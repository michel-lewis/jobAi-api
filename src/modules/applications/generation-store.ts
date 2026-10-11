import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan, QueryFailedError } from 'typeorm';
import {
  DocumentsService,
  type GeneratedDocumentDraft,
  type GeneratedDocumentResult,
} from '../documents/documents.service.js';
import {
  Application,
  type ApplicationStatus,
} from './entities/application.entity.js';

/** Code d'erreur PostgreSQL pour une violation de contrainte d'unicité. */
const PG_UNIQUE_VIOLATION = '23505';

export interface ApplicationState {
  id: string;
  status: ApplicationStatus;
  failureReason: string | null;
}

/** Sentinelle interne : force le rollback de markSucceeded sans faire
 *  remonter une vraie erreur à l'appelant. */
class StatusNoLongerDraftError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Porte toutes les écritures conditionnelles de statut d'une `Application` —
 * chacune une seule requête `UPDATE ... WHERE status = 'draft'` (ou son
 * équivalent à l'insertion), pour que la transition qui arrive en second
 * perde toujours proprement plutôt que d'écraser la première (ADR-13).
 */
@Injectable()
export class ApplicationGenerationStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * Insère si (userId, offerId) n'existe pas encore. Si une ligne existe en
   * 'generation_failed', la fait repasser à 'draft' — une seule requête
   * conditionnelle, shouldLaunch=true uniquement pour l'appelant dont la
   * bascule a réellement eu lieu (jamais pour 'draft'/'generated' déjà en
   * place, jamais pour un appelant qui a perdu la course de la bascule).
   */
  async startOrRetry(
    userId: string,
    offerId: string,
  ): Promise<ApplicationState & { shouldLaunch: boolean }> {
    const repository = this.dataSource.getRepository(Application);
    const startedAt = new Date();

    try {
      const inserted = await repository.save(
        repository.create({
          userId,
          offerId,
          status: 'draft',
          generationFailureReason: null,
          generationStartedAt: startedAt,
        }),
      );
      return {
        id: inserted.id,
        status: inserted.status,
        failureReason: inserted.generationFailureReason,
        shouldLaunch: true,
      };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }

    const existing = await repository.findOneOrFail({
      where: { userId, offerId },
    });

    if (existing.status !== 'generation_failed') {
      return {
        id: existing.id,
        status: existing.status,
        failureReason: existing.generationFailureReason,
        shouldLaunch: false,
      };
    }

    const retried = await repository.update(
      { id: existing.id, status: 'generation_failed' },
      {
        status: 'draft',
        generationFailureReason: null,
        generationStartedAt: startedAt,
      },
    );

    if (retried.affected === 1) {
      return {
        id: existing.id,
        status: 'draft',
        failureReason: null,
        shouldLaunch: true,
      };
    }

    const fresh = await repository.findOneOrFail({
      where: { id: existing.id },
    });
    return {
      id: fresh.id,
      status: fresh.status,
      failureReason: fresh.generationFailureReason,
      shouldLaunch: false,
    };
  }

  /**
   * Transaction unique : persiste le document ET bascule le statut à
   * 'generated', ou aucun des deux. Si la bascule n'affecte aucune ligne
   * (le statut n'était déjà plus 'draft' — échec par délai arrivé en
   * premier), toute la transaction est annulée : le document généré n'est
   * pas gardé.
   */
  async markSucceeded(
    applicationId: string,
    draft: GeneratedDocumentDraft,
  ): Promise<{ applied: boolean; document: GeneratedDocumentResult | null }> {
    try {
      const document = await this.dataSource.transaction(async (manager) => {
        const saved = await this.documents.persist(
          manager,
          applicationId,
          draft,
        );

        const result = await manager.update(
          Application,
          { id: applicationId, status: 'draft' },
          { status: 'generated' },
        );

        if (result.affected !== 1) {
          throw new StatusNoLongerDraftError();
        }

        return saved;
      });

      return { applied: true, document };
    } catch (error) {
      if (error instanceof StatusNoLongerDraftError) {
        return { applied: false, document: null };
      }
      throw error;
    }
  }

  /** UPDATE conditionnel WHERE status='draft' vers 'generation_failed'. */
  async markFailed(
    applicationId: string,
    reason: string,
  ): Promise<{ applied: boolean }> {
    const result = await this.dataSource
      .getRepository(Application)
      .update(
        { id: applicationId, status: 'draft' },
        { status: 'generation_failed', generationFailureReason: reason },
      );
    return { applied: result.affected === 1 };
  }

  /**
   * UPDATE conditionnel WHERE status='draft' AND generationStartedAt <
   * staleBefore — jamais createdAt, qui ne bouge pas lors d'une relance.
   */
  async markFailedIfStale(
    applicationId: string,
    staleBefore: Date,
  ): Promise<{ applied: boolean }> {
    const result = await this.dataSource.getRepository(Application).update(
      {
        id: applicationId,
        status: 'draft',
        generationStartedAt: LessThan(staleBefore),
      },
      {
        status: 'generation_failed',
        generationFailureReason: 'Délai de génération dépassé.',
      },
    );
    return { applied: result.affected === 1 };
  }

  /**
   * Même règle que markFailedIfStale, mais ciblée par (userId, offerId)
   * plutôt que par id — pour que `create()` puisse purger un brouillon
   * périmé AVANT startOrRetry, sans l'avoir déjà cherché. Sans ça, un
   * brouillon dont le processus est mort reste 'draft' pour toujours tant
   * que personne ne fait de GET : startOrRetry le trouverait encore
   * 'draft' et renverrait shouldLaunch=false indéfiniment.
   */
  async markFailedIfStaleByOffer(
    userId: string,
    offerId: string,
    staleBefore: Date,
  ): Promise<{ applied: boolean }> {
    const result = await this.dataSource.getRepository(Application).update(
      {
        userId,
        offerId,
        status: 'draft',
        generationStartedAt: LessThan(staleBefore),
      },
      {
        status: 'generation_failed',
        generationFailureReason: 'Délai de génération dépassé.',
      },
    );
    return { applied: result.affected === 1 };
  }

  /** null si l'application n'existe pas OU n'appartient pas à userId — source du 404. */
  async findOwnedState(
    applicationId: string,
    userId: string,
  ): Promise<
    (ApplicationState & { document: GeneratedDocumentResult | null }) | null
  > {
    const application = await this.dataSource
      .getRepository(Application)
      .findOne({
        where: { id: applicationId, userId },
      });

    if (!application) {
      return null;
    }

    const document =
      application.status === 'generated'
        ? await this.documents.findLatestForApplication(applicationId)
        : null;

    return {
      id: application.id,
      status: application.status,
      failureReason: application.generationFailureReason,
      document,
    };
  }
}

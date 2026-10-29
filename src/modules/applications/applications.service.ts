import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { log } from '../../common/logging/logger.js';
import { OffersService } from '../offers/offers.service.js';
import {
  DocumentsService,
  DocumentQualityRejectedError,
  GenerationBlockedError,
} from '../documents/documents.service.js';
import {
  LlmMalformedResponseError,
  LlmQuotaExceededError,
  LlmRejectedError,
  LlmRetriesExhaustedError,
  LlmTimeoutError,
  LlmTokenCapExceededError,
} from '../llm/llm.port.js';
import { ApplicationGenerationStore } from './generation-store.js';
import type { ApplicationStatus } from './entities/application.entity.js';
import type { GeneratedDocumentResult } from '../documents/documents.service.js';
import type { OfferDto } from '../offers/dto/offer.dto.js';

export interface ApplicationStateDto {
  id: string;
  status: ApplicationStatus;
  failureReason: string | null;
  document: { type: 'cover_letter'; content: string; createdAt: Date } | null;
}

/**
 * COUCHE 3 — orchestrateur. Dépend de `offers` et `documents`, ne laisse
 * jamais l'un appeler l'autre : c'est elle qui porte l'offre récupérée vers
 * `DocumentsService`.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly offers: OffersService,
    private readonly documents: DocumentsService,
    private readonly store: ApplicationGenerationStore,
    private readonly config: ConfigService,
  ) {}

  /**
   * Point de lancement unique du ticket : seule méthode à jamais appeler
   * `runGeneration`, et seulement quand `startOrRetry` dit que c'est à
   * cet appel de le faire (ADR-13).
   */
  async create(userId: string, offerId: string): Promise<ApplicationStateDto> {
    const offer = await this.offers.findVisibleById(userId, offerId);

    // Purge un brouillon périmé AVANT startOrRetry : sans ça, un brouillon
    // dont le processus est mort reste 'draft' pour toujours tant que
    // personne n'a fait de GET, et un POST seul ne pourrait jamais le
    // relancer (startOrRetry le trouverait encore 'draft', shouldLaunch
    // resterait false indéfiniment).
    await this.store.markFailedIfStaleByOffer(
      userId,
      offerId,
      this.staleBefore(),
    );

    const state = await this.store.startOrRetry(userId, offerId);

    if (state.shouldLaunch) {
      void this.runGeneration(state.id, userId, offer);
    }

    return this.toDto({ ...state, document: null });
  }

  async findOne(userId: string, id: string): Promise<ApplicationStateDto> {
    let state = await this.store.findOwnedState(id, userId);
    if (!state) {
      throw this.notFound();
    }

    if (state.status === 'draft') {
      const { applied } = await this.store.markFailedIfStale(
        id,
        this.staleBefore(),
      );

      if (applied) {
        const refreshed = await this.store.findOwnedState(id, userId);
        if (!refreshed) {
          throw this.notFound();
        }
        state = refreshed;
      }
    }

    return this.toDto(state);
  }

  private staleBefore(): Date {
    const staleTimeoutMs = this.config.get<number>(
      'GENERATION_STALE_TIMEOUT_MS',
    )!;
    return new Date(Date.now() - staleTimeoutMs);
  }

  private async runGeneration(
    applicationId: string,
    userId: string,
    offer: OfferDto,
  ): Promise<void> {
    try {
      const draft = await this.documents.generateCoverLetter({
        userId,
        offer: {
          title: offer.title,
          company: offer.company,
          description: offer.description,
          language: offer.language,
          country: offer.country,
        },
      });
      await this.store.markSucceeded(applicationId, draft);
    } catch (error) {
      if (error instanceof GenerationBlockedError) {
        log('error', {
          applicationId,
          userId,
          reason: error.reason,
          outcome: 'generation_blocked',
        });
      } else if (error instanceof DocumentQualityRejectedError) {
        // Jamais le texte produit ni le contenu d'une violation — seul le
        // type de chaque violation est journalisé (ADR-16 : le prompt de
        // correction, lui, ne réexpose déjà ni le profil ni l'offre ; le
        // journal ne doit pas réintroduire la fuite par un autre chemin).
        log('error', {
          applicationId,
          userId,
          violationTypes: error.violations.map((violation) => violation.type),
          outcome: 'document_quality_rejected',
        });
      }

      try {
        await this.store.markFailed(
          applicationId,
          this.toReadableFailureReason(error),
        );
      } catch {
        // Cette tâche de fond n'est jamais attendue par son appelant
        // (fire-and-forget) : une seconde erreur ici — typiquement la base
        // devenue inaccessible pendant un redémarrage — ne doit jamais
        // remonter en rejet non attrapé. Le travail reste 'draft', et le
        // contrôle de péremption de GET (ADR-13) reste le seul filet de
        // sécurité nécessaire.
        log('error', {
          applicationId,
          userId,
          outcome: 'mark_failed_write_failed',
        });
      }
    }
  }

  private toReadableFailureReason(error: unknown): string {
    if (error instanceof GenerationBlockedError) {
      if (error.reason === 'incomplete_profile') {
        return 'Le profil est insuffisant pour générer un document — ajoute au moins une expérience ou une compétence.';
      }
      return "L'offre ne correspond pas suffisamment au profil pour générer un document.";
    }
    if (error instanceof DocumentQualityRejectedError) {
      return 'Le document généré ne respecte pas la qualité attendue pour ce marché.';
    }
    if (error instanceof LlmTimeoutError) {
      return "Le fournisseur n'a pas répondu à temps.";
    }
    if (error instanceof LlmRetriesExhaustedError) {
      return 'Le fournisseur de modèle est indisponible.';
    }
    if (error instanceof LlmRejectedError) {
      return 'La demande a été rejetée par le fournisseur.';
    }
    if (error instanceof LlmMalformedResponseError) {
      return 'Le fournisseur a renvoyé une réponse invalide.';
    }
    if (error instanceof LlmQuotaExceededError) {
      return 'Le quota quotidien de génération est atteint.';
    }
    if (error instanceof LlmTokenCapExceededError) {
      return 'La demande dépasse le plafond de jetons autorisé.';
    }
    return 'Une erreur inattendue est survenue pendant la génération.';
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'APPLICATION_NOT_FOUND',
      message: "Cette candidature n'existe pas ou ne vous appartient pas",
    });
  }

  private toDto(state: {
    id: string;
    status: ApplicationStatus;
    failureReason: string | null;
    document: GeneratedDocumentResult | null;
  }): ApplicationStateDto {
    return {
      id: state.id,
      status: state.status,
      failureReason: state.failureReason,
      document: state.document
        ? {
            type: state.document.type,
            content: state.document.content,
            createdAt: state.document.createdAt,
          }
        : null,
    };
  }
}

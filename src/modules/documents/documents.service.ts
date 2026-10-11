import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { LLM_PORT, type LlmPort } from '../llm/llm.port.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { buildCoverLetterPrompt } from './prompt.js';
import { buildAnchoringFacts, checkAnchoring } from './anchoring.js';
import { GeneratedDocument } from './entities/generated-document.entity.js';

export interface GenerateCoverLetterInput {
  userId: string;
  offer: { title: string; company: string | null; description: string };
}

export interface GeneratedDocumentDraft {
  type: 'cover_letter';
  content: string;
}

export interface GeneratedDocumentResult extends GeneratedDocumentDraft {
  id: string;
  createdAt: Date;
}

/**
 * COUCHE 2. N'écrit jamais `generated_documents` elle-même en dehors de
 * `persist` : `generateCoverLetter` ne fait qu'appeler le fournisseur et
 * valider sa réponse, pour ne jamais garder une transaction ouverte pendant
 * un appel réseau de dizaines de secondes.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly profiles: ProfilesService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async generateCoverLetter(
    input: GenerateCoverLetterInput,
  ): Promise<GeneratedDocumentDraft> {
    const { dto: profile } = await this.profiles.findMine(input.userId);

    const prompt = buildCoverLetterPrompt({ profile, offer: input.offer });

    const generated = await this.llm.generateText({
      userId: input.userId,
      prompt,
      maxOutputTokens: this.config.get<number>('LLM_MAX_OUTPUT_TOKENS')!,
    });

    const facts = buildAnchoringFacts(profile, {
      title: input.offer.title,
      company: input.offer.company,
      description: input.offer.description,
    });
    checkAnchoring(generated.text, facts);

    return { type: 'cover_letter', content: generated.text };
  }

  /**
   * Seule méthode qui écrit `generated_documents` — dans le EntityManager de
   * l'appelant, pour qu'elle rejoigne la même transaction que la bascule de
   * statut de l'`Application` (voir ApplicationGenerationStore.markSucceeded).
   */
  async persist(
    manager: EntityManager,
    applicationId: string,
    draft: GeneratedDocumentDraft,
  ): Promise<GeneratedDocumentResult> {
    const saved = await manager.save(
      GeneratedDocument,
      manager.create(GeneratedDocument, {
        applicationId,
        type: draft.type,
        content: draft.content,
        fileUrl: null,
      }),
    );

    return {
      id: saved.id,
      type: draft.type,
      content: draft.content,
      createdAt: saved.createdAt,
    };
  }

  /**
   * Le document généré est immuable et jamais réécrit : le plus récent par
   * `createdAt` est, par construction, le document courant d'une
   * candidature (voir le commentaire de l'entité `GeneratedDocument`).
   */
  async findLatestForApplication(
    applicationId: string,
  ): Promise<GeneratedDocumentResult | null> {
    // Filtré explicitement sur le type, pas seulement trié par date : une
    // candidature qui aura un jour aussi un CV généré ne doit jamais faire
    // remonter ici autre chose qu'une lettre de motivation.
    const document = await this.dataSource
      .getRepository(GeneratedDocument)
      .findOne({
        where: { applicationId, type: 'cover_letter' },
        order: { createdAt: 'DESC' },
      });

    if (!document) {
      return null;
    }

    return {
      id: document.id,
      type: 'cover_letter',
      content: document.content,
      createdAt: document.createdAt,
    };
  }
}

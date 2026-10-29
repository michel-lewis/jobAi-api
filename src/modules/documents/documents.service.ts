import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { FORMAT_MAX_ATTEMPTS } from '../../config/env.validation.js';
import { LLM_PORT, type LlmPort } from '../llm/llm.port.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { buildCoverLetterPrompt } from './prompt.js';
import { buildAnchoringFacts, checkFacts } from './fact-checking.js';
import { checkMarketFormat } from './market-format.js';
import { applyMechanicalCorrections } from './mechanical-corrections.js';
import { preflight, type GenerationBlockedReason } from './preflight.js';
import {
  buildCorrectionPrompt,
  hasFault,
  type Violation,
} from './violations.js';
import {
  MARKET_NORM_PROVIDER,
  type Language,
  type MarketNormProvider,
} from './market-norm.js';
import { GeneratedDocument } from './entities/generated-document.entity.js';

export interface GenerateCoverLetterInput {
  userId: string;
  offer: {
    title: string;
    company: string | null;
    description: string;
    language: Language;
    country: string;
  };
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
 * Levée à l'étape 0 de l'ADR-16 — pré-vol : rien n'a été tenté, donc jamais
 * confondue avec un rejet de qualité (`DocumentQualityRejectedError`
 * ci-dessous). `reason` porte le mécanisme nommé par ADR-16
 * (`generationBlockedReason`), jamais la chaîne `'generation_failed'`.
 */
export class GenerationBlockedError extends Error {
  constructor(public readonly reason: GenerationBlockedReason) {
    super(`Génération bloquée avant tout appel au modèle : ${reason}`);
    this.name = 'GenerationBlockedError';
  }
}

/**
 * Levée après au moins un appel LLM — une faute (fait inventé ou valeur de
 * fait modifiée) court-circuite immédiatement ; une imprécision qui
 * persiste après `FORMAT_MAX_ATTEMPTS` essais est traitée au même titre
 * (ADR-14, décision 3a). Porte les violations plutôt qu'un message
 * générique : c'est ce qu'un relecteur ou un futur ticket G veut inspecter.
 */
export class DocumentQualityRejectedError extends Error {
  constructor(public readonly violations: Violation[]) {
    super('Le document produit ne respecte pas la qualité attendue');
    this.name = 'DocumentQualityRejectedError';
  }
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
    @Inject(MARKET_NORM_PROVIDER)
    private readonly marketNorms: MarketNormProvider,
  ) {}

  /**
   * Les quatre étapes de l'ADR-16, dans l'ordre : pré-vol (aucun appel),
   * génération (un appel), correction mécanique (aucun appel), deux
   * vérificateurs indépendants — puis, s'il ne reste qu'une imprécision,
   * un unique tour de correction (étapes 2 et 3 rejouées). Pire cas : deux
   * appels, jamais plus (`FORMAT_MAX_ATTEMPTS`, possédé par l'ADR-14).
   */
  async generateCoverLetter(
    input: GenerateCoverLetterInput,
  ): Promise<GeneratedDocumentDraft> {
    const { dto: profile } = await this.profiles.findMine(input.userId);

    const norm = this.marketNorms.resolveNorm({
      country: input.offer.country,
      language: input.offer.language,
      userId: input.userId,
    });

    const offer = {
      title: input.offer.title,
      company: input.offer.company,
      description: input.offer.description,
    };

    // Étape 0 — code pur, aucun appel LLM.
    const preflightResult = preflight(profile, offer, norm);
    if (!preflightResult.ok) {
      throw new GenerationBlockedError(preflightResult.reason);
    }

    // Faits connus une seule fois : profil et offre ne changent pas entre
    // un éventuel premier essai et son tour de correction.
    const facts = buildAnchoringFacts(
      profile,
      offer,
      norm.language,
      norm.verbLadder,
    );

    const prompt = buildCoverLetterPrompt({ profile, offer, norm });

    let rawText = await this.callLlm(input.userId, prompt);
    let attempts = 1;

    for (;;) {
      const corrected = applyMechanicalCorrections(
        rawText,
        norm.letter,
        norm.superlatives,
        preflightResult.superlatifsAutorisés,
      );

      const violations: Violation[] = [
        ...checkFacts(corrected, facts, norm.verbLadder),
        ...checkMarketFormat(corrected, norm.letter),
      ];

      if (violations.length === 0) {
        return { type: 'cover_letter', content: corrected };
      }

      // Une faute, ou une imprécision qui survit au budget de correction :
      // rejet immédiat, aucun autre essai (ADR-14, décision 3a).
      if (hasFault(violations) || attempts >= FORMAT_MAX_ATTEMPTS) {
        throw new DocumentQualityRejectedError(violations);
      }

      // Le prompt de correction ne porte que le texte produit et les
      // violations — jamais le profil, jamais l'offre (ADR-16).
      const correctionPrompt = buildCorrectionPrompt(corrected, violations);
      rawText = await this.callLlm(input.userId, correctionPrompt);
      attempts += 1;
    }
  }

  private async callLlm(userId: string, prompt: string): Promise<string> {
    const generated = await this.llm.generateText({
      userId,
      prompt,
      maxOutputTokens: this.config.get<number>('LLM_MAX_OUTPUT_TOKENS')!,
    });
    return generated.text;
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

import { z } from 'zod';

/**
 * Valide une norme au démarrage (ADR-14, décision 2) : une norme invalide
 * fait échouer le boot, jamais une génération en cours.
 */
export const letterNormSchema = z.object({
  lengthRange: z.tuple([
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
  // Fourchette, pas une cible unique (correction J) — voir market-norm.ts.
  paragraphCount: z.tuple([
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
  openingFormula: z.string().nullable(),
  closingFormula: z.string().nullable(),
  forbiddenFormulas: z.object({
    standalone: z.array(z.string()),
    embedded: z.array(z.string()),
  }),
});

const expectSchema = z.enum(['never', 'optional', 'expected']);

export const personalPolicySchema = z.object({
  photo: expectSchema,
  dateOfBirth: expectSchema,
  maritalStatus: expectSchema,
  nationality: expectSchema,
  workAuthorization: expectSchema,
});

export const marketNormSchema = z.object({
  family: z.enum([
    'north_american',
    'commonwealth',
    'french',
    'german',
    'southern_european',
    'northern_european',
    'central_eastern_european',
    'latin_american',
    'gulf',
    'east_asian',
    'south_asian',
    'unknown',
  ]),
  language: z.enum(['fr', 'en']),
  verbLadder: z.array(z.array(z.string())),
  superlatives: z.array(z.string()),
  personal: personalPolicySchema,
  letter: letterNormSchema,
  cv: z.record(z.string(), z.never()).nullable(),
  meta: z
    .object({
      provenance: z.string(),
      verifiedAt: z.string().nullable(),
      confidence: z.enum(['verified', 'inherited', 'neutral']),
      userOverridable: z.record(z.string(), z.boolean()),
    })
    // Correction 6 — une norme ne doit jamais se présenter comme vérifiée
    // sans date de vérification réelle (ADR-14, décision 2).
    .refine(
      (meta) => meta.confidence !== 'verified' || meta.verifiedAt !== null,
      {
        message: "confidence 'verified' exige verifiedAt non nul",
        path: ['verifiedAt'],
      },
    )
    // Correction I — 'neutral' est par définition l'absence de recherche :
    // une date de vérification le contredirait. 'inherited' n'a pas cette
    // contrainte, une date d'héritage confirmé reste légitime.
    .refine(
      (meta) => meta.confidence !== 'neutral' || meta.verifiedAt === null,
      {
        message: "confidence 'neutral' exige verifiedAt nul",
        path: ['verifiedAt'],
      },
    ),
});

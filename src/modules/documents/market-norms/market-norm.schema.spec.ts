import { marketNormSchema } from './market-norm.schema.js';
import type { MarketNorm } from '../market-norm.js';

/**
 * Le plus petit MarketNorm valide, local à ce fichier — même décision que
 * les autres fichiers de ce module. Seul `meta` varie entre les tests.
 */
function makeMarketNorm(overrides: Partial<MarketNorm> = {}): MarketNorm {
  return {
    family: 'french',
    language: 'fr',
    verbLadder: [['participé', 'assisté']],
    superlatives: ['exceptionnel'],
    personal: {
      photo: 'never',
      dateOfBirth: 'never',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    },
    letter: {
      lengthRange: [250, 350],
      paragraphCount: [3, 3],
      openingFormula: 'Madame, Monsieur,',
      closingFormula: 'Cordialement,',
      forbiddenFormulas: { standalone: [], embedded: [] },
    },
    cv: null,
    meta: {
      provenance: 'fixture de test',
      verifiedAt: null,
      confidence: 'neutral',
      userOverridable: {},
    },
    ...overrides,
  };
}

/**
 * Correction 6 + I — ADR-14, décision 2 : « une norme héritée ou neutre ne
 * doit jamais se présenter comme vérifiée ». `confidence: 'verified'` sans
 * `verifiedAt` prétend à une vérification qui n'a pas de date ; à
 * l'inverse, `confidence: 'neutral'` est par définition l'absence de
 * recherche — une date de vérification le contredirait.
 */
describe('marketNormSchema — invariant confidence/verifiedAt', () => {
  it('confidence verified avec verifiedAt null est rejeté par le schéma', () => {
    const norm = makeMarketNorm({
      meta: {
        provenance: 'fixture de test',
        verifiedAt: null,
        confidence: 'verified',
        userOverridable: {},
      },
    });

    const result = marketNormSchema.safeParse(norm);

    expect(result.success).toBe(false);
  });

  it('confidence verified avec une date de vérification est accepté par le schéma', () => {
    const norm = makeMarketNorm({
      meta: {
        provenance: 'fixture de test',
        verifiedAt: '2026-10-28',
        confidence: 'verified',
        userOverridable: {},
      },
    });

    const result = marketNormSchema.safeParse(norm);

    expect(result.success).toBe(true);
  });

  it('confidence neutral avec une date de vérification non nulle est rejeté par le schéma', () => {
    const norm = makeMarketNorm({
      meta: {
        provenance: 'fixture de test',
        verifiedAt: '2026-10-28',
        confidence: 'neutral',
        userOverridable: {},
      },
    });

    const result = marketNormSchema.safeParse(norm);

    expect(result.success).toBe(false);
  });

  it('confidence neutral avec verifiedAt null est accepté par le schéma', () => {
    const norm = makeMarketNorm({
      meta: {
        provenance: 'fixture de test',
        verifiedAt: null,
        confidence: 'neutral',
        userOverridable: {},
      },
    });

    const result = marketNormSchema.safeParse(norm);

    expect(result.success).toBe(true);
  });

  // Branche inverse de la contrainte — une date d'héritage confirmé reste
  // légitime : 'inherited' n'est pas 'neutral'.
  it('confidence inherited avec une date de vérification confirmée est accepté par le schéma', () => {
    const norm = makeMarketNorm({
      meta: {
        provenance: 'fixture de test',
        verifiedAt: '2026-10-28',
        confidence: 'inherited',
        userOverridable: {},
      },
    });

    const result = marketNormSchema.safeParse(norm);

    expect(result.success).toBe(true);
  });
});

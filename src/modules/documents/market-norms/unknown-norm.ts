import type { Language, MarketNorm } from '../market-norm.js';
import { UNKNOWN_PERSONAL_POLICY } from './personal-policy.js';

/**
 * L'entrée de secours la plus neutre de `letter` (ADR-14, décision 2) :
 * utilisée quand ni la famille ni aucune exception pays ne couvrent encore
 * la combinaison `country + language` d'une offre. Fourchette de longueur
 * large, pas de formule d'ouverture/clôture spécifique à un marché réel —
 * pas un refus de générer. `verbLadder`/`superlatives`/`forbiddenFormulas`
 * vides plutôt qu'une supposition : rien ne se déclenche jamais à tort sur
 * un marché dont on ne sait rien.
 *
 * `personal`, lui, ne suit pas cette permissivité : « le plus strict »
 * s'applique aux champs à risque asymétrique (photo, date de naissance,
 * nationalité, autorisation de travail), donc `UNKNOWN_PERSONAL_POLICY` —
 * tout à `'never'` — pas une norme neutre au sens de `letter`.
 */
export function unknownNorm(language: Language): MarketNorm {
  return {
    family: 'unknown',
    language,
    verbLadder: [],
    superlatives: [],
    personal: UNKNOWN_PERSONAL_POLICY,
    letter: {
      lengthRange: [150, 600],
      // Permissif, comme lengthRange (ADR-14) : pas calé sur une fourchette
      // réelle, aucun marché n'impose "entre 1 et 10 paragraphes".
      paragraphCount: [1, 10],
      openingFormula: null,
      closingFormula: null,
      forbiddenFormulas: { standalone: [], embedded: [] },
    },
    cv: null,
    meta: {
      provenance: 'aucune source institutionnelle trouvée au 2026-10-28',
      verifiedAt: null,
      confidence: 'neutral',
      userOverridable: {},
    },
  };
}

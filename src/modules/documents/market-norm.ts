export type Language = 'fr' | 'en';

/**
 * Il n'existe aucune source officielle des normes de CV ou de lettre par
 * pays (ADR-14, décision 2) : une norme héritée ou neutre ne doit jamais se
 * présenter comme vérifiée.
 */
export type Confidence = 'verified' | 'inherited' | 'neutral';

/**
 * Les onze familles de format (ADR-14, décision 2), plus l'entrée de
 * secours neutre.
 */
export type FormatFamily =
  | 'north_american'
  | 'commonwealth'
  | 'french'
  | 'german'
  | 'southern_european'
  | 'northern_european'
  | 'central_eastern_european'
  | 'latin_american'
  | 'gulf'
  | 'east_asian'
  | 'south_asian'
  | 'unknown';

/**
 * Réservé, volontairement vide au ticket D (ADR-14, décision 2) : le ticket
 * F le remplit sans changer le type de retour du port.
 */
export type CvNorm = Record<string, never>;

/**
 * `'never' | 'optional' | 'expected'` par champ à risque asymétrique
 * (ADR-14, décision 2) : inclure peut faire écarter la candidature, omettre
 * jamais. Rempli dès ce ticket, non consommé avant le ticket F (le CV).
 */
export interface PersonalPolicy {
  photo: 'never' | 'optional' | 'expected';
  dateOfBirth: 'never' | 'optional' | 'expected';
  maritalStatus: 'never' | 'optional' | 'expected';
  nationality: 'never' | 'optional' | 'expected';
  workAuthorization: 'never' | 'optional' | 'expected';
}

export interface LetterNorm {
  lengthRange: [number, number];
  /**
   * Fourchette, pas une cible unique (correction J) : les sources réelles
   * disent « 3 à 5 paragraphes », jamais « exactement 3 » — comparer avec
   * `!==` rejetait à tort une lettre conforme et déclenchait un tour de
   * correction payant pour rien.
   */
  paragraphCount: [number, number];
  openingFormula: string | null;
  closingFormula: string | null;
  forbiddenFormulas: { standalone: string[]; embedded: string[] };
}

export interface MarketNorm {
  family: FormatFamily;
  language: Language;
  /** Rangs, chacun une liste de synonymes, rang croissant (ADR-14, décision 5). */
  verbLadder: string[][];
  /** Liste fermée par langue (ADR-14, décision 5). */
  superlatives: string[];
  personal: PersonalPolicy;
  letter: LetterNorm;
  cv: CvNorm | null;
  meta: {
    provenance: string;
    verifiedAt: string | null;
    confidence: Confidence;
    userOverridable: Record<string, boolean>;
  };
}

export const MARKET_NORM_PROVIDER = Symbol('MARKET_NORM_PROVIDER');

export interface MarketNormProvider {
  resolveNorm(context: {
    country: string;
    language: Language;
    userId?: string;
  }): MarketNorm;
}

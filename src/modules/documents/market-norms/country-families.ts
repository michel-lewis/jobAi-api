import type { FormatFamily } from '../market-norm.js';

/**
 * Un pays sans entrée hérite de `'unknown'` (ADR-14, décision 2) — pas un
 * repli déguisé en marché choisi, `'unknown'` est lui-même une entrée
 * documentée (`unknown-norm.ts`). Peupler cette liste pour une nouvelle
 * famille est un commit futur, pas un prérequis de ce ticket : seul `CA`
 * a du contenu réel (`ca-norms.ts`) aujourd'hui.
 *
 * Trois exceptions pays à écrire dès ce ticket (ADR-14, décision 2) :
 * Afrique du Sud, Nigeria, Ghana — toutes trois anglophones, modèle
 * Commonwealth. Leur contenu propre (références nommées et pas de photo
 * pour l'Afrique du Sud, le NYSC dans l'expérience pour le Nigeria, les
 * certifications dans la ligne du nom pour le Ghana) est un champ de
 * `cv`, volontairement vide jusqu'au ticket F (ADR-14, décision 2) — ces
 * trois pays sont donc déjà cartographiés, prêts à recevoir ce contenu
 * sans qu'un commit futur ait besoin de les ajouter à cette liste.
 */
export const COUNTRY_FAMILY: Record<string, FormatFamily> = {
  CA: 'north_american',
  US: 'north_american',
  MX: 'north_american',
  ZA: 'commonwealth',
  NG: 'commonwealth',
  GH: 'commonwealth',
  GB: 'commonwealth',
  AU: 'commonwealth',
  NZ: 'commonwealth',
  IE: 'commonwealth',
  KE: 'commonwealth',
  FR: 'french',
  BE: 'french',
  LU: 'french',
  DE: 'german',
  AT: 'german',
  CH: 'german',
  IT: 'southern_european',
  ES: 'southern_european',
  PT: 'southern_european',
  GR: 'southern_european',
  SE: 'northern_european',
  NO: 'northern_european',
  DK: 'northern_european',
  FI: 'northern_european',
  NL: 'northern_european',
  PL: 'central_eastern_european',
  CZ: 'central_eastern_european',
  RO: 'central_eastern_european',
  HU: 'central_eastern_european',
  AE: 'gulf',
  SA: 'gulf',
  QA: 'gulf',
  KW: 'gulf',
};

/**
 * Règle britannique non représentable : au Royaume-Uni, la formule de
 * clôture dépend de l'ouverture (« Yours sincerely » avec un nom connu,
 * « Yours faithfully » avec « Dear Sir or Madam »), alors que
 * `LetterNorm.openingFormula`/`closingFormula` sont deux champs
 * indépendants. La famille `commonwealth` n'a aujourd'hui aucun contenu de
 * lettre réel, donc rien ne casse — voir l'issue #42 avant d'écrire un
 * contenu `letter` pour cette famille.
 */

export function familyOf(country: string): FormatFamily {
  return COUNTRY_FAMILY[country] ?? 'unknown';
}

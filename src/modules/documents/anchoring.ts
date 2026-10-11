import type { ProfileDto } from '../profiles/dto/profile.dto.js';

/**
 * Un candidat « entreprise » est une suite de 2+ mots consécutifs à
 * majuscule initiale, reliés par un espace ou une virgule-espace (pour
 * couvrir des ouvertures comme « Madame, Monsieur »). Un seul mot capitalisé
 * (début de phrase, titre de civilité isolé...) n'est jamais un candidat —
 * c'est délibéré, voir checkAnchoring.
 */
const CAPITALIZED_RUN =
  /\b[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'-]*(?:,?[ \t]+[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'-]*)+\b/g;

const YEAR = /\b(?:19|20)\d{2}\b/g;

/**
 * Ouvertures et formules de politesse françaises : jamais une entreprise,
 * jamais à vérifier contre le profil.
 */
const FRENCH_LETTER_OPENING_WORDS = [
  'madame',
  'monsieur',
  'mesdames',
  'messieurs',
  'cher',
  'chère',
  'chers',
  'chères',
  'bonjour',
  'cordialement',
  'sincèrement',
  'salutations',
  'veuillez',
  'objet',
  'distinguées',
  'agréer',
  'expression',
];

export interface AnchoringFacts {
  /** Mots connus, en minuscules. */
  knownWords: Set<string>;
  knownYears: Set<number>;
}

/**
 * Porte la liste des termes rejetés, pas seulement un message : ce contrôle
 * est une heuristique qui se règle dans le temps, et un journal sans le
 * terme exact ne permet pas de la régler.
 */
export class AnchorViolationError extends Error {
  constructor(
    message: string,
    public readonly violations: string[],
  ) {
    super(message);
    this.name = 'AnchorViolationError';
  }
}

function wordsOf(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .toLowerCase()
    .split(/[^a-zà-öø-ÿ'-]+/)
    .filter((word) => word.length > 0);
}

function addYearFromDate(years: Set<number>, date: string | null): void {
  if (!date) {
    return;
  }
  const year = Number.parseInt(date.slice(0, 4), 10);
  if (!Number.isNaN(year)) {
    years.add(year);
  }
}

/**
 * L'ensemble connu : entreprises et intitulés passés du profil, l'offre
 * elle-même (on nomme légitimement l'entreprise à qui on écrit), les
 * compétences et le nom du candidat, plus l'année en cours et la suivante
 * (une disponibilité annoncée n'est pas un fait du profil). Voir ADR-13 :
 * ça garantit l'absence de nom propre nouveau, pas l'absence d'entreprise
 * inventée — une recombinaison de deux mots connus séparément passe.
 */
export function buildAnchoringFacts(
  profile: ProfileDto,
  offer: { title: string; company: string | null; description: string },
): AnchoringFacts {
  const knownWords = new Set<string>(FRENCH_LETTER_OPENING_WORDS);
  const knownYears = new Set<number>();

  const currentYear = new Date().getFullYear();
  knownYears.add(currentYear);
  knownYears.add(currentYear + 1);

  for (const word of wordsOf(profile.fullName)) {
    knownWords.add(word);
  }
  for (const word of wordsOf(offer.title)) {
    knownWords.add(word);
  }
  for (const word of wordsOf(offer.company)) {
    knownWords.add(word);
  }
  // prompt.ts envoie aussi la description complète de l'offre comme
  // matière autorisée — une techno ou une entité qu'elle nomme (« Azure
  // DevOps », « Banque Nationale ») est un fait réel de l'offre, pas une
  // invention du LLM.
  for (const word of wordsOf(offer.description)) {
    knownWords.add(word);
  }
  for (const match of offer.description.matchAll(YEAR)) {
    knownYears.add(Number.parseInt(match[0], 10));
  }

  for (const skill of profile.skills) {
    for (const word of wordsOf(skill.name)) {
      knownWords.add(word);
    }
  }

  for (const experience of profile.experiences) {
    for (const word of wordsOf(experience.company)) {
      knownWords.add(word);
    }
    for (const word of wordsOf(experience.title)) {
      knownWords.add(word);
    }
    // Le prompt transmet aussi ce champ comme fait autorisé (prompt.ts) —
    // un nom propre qu'il contient (ex. le nom d'un ancien client cité dans
    // un résumé de poste) doit être reconnu ici, sinon un fait réel du
    // profil ferait échouer l'ancrage à tort.
    for (const word of wordsOf(experience.summary)) {
      knownWords.add(word);
    }
    addYearFromDate(knownYears, experience.startDate);
    addYearFromDate(knownYears, experience.endDate);
  }

  for (const education of profile.education) {
    addYearFromDate(knownYears, education.startDate);
    addYearFromDate(knownYears, education.endDate);
  }

  for (const certification of profile.certifications) {
    addYearFromDate(knownYears, certification.issuedOn);
    addYearFromDate(knownYears, certification.expiresOn);
  }

  return { knownWords, knownYears };
}

/**
 * Collecte TOUTES les violations avant de lever — un seul terme rejeté ne
 * dit pas si le reste du document est propre, et régler l'heuristique a
 * besoin de voir chaque faux positif d'un coup.
 */
export function checkAnchoring(text: string, facts: AnchoringFacts): void {
  const violations: string[] = [];

  for (const match of text.matchAll(CAPITALIZED_RUN)) {
    const run = match[0];
    const words = wordsOf(run);
    const allKnown = words.every((word) => facts.knownWords.has(word));
    if (!allKnown) {
      violations.push(run);
    }
  }

  for (const match of text.matchAll(YEAR)) {
    const year = Number.parseInt(match[0], 10);
    if (!facts.knownYears.has(year)) {
      violations.push(match[0]);
    }
  }

  if (violations.length > 0) {
    throw new AnchorViolationError(
      'Le document généré contenait des informations absentes du profil',
      violations,
    );
  }
}

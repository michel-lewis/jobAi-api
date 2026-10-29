import type { ProfileDto } from '../profiles/dto/profile.dto.js';
import type { Violation } from './violations.js';

/**
 * Correction 5 — `'number'` et `'volume'` retirés : ils n'avaient ni
 * producteur (`buildAnchoringFacts`) ni consommateur (`checkFacts`), aucune
 * regex, aucune branche. Un type qui annonce une couverture inexistante est
 * trompeur. Le ticket F les rajoutera s'il en a besoin.
 */
export type FactKind = 'proper_noun' | 'date' | 'duration' | 'verb';

/**
 * `normalized` existe parce que « 2 ans » et « deux ans » sont le même
 * fait : la comparaison d'identité se fait sur cette forme, jamais sur
 * `value` qui ne porte que le texte d'origine.
 */
export interface AnchoringFact {
  kind: FactKind;
  value: string;
  normalized: string;
}

/**
 * Un candidat « entreprise » est une suite de 2+ mots consécutifs à
 * majuscule initiale, chacun d'au moins deux caractères — une seule lettre
 * capitalisée (le pronom anglais « I », une initiale) ne compte jamais
 * comme un mot du candidat, sans quoi une virgule suivie d'un pronom isolé
 * (« Dear Hiring Manager, I ») se retrouverait absorbée dans le même
 * candidat que l'ouverture elle-même. Un seul mot capitalisé n'est jamais
 * un candidat. Reprend la règle de l'ancien `anchoring.ts`, corrigée sur ce
 * point.
 */
const CAPITALIZED_RUN =
  /\b[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'-]+(?:,?[ \t]+[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'-]+)+\b/g;

const YEAR = /\b(?:19|20)\d{2}\b/g;

// Capture aussi l'unité (correction 4) : la comparaison d'identité doit
// convertir vers une unité commune avant de comparer, pas comparer le
// chiffre seul — « 2 ans » et « 2 mois » ne sont pas la même durée.
const DURATION =
  /\b(\d+)\s*(ans?|années?|mois|semaines?|jours?|years?|months?|weeks?|days?)\b/gi;

/**
 * Normalise une durée vers une unité explicite plutôt que le chiffre seul
 * (correction 4, revue senior) : `'24m'` pour deux ans, `'2m'` pour deux
 * mois — sans ça, « 2 ans » et « 2 mois » produisaient tous deux '2' et une
 * confusion d'unité passait inaperçue, exactement la définition d'une
 * faute (un fait dont la valeur a changé).
 */
function normalizeDuration(amount: number, unit: string): string {
  const lower = unit.toLowerCase();
  if (lower.startsWith('an') || lower.startsWith('year')) {
    return `${amount * 12}m`;
  }
  if (lower.startsWith('mois') || lower.startsWith('month')) {
    return `${amount}m`;
  }
  if (lower.startsWith('semaine') || lower.startsWith('week')) {
    return `${amount}w`;
  }
  return `${amount}d`;
}

/**
 * Par langue (ADR-14, conséquences) : une lettre en anglais ferait rejeter
 * « Dear Hiring Manager » comme nom propre inventé si cette liste ne
 * suivait pas la langue choisie.
 */
const LETTER_OPENING_WORDS_BY_LANGUAGE: Record<string, string[]> = {
  fr: [
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
  ],
  en: [
    'dear',
    'hiring',
    'manager',
    'sincerely',
    'regards',
    'best',
    'greetings',
    'hello',
    'subject',
    're',
  ],
};

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

function findVerbRank(word: string, verbLadder: string[][]): number | null {
  const lower = word.toLowerCase();
  for (let rank = 0; rank < verbLadder.length; rank++) {
    if (verbLadder[rank].some((verb) => verb.toLowerCase() === lower)) {
      return rank;
    }
  }
  return null;
}

function parseDateSafe(date: string | null): Date | null {
  if (!date) {
    return null;
  }
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthsBetween(start: Date, end: Date): number {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(0, months);
}

const DURATION_UNIT_WORD: Record<string, { years: string; months: string }> = {
  fr: { years: 'ans', months: 'mois' },
  en: { years: 'years', months: 'months' },
};

/**
 * Correction 4 — normalise toujours sur le total en mois (`'24m'` pour
 * deux ans exactement, `'6m'` pour six mois), jamais sur le chiffre affiché
 * seul : « 2 ans » et « 2 mois » ne sont plus confondus. `value` reste la
 * forme lisible (années ou mois, selon ce qui se lit le plus naturellement)
 * — seule `normalized` porte la comparaison.
 */
function experienceDurationFacts(
  experiences: ProfileDto['experiences'],
  language: string,
): AnchoringFact[] {
  const unitWords = DURATION_UNIT_WORD[language] ?? DURATION_UNIT_WORD.fr;
  const facts: AnchoringFact[] = [];

  for (const experience of experiences) {
    const start = parseDateSafe(experience.startDate);
    const end = experience.endDate
      ? parseDateSafe(experience.endDate)
      : new Date();
    if (!start || !end) {
      continue;
    }
    const totalMonths = monthsBetween(start, end);
    if (totalMonths <= 0) {
      continue;
    }
    if (totalMonths >= 12) {
      const years = Math.round(totalMonths / 12);
      facts.push({
        kind: 'duration',
        value: `${years} ${unitWords.years}`,
        normalized: `${totalMonths}m`,
      });
    } else {
      facts.push({
        kind: 'duration',
        value: `${totalMonths} ${unitWords.months}`,
        normalized: `${totalMonths}m`,
      });
    }
  }

  return facts;
}

/**
 * L'ensemble connu : entreprises et intitulés passés du profil, l'offre
 * elle-même, les compétences et le nom du candidat, plus l'année en cours
 * et la suivante — comme l'ancien `anchoring.ts`, mais porté par
 * `AnchoringFact[]` plutôt que par deux `Set` opaques, et la liste
 * d'ouverture suit désormais la langue (ADR-14).
 */
export function buildAnchoringFacts(
  profile: ProfileDto,
  offer: { title: string; company: string | null; description: string },
  language: string,
  verbLadder: string[][],
): AnchoringFact[] {
  const facts: AnchoringFact[] = [];
  const knownWords = new Set<string>(
    LETTER_OPENING_WORDS_BY_LANGUAGE[language] ?? [],
  );
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

  for (const word of knownWords) {
    facts.push({ kind: 'proper_noun', value: word, normalized: word });
  }
  for (const year of knownYears) {
    facts.push({ kind: 'date', value: String(year), normalized: String(year) });
  }

  facts.push(...experienceDurationFacts(profile.experiences, language));

  // Montée en responsabilité (ADR-14, décision 5) : le plafond porte sur le
  // rang le plus élevé trouvé dans le profil, jamais sur un appariement
  // puce à puce. `verbLadder` est obligatoire, sans valeur par défaut : un
  // appelant qui l'omettrait désactiverait silencieusement ce contrôle —
  // exactement le bug trouvé en revue senior. Un paramètre dont l'oubli
  // éteint un garde-fou doit être obligatoire, pas optionnel.
  const freeTexts: (string | null)[] = [profile.summary];
  for (const experience of profile.experiences) {
    freeTexts.push(experience.summary);
    for (const bullet of experience.bullets) {
      freeTexts.push(bullet.text);
    }
  }
  const verbRankWords = new Map<number, string>();
  for (const text of freeTexts) {
    for (const word of wordsOf(text)) {
      const rank = findVerbRank(word, verbLadder);
      if (rank !== null && !verbRankWords.has(rank)) {
        verbRankWords.set(rank, word);
      }
    }
  }
  for (const [rank, word] of verbRankWords) {
    facts.push({ kind: 'verb', value: word, normalized: String(rank) });
  }

  return facts;
}

/**
 * Ancrage (proper_noun, date) : présence dans l'ensemble connu, comme
 * l'ancien `anchoring.ts` — `unanchored_fact`.
 *
 * Identité (duration) : correspondance par ensemble, pas par appariement à
 * une puce (ADR-14, décision 5) — `fact_identity`.
 *
 * Montée en responsabilité (verb) : le rang du verbe produit ne dépasse
 * jamais le rang le plus élevé présent dans les faits `kind: 'verb'`
 * (ADR-14, décision 5) — `verb_rank`. Un verbe absent de toutes les listes
 * de l'échelle n'est jamais une violation. Aucun fait `verb` connu signifie
 * aucun plafond connu : le contrôle ne s'applique pas plutôt que de pénaliser
 * sur une base absente.
 */
export function checkFacts(
  producedText: string,
  facts: AnchoringFact[],
  verbLadder: string[][],
): Violation[] {
  const violations: Violation[] = [];

  const knownWords = new Set(
    facts.filter((f) => f.kind === 'proper_noun').map((f) => f.normalized),
  );
  const knownYears = new Set(
    facts.filter((f) => f.kind === 'date').map((f) => f.normalized),
  );
  const knownDurations = new Set(
    facts.filter((f) => f.kind === 'duration').map((f) => f.normalized),
  );
  const durationValues = facts
    .filter((f) => f.kind === 'duration')
    .map((f) => f.value);

  for (const match of producedText.matchAll(CAPITALIZED_RUN)) {
    const run = match[0];
    const words = wordsOf(run);
    const allKnown = words.every((word) => knownWords.has(word));
    if (!allKnown) {
      violations.push({
        category: 'fault',
        type: 'unanchored_fact',
        value: run,
      });
    }
  }

  for (const match of producedText.matchAll(YEAR)) {
    if (!knownYears.has(match[0])) {
      violations.push({
        category: 'fault',
        type: 'unanchored_fact',
        value: match[0],
      });
    }
  }

  for (const match of producedText.matchAll(DURATION)) {
    const normalized = normalizeDuration(
      Number.parseInt(match[1], 10),
      match[2],
    );
    // Passe-droit assumé (correction O, revue senior), même raisonnement
    // que « verbe absent de l'échelle » : experienceDurationFacts ne
    // produit jamais que des durées en mois (voir normalizeDuration), donc
    // une phrase de disponibilité en semaines ou en jours — recommandée
    // par HEC Montréal — n'a jamais de fait connu de son unité à comparer.
    // On sous-détecte plutôt que de rejeter une lettre honnête.
    if (!normalized.endsWith('m')) {
      continue;
    }
    if (!knownDurations.has(normalized)) {
      violations.push({
        category: 'fault',
        type: 'fact_identity',
        found: normalized,
        expected: durationValues.join(' ou ') || 'aucune durée connue',
      });
    }
  }

  const verbFacts = facts.filter((f) => f.kind === 'verb');
  if (verbFacts.length > 0) {
    const ceiling = Math.max(...verbFacts.map((f) => Number(f.normalized)));
    for (const word of wordsOf(producedText)) {
      const rank = findVerbRank(word, verbLadder);
      if (rank !== null && rank > ceiling) {
        violations.push({
          category: 'imprecision',
          type: 'verb_rank',
          found: word,
          expected: verbLadder[ceiling][0],
        });
      }
    }
  }

  return violations;
}

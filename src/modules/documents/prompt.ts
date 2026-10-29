import type { ProfileDto } from '../profiles/dto/profile.dto.js';
import type { Language, MarketNorm } from './market-norm.js';

export interface CoverLetterPromptInput {
  profile: ProfileDto;
  offer: { title: string; company: string | null; description: string };
  norm: MarketNorm;
}

const LANGUAGE_NAME: Record<Language, string> = {
  fr: 'français',
  en: 'anglais',
};

/** Marge minimale en-dessous de laquelle une bande cible ne veut plus rien dire. */
const MIN_REQUESTED_BAND_WIDTH = 40;

/**
 * Correction 1 / E — la marge demandée vient de ce qu'elle compense : le
 * nombre de mots qu'une correction mécanique (étape 2 de l'ADR-16) peut
 * retirer avant le contrôle de longueur, pas un pourcentage fixe de la
 * fourchette entière. Une phrase interdite autonome ou un superlatif
 * retiré pèsent chacun une poignée de mots — d'où un plancher absolu
 * (20 côté bas, 10 côté haut), avec un pourcentage de la largeur comme
 * relais sur une fourchette large où un plancher fixe serait négligeable.
 *
 * Le plancher absolu peut inverser la bande sur une fourchette très
 * étroite (ex. [300, 320], largeur 20) : `min + 20` dépasserait `max - 10`.
 * Dans ce cas, on redistribue le peu de place disponible proportionnellement
 * entre les deux marges plutôt que de laisser une bande inversée ; si même
 * cela ne laisse aucune place (fourchette plus étroite que la bande
 * minimale elle-même), on retombe sur l'inset le plus faible qui garde la
 * bande strictement à l'intérieur — aucune norme réelle n'est aujourd'hui
 * aussi étroite, mais la fonction ne doit jamais produire un résultat
 * incohérent si une le devenait.
 */
export function computeRequestedWordRange(
  lengthRange: [number, number],
): [number, number] {
  const [min, max] = lengthRange;
  const width = max - min;

  const marginLow = Math.max(20, Math.round(width * 0.15));
  const marginHigh = Math.max(10, Math.round(width * 0.1));

  let low = min + marginLow;
  let high = max - marginHigh;

  if (high - low < MIN_REQUESTED_BAND_WIDTH) {
    const roomForMinimalBand = width - MIN_REQUESTED_BAND_WIDTH;
    if (roomForMinimalBand > 0) {
      const lowShareOfMargin = marginLow / (marginLow + marginHigh);
      low = min + Math.round(roomForMinimalBand * lowShareOfMargin);
      high = low + MIN_REQUESTED_BAND_WIDTH;
    } else {
      low = min + 1;
      high = max - 1;
    }
  }

  return [low, high];
}

/**
 * Pure : seules les données de `input` peuvent apparaître dans le résultat.
 * Aucune autre source — c'est ce qu'un test unitaire doit pouvoir démontrer
 * sans dépendre du réseau ni d'une base.
 *
 * Ne demande que le corps de la lettre — aucune date, aucun en-tête, aucune
 * formule de signature : ces éléments appartiennent au rendu (hors
 * périmètre de ce ticket), et une date du jour dans le corps ferait
 * systématiquement échouer le contrôle de faits (voir fact-checking.ts).
 */
export function buildCoverLetterPrompt(input: CoverLetterPromptInput): string {
  const { profile, offer, norm } = input;

  const experiences = profile.experiences
    .map((experience) => {
      const period = experience.endDate
        ? `${experience.startDate} – ${experience.endDate}`
        : `depuis ${experience.startDate}`;
      const summary = experience.summary ? ` ${experience.summary}` : '';
      return `- ${experience.title} chez ${experience.company} (${period}).${summary}`;
    })
    .join('\n');

  const skills = profile.skills.map((skill) => skill.name).join(', ');

  const [minParagraphs, maxParagraphs] = norm.letter.paragraphCount;
  const [minWords, maxWords] = computeRequestedWordRange(
    norm.letter.lengthRange,
  );

  const forbiddenFormulas = [
    ...norm.letter.forbiddenFormulas.standalone,
    ...norm.letter.forbiddenFormulas.embedded,
  ];

  const lines = [
    `Tu écris le corps d'une lettre de motivation en ${LANGUAGE_NAME[norm.language]}, pour ${profile.fullName}.`,
    "N'écris JAMAIS de date ni de formule de signature séparée : seulement le corps, ouverture et clôture comprises.",
    `Écris entre ${minParagraphs} et ${maxParagraphs} paragraphes, pour un total d'environ ${minWords} à ${maxWords} mots.`,
  ];

  if (norm.letter.openingFormula !== null) {
    lines.push(
      `La première ligne doit être exactement : « ${norm.letter.openingFormula} »`,
    );
  }
  if (norm.letter.closingFormula !== null) {
    lines.push(
      `La dernière ligne doit être exactement : « ${norm.letter.closingFormula} »`,
    );
  }
  if (forbiddenFormulas.length > 0) {
    lines.push(
      "N'utilise jamais ces formules toutes faites, ni telles quelles ni intégrées à une phrase :",
      forbiddenFormulas.map((formula) => `- ${formula}`).join('\n'),
    );
  }

  lines.push(
    '',
    `Poste visé : ${offer.title}${offer.company ? ` chez ${offer.company}` : ''}.`,
    `Description du poste : ${offer.description}`,
    '',
    "Expérience du candidat (n'invente aucun fait hors de cette liste) :",
    experiences || '(aucune expérience renseignée)',
    '',
    `Compétences du candidat : ${skills || '(aucune compétence renseignée)'}`,
  );

  return lines.join('\n');
}

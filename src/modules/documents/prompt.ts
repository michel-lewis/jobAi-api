import type { ProfileDto } from '../profiles/dto/profile.dto.js';

export interface CoverLetterPromptInput {
  profile: ProfileDto;
  offer: { title: string; company: string | null; description: string };
}

/**
 * Pure : seules les données de `input` peuvent apparaître dans le résultat.
 * Aucune autre source — c'est ce qu'un test unitaire doit pouvoir démontrer
 * sans dépendre du réseau ni d'une base.
 *
 * Ne demande que le corps de la lettre — aucune date, aucun en-tête, aucune
 * formule de signature : ces éléments appartiennent au rendu (hors
 * périmètre de ce ticket), et une date du jour dans le corps ferait
 * systématiquement échouer le contrôle d'ancrage (voir anchoring.ts).
 */
export function buildCoverLetterPrompt(input: CoverLetterPromptInput): string {
  const { profile, offer } = input;

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

  return [
    `Tu écris le corps d'une lettre de motivation en français, pour ${profile.fullName}.`,
    "N'écris JAMAIS de date, d'en-tête ni de formule de signature : seulement le corps.",
    '',
    `Poste visé : ${offer.title}${offer.company ? ` chez ${offer.company}` : ''}.`,
    `Description du poste : ${offer.description}`,
    '',
    "Expérience du candidat (n'invente aucun fait hors de cette liste) :",
    experiences || '(aucune expérience renseignée)',
    '',
    `Compétences du candidat : ${skills || '(aucune compétence renseignée)'}`,
  ].join('\n');
}

import type { ProfileDto } from '../profiles/dto/profile.dto.js';
import type { MarketNorm } from './market-norm.js';

/**
 * Distinct de `generation_failed` (ADR-16) : rien n'a été tenté. Réutiliser
 * le motif d'un échec de génération serait faux, et le ticket G compte les
 * échecs de génération comme métrique — un pré-vol raté n'en est pas un.
 * `'low_match'` est réservé au score du ticket J, jamais émis aujourd'hui.
 */
export type GenerationBlockedReason = 'incomplete_profile' | 'low_match';

export type PreflightResult =
  | { ok: true; superlatifsAutorisés: string[] }
  | { ok: false; reason: GenerationBlockedReason };

function textsOf(
  profile: ProfileDto,
  offer: { title: string; company: string | null; description: string },
): string[] {
  const texts: (string | null)[] = [
    profile.headline,
    profile.summary,
    offer.title,
    offer.company,
    offer.description,
  ];
  for (const experience of profile.experiences) {
    texts.push(experience.summary);
    for (const bullet of experience.bullets) {
      texts.push(bullet.text);
    }
  }
  return texts.filter((text): text is string => Boolean(text));
}

/**
 * L'intersection entre la liste fermée de la langue résolue et les
 * superlatifs effectivement présents dans le profil et l'offre (ADR-16,
 * étape 0) — jamais un superlatif absent de la source n'y figure.
 */
export function computeAllowedSuperlatives(
  profile: ProfileDto,
  offer: { title: string; company: string | null; description: string },
  superlatives: string[],
): string[] {
  const sourceText = textsOf(profile, offer).join(' ').toLowerCase();
  return superlatives.filter((superlative) =>
    sourceText.includes(superlative.toLowerCase()),
  );
}

/**
 * Code pur, aucun appel LLM (ADR-16, étape 0). Vérifie que le profil est
 * suffisant et calcule `superlatifsAutorisés` — la seule étape qui voit le
 * profil et l'offre ensemble, avant que l'étape 2 n'en ait besoin.
 */
export function preflight(
  profile: ProfileDto,
  offer: { title: string; company: string | null; description: string },
  norm: MarketNorm,
): PreflightResult {
  if (profile.experiences.length === 0 && profile.skills.length === 0) {
    return { ok: false, reason: 'incomplete_profile' };
  }

  return {
    ok: true,
    superlatifsAutorisés: computeAllowedSuperlatives(
      profile,
      offer,
      norm.superlatives,
    ),
  };
}

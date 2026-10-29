import type { LetterNorm } from './market-norm.js';

function stripTrailingPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/, '');
}

/**
 * Suppression mécanique (ADR-14, 3a) : un tiret cadratin se remplace par
 * une virgule sans jamais changer le sens.
 */
function removeEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ', ');
}

/**
 * Une formule interdite (standalone ou embedded, peu importe la liste
 * d'origine — ADR-14, décision 3a) qui forme, dans cette occurrence, sa
 * propre phrase se retire sans laisser de trou grammatical. Opère au
 * niveau de la ligne : les tests comme le pipeline réel produisent une
 * phrase interdite autonome sur sa propre ligne.
 */
function removeStandaloneForbiddenFormulas(
  text: string,
  letterNorm: LetterNorm,
): string {
  const allForbidden = [
    ...letterNorm.forbiddenFormulas.standalone,
    ...letterNorm.forbiddenFormulas.embedded,
  ].map((phrase) => stripTrailingPunctuation(phrase).toLowerCase());

  return text
    .split('\n')
    .filter((line) => {
      const normalized = stripTrailingPunctuation(line).toLowerCase();
      if (normalized.length === 0) {
        return true;
      }
      return !allForbidden.includes(normalized);
    })
    .join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `superlatives` (le catalogue complet du marché) dit quoi chercher ;
 * `allowedSuperlatives` (calculé à l'étape 0) dit lequel garder — le
 * sous-ensemble autorisé seul ne suffit pas, il ne porte aucune
 * information sur ce qui compte comme un superlatif au départ (ADR-16,
 * étape 2). `\w*` après le radical attrape les accords grammaticaux
 * (« exceptionnel » trouve aussi « exceptionnelle »).
 */
function removeDisallowedSuperlatives(
  text: string,
  superlatives: string[],
  allowedSuperlatives: string[],
): string {
  const allowed = new Set(allowedSuperlatives.map((s) => s.toLowerCase()));
  let result = text;
  for (const superlative of superlatives) {
    if (allowed.has(superlative.toLowerCase())) {
      continue;
    }
    // Bornée aux terminaisons d'accord françaises réelles (masculin,
    // pluriel, féminin, féminin pluriel), jamais à `\w*` (correction A,
    // revue senior) : `\w*` collé au radical attrapait aussi un mot
    // distinct qui commence par les mêmes lettres — « uniquement » sous le
    // filtre de « unique », « exceptionnellement » sous celui
    // d'« exceptionnel ». Le `\b` final rejette ces cas : aucune
    // terminaison de la liste ne laisse la frontière de mot tomber au
    // milieu de leur suffixe réel ("-ment").
    //
    // Capture un seul espace de chaque côté (jamais `\s*`, qui franchirait
    // une fin de ligne) plutôt que de toujours consommer celui de devant
    // (revue senior) : au tout début d'une ligne, il n'y a rien avant à
    // consommer, et l'ancien motif laissait alors une espace résiduelle en
    // tête de ligne. Garder un seul espace si les deux côtés en avaient
    // un, sinon aucun — jamais de mots recollés, jamais d'espace orpheline.
    const pattern = new RegExp(
      `([ \\t]?)\\b${escapeRegExp(superlative)}(?:les|le|s)?\\b([ \\t]?)`,
      'gi',
    );
    result = result.replace(pattern, (_match, before: string, after: string) =>
      before && after ? ' ' : '',
    );
  }
  return result;
}

/**
 * Fonction pure de quatre entrées, chacune avec un besoin distinct
 * (ADR-16, étape 2) : le tiret cadratin ne demande rien d'autre que le
 * texte brut ; la formule interdite demande `letterNorm` (la liste change
 * par langue/marché) ; le superlatif ajouté demande les deux listes de
 * superlatifs — le catalogue complet pour reconnaître un candidat, le
 * sous-ensemble autorisé pour savoir lequel garder.
 */
export function applyMechanicalCorrections(
  rawText: string,
  letterNorm: LetterNorm,
  superlatives: string[],
  allowedSuperlatives: string[],
): string {
  let text = removeEmDashes(rawText);
  text = removeStandaloneForbiddenFormulas(text, letterNorm);
  text = removeDisallowedSuperlatives(text, superlatives, allowedSuperlatives);
  return text;
}

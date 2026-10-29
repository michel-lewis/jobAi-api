import type { LetterNorm } from './market-norm.js';
import type { Violation } from './violations.js';

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * Nombre de blocs/lignes, depuis le début du texte, où la formule
 * d'ouverture est cherchée — pas seulement la première (correction L).
 * HEC Montréal recommande une ligne « Objet : ... » avant la salutation ;
 * un contrôle limité à la ligne 1 rejetterait à tort une lettre conforme à
 * cette recommandation. 3 : assez pour couvrir un objet et une référence
 * sur deux lignes avant la salutation, sans laisser la fenêtre devenir
 * illimitée — une salutation trouvée n'importe où dans le corps ne doit
 * jamais passer pour une ouverture correcte. Partagée par le contrôle de
 * ligne (ci-dessous) et par `bodyBlocksOf` (correction R) : les deux
 * doivent reconnaître exactement le même préambule, pas deux définitions
 * séparées de « avant le corps ».
 */
const OPENING_FORMULA_WINDOW = 3;

/**
 * Corrections N, Q et R (revue senior) — la salutation et la clôture sont
 * chacune leur propre bloc (séparées du corps par une ligne vide), pas
 * des paragraphes de corps : les sources citées (HEC Montréal, Michael
 * Page Canada) comptent des paragraphes DE CORPS, jamais la salutation ni
 * la clôture. La salutation est cherchée dans les `OPENING_FORMULA_WINDOW`
 * premiers blocs, pas seulement blocs[0] (correction R) : la fenêtre de la
 * correction L autorise un « Objet : » devant elle, qui formerait alors
 * son propre bloc, décalant la salutation — un contrôle limité à blocs[0]
 * ne la retirerait jamais, et compterait l'« Objet : » lui-même comme un
 * paragraphe de corps. Trouvée, la salutation ET tout ce qui la précède
 * sont écartés — pas seulement elle.
 */
function bodyBlocksOf(blocks: string[], letterNorm: LetterNorm): string[] {
  let start = 0;
  let end = blocks.length;
  if (letterNorm.openingFormula !== null) {
    const windowEnd = Math.min(OPENING_FORMULA_WINDOW, blocks.length);
    const openingIndex = blocks
      .slice(0, windowEnd)
      .indexOf(letterNorm.openingFormula);
    if (openingIndex !== -1) {
      start = openingIndex + 1;
    }
  }
  if (
    letterNorm.closingFormula !== null &&
    end > start &&
    blocks[end - 1] === letterNorm.closingFormula
  ) {
    end -= 1;
  }
  return blocks.slice(start, end);
}

function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function stripTrailingPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Frontière de mot, pas une sous-chaîne brute : « véritablement » ne doit
 * jamais matcher « véritable ». `\b` ne reconnaît que les caractères ASCII
 * comme caractères de mot, mais la frontière recherchée est toujours à une
 * limite — début/fin de phrase, espace, ponctuation — jamais au milieu
 * d'un mot accentué, donc ça reste correct pour nos formules.
 */
function containsWholePhrase(sentence: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`).test(sentence);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Correction 7 — une formule interdite répétée dans plusieurs phrases
 * empilait autant de violations que d'occurrences, donc le prompt de
 * correction répétait la même consigne. Dédupliquée par type et par
 * valeur (`found`) : toutes les violations de ce fichier portent ce champ.
 */
function dedupeViolations(violations: Violation[]): Violation[] {
  const seen = new Set<string>();
  const result: Violation[] = [];
  for (const violation of violations) {
    const value = 'found' in violation ? violation.found : null;
    const key = `${violation.type}::${JSON.stringify(value)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(violation);
    }
  }
  return result;
}

/**
 * Ne reçoit que la norme résolue (ADR-16) — jamais l'offre, jamais le
 * profil, aucun service injecté : l'aveuglement est garanti par la
 * signature, pas par la discipline de qui l'appelle.
 */
export function checkMarketFormat(
  producedText: string,
  letterNorm: LetterNorm,
): Violation[] {
  const violations: Violation[] = [];

  const bodyBlocks = bodyBlocksOf(paragraphsOf(producedText), letterNorm);
  const bodyText = bodyBlocks.join('\n\n');

  const wordCount = countWords(bodyText);
  const [min, max] = letterNorm.lengthRange;
  if (wordCount < min || wordCount > max) {
    violations.push({
      category: 'imprecision',
      type: 'length',
      found: wordCount,
      expectedRange: letterNorm.lengthRange,
    });
  }

  const paragraphCount = bodyBlocks.length;
  const [minParagraphs, maxParagraphs] = letterNorm.paragraphCount;
  if (paragraphCount < minParagraphs || paragraphCount > maxParagraphs) {
    violations.push({
      category: 'imprecision',
      type: 'paragraph_count',
      found: paragraphCount,
      expected: letterNorm.paragraphCount,
    });
  }

  const lines = linesOf(producedText);
  const firstLine = lines[0] ?? null;
  const openingWindow = lines.slice(0, OPENING_FORMULA_WINDOW);
  if (
    letterNorm.openingFormula !== null &&
    !openingWindow.includes(letterNorm.openingFormula)
  ) {
    violations.push({
      category: 'imprecision',
      type: 'opening_formula',
      found: firstLine,
      expected: letterNorm.openingFormula,
    });
  }

  const lastLine = lines[lines.length - 1] ?? null;
  if (
    letterNorm.closingFormula !== null &&
    lastLine !== letterNorm.closingFormula
  ) {
    violations.push({
      category: 'imprecision',
      type: 'closing_formula',
      found: lastLine,
      expected: letterNorm.closingFormula,
    });
  }

  // La position dans le texte produit tranche la catégorie, jamais la liste
  // d'origine (ADR-14, décision 3a) : une formule qui forme, dans cette
  // occurrence, sa propre phrase est déjà corrigée mécaniquement avant que
  // ce contrôle ne s'exécute (ADR-16, étape 2) — si elle apparaît malgré
  // tout ici, c'est qu'elle est intégrée à une phrase plus longue.
  const sentences = splitSentences(producedText);
  const allForbidden = [
    ...letterNorm.forbiddenFormulas.standalone,
    ...letterNorm.forbiddenFormulas.embedded,
  ];
  for (const phrase of allForbidden) {
    const normalizedPhrase = stripTrailingPunctuation(phrase).toLowerCase();
    for (const sentence of sentences) {
      const normalizedSentence =
        stripTrailingPunctuation(sentence).toLowerCase();
      if (normalizedSentence === normalizedPhrase) {
        continue;
      }
      if (containsWholePhrase(normalizedSentence, normalizedPhrase)) {
        violations.push({
          category: 'imprecision',
          type: 'embedded_forbidden_formula',
          found: phrase,
        });
      }
    }
  }

  return dedupeViolations(violations);
}

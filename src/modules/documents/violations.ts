/**
 * Une faute court-circuite tout tour de correction (ADR-16) : inventer un
 * fait, ou en changer la valeur, n'est pas corrigé par le simple fait de
 * recommencer.
 */
export type Violation =
  | { category: 'fault'; type: 'unanchored_fact'; value: string }
  | {
      category: 'fault';
      type: 'fact_identity';
      found: string;
      expected: string;
    }
  | {
      category: 'imprecision';
      type: 'verb_rank';
      found: string;
      expected: string;
    }
  | {
      category: 'imprecision';
      type: 'length';
      found: number;
      expectedRange: [number, number];
    }
  | {
      category: 'imprecision';
      type: 'paragraph_count';
      found: number;
      expected: [number, number];
    }
  | {
      category: 'imprecision';
      type: 'opening_formula';
      found: string | null;
      expected: string;
    }
  | {
      category: 'imprecision';
      type: 'closing_formula';
      found: string | null;
      expected: string;
    }
  | {
      category: 'imprecision';
      type: 'embedded_forbidden_formula';
      found: string;
    };

/**
 * Le mécanisme qui porte la décision « rejet immédiat » en aval (ADR-16) :
 * une seule faute, peu importe le vérificateur qui l'a trouvée, empêche tout
 * tour de correction.
 */
export function hasFault(violations: Violation[]): boolean {
  return violations.some((violation) => violation.category === 'fault');
}

function describeViolation(violation: Violation): string {
  switch (violation.type) {
    case 'unanchored_fact':
      return `- Fait non ancré, ne devrait jamais atteindre une correction : « ${violation.value} ».`;
    case 'fact_identity':
      return `- Fait dont la valeur a changé, ne devrait jamais atteindre une correction : « ${violation.found} ».`;
    case 'length':
      return `- Longueur hors fourchette attendue (${violation.expectedRange[0]}-${violation.expectedRange[1]} mots), actuellement ${violation.found} mots.`;
    case 'paragraph_count':
      return `- Nombre de paragraphes attendu : entre ${violation.expected[0]} et ${violation.expected[1]}, actuellement ${violation.found}.`;
    case 'opening_formula':
      return `- Formule d'ouverture attendue : « ${violation.expected} ».`;
    case 'closing_formula':
      return `- Formule de clôture attendue : « ${violation.expected} ».`;
    case 'embedded_forbidden_formula':
      return `- Retire ou reformule la formule interdite : « ${violation.found} ».`;
    case 'verb_rank':
      return `- Remplace le verbe « ${violation.found} » par un verbe de rang équivalent à « ${violation.expected} ».`;
  }
}

/**
 * Jamais le profil, jamais l'offre (ADR-16) : la correction n'a besoin que
 * du texte produit et de ce qui est faux dans ce texte.
 */
export function buildCorrectionPrompt(
  producedText: string,
  violations: Violation[],
): string {
  return [
    'Voici le texte produit à corriger :',
    producedText,
    '',
    'Corrige exactement les écarts suivants, sans en introduire de nouveaux :',
    ...violations.map(describeViolation),
  ].join('\n');
}

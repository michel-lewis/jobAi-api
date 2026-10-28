import { buildCorrectionPrompt, hasFault } from './violations.js';
import type { Violation } from './violations.js';

describe('hasFault', () => {
  // Preuves 3 et 4 — une faute (fait non ancré ou identité d'un fait
  // modifiée) doit toujours faire basculer hasFault à true : c'est ce
  // booléen qui, dans le pipeline, court-circuite tout tour de correction
  // pour un rejet immédiat (ADR-16).
  it('renvoie true dès qu une violation de catégorie fault est présente', () => {
    const violations: Violation[] = [
      {
        category: 'fault',
        type: 'unanchored_fact',
        value: 'Globex Corporation',
      },
    ];

    expect(hasFault(violations)).toBe(true);
  });

  it('renvoie true pour une violation fact_identity, au même titre qu un fait non ancré', () => {
    const violations: Violation[] = [
      {
        category: 'fault',
        type: 'fact_identity',
        found: '5',
        expected: '3',
      },
    ];

    expect(hasFault(violations)).toBe(true);
  });

  // Preuves 6, 7, 8 — une liste qui ne contient que des imprécisions ne
  // doit jamais déclencher la branche de rejet immédiat.
  it('renvoie false quand la liste ne contient que des imprécisions', () => {
    const violations: Violation[] = [
      {
        category: 'imprecision',
        type: 'paragraph_count',
        found: 2,
        // Changement de TYPE mécanique requis par l'interface validée
        // (paragraphCount devient une fourchette) — hasFault ne regarde que
        // `category`, aucune assertion de comportement ne change.
        expected: [3, 3],
      },
      {
        category: 'imprecision',
        type: 'opening_formula',
        found: 'Bonjour,',
        expected: 'Madame, Monsieur,',
      },
    ];

    expect(hasFault(violations)).toBe(false);
  });

  it('renvoie false pour une liste vide', () => {
    expect(hasFault([])).toBe(false);
  });
});

describe('buildCorrectionPrompt', () => {
  // Preuves 5/6/7/8 — la consigne renforcée doit porter la valeur attendue
  // de chaque violation, pas seulement rappeler la règle : c'est ce qui
  // permet une correction visée plutôt qu'une nouvelle génération à
  // l'aveugle (ADR-16).
  it('porte la valeur attendue d une violation de longueur dans la consigne renforcée', () => {
    const violations: Violation[] = [
      {
        category: 'imprecision',
        type: 'length',
        found: 180,
        expectedRange: [250, 350],
      },
    ];

    const prompt = buildCorrectionPrompt(
      'Texte produit trop court.',
      violations,
    );

    expect(prompt).toContain('250');
    expect(prompt).toContain('350');
  });

  it('porte le texte produit fourni en paramètre', () => {
    const producedText =
      'Corps de lettre à corriger, texte distinctif Qorzimbaluth.';
    const violations: Violation[] = [
      {
        category: 'imprecision',
        type: 'closing_formula',
        found: null,
        expected: 'Cordialement,',
      },
    ];

    const prompt = buildCorrectionPrompt(producedText, violations);

    expect(prompt).toContain('Qorzimbaluth');
  });
});

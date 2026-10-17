import { checkMarketFormat } from './market-format.js';
import { hasFault } from './violations.js';
import type { LetterNorm } from './market-norm.js';

/**
 * Local à ce fichier — voir fact-checking.spec.ts pour la même décision.
 */
function makeLetterNorm(overrides: Partial<LetterNorm> = {}): LetterNorm {
  return {
    lengthRange: [250, 350],
    paragraphCount: 3,
    openingFormula: 'Madame, Monsieur,',
    closingFormula: 'Cordialement,',
    forbiddenFormulas: {
      standalone: [
        'Je vous écris pour exprimer mon intérêt pour ce poste.',
        'Je me permets de vous adresser ma candidature.',
        "C'est avec un grand intérêt que j'ai pris connaissance de votre annonce.",
        'Je reste à votre disposition pour tout complément d’information.',
      ],
      embedded: [
        'force de proposition',
        "esprit d'équipe",
        'dynamique et motivé',
        'passionné par',
        'véritable',
        'plus-value',
        'à la pointe',
      ],
    },
    ...overrides,
  };
}

function wordsText(count: number): string {
  return Array.from({ length: count }, (_, i) => `mot${i}`).join(' ');
}

describe('checkMarketFormat', () => {
  // Preuve 5 (partielle — voir le rapport : le calcul de la tolérance ±10%
  // et la décision finale livrer/rejeter après la seconde tentative ne sont
  // portés par aucune fonction de l'interface validée). Ce test prouve
  // uniquement que checkMarketFormat classe l'écart de longueur en
  // imprécision, jamais en faute — la condition nécessaire pour qu'un
  // nouvel essai, plutôt qu'un rejet immédiat, soit déclenché.
  it('une lettre trop courte par rapport à la fourchette du marché est une imprécision de longueur, jamais une faute', () => {
    const letterNorm = makeLetterNorm({ lengthRange: [250, 350] });
    const text = wordsText(100);

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({ category: 'imprecision', type: 'length' }),
    );
    expect(hasFault(violations)).toBe(false);
  });

  // Preuve 6 — le nombre de paragraphes déclenche une imprécision, pas un
  // rejet immédiat.
  it('un nombre de paragraphes différent de la cible du marché est une imprécision, jamais une faute', () => {
    const letterNorm = makeLetterNorm({ paragraphCount: 3 });
    const text = ['Paragraphe un.', 'Paragraphe deux.'].join('\n\n');

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'paragraph_count',
        expected: 3,
      }),
    );
    expect(hasFault(violations)).toBe(false);
  });

  // Preuve 7 — la formule d'ouverture attendue par le marché.
  it('une formule d ouverture différente de celle du marché est une imprécision, jamais une faute', () => {
    const letterNorm = makeLetterNorm({ openingFormula: 'Madame, Monsieur,' });
    const text = ['Bonjour,', '', 'Corps de la lettre.'].join('\n');

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'opening_formula',
        expected: 'Madame, Monsieur,',
      }),
    );
    expect(hasFault(violations)).toBe(false);
  });

  // Preuve 8 — la formule de clôture attendue par le marché.
  it('une formule de clôture différente de celle du marché est une imprécision, jamais une faute', () => {
    const letterNorm = makeLetterNorm({ closingFormula: 'Cordialement,' });
    const text = [
      'Madame, Monsieur,',
      '',
      'Corps de la lettre.',
      '',
      'Salutations,',
    ].join('\n');

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'closing_formula',
        expected: 'Cordialement,',
      }),
    );
    expect(hasFault(violations)).toBe(false);
  });

  // Preuve 12 (moitié « intégrée ») — une formule interdite cataloguée
  // comme `standalone` mais qui apparaît, dans CETTE occurrence, à
  // l'intérieur d'une phrase plus longue est une imprécision — la position
  // dans le texte décide, pas la liste d'origine.
  it('une formule du catalogue standalone intégrée dans une phrase plus longue déclenche une imprécision, pas une correction mécanique', () => {
    const letterNorm = makeLetterNorm();
    const text =
      'Après avoir lu votre annonce, je reste à votre disposition pour tout complément d’information et je me tiens disponible pour un entretien.';

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'embedded_forbidden_formula',
      }),
    );
  });

  // Preuve 12 (cas droit, manquant) — une formule du catalogue `embedded`,
  // utilisée à l'intérieur d'une phrase plus longue (son usage normal, pas
  // croisé avec `standalone`), déclenche une imprécision.
  it('une formule du catalogue embedded utilisée à l intérieur d une phrase est une imprécision de type embedded_forbidden_formula', () => {
    const letterNorm = makeLetterNorm();
    const text =
      'Mon profil est, je crois, une bonne force de proposition pour cette équipe.';

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'embedded_forbidden_formula',
        found: 'force de proposition',
      }),
    );
  });
});

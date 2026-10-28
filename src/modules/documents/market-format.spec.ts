import { checkMarketFormat } from './market-format.js';
import { hasFault } from './violations.js';
import type { LetterNorm } from './market-norm.js';

/**
 * Local à ce fichier — voir fact-checking.spec.ts pour la même décision.
 */
function makeLetterNorm(overrides: Partial<LetterNorm> = {}): LetterNorm {
  return {
    lengthRange: [250, 350],
    // Changement de TYPE mécanique requis par l'interface validée
    // (paragraphCount devient une fourchette) — aucune assertion ne change.
    paragraphCount: [3, 3],
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
  //
  // MODIFICATION (interface validée — paragraphCount devient [number,
  // number]) — l'override et l'assertion `expected` passent du scalaire `3`
  // à la fourchette `[3, 3]`. Aucune assertion de comportement ne change :
  // le texte a toujours 2 paragraphes, la cible est toujours « exactement
  // 3 » — seule la FORME imposée par le nouveau type change. Loggé ici
  // explicitement, comme demandé.
  it('un nombre de paragraphes différent de la cible du marché est une imprécision, jamais une faute', () => {
    const letterNorm = makeLetterNorm({ paragraphCount: [3, 3] });
    const text = ['Paragraphe un.', 'Paragraphe deux.'].join('\n\n');

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'paragraph_count',
        expected: [3, 3],
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

  // Régression (revue senior) — un mot qui contient une formule interdite
  // comme simple sous-chaîne ne doit jamais déclencher de violation :
  // « véritablement » n'est pas « véritable ».
  it('un mot qui contient une formule interdite comme sous chaine n est jamais une violation', () => {
    const letterNorm = makeLetterNorm();
    const text =
      "C'est véritablement un poste qui correspond à mon parcours professionnel.";

    const violations = checkMarketFormat(text, letterNorm);

    const embeddedViolations = violations.filter(
      (violation) => violation.type === 'embedded_forbidden_formula',
    );
    expect(embeddedViolations).toHaveLength(0);
  });

  // Correction J — paragraphCount devient une fourchette [min, max], plus
  // une cible unique. Un texte dont le nombre de paragraphes tombe dans la
  // fourchette ne déclenche jamais de violation paragraph_count, qu'il soit
  // à la borne basse ou à la borne haute.
  it('un texte de 3 paragraphes passe avec une fourchette de paragraphCount 3 a 5', () => {
    const letterNorm = makeLetterNorm({ paragraphCount: [3, 5] });
    const text = [
      'Paragraphe un.',
      'Paragraphe deux.',
      'Paragraphe trois.',
    ].join('\n\n');

    const violations = checkMarketFormat(text, letterNorm);

    const paragraphViolations = violations.filter(
      (violation) => violation.type === 'paragraph_count',
    );
    expect(paragraphViolations).toHaveLength(0);
  });

  it('un texte de 5 paragraphes passe avec une fourchette de paragraphCount 3 a 5', () => {
    const letterNorm = makeLetterNorm({ paragraphCount: [3, 5] });
    const text = [
      'Paragraphe un.',
      'Paragraphe deux.',
      'Paragraphe trois.',
      'Paragraphe quatre.',
      'Paragraphe cinq.',
    ].join('\n\n');

    const violations = checkMarketFormat(text, letterNorm);

    const paragraphViolations = violations.filter(
      (violation) => violation.type === 'paragraph_count',
    );
    expect(paragraphViolations).toHaveLength(0);
  });

  it('un texte de 2 paragraphes échoue avec une fourchette de paragraphCount 3 a 5', () => {
    const letterNorm = makeLetterNorm({ paragraphCount: [3, 5] });
    const text = ['Paragraphe un.', 'Paragraphe deux.'].join('\n\n');

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'paragraph_count',
        expected: [3, 5],
      }),
    );
  });

  it('un texte de 6 paragraphes échoue avec une fourchette de paragraphCount 3 a 5', () => {
    const letterNorm = makeLetterNorm({ paragraphCount: [3, 5] });
    const text = [
      'Paragraphe un.',
      'Paragraphe deux.',
      'Paragraphe trois.',
      'Paragraphe quatre.',
      'Paragraphe cinq.',
      'Paragraphe six.',
    ].join('\n\n');

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'paragraph_count',
        expected: [3, 5],
      }),
    );
  });

  // Correction L — la formule d'ouverture doit être recherchée dans les 3
  // premières lignes non vides du texte produit, pas seulement la première.
  it('la salutation en ligne 1 ne déclenche aucune violation opening formula', () => {
    const letterNorm = makeLetterNorm({ openingFormula: 'Madame, Monsieur,' });
    const text = [
      'Madame, Monsieur,',
      '',
      'Corps de la lettre.',
      '',
      'Cordialement,',
    ].join('\n');

    const violations = checkMarketFormat(text, letterNorm);

    const openingViolations = violations.filter(
      (violation) => violation.type === 'opening_formula',
    );
    expect(openingViolations).toHaveLength(0);
  });

  // Cas HEC Montréal : une ligne « Objet : ... » précède la salutation, qui
  // se retrouve en 2e ligne non vide. Le contrôle actuel (première ligne
  // seulement) la rejetterait à tort.
  it('une ligne objet suivie de la salutation en ligne 2 ne déclenche aucune violation opening formula', () => {
    const letterNorm = makeLetterNorm({ openingFormula: 'Madame, Monsieur,' });
    const text = [
      'Objet : Candidature au poste de Développeur',
      'Madame, Monsieur,',
      '',
      'Corps de la lettre.',
      '',
      'Cordialement,',
    ].join('\n');

    const violations = checkMarketFormat(text, letterNorm);

    const openingViolations = violations.filter(
      (violation) => violation.type === 'opening_formula',
    );
    expect(openingViolations).toHaveLength(0);
  });

  it('la salutation complètement absente du texte échoue avec une violation opening formula', () => {
    const letterNorm = makeLetterNorm({ openingFormula: 'Madame, Monsieur,' });
    const text = [
      'Bonjour,',
      '',
      'Corps de la lettre.',
      '',
      'Cordialement,',
    ].join('\n');

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'opening_formula',
      }),
    );
  });

  // La fenêtre ne doit pas devenir illimitée : une salutation présente
  // seulement au milieu du corps (au-delà des 3 premières lignes non vides)
  // doit continuer à échouer.
  it('la salutation présente seulement au milieu du corps échoue avec une violation opening formula', () => {
    const letterNorm = makeLetterNorm({ openingFormula: 'Madame, Monsieur,' });
    const text = [
      'Objet : Candidature au poste de Développeur',
      'Référence : 2026-042',
      'Date : 28 octobre 2026',
      'Madame, Monsieur,',
      'Corps de la lettre.',
      'Cordialement,',
    ].join('\n');

    const violations = checkMarketFormat(text, letterNorm);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'opening_formula',
      }),
    );
  });

  // Correction 7 — dédup : une formule interdite qui apparaît deux fois,
  // intégrée dans deux phrases différentes, n'apparaît qu'une seule fois
  // dans la liste des violations (dédupliquée par type et par valeur).
  it('une formule interdite qui apparaît deux fois dans le texte n apparaît qu une seule fois dans les violations', () => {
    const letterNorm = makeLetterNorm();
    const text = [
      'Mon profil est, je crois, une bonne force de proposition pour cette équipe.',
      'Je reste convaincu que je serai une vraie force de proposition dans ce poste.',
    ].join(' ');

    const violations = checkMarketFormat(text, letterNorm);

    const embeddedViolations = violations.filter(
      (violation) =>
        violation.type === 'embedded_forbidden_formula' &&
        violation.found === 'force de proposition',
    );
    expect(embeddedViolations).toHaveLength(1);
  });
});

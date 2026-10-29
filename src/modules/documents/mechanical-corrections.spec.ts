import { randomUUID } from 'node:crypto';
import { applyMechanicalCorrections } from './mechanical-corrections.js';
import { computeAllowedSuperlatives } from './preflight.js';
import type { LetterNorm } from './market-norm.js';
import type { ExperienceDto, ProfileDto } from '../profiles/dto/profile.dto.js';

/**
 * Local à ce fichier — voir fact-checking.spec.ts pour la même décision.
 */
function makeProfileDto(overrides: Partial<ProfileDto> = {}): ProfileDto {
  return {
    id: randomUUID(),
    fullName: 'Lewis Kouamkouam',
    headline: null,
    summary: null,
    email: null,
    phone: null,
    location: null,
    willingToRelocate: false,
    workPreference: null,
    workAuthorizationNote: null,
    rawCvText: null,
    experiences: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    links: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeExperience(overrides: Partial<ExperienceDto> = {}): ExperienceDto {
  return {
    company: 'Acme',
    title: 'Développeur',
    employmentType: 'full_time',
    location: null,
    startDate: '2020-01-01',
    endDate: null,
    summary: null,
    bullets: [],
    ...overrides,
  };
}

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

const offer = {
  title: 'Développeur Backend',
  company: 'Acme',
  description: 'Description du poste.',
};

describe('applyMechanicalCorrections', () => {
  // Preuve 10 — le tiret cadratin est retiré mécaniquement. Aucun type de
  // Violation ne porte le tiret cadratin : la correction doit donc avoir
  // déjà eu lieu avant que checkFacts ou checkMarketFormat ne voient le
  // texte, ce qui prouve structurellement qu'aucun second appel LLM n'est
  // nécessaire pour ce défaut — applyMechanicalCorrections est une fonction
  // synchrone pure, sans port LLM dans sa signature.
  it('un tiret cadratin est retiré du texte livré', () => {
    const letterNorm = makeLetterNorm();
    const rawText = 'Une expérience solide — acquise sur le terrain.';

    const corrected = applyMechanicalCorrections(rawText, letterNorm, [], []);

    expect(corrected).not.toContain('—');
  });

  // Preuve 11 — une formule interdite qui constitue, dans cette occurrence,
  // une phrase entière à elle seule est retirée mécaniquement.
  it('une formule interdite qui forme sa propre phrase est retirée du texte livré', () => {
    const letterNorm = makeLetterNorm();
    const rawText = [
      'Madame, Monsieur,',
      '',
      'Je reste à votre disposition pour tout complément d’information.',
      'Cordialement,',
    ].join('\n');

    const corrected = applyMechanicalCorrections(rawText, letterNorm, [], []);

    expect(corrected).not.toContain(
      'Je reste à votre disposition pour tout complément d’information.',
    );
  });

  // Preuve 12 (moitié « autonome ») — la même formule, cataloguée dans
  // `embedded`, est retirée mécaniquement dès qu'elle forme, dans cette
  // occurrence, sa propre phrase — la position décide, pas la liste
  // d'origine.
  it('une formule du catalogue embedded qui forme sa propre phrase est retirée mécaniquement, sans second appel', () => {
    const letterNorm = makeLetterNorm();
    const rawText = [
      'Madame, Monsieur,',
      '',
      'Force de proposition.',
      'Cordialement,',
    ].join('\n');

    const corrected = applyMechanicalCorrections(rawText, letterNorm, [], []);

    expect(corrected.toLowerCase()).not.toContain('force de proposition');
  });

  // Preuve 15 — un superlatif absent du profil et de l'offre est retiré
  // mécaniquement, sans second appel.
  it('un superlatif absent du profil et de l offre est retiré du texte livré', () => {
    const profile = makeProfileDto();
    const superlatives = ['exceptionnel', 'unique'];
    const allowed = computeAllowedSuperlatives(profile, offer, superlatives);
    const letterNorm = makeLetterNorm();
    const rawText = "J'ai mené une expérience exceptionnelle dans ce poste.";

    const corrected = applyMechanicalCorrections(
      rawText,
      letterNorm,
      superlatives,
      allowed,
    );

    expect(corrected.toLowerCase()).not.toContain('exceptionnel');
  });

  // Preuve 16 — un superlatif déjà présent dans le profil (ou l'offre)
  // n'est jamais retiré.
  it('un superlatif déjà présent dans le profil n est jamais retiré du texte produit', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({
          summary: 'Un parcours exceptionnel chez plusieurs clients majeurs.',
        }),
      ],
    });
    const superlatives = ['exceptionnel', 'unique'];
    const allowed = computeAllowedSuperlatives(profile, offer, superlatives);
    const letterNorm = makeLetterNorm();
    const rawText = "J'ai mené une expérience exceptionnelle dans ce poste.";

    const corrected = applyMechanicalCorrections(
      rawText,
      letterNorm,
      superlatives,
      allowed,
    );

    expect(corrected.toLowerCase()).toContain('exceptionnelle');
  });

  // Correction A (régression) — `removeDisallowedSuperlatives` retire
  // aujourd'hui n'importe quelle suite de lettres après le radical d'un
  // superlatif (`\w*` collé, sans frontière de mot), donc « uniquement »,
  // qui n'est pas une forme accordée de « unique », disparaît entièrement
  // sous l'effet du filtre. Un seul mot, sans aucun superlatif autorisé,
  // suffit à exercer le bug : aucune autre branche ne doit intervenir.
  it('le mot uniquement n est jamais tronqué par le filtre sur le superlatif unique', () => {
    const letterNorm = makeLetterNorm();
    const superlatives = ['unique'];
    const rawText = 'Je travaille uniquement avec des équipes distribuées.';

    const corrected = applyMechanicalCorrections(
      rawText,
      letterNorm,
      superlatives,
      [],
    );

    expect(corrected).toContain('uniquement');
  });

  // Correction A (régression) — même bug sur « exceptionnellement », qui
  // n'est pas une forme accordée de « exceptionnel » mais un adverbe
  // distinct.
  it('le mot exceptionnellement n est jamais tronqué par le filtre sur le superlatif exceptionnel', () => {
    const letterNorm = makeLetterNorm();
    const superlatives = ['exceptionnel'];
    const rawText = 'Il travaille exceptionnellement bien sous pression.';

    const corrected = applyMechanicalCorrections(
      rawText,
      letterNorm,
      superlatives,
      [],
    );

    expect(corrected).toContain('exceptionnellement');
  });

  // Correction A (branche inverse) — le retrait réel, lui, doit continuer
  // de fonctionner : « exceptionnelle » est une forme accordée de
  // « exceptionnel », elle doit toujours disparaître.
  it('une expérience exceptionnelle perd bien exceptionnelle quand exceptionnel est un superlatif non autorisé', () => {
    const letterNorm = makeLetterNorm();
    const superlatives = ['exceptionnel'];
    const rawText =
      'Il a vécu une expérience exceptionnelle dans cette entreprise.';

    const corrected = applyMechanicalCorrections(
      rawText,
      letterNorm,
      superlatives,
      [],
    );

    expect(corrected.toLowerCase()).not.toContain('exceptionnelle');
  });

  // Correction A (branche inverse) — même exigence pour l'accord pluriel
  // « exceptionnels ».
  it('des résultats exceptionnels perdent bien exceptionnels quand exceptionnel est un superlatif non autorisé', () => {
    const letterNorm = makeLetterNorm();
    const superlatives = ['exceptionnel'];
    const rawText =
      'Nous avons obtenu des résultats exceptionnels ce trimestre.';

    const corrected = applyMechanicalCorrections(
      rawText,
      letterNorm,
      superlatives,
      [],
    );

    expect(corrected.toLowerCase()).not.toContain('exceptionnels');
  });

  // Régression (revue senior) — un superlatif retiré en tout début de ligne
  // n'a aucune espace devant lui à consommer ; l'ancien motif ne consommait
  // que l'espace de devant et laissait une espace résiduelle en tête de
  // ligne derrière lui.
  it('un superlatif retiré en tout début de ligne ne laisse jamais une espace résiduelle en tête de ligne', () => {
    const letterNorm = makeLetterNorm();
    const superlatives = ['exceptionnel'];
    const rawText = 'Exceptionnel projet, mené à bien cette année.';

    const corrected = applyMechanicalCorrections(
      rawText,
      letterNorm,
      superlatives,
      [],
    );

    expect(corrected.startsWith(' ')).toBe(false);
  });
});

describe('computeAllowedSuperlatives', () => {
  // Preuve 15 — support direct : le calcul lui-même exclut un superlatif
  // absent de la source.
  it('exclut un superlatif absent du profil et de l offre', () => {
    const profile = makeProfileDto();
    const superlatives = ['exceptionnel', 'unique'];

    const allowed = computeAllowedSuperlatives(profile, offer, superlatives);

    expect(allowed).not.toContain('exceptionnel');
  });

  // Preuve 16 — support direct : le calcul inclut un superlatif présent
  // dans l'offre, même absent du profil.
  it('inclut un superlatif présent dans l offre même absent du profil', () => {
    const profile = makeProfileDto();
    const offerWithSuperlative = {
      ...offer,
      description: 'Nous cherchons un profil exceptionnel pour notre équipe.',
    };
    const superlatives = ['exceptionnel', 'unique'];

    const allowed = computeAllowedSuperlatives(
      profile,
      offerWithSuperlative,
      superlatives,
    );

    expect(allowed).toContain('exceptionnel');
  });
});

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

    const corrected = applyMechanicalCorrections(rawText, letterNorm, []);

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

    const corrected = applyMechanicalCorrections(rawText, letterNorm, []);

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

    const corrected = applyMechanicalCorrections(rawText, letterNorm, []);

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

    const corrected = applyMechanicalCorrections(rawText, letterNorm, allowed);

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

    const corrected = applyMechanicalCorrections(rawText, letterNorm, allowed);

    expect(corrected.toLowerCase()).toContain('exceptionnelle');
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

import { randomUUID } from 'node:crypto';
import { preflight } from './preflight.js';
import type { MarketNorm } from './market-norm.js';
import type { ExperienceDto, ProfileDto } from '../profiles/dto/profile.dto.js';

/**
 * Le plus petit ProfileDto valide. Local à ce fichier — même décision que
 * anchoring.spec.ts et prompt.spec.ts : AnchoringFact/MarketNorm dépendent
 * de champs très spécifiques qu'il est plus clair de régler en entier dans
 * chaque fichier que de deviner derrière des overrides génériques partagés.
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

const FR_VERB_LADDER = [
  ['participé', 'assisté', 'appuyé'],
  ['contribué', 'collaboré'],
  ['développé', 'construit', 'mis en place', 'implémenté'],
  ['réalisé', 'livré', 'assuré', 'mené à bien'],
  ['conduit', 'piloté', 'encadré', 'supervisé', 'géré'],
  ['dirigé', 'orchestré', 'impulsé', 'chapeauté'],
];

function makeMarketNorm(overrides: Partial<MarketNorm> = {}): MarketNorm {
  return {
    family: 'french',
    language: 'fr',
    verbLadder: FR_VERB_LADDER,
    superlatives: ['exceptionnel', 'unique'],
    personal: {
      photo: 'never',
      dateOfBirth: 'never',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    },
    letter: {
      lengthRange: [250, 350],
      // Changement de TYPE mécanique requis par l'interface validée
      // (paragraphCount devient une fourchette) — aucune assertion ne change.
      paragraphCount: [3, 3],
      openingFormula: 'Madame, Monsieur,',
      closingFormula: 'Cordialement,',
      forbiddenFormulas: { standalone: [], embedded: [] },
    },
    cv: null,
    meta: {
      provenance: 'fixture de test',
      verifiedAt: null,
      confidence: 'neutral',
      userOverridable: {},
    },
    ...overrides,
  };
}

const offer = {
  title: 'Développeur Backend',
  company: 'Acme',
  description: 'Description du poste.',
};

describe('preflight', () => {
  // Preuve 17 — le cas qui bloque.
  it('bloque la génération d un profil sans aucune expérience ni compétence, avec le motif incomplete_profile', () => {
    const profile = makeProfileDto({ experiences: [], skills: [] });
    const norm = makeMarketNorm();

    const result = preflight(profile, offer, norm);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('incomplete_profile');
    }
  });

  // Preuve 17 — le motif de blocage n'est jamais confondu avec un échec de
  // génération : 'generation_failed' n'existe même pas dans
  // GenerationBlockedReason, mais on le vérifie aussi à l'exécution pour
  // qu'un futur refactor qui élargirait le type à la main ne le réintroduise
  // pas en silence.
  it('le motif de blocage n est jamais la chaîne generation_failed', () => {
    const profile = makeProfileDto({ experiences: [], skills: [] });
    const norm = makeMarketNorm();

    const result = preflight(profile, offer, norm);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toBe('generation_failed');
    }
  });

  // Preuve 17 — branche inverse : un profil suffisant n'est jamais bloqué,
  // et porte alors les superlatifs autorisés calculés par l'étape 0
  // (ADR-16).
  it('laisse passer un profil avec au moins une expérience, et renvoie les superlatifs autorisés', () => {
    const profile = makeProfileDto({
      experiences: [makeExperience({ company: 'Acme' })],
    });
    const norm = makeMarketNorm();

    const result = preflight(profile, offer, norm);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.superlatifsAutorisés)).toBe(true);
    }
  });
});

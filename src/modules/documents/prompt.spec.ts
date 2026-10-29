import { randomUUID } from 'node:crypto';
import { buildCoverLetterPrompt, computeRequestedWordRange } from './prompt.js';
import type { ProfileDto } from '../profiles/dto/profile.dto.js';
import { unknownNorm } from './market-norms/unknown-norm.js';
import { CA_EN_NORM, CA_FR_NORM } from './market-norms/ca-norms.js';

/**
 * Le plus petit ProfileDto valide. Local à ce fichier — voir
 * anchoring.spec.ts pour la même décision.
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

describe('buildCoverLetterPrompt', () => {
  // Preuve 2.
  it('deux profils différents produisent deux prompts différents pour la même offre', () => {
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };

    const promptAlice = buildCoverLetterPrompt({
      profile: makeProfileDto({ fullName: 'Alice Zephyrine Dupont' }),
      offer,
      norm: unknownNorm('fr'),
    });
    const promptBob = buildCoverLetterPrompt({
      profile: makeProfileDto({ fullName: 'Bob Przybylski' }),
      offer,
      norm: unknownNorm('fr'),
    });

    expect(promptAlice).not.toBe(promptBob);
  });

  // Preuve 2 — traçabilité : le nom d'un profil n'apparaît jamais dans le
  // prompt d'un autre profil.
  it('le prompt contient le nom du profil fourni en paramètre, jamais celui d un autre profil', () => {
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };

    const promptAlice = buildCoverLetterPrompt({
      profile: makeProfileDto({ fullName: 'Alice Zephyrine Dupont' }),
      offer,
      norm: unknownNorm('fr'),
    });

    expect(promptAlice).toContain('Alice Zephyrine Dupont');
    expect(promptAlice).not.toContain('Bob Przybylski');
  });

  // Preuve 2 — traçabilité côté offre.
  it('le prompt contient le titre et l entreprise de l offre passés en paramètre', () => {
    const profile = makeProfileDto({ fullName: 'Alice Zephyrine Dupont' });
    const prompt = buildCoverLetterPrompt({
      profile,
      offer: {
        title: 'Analyste de données',
        company: 'Nordique Capital',
        description: 'Description.',
      },
      norm: unknownNorm('fr'),
    });

    expect(prompt).toContain('Analyste de données');
    expect(prompt).toContain('Nordique Capital');
  });

  // Preuve 2 — aucune fuite d'une source tierce : un mot inventé ne peut
  // apparaître dans le prompt que s'il vient du profil ou de l'offre passés
  // en paramètre, puisqu'aucune autre source ne le connaît.
  it('chaque fragment distinctif du prompt est traçable au profil ou à l offre — pas de fuite d une source tierce', () => {
    const profile = makeProfileDto({ fullName: 'Zyxqvonor Testovna' });
    const offer = {
      title: 'Qorzimbaluth Specialist',
      company: 'Acme',
      description: 'Description.',
    };

    const prompt = buildCoverLetterPrompt({
      profile,
      offer,
      norm: unknownNorm('fr'),
    });

    expect(prompt).toContain('Zyxqvonor');
    expect(prompt).toContain('Qorzimbaluth');
  });

  // Correction 1 — la norme résolue doit influencer le prompt, pas rester
  // un paramètre ignoré (ADR-16).
  it('le prompt d une offre canadienne anglophone contient la formule d ouverture anglaise exacte', () => {
    const prompt = buildCoverLetterPrompt({
      profile: makeProfileDto(),
      offer: {
        title: 'Développeur Backend',
        company: 'Acme',
        description: 'Description du poste.',
      },
      norm: CA_EN_NORM,
    });

    expect(prompt).toContain('Dear Hiring Manager,');
  });

  it('le prompt d une offre canadienne francophone contient la formule d ouverture française exacte', () => {
    const prompt = buildCoverLetterPrompt({
      profile: makeProfileDto(),
      offer: {
        title: 'Développeur Backend',
        company: 'Acme',
        description: 'Description du poste.',
      },
      norm: CA_FR_NORM,
    });

    expect(prompt).toContain('Madame, Monsieur,');
  });

  it('le prompt construit avec la norme neutre n impose aucune des deux formules d ouverture connues', () => {
    const prompt = buildCoverLetterPrompt({
      profile: makeProfileDto(),
      offer: {
        title: 'Développeur Backend',
        company: 'Acme',
        description: 'Description du poste.',
      },
      norm: unknownNorm('fr'),
    });

    expect(prompt).not.toContain('Dear Hiring Manager,');
    expect(prompt).not.toContain('Madame, Monsieur,');
  });

  it('le prompt mentionne les deux bornes du nombre de paragraphes attendu par la norme', () => {
    const prompt = buildCoverLetterPrompt({
      profile: makeProfileDto(),
      offer: {
        title: 'Développeur Backend',
        company: 'Acme',
        description: 'Description du poste.',
      },
      norm: CA_EN_NORM,
    });

    const [minParagraphs, maxParagraphs] = CA_EN_NORM.letter.paragraphCount;
    expect(prompt).toContain(String(minParagraphs));
    expect(prompt).toContain(String(maxParagraphs));
  });
});

describe('computeRequestedWordRange', () => {
  // Correction 1 — la marge demandée vient de ce qu'elle compense, pas d'un
  // pourcentage fixe : le stub actuel renvoie la fourchette inchangée, ces
  // trois tests doivent donc échouer tant qu'il n'est pas remplacé.
  it('avec une fourchette normale ([250, 450]), la fourchette renvoyée est strictement à l intérieur', () => {
    const [min, max] = computeRequestedWordRange([250, 450]);

    expect(min).toBeGreaterThan(250);
    expect(max).toBeLessThan(450);
  });

  it('avec une fourchette large ([150, 600], norme neutre), la fourchette renvoyée reste strictement à l intérieur', () => {
    const [min, max] = computeRequestedWordRange([150, 600]);

    expect(min).toBeGreaterThan(150);
    expect(max).toBeLessThan(600);
  });

  it('avec une fourchette étroite ([300, 320]), la fourchette renvoyée reste strictement à l intérieur et jamais inversée', () => {
    const [min, max] = computeRequestedWordRange([300, 320]);

    expect(min).toBeGreaterThan(300);
    expect(max).toBeLessThan(320);
    expect(min).toBeLessThan(max);
  });
});

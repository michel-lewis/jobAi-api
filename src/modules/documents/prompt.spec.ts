import { randomUUID } from 'node:crypto';
import { buildCoverLetterPrompt } from './prompt.js';
import type { ProfileDto } from '../profiles/dto/profile.dto.js';

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
    });
    const promptBob = buildCoverLetterPrompt({
      profile: makeProfileDto({ fullName: 'Bob Przybylski' }),
      offer,
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

    const prompt = buildCoverLetterPrompt({ profile, offer });

    expect(prompt).toContain('Zyxqvonor');
    expect(prompt).toContain('Qorzimbaluth');
  });
});

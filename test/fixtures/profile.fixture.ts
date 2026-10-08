import type { PutProfileDto } from '../../src/modules/profiles/dto/put-profile.dto.js';

/**
 * Le plus petit document valide pour PUT /profiles/me — tous les tableaux
 * vides, seul fullName est requis. Les tests qui veulent des enfants
 * étendent ce squelette plutôt que de le réécrire.
 */
export function makePutProfileDto(
  overrides: Partial<PutProfileDto> = {},
): PutProfileDto {
  return {
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
    ...overrides,
  };
}

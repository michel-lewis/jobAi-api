import { putProfileSchema } from './put-profile.dto.js';
import { makePutProfileDto } from '../../../../test/fixtures/profile.fixture.js';

describe('putProfileSchema', () => {
  it('accepte le document minimal (fullName seul, tous les tableaux vides)', () => {
    const result = putProfileSchema.safeParse(makePutProfileDto());

    expect(result.success).toBe(true);
  });

  it('accepte un document complet avec enfants imbriqués', () => {
    const dto = makePutProfileDto({
      experiences: [
        {
          company: 'Acme',
          title: 'Développeuse',
          employmentType: 'full_time',
          location: 'Calgary',
          startDate: '2024-01-01',
          endDate: null,
          summary: null,
          bullets: ['A livré X', 'A conçu Y'],
        },
      ],
      skills: [{ name: 'TypeScript', category: 'language' }],
      links: [{ kind: 'github', url: 'https://github.com/lewis', label: null }],
    });

    const result = putProfileSchema.safeParse(dto);

    expect(result.success).toBe(true);
  });

  it('rejette un document sans fullName', () => {
    const { fullName, ...rest } = makePutProfileDto();
    void fullName;

    expect(putProfileSchema.safeParse(rest).success).toBe(false);
  });

  it('rejette une expérience dont la date de fin précède la date de début', () => {
    const dto = makePutProfileDto({
      experiences: [
        {
          company: 'Acme',
          title: 'Développeuse',
          employmentType: 'full_time',
          location: null,
          startDate: '2024-06-01',
          endDate: '2024-01-01',
          summary: null,
          bullets: [],
        },
      ],
    });

    expect(putProfileSchema.safeParse(dto).success).toBe(false);
  });

  it('rejette un employmentType hors énumération', () => {
    const dto = makePutProfileDto({
      experiences: [
        {
          company: 'Acme',
          title: 'Développeuse',
          employmentType: 'ceo' as never,
          location: null,
          startDate: '2024-01-01',
          endDate: null,
          summary: null,
          bullets: [],
        },
      ],
    });

    expect(putProfileSchema.safeParse(dto).success).toBe(false);
  });

  it('rejette un tableau de compétences trop long', () => {
    const dto = makePutProfileDto({
      skills: Array.from({ length: 101 }, (_, i) => ({
        name: `skill-${i}`,
        category: 'tool' as const,
      })),
    });

    expect(putProfileSchema.safeParse(dto).success).toBe(false);
  });

  it('rejette un fullName trop long', () => {
    const dto = makePutProfileDto({ fullName: 'x'.repeat(201) });

    expect(putProfileSchema.safeParse(dto).success).toBe(false);
  });

  it('rejette deux compétences de même nom, insensible à la casse', () => {
    const dto = makePutProfileDto({
      skills: [
        { name: 'TypeScript', category: 'language' },
        { name: 'typescript', category: 'language' },
      ],
    });

    expect(putProfileSchema.safeParse(dto).success).toBe(false);
  });

  it('rejette deux langues de même nom, insensible à la casse', () => {
    const dto = makePutProfileDto({
      languages: [
        { name: 'Français', proficiency: 'native' },
        { name: 'français', proficiency: 'fluent' },
      ],
    });

    expect(putProfileSchema.safeParse(dto).success).toBe(false);
  });

  it('rejette une URL de lien qui n est pas http(s)', () => {
    const dto = makePutProfileDto({
      links: [{ kind: 'other', url: 'ftp://example.com', label: null }],
    });

    expect(putProfileSchema.safeParse(dto).success).toBe(false);
  });

  it('rejette un email mal formé', () => {
    const dto = makePutProfileDto({ email: 'pas-un-email' as never });

    expect(putProfileSchema.safeParse(dto).success).toBe(false);
  });
});

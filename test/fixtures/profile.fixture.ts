import { Profile } from '../../src/modules/profiles/entities/profile.entity.js';
import { makeUser } from './user.fixture.js';

/** Même raison que `makeUser` : un objet typé `Profile`, pas un littéral à la main. */
export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: '7c2e1a9f-3b5d-4e8a-9c1f-2d6b8e4a7c06',
    userId: '3f1a9c2e-5b7d-4e8a-9c1f-2d6b8e4a7c05',
    user: makeUser(),
    professionalInformation: 'Développeuse backend, 5 ans d expérience.',
    personalInformation: 'Disponible immédiatement.',
    education: 'Master informatique.',
    location: 'Paris',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

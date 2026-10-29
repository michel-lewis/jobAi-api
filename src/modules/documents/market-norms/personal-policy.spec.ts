import {
  resolvePersonalPolicy,
  UNKNOWN_PERSONAL_POLICY,
} from './personal-policy.js';

/**
 * Verrouille la recherche (ADR-14, décision 2) : un test par famille
 * recherchée, pour qu'un changement silencieux de ces valeurs soit vu.
 * `maritalStatus`/`nationality` ne sont fournis par aucune recherche —
 * toujours `'never'`, le repli le plus strict, pas une valeur inventée.
 */
describe('resolvePersonalPolicy — familles recherchées', () => {
  it('north_american : never partout', () => {
    expect(resolvePersonalPolicy('US', 'north_american')).toEqual({
      photo: 'never',
      dateOfBirth: 'never',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    });
  });

  it('commonwealth : never partout', () => {
    expect(resolvePersonalPolicy('GB', 'commonwealth')).toEqual({
      photo: 'never',
      dateOfBirth: 'never',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    });
  });

  it('northern_european : photo optional, le reste never', () => {
    expect(resolvePersonalPolicy('SE', 'northern_european')).toEqual({
      photo: 'optional',
      dateOfBirth: 'never',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    });
  });

  it('french : photo et date de naissance expected', () => {
    expect(resolvePersonalPolicy('FR', 'french')).toEqual({
      photo: 'expected',
      dateOfBirth: 'expected',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    });
  });

  it('southern_european : photo expected, le reste never', () => {
    expect(resolvePersonalPolicy('IT', 'southern_european')).toEqual({
      photo: 'expected',
      dateOfBirth: 'never',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    });
  });

  it('gulf : photo, date de naissance et autorisation de travail expected', () => {
    expect(resolvePersonalPolicy('AE', 'gulf')).toEqual({
      photo: 'expected',
      dateOfBirth: 'expected',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'expected',
    });
  });

  it('german : date de naissance expected, le reste never', () => {
    expect(resolvePersonalPolicy('DE', 'german')).toEqual({
      photo: 'never',
      dateOfBirth: 'expected',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    });
  });

  it('central_eastern_european : date de naissance expected, le reste never', () => {
    expect(resolvePersonalPolicy('PL', 'central_eastern_european')).toEqual({
      photo: 'never',
      dateOfBirth: 'expected',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    });
  });
});

describe('resolvePersonalPolicy — exceptions pays sur workAuthorization', () => {
  it('le Canada diverge de sa famille north_american : workAuthorization expected', () => {
    const policy = resolvePersonalPolicy('CA', 'north_american');

    expect(policy.workAuthorization).toBe('expected');
    expect(policy.photo).toBe('never');
  });

  it("l'Afrique du Sud diverge de sa famille commonwealth : workAuthorization expected", () => {
    const policy = resolvePersonalPolicy('ZA', 'commonwealth');

    expect(policy.workAuthorization).toBe('expected');
    expect(policy.photo).toBe('never');
  });

  it("un autre pays de la famille commonwealth n'hérite pas de l'exception sud-africaine", () => {
    const policy = resolvePersonalPolicy('GB', 'commonwealth');

    expect(policy.workAuthorization).toBe('never');
  });
});

describe('resolvePersonalPolicy — familles non recherchées et unknown', () => {
  it('une famille jamais recherchée (latin_american) retombe sur le repli le plus strict', () => {
    expect(resolvePersonalPolicy('BR', 'latin_american')).toEqual(
      UNKNOWN_PERSONAL_POLICY,
    );
  });

  it("la famille 'unknown' elle-même retombe sur le repli le plus strict", () => {
    expect(resolvePersonalPolicy('XX', 'unknown')).toEqual(
      UNKNOWN_PERSONAL_POLICY,
    );
  });
});

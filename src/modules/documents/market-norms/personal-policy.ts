import type { FormatFamily, PersonalPolicy } from '../market-norm.js';

/**
 * Le repli le plus strict (ADR-14, décision 2) : tout à `'never'`, parce que
 * deviner faux dans le sens « expected » coûte une candidature écartée,
 * deviner faux dans le sens « never » ne coûte qu'une mention absente.
 */
export const UNKNOWN_PERSONAL_POLICY: PersonalPolicy = {
  photo: 'never',
  dateOfBirth: 'never',
  maritalStatus: 'never',
  nationality: 'never',
  workAuthorization: 'never',
};

/**
 * Recherché par famille. `maritalStatus` et `nationality` ne sont fournis
 * par aucune recherche à ce jour — défaut `'never'` (le plus strict), pas
 * une valeur inventée. `latin_american`, `east_asian` et `south_asian` ne
 * sont pas encore recherchées du tout : absentes de cette table, elles
 * retombent sur `UNKNOWN_PERSONAL_POLICY` à la résolution, ce qui donne
 * exactement les mêmes valeurs — pas la peine de les dupliquer ici.
 */
const FAMILY_PERSONAL_POLICY: Partial<Record<FormatFamily, PersonalPolicy>> = {
  north_american: {
    photo: 'never',
    dateOfBirth: 'never',
    maritalStatus: 'never',
    nationality: 'never',
    workAuthorization: 'never',
  },
  commonwealth: {
    photo: 'never',
    dateOfBirth: 'never',
    maritalStatus: 'never',
    nationality: 'never',
    workAuthorization: 'never',
  },
  northern_european: {
    photo: 'optional',
    dateOfBirth: 'never',
    maritalStatus: 'never',
    nationality: 'never',
    workAuthorization: 'never',
  },
  french: {
    photo: 'expected',
    dateOfBirth: 'expected',
    maritalStatus: 'never',
    nationality: 'never',
    workAuthorization: 'never',
  },
  southern_european: {
    photo: 'expected',
    dateOfBirth: 'never',
    maritalStatus: 'never',
    nationality: 'never',
    workAuthorization: 'never',
  },
  gulf: {
    photo: 'expected',
    dateOfBirth: 'expected',
    maritalStatus: 'never',
    nationality: 'never',
    workAuthorization: 'expected',
  },
  german: {
    photo: 'never',
    dateOfBirth: 'expected',
    maritalStatus: 'never',
    nationality: 'never',
    workAuthorization: 'never',
  },
  central_eastern_european: {
    photo: 'never',
    dateOfBirth: 'expected',
    maritalStatus: 'never',
    nationality: 'never',
    workAuthorization: 'never',
  },
};

/**
 * Exceptions pays, par-dessus la famille — même ordre de fusion que les
 * normes de lettre (famille → exception pays). `CA` et `ZA` divergent de
 * leur famille sur `workAuthorization` seulement ; le reste de la famille
 * s'applique tel quel.
 */
const COUNTRY_PERSONAL_OVERRIDES: Record<string, Partial<PersonalPolicy>> = {
  CA: { workAuthorization: 'expected' },
  ZA: { workAuthorization: 'expected' },
};

export function resolvePersonalPolicy(
  country: string,
  family: FormatFamily,
): PersonalPolicy {
  const base = FAMILY_PERSONAL_POLICY[family] ?? UNKNOWN_PERSONAL_POLICY;
  const override = COUNTRY_PERSONAL_OVERRIDES[country];
  return override ? { ...base, ...override } : base;
}

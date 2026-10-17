import { randomUUID } from 'node:crypto';
import { buildAnchoringFacts, checkFacts } from './fact-checking.js';
import type { AnchoringFact } from './fact-checking.js';
import type { Violation } from './violations.js';
import type { ProfileDto } from '../profiles/dto/profile.dto.js';

/**
 * Local à ce fichier — même décision que anchoring.spec.ts (le prédécesseur
 * de ce module) : les champs dont AnchoringFact a besoin sont trop
 * spécifiques pour une fabrique générique partagée.
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

const FR_VERB_LADDER = [
  ['participé', 'assisté', 'appuyé'],
  ['contribué', 'collaboré'],
  ['développé', 'construit', 'mis en place', 'implémenté'],
  ['réalisé', 'livré', 'assuré', 'mené à bien'],
  ['conduit', 'piloté', 'encadré', 'supervisé', 'géré'],
  ['dirigé', 'orchestré', 'impulsé', 'chapeauté'],
];

const EN_VERB_LADDER = [
  ['participated', 'assisted', 'supported'],
  ['contributed', 'collaborated'],
  ['developed', 'built', 'implemented'],
  ['delivered', 'completed', 'shipped', 'executed'],
  ['led', 'drove', 'managed', 'owned', 'coordinated'],
  ['directed', 'headed', 'spearheaded', 'championed'],
];

describe('buildAnchoringFacts + checkFacts', () => {
  // Preuve 2 — une formule d'ouverture anglaise standard, construite pour
  // une offre anglaise, n'est jamais traitée comme un nom propre inventé.
  it('une formule d ouverture anglaise standard n est pas rejetée comme fait non ancré sur une offre en anglais', () => {
    const profile = makeProfileDto();
    const offer = {
      title: 'Backend Developer',
      company: 'Acme',
      description: 'Job description.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'en');

    const text =
      'Dear Hiring Manager, I would like to apply for this position.';

    const violations = checkFacts(text, facts, EN_VERB_LADDER);

    const unanchored = violations.filter(
      (violation: Violation) => violation.type === 'unanchored_fact',
    );
    expect(unanchored).toHaveLength(0);
  });

  // Preuve 3 — LE test du ticket : un fait non ancré est une faute, rejetée
  // immédiatement (hasFault est le mécanisme qui porte cette décision en
  // aval — voir violations.spec.ts).
  it('une entreprise absente du profil et de l offre est une faute de type unanchored_fact', () => {
    const profile = makeProfileDto();
    const offer = {
      title: 'Ingénieur',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr');

    const text = 'Je souhaite rejoindre Globex Corporation pour ce poste.';

    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'fault',
        type: 'unanchored_fact',
      }),
    );
  });

  // Preuve 4 — un fait déjà ancré dont la valeur change est une faute
  // distincte (fact_identity), au même titre qu'un fait non ancré.
  //
  // ADR-14, décision 5, juste après le paragraphe sur l'identité des faits :
  // « la correspondance se fait par ensemble, pas par appariement à une
  // puce ». Deux durées connues, de valeurs différentes, pour que ce test
  // exerce réellement la logique d'ensemble — avec une seule durée connue,
  // rien ne distinguerait cette logique d'un simple appariement à une puce
  // unique.
  it('une durée produite qui ne correspond à aucune des durées connues du profil et de l offre est une faute de type fact_identity', () => {
    const facts: AnchoringFact[] = [
      { kind: 'duration', value: '2 ans', normalized: '2' },
      { kind: 'duration', value: '6 mois', normalized: '6' },
    ];
    const text = "Fort de mes 5 ans d'expérience dans ce domaine.";

    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'fault',
        type: 'fact_identity',
        found: '5',
      }),
    );
  });

  // Preuve 4 (branche inverse) — une durée produite qui correspond
  // exactement à une des deux durées connues de l'ensemble n'est jamais une
  // faute, même si elle ne correspond pas à l'AUTRE durée connue : c'est
  // précisément ce que distingue la correspondance par ensemble d'un
  // appariement à une puce précise.
  it('une durée produite qui correspond exactement à une des durées connues de l ensemble n est jamais une faute', () => {
    const facts: AnchoringFact[] = [
      { kind: 'duration', value: '2 ans', normalized: '2' },
      { kind: 'duration', value: '6 mois', normalized: '6' },
    ];
    const text = "Fort de mes 6 mois d'expérience dans ce domaine.";

    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    const factIdentityViolations = violations.filter(
      (violation: Violation) => violation.type === 'fact_identity',
    );
    expect(factIdentityViolations).toHaveLength(0);
  });

  // Preuve 14 — un verbe produit dont le rang dépasse le rang le plus élevé
  // présent dans le profil est une imprécision de type verb_rank (ADR-14,
  // décision 5, section sur la montée en responsabilité) : le plafond porte
  // sur le MAXIMUM des rangs parmi les faits `kind: 'verb'`, jamais sur un
  // appariement puce à puce.
  it('un verbe produit dont le rang dépasse le rang maximum présent dans le profil est une imprécision de type verb_rank', () => {
    const facts: AnchoringFact[] = [
      { kind: 'verb', value: 'participé', normalized: '0' },
      { kind: 'verb', value: 'développé', normalized: '2' },
    ];
    const text = "J'ai piloté cette initiative de bout en bout.";

    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'verb_rank',
        found: 'piloté',
        expected: 'développé',
      }),
    );
  });

  // Preuve 14 (branche inverse) — un verbe produit dont le rang ne dépasse
  // pas le rang maximum présent dans le profil n'est jamais une imprécision
  // de type verb_rank.
  it('un verbe produit dont le rang ne dépasse pas le rang maximum présent dans le profil n est jamais une imprécision de type verb_rank', () => {
    const facts: AnchoringFact[] = [
      { kind: 'verb', value: 'participé', normalized: '0' },
      { kind: 'verb', value: 'développé', normalized: '2' },
    ];
    const text = "J'ai contribué à ce projet avec toute l'équipe.";

    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    const verbRankViolations = violations.filter(
      (violation: Violation) => violation.type === 'verb_rank',
    );
    expect(verbRankViolations).toHaveLength(0);
  });

  // Preuve 14 (sous-cas atteignable) — un verbe absent de toutes les listes
  // de l'échelle n'est jamais considéré comme une montée en responsabilité,
  // indépendamment de ce que `facts` contient.
  it('un verbe absent de toutes les listes de l échelle n est jamais une montée en responsabilité', () => {
    const facts: AnchoringFact[] = [];
    const text = 'J’ai bricolé cette fonctionnalité en une semaine.';

    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    const verbRankViolations = violations.filter(
      (violation: Violation) => violation.type === 'verb_rank',
    );
    expect(verbRankViolations).toHaveLength(0);
  });
});

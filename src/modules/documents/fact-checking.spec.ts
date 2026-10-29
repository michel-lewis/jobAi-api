import { randomUUID } from 'node:crypto';
import { buildAnchoringFacts, checkFacts } from './fact-checking.js';
import type { AnchoringFact } from './fact-checking.js';
import type { Violation } from './violations.js';
import type { ExperienceDto, ProfileDto } from '../profiles/dto/profile.dto.js';

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
    const facts = buildAnchoringFacts(profile, offer, 'en', EN_VERB_LADDER);

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
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

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
  //
  // MODIFICATION (correction 4, mois vs années) — ce test était déjà commité
  // avec `normalized: '2'` / `'6'` (le chiffre seul) et asserait
  // `found: '5'`. La normalisation change pour distinguer les mois des
  // années (ex. « 2 ans » → '24m', « 6 mois » → '6m') : les deux fixtures et
  // l'assertion `found` sont mises à jour en conséquence — ce n'est pas un
  // ajustement de comportement silencieux, c'est le format qui change parce
  // que l'interface validée l'exige. Loggé ici explicitement, comme demandé.
  it('une durée produite qui ne correspond à aucune des durées connues du profil et de l offre est une faute de type fact_identity', () => {
    const facts: AnchoringFact[] = [
      { kind: 'duration', value: '2 ans', normalized: '24m' },
      { kind: 'duration', value: '6 mois', normalized: '6m' },
    ];
    const text = "Fort de mes 5 ans d'expérience dans ce domaine.";

    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'fault',
        type: 'fact_identity',
        found: '60m',
      }),
    );
  });

  // Preuve 4 (branche inverse) — une durée produite qui correspond
  // exactement à une des deux durées connues de l'ensemble n'est jamais une
  // faute, même si elle ne correspond pas à l'AUTRE durée connue : c'est
  // précisément ce que distingue la correspondance par ensemble d'un
  // appariement à une puce précise.
  //
  // MODIFICATION (correction 4, mois vs années) — même mise à jour mécanique
  // des fixtures que le test précédent (`'2'`/`'6'` → `'24m'`/`'6m'`) ; cette
  // branche ne vérifie que l'absence de violation et ne pinne aucune valeur
  // littérale de `found`, donc rien d'autre ne change.
  it('une durée produite qui correspond exactement à une des durées connues de l ensemble n est jamais une faute', () => {
    const facts: AnchoringFact[] = [
      { kind: 'duration', value: '2 ans', normalized: '24m' },
      { kind: 'duration', value: '6 mois', normalized: '6m' },
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

  // Régression (revue senior) — buildAnchoringFacts doit produire un fait
  // kind: 'duration' à partir des dates d'expérience du profil. Sans ça,
  // checkFacts n'a jamais de durée connue et rejette comme fact_identity
  // n'importe quelle durée réelle mentionnée dans la lettre — un faux
  // positif systématique, pas un cas limite.
  it('une durée réelle du profil, mentionnée dans la lettre, n est jamais une faute fact_identity', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2022-01-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = "Fort de mes 2 ans d'expérience chez Acme, je...";
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    const factIdentityViolations = violations.filter(
      (violation: Violation) => violation.type === 'fact_identity',
    );
    expect(factIdentityViolations).toHaveLength(0);
  });

  // Régression (revue senior) — buildAnchoringFacts doit aussi produire un
  // fait kind: 'verb' à partir du texte libre du profil, sinon aucun
  // plafond n'est jamais posé et le contrôle de montée en responsabilité
  // est mort à la livraison, quel que soit le verbe produit par le LLM.
  it('un verbe du profil pose un plafond que buildAnchoringFacts calcule seule, sans faits construits à la main', () => {
    const profile = makeProfileDto({
      experiences: [makeExperience({ summary: "J'ai participé à ce projet." })],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = "J'ai dirigé cette initiative de bout en bout.";
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'imprecision',
        type: 'verb_rank',
        found: 'dirigé',
      }),
    );
  });

  // Correction 4 (régression principale) — experienceDurationFacts
  // normalise aujourd'hui sur le chiffre seul : « 2 ans » et « 2 mois »
  // produisent tous deux '2'. Une expérience de deux ans valide alors à
  // tort une lettre qui parle de deux MOIS d'expérience. Doit être rouge
  // tant que la normalisation ne distingue pas les deux unités.
  it('une expérience de deux ans ne valide jamais une lettre qui mentionne deux mois d experience', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2022-01-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = "Fort de mes 2 mois d'expérience chez Acme, je...";
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'fault',
        type: 'fact_identity',
      }),
    );
  });

  // Correction 4 (branche nominale) — la même durée, exprimée dans la même
  // unité (années), continue de valider sans faute.
  it('une expérience de deux ans valide toujours une lettre qui mentionne la même durée en années', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2022-01-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = "Fort de mes 2 ans d'expérience chez Acme, je...";
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    const factIdentityViolations = violations.filter(
      (violation: Violation) => violation.type === 'fact_identity',
    );
    expect(factIdentityViolations).toHaveLength(0);
  });

  // Correction 4 (branche nominale) — symétrique côté mois : une expérience
  // de six mois valide une lettre qui mentionne la même durée en mois.
  it('une expérience de six mois valide toujours une lettre qui mentionne la même durée en mois', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2020-07-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = "Fort de mes 6 mois d'expérience chez Acme, je...";
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    const factIdentityViolations = violations.filter(
      (violation: Violation) => violation.type === 'fact_identity',
    );
    expect(factIdentityViolations).toHaveLength(0);
  });

  // Correction 4 (régression, branche symétrique) — une expérience de six
  // mois ne valide jamais une lettre qui parle de six ANS, la confusion
  // inverse de la régression principale.
  it('une expérience de six mois ne valide jamais une lettre qui mentionne six ans', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2020-07-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = "Fort de mes 6 ans d'expérience chez Acme, je...";
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'fault',
        type: 'fact_identity',
      }),
    );
  });

  // Correction O (revue senior) — experienceDurationFacts ne produit
  // jamais que des durées en mois (voir normalizeDuration), donc une
  // phrase de disponibilité en jours ou en semaines — recommandée par HEC
  // Montréal, la source citée pour ce marché — n'a jamais de fait connu
  // de son unité à comparer, et tombait en faute à tort. Passe-droit
  // assumé, même raisonnement que « verbe absent de l'échelle » : on
  // sous-détecte plutôt que de rejeter une lettre honnête.
  it('une disponibilité exprimée en jours n est jamais une faute fact_identity', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2022-01-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = 'Je serai disponible dans 15 jours.';
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(
      violations.filter((violation) => violation.type === 'fact_identity'),
    ).toHaveLength(0);
  });

  it('une disponibilité exprimée en semaines n est jamais une faute fact_identity', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2022-01-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = 'Je peux commencer sous 2 semaines.';
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(
      violations.filter((violation) => violation.type === 'fact_identity'),
    ).toHaveLength(0);
  });

  it('une durée en mois reste une faute quand le profil porte deux ans, même avec le passe-droit sur les semaines et les jours', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2022-01-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = 'Mes 2 mois chez Acme me servent ici.';
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(violations).toContainEqual(
      expect.objectContaining({
        category: 'fault',
        type: 'fact_identity',
      }),
    );
  });

  it('une durée en années reste valide quand le profil porte deux ans', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({ startDate: '2020-01-01', endDate: '2022-01-01' }),
      ],
    });
    const offer = {
      title: 'Développeur Backend',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer, 'fr', FR_VERB_LADDER);

    const text = 'Mes 2 ans chez Acme me servent ici.';
    const violations = checkFacts(text, facts, FR_VERB_LADDER);

    expect(
      violations.filter((violation) => violation.type === 'fact_identity'),
    ).toHaveLength(0);
  });
});

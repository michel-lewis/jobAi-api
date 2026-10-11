import { randomUUID } from 'node:crypto';
import {
  buildAnchoringFacts,
  checkAnchoring,
  AnchorViolationError,
} from './anchoring.js';
import type {
  ExperienceDto,
  ProfileDto,
  SkillDto,
} from '../profiles/dto/profile.dto.js';

/**
 * Le plus petit ProfileDto valide. Pas de fixture partagée dans
 * test/fixtures : AnchoringFacts dépend de champs très spécifiques
 * (experiences[].company, skills[].name...) qu'il est plus clair de régler
 * en entier dans chaque test que de deviner derrière des overrides
 * génériques. Local à ce fichier.
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

function makeSkill(overrides: Partial<SkillDto> = {}): SkillDto {
  return {
    name: 'Java',
    category: 'language',
    ...overrides,
  };
}

describe('checkAnchoring', () => {
  // Preuve 1 — LE test du ticket.
  it('rejette un document qui mentionne une entreprise absente du profil', () => {
    const profile = makeProfileDto();
    const offer = {
      title: 'Ingénieur',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer);
    const text = 'Je souhaite rejoindre Globex Corporation pour ce poste.';

    expect(() => checkAnchoring(text, facts)).toThrow(AnchorViolationError);
  });

  // Preuve 4.
  it('AnchorViolationError porte un tableau violations non vide listant chaque terme rejeté', () => {
    const profile = makeProfileDto();
    const offer = {
      title: 'Ingénieur',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer);
    const text =
      "Je code pour Globex Corporation et j'ai auparavant travaillé pour Stark Industries.";

    let caught: unknown;
    try {
      checkAnchoring(text, facts);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AnchorViolationError);
    const violations = (caught as AnchorViolationError).violations;
    expect(violations.length).toBeGreaterThan(0);
    const joined = violations.join(' ').toLowerCase();
    expect(joined).toContain('globex');
    expect(joined).toContain('stark');
  });

  // Preuve 3.
  it('une lettre réaliste ancrée dans le profil et l offre passe sans lever', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({
          company: 'Nordique Technologies',
          startDate: '2020-06-01',
          endDate: '2022-01-01',
        }),
      ],
      skills: [makeSkill({ name: 'Java' })],
    });
    const offer = {
      title: 'Développeur Backend Senior',
      company: 'Nordique Technologies',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer);

    const text = [
      'Madame, Monsieur,',
      '',
      "Fort de mon expérience chez Nordique Technologies depuis 2020, où j'ai acquis une solide maîtrise de Java,",
      'je souhaite vous proposer ma candidature pour le poste de Développeur Backend, basé à Montréal.',
      '',
      'Cordialement,',
    ].join('\n');

    expect(() => checkAnchoring(text, facts)).not.toThrow();
  });

  // Preuve 5.
  it('une mention de l année en cours et de l année suivante passe même absente du profil', () => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const profile = makeProfileDto({
      experiences: [
        makeExperience({
          company: 'Acme',
          startDate: '2015-01-01',
          endDate: '2016-01-01',
        }),
      ],
    });
    const offer = {
      title: 'Ingénieur',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer);

    const text = `Je suis disponible pour un début de contrat en ${currentYear} ou en ${nextYear}.`;

    expect(() => checkAnchoring(text, facts)).not.toThrow();
  });

  // Preuve 6 (bonus) — documente volontairement une limite connue de
  // l'algorithme : il vérifie des mots connus, pas des entités connues.
  // Voir ADR-13 : garantit l'absence de nom propre nouveau, pas l'absence
  // d'entreprise inventée par recombinaison de deux mots par ailleurs
  // légitimes.
  it('ne détecte pas la recombinaison de deux mots connus séparément — limite documentée par ADR-13', () => {
    const profile = makeProfileDto({
      experiences: [makeExperience({ company: 'Northwind' })],
      skills: [makeSkill({ name: 'Traders', category: 'tool' })],
    });
    const offer = {
      title: 'Analyste',
      company: 'Chinook',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer);

    // « Northwind Traders » n'a jamais figuré ainsi dans le profil : c'est
    // la juxtaposition de deux mots connus séparément (une entreprise, une
    // compétence). checkAnchoring ne peut pas le voir : il ne lève PAS.
    const text =
      "Je rejoindrais avec plaisir Northwind Traders, qui n'a jamais existé en tant que tel.";

    expect(() => checkAnchoring(text, facts)).not.toThrow();
  });

  // Régression : experience.summary est transmis au LLM comme fait
  // autorisé par prompt.ts — un nom propre qui n'apparaît QUE dans ce champ
  // doit donc être reconnu par buildAnchoringFacts, sinon un fait réel du
  // profil fait échouer l'ancrage à tort.
  it('un nom propre présent uniquement dans experience.summary compte comme fait connu', () => {
    const profile = makeProfileDto({
      experiences: [
        makeExperience({
          company: 'Acme',
          summary:
            'Dirigé la migration cloud pour Banque Royale avant la clôture du projet.',
        }),
      ],
    });
    const offer = {
      title: 'Ingénieur',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer);

    const text =
      'Mon expérience auprès de Banque Royale illustre ma capacité à mener un projet complexe.';

    expect(() => checkAnchoring(text, facts)).not.toThrow();
  });

  // Régression : offer.description est transmise au LLM comme matière
  // autorisée par prompt.ts — une techno ou une entité nommée dans
  // l'annonce doit donc être reconnue par buildAnchoringFacts, sinon un
  // fait réel de l'offre fait échouer l'ancrage à tort.
  it('un nom propre présent uniquement dans offer.description compte comme fait connu', () => {
    const profile = makeProfileDto();
    const offer = {
      title: 'Ingénieur',
      company: 'Acme',
      description:
        'Poste au sein d une équipe qui utilise Azure DevOps au quotidien.',
    };
    const facts = buildAnchoringFacts(profile, offer);

    const text =
      'Je maîtrise déjà Azure DevOps, un atout pour rejoindre votre équipe.';

    expect(() => checkAnchoring(text, facts)).not.toThrow();
  });

  // Limite documentée, pas un oubli (ADR-13 et README : seules les suites
  // de 2+ mots capitalisés consécutifs sont des candidats). Un nom propre
  // halluciné d'UN SEUL mot, au milieu d'une phrase, traverse le contrôle
  // sans jamais être examiné — ce test documente cette limite plutôt que
  // de la laisser implicite.
  it('ne détecte pas un nom propre inventé d un seul mot — limite documentée par ADR-13', () => {
    const profile = makeProfileDto();
    const offer = {
      title: 'Ingénieur',
      company: 'Acme',
      description: 'Description du poste.',
    };
    const facts = buildAnchoringFacts(profile, offer);

    // « Zorgolax » n'apparaît dans aucun fait connu et n'est pas en début
    // de phrase : un seul mot capitalisé n'est jamais un candidat, donc
    // checkAnchoring ne le voit pas et ne lève PAS.
    const text = "J'ai aussi collaboré avec Zorgolax sur un projet annexe.";

    expect(() => checkAnchoring(text, facts)).not.toThrow();
  });
});

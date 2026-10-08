import { z } from 'zod';
import { WORK_PREFERENCES } from '../entities/profile.entity.js';
import { EMPLOYMENT_TYPES } from '../entities/profile-experience.entity.js';
import { SKILL_CATEGORIES } from '../entities/profile-skill.entity.js';
import { LANGUAGE_PROFICIENCIES } from '../entities/profile-language.entity.js';
import { LINK_KINDS } from '../entities/profile-link.entity.js';

const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** Omise ou `null` => `null`. Jamais de chaîne vide en base : min(1) le refuse. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const nullableDate = () =>
  z.iso
    .date()
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const httpUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .url()
    .refine(
      (value) => value.startsWith('http://') || value.startsWith('https://'),
      {
        message: 'doit être une URL http(s)',
      },
    );

const nullableHttpUrl = (max: number) =>
  httpUrl(max)
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const experienceSchema = z
  .object({
    company: requiredText(200),
    title: requiredText(200),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    location: nullableText(200),
    startDate: z.iso.date(),
    endDate: nullableDate(),
    summary: nullableText(2000),
    bullets: z.array(requiredText(500)).max(20),
  })
  .refine(
    (experience) =>
      experience.endDate === null || experience.endDate >= experience.startDate,
    {
      message: 'endDate doit être postérieure ou égale à startDate',
      path: ['endDate'],
    },
  );

const educationSchema = z.object({
  school: requiredText(200),
  degree: requiredText(200),
  field: nullableText(200),
  location: nullableText(200),
  startDate: nullableDate(),
  endDate: nullableDate(),
  credentialEvaluation: nullableText(500),
  honours: nullableText(200),
});

const skillSchema = z.object({
  name: requiredText(100),
  category: z.enum(SKILL_CATEGORIES),
});

const languageSchema = z.object({
  name: requiredText(100),
  proficiency: z.enum(LANGUAGE_PROFICIENCIES),
});

const certificationSchema = z.object({
  name: requiredText(200),
  issuer: nullableText(200),
  issuedOn: nullableDate(),
  expiresOn: nullableDate(),
  credentialUrl: nullableHttpUrl(2000),
});

const linkSchema = z.object({
  kind: z.enum(LINK_KINDS),
  url: httpUrl(2000),
  label: nullableText(200),
});

/**
 * Le document complet attendu par PUT /profiles/me. Pas de champ `version` :
 * la concurrence optimiste voyage par l'en-tête If-Match (voir if-match.ts),
 * jamais dans le corps — ce n'est pas une donnée du CV, c'est une
 * métadonnée de synchronisation.
 *
 * Les noms de compétences et de langues dupliqués sont rejetés ici plutôt
 * que renvoyés par la contrainte UNIQUE de la base : un 400 avec un message
 * clair plutôt qu'une erreur de contrainte traduite en 500.
 */
export const putProfileSchema = z
  .object({
    fullName: requiredText(200),
    headline: nullableText(200),
    summary: nullableText(5000),
    email: z
      .email()
      .max(320)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    phone: nullableText(50),
    location: nullableText(200),
    willingToRelocate: z.boolean().default(false),
    workPreference: z
      .enum(WORK_PREFERENCES)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    workAuthorizationNote: nullableText(2000),
    rawCvText: nullableText(20_000),
    experiences: z.array(experienceSchema).max(30),
    education: z.array(educationSchema).max(20),
    skills: z.array(skillSchema).max(100),
    languages: z.array(languageSchema).max(20),
    certifications: z.array(certificationSchema).max(30),
    links: z.array(linkSchema).max(10),
  })
  .refine(
    (dto) => {
      const names = dto.skills.map((skill) => skill.name.toLowerCase());
      return new Set(names).size === names.length;
    },
    {
      message: 'une compétence ne peut pas apparaître deux fois',
      path: ['skills'],
    },
  )
  .refine(
    (dto) => {
      const names = dto.languages.map((language) =>
        language.name.toLowerCase(),
      );
      return new Set(names).size === names.length;
    },
    {
      message: 'une langue ne peut pas apparaître deux fois',
      path: ['languages'],
    },
  );

export type PutProfileDto = z.infer<typeof putProfileSchema>;

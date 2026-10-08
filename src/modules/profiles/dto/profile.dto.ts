import type { WorkPreference } from '../entities/profile.entity.js';
import type { EmploymentType } from '../entities/profile-experience.entity.js';
import type { SkillCategory } from '../entities/profile-skill.entity.js';
import type { LanguageProficiency } from '../entities/profile-language.entity.js';
import type { LinkKind } from '../entities/profile-link.entity.js';

export interface ExperienceDto {
  company: string;
  title: string;
  employmentType: EmploymentType;
  location: string | null;
  startDate: string;
  endDate: string | null;
  summary: string | null;
  bullets: { text: string }[];
}

export interface EducationDto {
  school: string;
  degree: string;
  field: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  credentialEvaluation: string | null;
  honours: string | null;
}

export interface SkillDto {
  name: string;
  category: SkillCategory;
}

export interface LanguageDto {
  name: string;
  proficiency: LanguageProficiency;
}

export interface CertificationDto {
  name: string;
  issuer: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  credentialUrl: string | null;
}

export interface LinkDto {
  kind: LinkKind;
  url: string;
  label: string | null;
}

/**
 * Le document complet renvoyé par GET et PUT. `version` n'y figure jamais :
 * elle voyage par l'en-tête ETag/If-Match (voir if-match.ts), jamais dans un
 * corps JSON que l'utilisateur pourrait modifier ou perdre de vue.
 */
export interface ProfileDto {
  id: string;
  fullName: string;
  headline: string | null;
  summary: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  willingToRelocate: boolean;
  workPreference: WorkPreference | null;
  workAuthorizationNote: string | null;
  rawCvText: string | null;
  experiences: ExperienceDto[];
  education: EducationDto[];
  skills: SkillDto[];
  languages: LanguageDto[];
  certifications: CertificationDto[];
  links: LinkDto[];
  createdAt: Date;
  updatedAt: Date;
}

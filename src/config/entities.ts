import { User } from '../modules/auth/entities/user.entity.js';
import { Profile } from '../modules/profiles/entities/profile.entity.js';
import { ProfileExperience } from '../modules/profiles/entities/profile-experience.entity.js';
import { ExperienceBullet } from '../modules/profiles/entities/experience-bullet.entity.js';
import { ProfileEducation } from '../modules/profiles/entities/profile-education.entity.js';
import { ProfileSkill } from '../modules/profiles/entities/profile-skill.entity.js';
import { ProfileLanguage } from '../modules/profiles/entities/profile-language.entity.js';
import { ProfileCertification } from '../modules/profiles/entities/profile-certification.entity.js';
import { ProfileLink } from '../modules/profiles/entities/profile-link.entity.js';
import { Application } from '../modules/applications/entities/application.entity.js';
import { GeneratedDocument } from '../modules/documents/entities/generated-document.entity.js';
import { Offer } from '../modules/offers/entities/offer.entity.js';
import { LlmDailyQuota } from '../modules/llm/entities/llm-daily-quota.entity.js';
import { ApplicationEvent } from '../modules/events/entities/application-event.entity.js';

/**
 * Liste unique des entités, partagée par la source de données de production et
 * par le harnais de test. En ESM il n'y a pas de glob possible : une liste
 * dupliquée dériverait, et un test tournerait alors sur un schéma différent de
 * celui de la production — exactement le bug qu'un test d'intégration doit
 * attraper.
 */
export const entities = [
  User,
  Profile,
  ProfileExperience,
  ExperienceBullet,
  ProfileEducation,
  ProfileSkill,
  ProfileLanguage,
  ProfileCertification,
  ProfileLink,
  Offer,
  LlmDailyQuota,
  Application,
  GeneratedDocument,
  ApplicationEvent,
];

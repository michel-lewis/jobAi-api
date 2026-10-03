import { User } from '../modules/auth/entities/user.entity.js';
import { Profile } from '../modules/profiles/entities/profile.entity.js';
import { Application } from '../modules/applications/entities/application.entity.js';
import { GeneratedDocument } from '../modules/documents/entities/generated-document.entity.js';
import { Offer } from '../modules/offers/entities/offer.entity.js';
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
  Offer,
  Application,
  GeneratedDocument,
  ApplicationEvent,
];

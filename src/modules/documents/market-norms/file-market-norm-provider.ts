import type {
  Language,
  MarketNorm,
  MarketNormProvider,
} from '../market-norm.js';
import { marketNormSchema } from './market-norm.schema.js';
import { CA_EN_NORM, CA_FR_NORM } from './ca-norms.js';
import { familyOf } from './country-families.js';
import { unknownNorm } from './unknown-norm.js';
import { resolvePersonalPolicy } from './personal-policy.js';

/**
 * Implémentation d'aujourd'hui : fichiers de données versionnés dans le
 * dépôt, validés par Zod au démarrage — une norme invalide fait échouer
 * le boot, jamais une génération en cours (ADR-14, décision 2). Une
 * implémentation en base de données reste possible plus tard, même
 * déclencheur que Redis à l'ADR-13.
 */
export class FileMarketNormProvider implements MarketNormProvider {
  constructor() {
    for (const norm of [CA_FR_NORM, CA_EN_NORM]) {
      marketNormSchema.parse(norm);
    }
  }

  /**
   * Fusion ordonnée : famille → exception pays → langue → (V2)
   * utilisateur. `userId` est accepté mais ignoré aujourd'hui — une
   * réservation de forme, pas une fonctionnalité.
   */
  resolveNorm(context: {
    country: string;
    language: Language;
    userId?: string;
  }): MarketNorm {
    if (context.country === 'CA') {
      return context.language === 'fr' ? CA_FR_NORM : CA_EN_NORM;
    }

    const family = familyOf(context.country);
    return {
      ...unknownNorm(context.language),
      family,
      // `personal` est recherché par famille indépendamment du contenu de
      // `letter` : une famille peut avoir une politique personnelle connue
      // (ADR-14, décision 2) sans qu'aucune norme de lettre réelle n'existe
      // encore pour elle.
      personal: resolvePersonalPolicy(context.country, family),
    };
  }
}

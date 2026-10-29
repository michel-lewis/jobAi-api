import type { MarketNorm } from '../market-norm.js';
import { resolvePersonalPolicy } from './personal-policy.js';

/**
 * Les deux entrées réelles au lancement (ADR-14, décision 2 : « même avec
 * deux entrées au lancement »). Les autres familles existent comme
 * catégorie, pas comme contenu : une famille sans entrée ici retombe sur
 * la norme neutre (`unknown-norm.ts`), confiance `neutral` — ajouter du
 * contenu réel pour une autre famille est un commit futur, pas un
 * prérequis de ce ticket.
 *
 * GAP CONNU, à confirmer : `superlatives` ne porte que les deux exemples
 * cités par l'ADR-14 (« exceptionnel », « unique »), jamais présentés comme
 * une liste fermée complète. Tant qu'elle n'est pas confirmée, le contrôle
 * de superlatif sous-détecte plutôt que de sur-détecter sur ces deux
 * marchés — même raisonnement que « verbe absent de l'échelle » : un
 * passe-droit assumé, pas un oubli silencieux.
 */

const FR_VERB_LADDER: string[][] = [
  ['participé', 'assisté', 'appuyé'],
  ['contribué', 'collaboré'],
  ['développé', 'construit', 'mis en place', 'implémenté'],
  ['réalisé', 'livré', 'assuré', 'mené à bien'],
  ['conduit', 'piloté', 'encadré', 'supervisé', 'géré'],
  ['dirigé', 'orchestré', 'impulsé', 'chapeauté'],
];

const EN_VERB_LADDER: string[][] = [
  ['participated', 'assisted', 'supported'],
  ['contributed', 'collaborated'],
  ['developed', 'built', 'implemented'],
  ['delivered', 'completed', 'shipped', 'executed'],
  ['led', 'drove', 'managed', 'owned', 'coordinated'],
  ['directed', 'headed', 'spearheaded', 'championed'],
];

export const CA_FR_NORM: MarketNorm = {
  family: 'north_american',
  language: 'fr',
  verbLadder: FR_VERB_LADDER,
  superlatives: ['exceptionnel', 'unique'],
  personal: resolvePersonalPolicy('CA', 'north_american'),
  letter: {
    // 450, pas 350 : aucune source consultée ne donne de nombre de mots
    // (elles raisonnent toutes en pages) — [250, 450] est notre conversion
    // assumée de la règle "une page", pas un chiffre cité (voir provenance).
    lengthRange: [250, 450],
    paragraphCount: [3, 5],
    openingFormula: 'Madame, Monsieur,',
    closingFormula: 'Cordialement,',
    forbiddenFormulas: {
      standalone: [
        'Je vous écris pour exprimer mon intérêt pour ce poste.',
        'Je me permets de vous adresser ma candidature.',
        "C'est avec un grand intérêt que j'ai pris connaissance de votre annonce.",
        'Je reste à votre disposition pour tout complément d’information.',
      ],
      embedded: [
        'force de proposition',
        "esprit d'équipe",
        'dynamique et motivé',
        'passionné par',
        'véritable',
        'plus-value',
        'à la pointe',
      ],
    },
  },
  cv: null,
  meta: {
    provenance:
      'HEC Montréal (service de gestion de carrière), Michael Page Canada — consultés le 2026-10-28',
    verifiedAt: '2026-10-28',
    confidence: 'verified',
    userOverridable: {},
  },
};

export const CA_EN_NORM: MarketNorm = {
  family: 'north_american',
  language: 'en',
  verbLadder: EN_VERB_LADDER,
  superlatives: ['exceptional', 'unique'],
  personal: resolvePersonalPolicy('CA', 'north_american'),
  letter: {
    // 450, pas 350 : même absence de source chiffrée que CA_FR_NORM. Le
    // nombre de paragraphes, lui, vient d'un autre marché — voir meta
    // ci-dessous.
    lengthRange: [250, 450],
    paragraphCount: [3, 5],
    openingFormula: 'Dear Hiring Manager,',
    closingFormula: 'Sincerely,',
    forbiddenFormulas: {
      standalone: [
        'I am writing to express my interest in this position.',
        'Please find attached my resume for your consideration.',
        'I believe I would be a great fit for this role.',
        'Thank you for considering my application.',
      ],
      embedded: [
        'team player',
        'results-driven',
        'hit the ground running',
        'think outside the box',
        'proven track record',
        'go-getter',
      ],
    },
  },
  cv: null,
  meta: {
    // Correction P (revue senior) — York ne donne ni nombre de paragraphes
    // ni nombre de mots (seulement « one page », « standard business
    // letter format ») : les 3 à 5 paragraphes viennent en réalité des
    // entrées commonwealth (National Careers Service britannique,
    // Prospects), un marché différent. 'inherited', pas 'verified' — le
    // format et la longueur en page SONT vérifiés par York, mais pas ce
    // chiffre précis. Attention pour la prochaine famille : le schéma Zod
    // ne vérifie que la cohérence confidence/verifiedAt, jamais celle
    // entre `provenance` et les valeurs qu'elle prétend justifier —
    // confidence doit refléter la pire garantie du lot, pas la meilleure,
    // et ça reste une vérification à faire à la main à chaque entrée.
    provenance:
      "York University Career Ready (format et longueur — une page) ; nombre de paragraphes hérité d'entrées commonwealth (National Careers Service, Prospects), aucune source nord-américaine anglophone trouvée pour ce chiffre précis — consulté le 2026-10-28",
    verifiedAt: '2026-10-28',
    confidence: 'inherited',
    userOverridable: {},
  },
};

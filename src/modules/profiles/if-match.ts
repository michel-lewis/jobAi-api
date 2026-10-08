import { BadRequestException } from '@nestjs/common';

// Guillemets appariés ou absents des deux côtés — jamais un seul. `"5` ou
// `5"` ne sont pas des ETags valides (formatETag n'en produit jamais) et ne
// doivent pas être acceptés comme un "5" silencieusement corrigé.
const IF_MATCH_PATTERN = /^(?:"(\d+)"|(\d+))$/;

/**
 * La version du profil voyage par en-tête, jamais dans le corps JSON — ce
 * n'est pas une donnée du CV, c'est une métadonnée de synchronisation.
 * Chaque profil existe dès l'inscription (créé dans la même transaction que
 * l'utilisateur) : il n'y a plus de première écriture sans version connue,
 * donc l'en-tête est obligatoire. Son absence est une erreur du client à
 * signaler, pas un cas à deviner.
 */
export function parseIfMatch(header: string | undefined): number {
  if (header === undefined) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message:
        'En-tête If-Match manquant — relis le profil (GET) pour obtenir sa version actuelle',
    });
  }

  const match = IF_MATCH_PATTERN.exec(header.trim());

  if (!match) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message:
        'En-tête If-Match invalide — attendu un entier, éventuellement entre guillemets',
    });
  }

  return Number(match[1] ?? match[2]);
}

export function formatETag(version: number): string {
  return `"${version}"`;
}

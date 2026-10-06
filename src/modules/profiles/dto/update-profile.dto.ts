import { z } from 'zod';
import { createProfileSchema } from './create-profile.dto.js';

/**
 * Mêmes champs que la création, tous optionnels : un PATCH, pas un PUT.
 *
 * Dériver de `createProfileSchema` est légitime ici parce que les
 * contraintes sont identiques — seule l'optionalité change. On ne dérive
 * que quand les règles ne divergent pas.
 *
 * Le `refine` refuse un corps vide. Un PATCH sans aucun champ est presque
 * toujours un bug du client — un formulaire mal câblé, un état vide. Lui
 * répondre 200 cacherait son bug ; le 400 le lui apprend. Et la règle vit
 * dans le schéma, pas dans le service : la requête vide n'atteint jamais
 * la couche métier.
 */
export const updateProfileSchema = createProfileSchema
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'Au moins un champ doit être fourni',
  });

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

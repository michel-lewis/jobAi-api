import { z } from 'zod';

/**
 * ENTRÉE : uniquement ce que le client envoie.
 * Pas de `min(8)` ici — durcir la politique de mot de passe ne doit jamais
 * rendre inconnectables les comptes déjà créés. Register impose une règle,
 * login constate une présence.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(100),
});

export type LoginDto = z.infer<typeof loginSchema>;

/** SORTIE : distincte de l'entrée. Ne contient jamais le hash. */
export interface LoggedInUserDto {
  id: string;
  email: string;
  name: string | null;
  autoApplyEnabled: boolean;
  createdAt: Date;
  token: string;
}

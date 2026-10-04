import { z } from 'zod';

/** Ce que le client envoie : un mot de passe EN CLAIR, jamais un hash. */
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(100),
  name: z.string().trim().min(1).max(100).optional(),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export interface RegisteredUserDto {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

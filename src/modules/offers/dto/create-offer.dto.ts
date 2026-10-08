import { z } from 'zod';

const httpUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .url()
    .refine(
      (value) => value.startsWith('http://') || value.startsWith('https://'),
      { message: 'doit être une URL http(s)' },
    );

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const nullableHttpUrl = (max: number) =>
  httpUrl(max)
    .nullable()
    .optional()
    .transform((value) => value ?? null);

/**
 * `source`, `createdByUserId` et `applyChannel` n'existent pas ici : le
 * service les fixe lui-même (manual_paste / l'utilisateur du JWT /
 * manual_only), jamais depuis ce qu'un client envoie dans le corps.
 *
 * `description` plafonne à 20 000 caractères — volontairement bien sous la
 * limite par défaut de 100 Ko d'Express, pour que 50 000+ caractères
 * accentués (jusqu'à 4 octets UTF-8 chacun) restent sous ce plafond et
 * déclenchent le 400 de Zod, pas un 413 d'Express non garanti de
 * traverser ce filtre.
 */
export const createOfferSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(20_000),
  company: nullableText(200),
  location: nullableText(200),
  applyUrl: nullableHttpUrl(2000),
});

export type CreateOfferDto = z.infer<typeof createOfferSchema>;

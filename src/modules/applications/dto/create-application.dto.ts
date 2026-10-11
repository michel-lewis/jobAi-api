import { z } from 'zod';

export const createApplicationSchema = z.object({
  offerId: z.string().uuid(),
});

export type CreateApplicationDto = z.infer<typeof createApplicationSchema>;

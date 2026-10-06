import { z } from 'zod';

export const createProfileSchema = z.object({
  professionalInformation: z.string().trim().min(1),
  personalInformation: z.string().trim().min(1),
  education: z.string().trim().min(1),
  location: z.string().trim().min(1).nullable().optional(),
});

export type CreateProfileDto = z.infer<typeof createProfileSchema>;

export interface ProfileDto {
  id: string;
  professionalInformation: string;
  personalInformation: string;
  education: string;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
}

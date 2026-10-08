import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Profile } from './profile.entity.js';

export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'contract',
  'freelance',
  'internship',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * Recréée en entier à chaque PUT sur le profil — pas de created_at/updated_at,
 * une ligne n'a pas d'histoire propre. `endDate` NULL est la source unique de
 * « poste actuel » : pas de colonne `isCurrent`, deux sources de vérité
 * finissent toujours par diverger.
 */
@Entity('profile_experiences')
@Check(
  'chk_profile_experiences_employment_type',
  `"employment_type" IN ('full_time', 'part_time', 'contract', 'freelance', 'internship')`,
)
@Check(
  'chk_profile_experiences_dates',
  `"end_date" IS NULL OR "end_date" >= "start_date"`,
)
@Index('idx_profile_experiences_profile_id', ['profileId'])
export class ProfileExperience {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ type: 'text' })
  company: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  employmentType: EmploymentType;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'int' })
  sortOrder: number;
}

import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Profile } from './profile.entity.js';

export const LANGUAGE_PROFICIENCIES = [
  'native',
  'fluent',
  'professional',
  'intermediate',
  'basic',
] as const;
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number];

/** Section réelle d'un CV canadien, et critère de sélection d'offre. */
@Entity('profile_languages')
@Unique('uq_profile_languages_profile_id_name', ['profileId', 'name'])
@Check(
  'chk_profile_languages_proficiency',
  `"proficiency" IN ('native', 'fluent', 'professional', 'intermediate', 'basic')`,
)
@Index('idx_profile_languages_profile_id', ['profileId'])
export class ProfileLanguage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  proficiency: LanguageProficiency;

  @Column({ type: 'int' })
  sortOrder: number;
}

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

export const SKILL_CATEGORIES = [
  'language',
  'framework',
  'database',
  'tool',
  'cloud',
  'soft',
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/**
 * Pas de niveau auto-déclaré : « expert en React » n'informe personne.
 * `category` sert au regroupement dans le CV rendu, et plus tard au
 * rapprochement avec les compétences exigées par une offre.
 */
@Entity('profile_skills')
@Unique('uq_profile_skills_profile_id_name', ['profileId', 'name'])
@Check(
  'chk_profile_skills_category',
  `"category" IN ('language', 'framework', 'database', 'tool', 'cloud', 'soft')`,
)
@Index('idx_profile_skills_profile_id', ['profileId'])
export class ProfileSkill {
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
  category: SkillCategory;

  @Column({ type: 'int' })
  sortOrder: number;
}

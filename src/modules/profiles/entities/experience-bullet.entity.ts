import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfileExperience } from './profile-experience.entity.js';

/**
 * La table qui rend le CV ciblé possible : un CV adapté choisit quelques
 * puces sur l'ensemble selon l'offre. Jamais supprimée à la main — elle
 * disparaît via le ON DELETE CASCADE quand son expérience parente est
 * supprimée au remplacement complet du profil.
 */
@Entity('experience_bullets')
@Index('idx_experience_bullets_experience_id', ['experienceId'])
export class ExperienceBullet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  experienceId: string;

  @ManyToOne(() => ProfileExperience, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'experience_id' })
  experience: ProfileExperience;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'int' })
  sortOrder: number;
}

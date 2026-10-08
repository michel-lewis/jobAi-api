import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Profile } from './profile.entity.js';

/**
 * `credentialEvaluation` est spécifique au Canada : « Évalué par WES comme
 * équivalent à un baccalauréat canadien » est la ligne qui rend un diplôme
 * étranger lisible pour un recruteur local. Sans elle, le diplôme est ignoré.
 */
@Entity('profile_education')
@Index('idx_profile_education_profile_id', ['profileId'])
export class ProfileEducation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ type: 'text' })
  school: string;

  @Column({ type: 'text' })
  degree: string;

  @Column({ type: 'text', nullable: true })
  field: string | null;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @Column({ type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'text', nullable: true })
  credentialEvaluation: string | null;

  @Column({ type: 'text', nullable: true })
  honours: string | null;

  @Column({ type: 'int' })
  sortOrder: number;
}

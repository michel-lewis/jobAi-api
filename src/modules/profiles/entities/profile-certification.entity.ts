import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Profile } from './profile.entity.js';

@Entity('profile_certifications')
@Index('idx_profile_certifications_profile_id', ['profileId'])
export class ProfileCertification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  issuer: string | null;

  @Column({ type: 'date', nullable: true })
  issuedOn: string | null;

  @Column({ type: 'date', nullable: true })
  expiresOn: string | null;

  @Column({ type: 'text', nullable: true })
  credentialUrl: string | null;

  @Column({ type: 'int' })
  sortOrder: number;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';

/**
 * Matière première des CV. Séparée de User parce que ce sont deux
 * responsabilités distinctes : l'une porte l'accès, l'autre le contenu.
 * Le 1-1 est garanti par la contrainte UNIQUE, pas par convention.
 */
@Entity('profiles')
@Index('uq_profiles_user_id', ['userId'], { unique: true })
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  professionalInformation: string;

  @Column({ type: 'text' })
  personalInformation: string;

  @Column({ type: 'text' })
  education: string;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

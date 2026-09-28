import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Identité et accès. Le contenu servant à générer les CV vit dans Profile. */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text' })
  passwordHash: string;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  /** Réglage de compte, pas contenu de CV. */
  @Column({ type: 'boolean', default: false })
  autoApplyEnabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

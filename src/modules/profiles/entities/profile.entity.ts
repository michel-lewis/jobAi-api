import {
  Check,
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

export const WORK_PREFERENCES = ['onsite', 'hybrid', 'remote'] as const;
export type WorkPreference = (typeof WORK_PREFERENCES)[number];

/**
 * Matière première des CV. Séparée de User parce que ce sont deux
 * responsabilités distinctes : l'une porte l'accès, l'autre le contenu.
 * Le 1-1 est garanti par la contrainte UNIQUE, pas par convention.
 *
 * `version` sert à la concurrence optimiste du PUT (deux onglets ouverts) :
 * jamais exposée dans le corps JSON, seulement via l'en-tête ETag/If-Match
 * (voir ProfilesController). Énumérations en text + CHECK, jamais en ENUM
 * natif (ADR-06).
 */
@Entity('profiles')
@Index('uq_profiles_user_id', ['userId'], { unique: true })
@Check(
  'chk_profiles_work_preference',
  `"work_preference" IS NULL OR "work_preference" IN ('onsite', 'hybrid', 'remote')`,
)
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'text' })
  fullName: string;

  @Column({ type: 'text', nullable: true })
  headline: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @Column({ type: 'boolean', default: false })
  willingToRelocate: boolean;

  @Column({ type: 'text', nullable: true })
  workPreference: WorkPreference | null;

  /**
   * Texte libre saisi par l'utilisateur, affiché ou copié tel quel. Jamais
   * déduit, jamais rempli automatiquement dans un formulaire — la règle du
   * projet interdit de générer des réponses aux questions de filtrage.
   */
  @Column({ type: 'text', nullable: true })
  workAuthorizationNote: string | null;

  /** Filet de sécurité : ce qui n'entre dans aucune case, en appui au LLM. */
  @Column({ type: 'text', nullable: true })
  rawCvText: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

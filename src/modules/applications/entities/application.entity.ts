import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import {
  Offer,
  type ApplyChannel,
} from '../../offers/entities/offer.entity.js';

export const APPLICATION_STATUSES = [
  'draft',
  'generated',
  'reviewed',
  'sent',
  'answered',
  'generation_failed',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * L'unicité (user, offer) est un garde-fou : rien n'est pire qu'une
 * candidature envoyée deux fois au même recruteur. Décision réversible,
 * mais assumée pour la v1.
 */
@Entity('applications')
@Unique('uq_applications_user_offer', ['userId', 'offerId'])
@Check(
  'chk_applications_status',
  `"status" IN ('draft', 'generated', 'reviewed', 'sent', 'answered', 'generation_failed')`,
)
@Index('idx_applications_user_created', ['userId', 'createdAt'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  offerId: string;

  /** RESTRICT : on ne supprime pas une offre à laquelle quelqu'un a postulé. */
  @ManyToOne(() => Offer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'offer_id' })
  offer: Offer;

  @Column({ type: 'text', default: 'draft' })
  status: ApplicationStatus;

  /**
   * Motif d'échec lisible par un humain, posé quand status passe à
   * 'generation_failed'. NULL tant qu'aucune génération n'a échoué.
   */
  @Column({ type: 'text', nullable: true })
  generationFailureReason: string | null;

  /**
   * Horodatage du dernier LANCEMENT de génération — posé par startOrRetry à
   * chaque fois (création initiale ET relance après échec), jamais par
   * createdAt qui ne bouge plus une fois la ligne insérée. C'est ce champ,
   * pas createdAt, qui mesure depuis combien de temps un travail 'draft'
   * est réellement en cours : une relance le lendemain d'un premier échec ne
   * doit pas naître déjà périmée (ADR-13).
   */
  @Column({ type: 'timestamptz' })
  generationStartedAt: Date;

  /** Niveau de préparation réellement utilisé. NULL tant que rien n'est envoyé. */
  @Column({ type: 'text', nullable: true })
  applyChannelUsed: ApplyChannel | null;

  /** La date qui compte pour un suivi de candidatures — pas createdAt. */
  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  answeredAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

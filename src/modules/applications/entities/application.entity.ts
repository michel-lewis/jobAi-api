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
  `"status" IN ('draft', 'generated', 'reviewed', 'sent', 'answered')`,
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

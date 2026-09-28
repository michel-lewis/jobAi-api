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

export const OFFER_SOURCES = ['jobbank', 'manual_paste'] as const;
export type OfferSource = (typeof OFFER_SOURCES)[number];

export const APPLY_CHANNELS = [
  'greenhouse',
  'lever',
  'generic_llm',
  'manual_only',
] as const;
export type ApplyChannel = (typeof APPLY_CHANNELS)[number];

/**
 * Énumérations en text + CHECK plutôt qu'en ENUM natif Postgres (ADR-06) :
 * ajouter une plateforme supportée arrivera plusieurs fois, et faire évoluer
 * un ENUM natif impose une migration pénible.
 */
@Entity('offers')
@Unique('uq_offers_source_external_id', ['source', 'externalId'])
@Check('chk_offers_source', `"source" IN ('jobbank', 'manual_paste')`)
@Check(
  'chk_offers_apply_channel',
  `"apply_channel" IN ('greenhouse', 'lever', 'generic_llm', 'manual_only')`,
)
@Index('idx_offers_apply_channel', ['applyChannel'])
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  source: OfferSource;

  @Column({ type: 'text', nullable: true })
  externalId: string | null;

  /** NULL = offre publique partagée. Renseigné = offre privée à son auteur. */
  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  company: string | null;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  /** Le corps de l'offre — entrée de l'extraction LLM. Jamais tronqué. */
  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  applyUrl: string | null;

  @Column({ type: 'text', default: 'manual_only' })
  applyChannel: ApplyChannel;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

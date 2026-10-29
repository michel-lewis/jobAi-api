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

/** ADR-14, décision 1 : posée par l'utilisateur à la création, jamais déduite du texte. */
export const OFFER_LANGUAGES = ['fr', 'en'] as const;
export type OfferLanguage = (typeof OFFER_LANGUAGES)[number];

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
@Check('chk_offers_language', `"language" IN ('fr', 'en')`)
// ISO 3166-1 alpha-2 (ADR-14, décision 2) : un format, pas une énumération
// de ~250 codes — le CHECK valide la forme, pas la liste.
@Check('chk_offers_country', `"country" ~ '^[A-Z]{2}$'`)
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

  /**
   * ADR-14, décision 1 : posée à la création, jamais déduite du texte.
   * Toutes les lettres générées pour cette offre utilisent cette langue.
   */
  @Column({ type: 'text' })
  language: OfferLanguage;

  /**
   * ADR-14, décision 2 : ISO 3166-1 alpha-2. Le marché est `country +
   * language`, sans analyse de texte — `deriveMarket` depuis `location`
   * a été retirée de la décision.
   */
  @Column({ type: 'text' })
  country: string;

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

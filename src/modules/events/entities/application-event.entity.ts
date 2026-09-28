import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Application } from '../../applications/entities/application.entity.js';

export const EVENT_TYPES = [
  'created',
  'documents_generated',
  'auto_apply_attempted',
  'auto_apply_failed',
  'submitted',
  'status_changed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Journal d'activité métier, en AJOUT SEUL : on n'y modifie jamais une ligne.
 * À ne pas confondre avec les logs applicatifs, qui partent sur stdout et
 * n'ont rien à faire en base de données.
 */
@Entity('application_events')
@Check(
  'chk_application_events_type',
  `"type" IN ('created', 'documents_generated', 'auto_apply_attempted', 'auto_apply_failed', 'submitted', 'status_changed')`,
)
@Index('idx_application_events_app_created', ['applicationId', 'createdAt'])
export class ApplicationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application: Application;

  @Column({ type: 'text' })
  type: EventType;

  @Column({ type: 'text', nullable: true })
  channel: string | null;

  @Column({ type: 'boolean', nullable: true })
  success: boolean | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

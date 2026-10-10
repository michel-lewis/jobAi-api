import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';

/**
 * Un compteur par utilisateur et par jour calendaire (UTC). En base, pas en
 * mémoire : le service Render gratuit s'endort toutes les ~15 minutes
 * d'inactivité, donc un compteur en mémoire repartirait de zéro plusieurs
 * fois par jour — ce ne serait plus un quota quotidien, à peine un
 * limiteur de rafale par processus.
 */
@Entity('llm_daily_quotas')
@Unique('uq_llm_daily_quotas_user_id_day', ['userId', 'day'])
export class LlmDailyQuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Jour calendaire UTC, au format AAAA-MM-JJ. */
  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'int', default: 0 })
  count: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

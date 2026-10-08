import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Profile } from './profile.entity.js';

export const LINK_KINDS = ['linkedin', 'github', 'portfolio', 'other'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

@Entity('profile_links')
@Check(
  'chk_profile_links_kind',
  `"kind" IN ('linkedin', 'github', 'portfolio', 'other')`,
)
@Index('idx_profile_links_profile_id', ['profileId'])
export class ProfileLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column({ type: 'text' })
  kind: LinkKind;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  label: string | null;

  @Column({ type: 'int' })
  sortOrder: number;
}

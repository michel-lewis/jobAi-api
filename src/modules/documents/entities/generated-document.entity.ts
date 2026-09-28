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

export const DOCUMENT_TYPES = ['cv', 'cover_letter'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * IMMUABLE. Une ligne générée n'est jamais modifiée : régénérer crée une
 * nouvelle ligne, et le document courant est le plus récent par createdAt.
 * C'est ce qui permet, six mois plus tard, de montrer exactement ce qui a
 * été envoyé — même si le profil a changé depuis.
 *
 * L'absence d'updatedAt documente cette règle. Ne pas en ajouter.
 * Pas de contrainte d'unicité sur (application, type) non plus : elle
 * interdirait précisément la régénération.
 */
@Entity('generated_documents')
@Check('chk_generated_documents_type', `"type" IN ('cv', 'cover_letter')`)
@Index('idx_generated_documents_app_type_created', [
  'applicationId',
  'type',
  'createdAt',
])
export class GeneratedDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application: Application;

  @Column({ type: 'text' })
  type: DocumentType;

  /** Texte généré et vérifié — source de vérité. */
  @Column({ type: 'text' })
  content: string;

  /** Rendu PDF sur stockage objet. NULL tant que le rendu n'a pas eu lieu. */
  @Column({ type: 'text', nullable: true })
  fileUrl: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

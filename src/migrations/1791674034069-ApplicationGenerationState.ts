import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationGenerationState1791674034069 implements MigrationInterface {
  name = 'ApplicationGenerationState1791674034069';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "applications" ADD "generation_failure_reason" text`,
    );
    // Ajout nullable, remplissage, puis contrainte — jamais un ADD NOT NULL
    // direct sur une table qui peut déjà avoir des lignes (même schéma que
    // StructuredProfile). Les testcontainers partent d'une table vide et ne
    // l'auraient pas attrapé.
    await queryRunner.query(
      `ALTER TABLE "applications" ADD "generation_started_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "applications" SET "generation_started_at" = "created_at" WHERE "generation_started_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "generation_started_at" SET NOT NULL`,
    );
    // Le générateur TypeORM ne détecte pas les changements de CHECK — à la
    // main : ajoute 'generation_failed' à la liste des statuts autorisés.
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "chk_applications_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "chk_applications_status" CHECK ("status" IN ('draft', 'generated', 'reviewed', 'sent', 'answered', 'generation_failed'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Sans ça, re-poser l'ancienne contrainte échoue dès qu'une ligne est en
    // 'generation_failed' — valeur qui n'existait pas avant cette migration.
    // Perte d'information assumée au retour en arrière : 'draft' est la
    // valeur la plus proche du contrat précédent.
    await queryRunner.query(
      `UPDATE "applications" SET "status" = 'draft' WHERE "status" = 'generation_failed'`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "chk_applications_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "chk_applications_status" CHECK ("status" IN ('draft', 'generated', 'reviewed', 'sent', 'answered'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP COLUMN "generation_started_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP COLUMN "generation_failure_reason"`,
    );
  }
}

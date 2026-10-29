import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-14, décision 1 et 2 : `language` et `country` deviennent chacun un
 * champ obligatoire du corps de `POST /offers`, dans la même rupture. Le
 * remplissage des offres déjà en base est une devinette assumée, pas un
 * silence — `'en'` et `'CA'`, une combinaison déjà couverte par la famille
 * nord-américaine, pas par l'entrée neutre `'unknown'`. Acceptée parce
 * qu'il n'existe aujourd'hui aucun utilisateur réel (ADR-13).
 *
 * Ajout nullable, remplissage, puis contrainte — jamais un ADD NOT NULL
 * direct sur une table qui peut déjà avoir des lignes (même schéma que
 * ApplicationGenerationState). Les testcontainers partent d'une table vide
 * et ne l'auraient pas attrapé.
 */
export class OfferLanguageAndCountry1791850000000 implements MigrationInterface {
  name = 'OfferLanguageAndCountry1791850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "offers" ADD "language" text`);
    await queryRunner.query(
      `UPDATE "offers" SET "language" = 'en' WHERE "language" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ALTER COLUMN "language" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD CONSTRAINT "chk_offers_language" CHECK ("language" IN ('fr', 'en'))`,
    );

    await queryRunner.query(`ALTER TABLE "offers" ADD "country" text`);
    await queryRunner.query(
      `UPDATE "offers" SET "country" = 'CA' WHERE "country" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ALTER COLUMN "country" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD CONSTRAINT "chk_offers_country" CHECK ("country" ~ '^[A-Z]{2}$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "offers" DROP CONSTRAINT "chk_offers_country"`,
    );
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN "country"`);
    await queryRunner.query(
      `ALTER TABLE "offers" DROP CONSTRAINT "chk_offers_language"`,
    );
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN "language"`);
  }
}

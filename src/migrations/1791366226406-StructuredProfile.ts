import { MigrationInterface, QueryRunner } from 'typeorm';

export class StructuredProfile1791366226406 implements MigrationInterface {
  name = 'StructuredProfile1791366226406';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "profile_experiences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "company" text NOT NULL, "title" text NOT NULL, "employment_type" text NOT NULL, "location" text, "start_date" date NOT NULL, "end_date" date, "summary" text, "sort_order" integer NOT NULL, CONSTRAINT "chk_profile_experiences_dates" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"), CONSTRAINT "chk_profile_experiences_employment_type" CHECK ("employment_type" IN ('full_time', 'part_time', 'contract', 'freelance', 'internship')), CONSTRAINT "PK_1f9ad5b6b19ae8daf2152222c6a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_experiences_profile_id" ON "profile_experiences" ("profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "experience_bullets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "experience_id" uuid NOT NULL, "text" text NOT NULL, "sort_order" integer NOT NULL, CONSTRAINT "PK_f7ba23c07aa7f8ab98f32273c9a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_experience_bullets_experience_id" ON "experience_bullets" ("experience_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "profile_education" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "school" text NOT NULL, "degree" text NOT NULL, "field" text, "location" text, "start_date" date, "end_date" date, "credential_evaluation" text, "honours" text, "sort_order" integer NOT NULL, CONSTRAINT "PK_4ee5074ee613d1e0ff7d1750bae" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_education_profile_id" ON "profile_education" ("profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "profile_skills" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "name" text NOT NULL, "category" text NOT NULL, "sort_order" integer NOT NULL, CONSTRAINT "uq_profile_skills_profile_id_name" UNIQUE ("profile_id", "name"), CONSTRAINT "chk_profile_skills_category" CHECK ("category" IN ('language', 'framework', 'database', 'tool', 'cloud', 'soft')), CONSTRAINT "PK_9347b76dd1aff0f0285dbba7f79" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_skills_profile_id" ON "profile_skills" ("profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "profile_languages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "name" text NOT NULL, "proficiency" text NOT NULL, "sort_order" integer NOT NULL, CONSTRAINT "uq_profile_languages_profile_id_name" UNIQUE ("profile_id", "name"), CONSTRAINT "chk_profile_languages_proficiency" CHECK ("proficiency" IN ('native', 'fluent', 'professional', 'intermediate', 'basic')), CONSTRAINT "PK_8256a549ade3e41099f34293a7e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_languages_profile_id" ON "profile_languages" ("profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "profile_certifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "name" text NOT NULL, "issuer" text, "issued_on" date, "expires_on" date, "credential_url" text, "sort_order" integer NOT NULL, CONSTRAINT "PK_d7b239b95ba5f4d4750b67cd67b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_certifications_profile_id" ON "profile_certifications" ("profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "profile_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "kind" text NOT NULL, "url" text NOT NULL, "label" text, "sort_order" integer NOT NULL, CONSTRAINT "chk_profile_links_kind" CHECK ("kind" IN ('linkedin', 'github', 'portfolio', 'other')), CONSTRAINT "PK_c32e8b4c7ed79e0b9c61014f7f6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_links_profile_id" ON "profile_links" ("profile_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN "professional_information"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN "personal_information"`,
    );
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "education"`);
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "version" integer NOT NULL DEFAULT '1'`,
    );
    // Colonne ajoutée nullable, puis remplie, puis contrainte NOT NULL —
    // pas en un ADD NOT NULL direct : sur une base où "profiles" contient
    // déjà des lignes, l'ADD NOT NULL échouerait (aucune valeur à poser
    // sur les lignes existantes). Les testcontainers ne l'auraient pas
    // attrapé : ils partent toujours d'une table vide.
    await queryRunner.query(`ALTER TABLE "profiles" ADD "full_name" text`);
    await queryRunner.query(
      `UPDATE "profiles" SET "full_name" = COALESCE("users"."name", '') FROM "users" WHERE "users"."id" = "profiles"."user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ALTER COLUMN "full_name" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "profiles" ADD "headline" text`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD "summary" text`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD "email" text`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD "phone" text`);
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "willing_to_relocate" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "work_preference" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "work_authorization_note" text`,
    );
    await queryRunner.query(`ALTER TABLE "profiles" ADD "raw_cv_text" text`);
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD CONSTRAINT "chk_profiles_work_preference" CHECK ("work_preference" IS NULL OR "work_preference" IN ('onsite', 'hybrid', 'remote'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_experiences" ADD CONSTRAINT "FK_7ad5cd95906fb779270aa696aa4" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experience_bullets" ADD CONSTRAINT "FK_061ebabae799e872ad9e0957b7d" FOREIGN KEY ("experience_id") REFERENCES "profile_experiences"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_education" ADD CONSTRAINT "FK_444007a7690884faf0ae5a7cb99" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_skills" ADD CONSTRAINT "FK_307099ef26ed5a2dc95b8ab4c41" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_languages" ADD CONSTRAINT "FK_ac071dc85f089e1b9c2e56f7fb5" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_certifications" ADD CONSTRAINT "FK_e9a6742403bdecfbe84d961d268" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_links" ADD CONSTRAINT "FK_91652eb8aa51ec36557c62bfb2b" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profile_links" DROP CONSTRAINT "FK_91652eb8aa51ec36557c62bfb2b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_certifications" DROP CONSTRAINT "FK_e9a6742403bdecfbe84d961d268"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_languages" DROP CONSTRAINT "FK_ac071dc85f089e1b9c2e56f7fb5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_skills" DROP CONSTRAINT "FK_307099ef26ed5a2dc95b8ab4c41"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_education" DROP CONSTRAINT "FK_444007a7690884faf0ae5a7cb99"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experience_bullets" DROP CONSTRAINT "FK_061ebabae799e872ad9e0957b7d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_experiences" DROP CONSTRAINT "FK_7ad5cd95906fb779270aa696aa4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT "chk_profiles_work_preference"`,
    );
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "raw_cv_text"`);
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN "work_authorization_note"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN "work_preference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN "willing_to_relocate"`,
    );
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "email"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "summary"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "headline"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "full_name"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "version"`);
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "education" text NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "personal_information" text NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "professional_information" text NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_profile_links_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_links"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_profile_certifications_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_certifications"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_profile_languages_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_languages"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_profile_skills_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_skills"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_profile_education_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_education"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_experience_bullets_experience_id"`,
    );
    await queryRunner.query(`DROP TABLE "experience_bullets"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_profile_experiences_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_experiences"`);
  }
}

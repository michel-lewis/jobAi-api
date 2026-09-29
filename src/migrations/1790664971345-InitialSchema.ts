import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1790664971345 implements MigrationInterface {
  name = 'InitialSchema1790664971345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" text NOT NULL, "password_hash" text NOT NULL, "name" text, "auto_apply_enabled" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "professional_information" text NOT NULL, "personal_information" text NOT NULL, "education" text NOT NULL, "location" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_profiles_user_id" ON "profiles" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "source" text NOT NULL, "external_id" text, "created_by_user_id" uuid, "title" text NOT NULL, "company" text, "location" text, "description" text NOT NULL, "apply_url" text, "apply_channel" text NOT NULL DEFAULT 'manual_only', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_offers_source_external_id" UNIQUE ("source", "external_id"), CONSTRAINT "chk_offers_apply_channel" CHECK ("apply_channel" IN ('greenhouse', 'lever', 'generic_llm', 'manual_only')), CONSTRAINT "chk_offers_source" CHECK ("source" IN ('jobbank', 'manual_paste')), CONSTRAINT "PK_4c88e956195bba85977da21b8f4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_offers_apply_channel" ON "offers" ("apply_channel") `,
    );
    await queryRunner.query(
      `CREATE TABLE "applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "offer_id" uuid NOT NULL, "status" text NOT NULL DEFAULT 'draft', "apply_channel_used" text, "submitted_at" TIMESTAMP WITH TIME ZONE, "answered_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_applications_user_offer" UNIQUE ("user_id", "offer_id"), CONSTRAINT "chk_applications_status" CHECK ("status" IN ('draft', 'generated', 'reviewed', 'sent', 'answered')), CONSTRAINT "PK_938c0a27255637bde919591888f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_applications_user_created" ON "applications" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "generated_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "type" text NOT NULL, "content" text NOT NULL, "file_url" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_generated_documents_type" CHECK ("type" IN ('cv', 'cover_letter')), CONSTRAINT "PK_93d5f4d6fdc3c0fcc5a7a3aedc2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_generated_documents_app_type_created" ON "generated_documents" ("application_id", "type", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "application_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "type" text NOT NULL, "channel" text, "success" boolean, "message" text, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_application_events_type" CHECK ("type" IN ('created', 'documents_generated', 'auto_apply_attempted', 'auto_apply_failed', 'submitted', 'status_changed')), CONSTRAINT "PK_fd185969787381d8bf8c529bc00" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_application_events_app_created" ON "application_events" ("application_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD CONSTRAINT "FK_45816ac10c45d83d42a78e9b757" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "FK_9e7594d5b474d9cbebba15c1ae7" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "FK_74a6c487d523a49087f51c9bb8e" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "generated_documents" ADD CONSTRAINT "FK_e3932e80bad59cf76aef1eb0172" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_events" ADD CONSTRAINT "FK_58159d663fba2a48144c5ed3f4d" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_events" DROP CONSTRAINT "FK_58159d663fba2a48144c5ed3f4d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "generated_documents" DROP CONSTRAINT "FK_e3932e80bad59cf76aef1eb0172"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "FK_74a6c487d523a49087f51c9bb8e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "FK_9e7594d5b474d9cbebba15c1ae7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP CONSTRAINT "FK_45816ac10c45d83d42a78e9b757"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_application_events_app_created"`,
    );
    await queryRunner.query(`DROP TABLE "application_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_generated_documents_app_type_created"`,
    );
    await queryRunner.query(`DROP TABLE "generated_documents"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_applications_user_created"`,
    );
    await queryRunner.query(`DROP TABLE "applications"`);
    await queryRunner.query(`DROP INDEX "public"."idx_offers_apply_channel"`);
    await queryRunner.query(`DROP TABLE "offers"`);
    await queryRunner.query(`DROP INDEX "public"."uq_profiles_user_id"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}

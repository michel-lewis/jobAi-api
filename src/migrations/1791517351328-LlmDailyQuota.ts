import { MigrationInterface, QueryRunner } from 'typeorm';

export class LlmDailyQuota1791517351328 implements MigrationInterface {
  name = 'LlmDailyQuota1791517351328';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "llm_daily_quotas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "day" date NOT NULL, "count" integer NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_llm_daily_quotas_user_id_day" UNIQUE ("user_id", "day"), CONSTRAINT "PK_d5dfe8fc42df0f7fb2c4628b1a9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "llm_daily_quotas" ADD CONSTRAINT "FK_3168e0ba051727e1359f706ae5c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "llm_daily_quotas" DROP CONSTRAINT "FK_3168e0ba051727e1359f706ae5c"`,
    );
    await queryRunner.query(`DROP TABLE "llm_daily_quotas"`);
  }
}

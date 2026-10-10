import { Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { LlmQuotaExceededError } from './llm.port.js';
import type { DailyQuotaTracker } from './daily-quota-tracker.js';

/**
 * Une seule requête atomique : INSERT ... ON CONFLICT DO UPDATE avec une
 * clause WHERE sur le plafond. Si le plafond est déjà atteint, la clause
 * WHERE bloque le DO UPDATE entièrement — PostgreSQL ne renvoie alors aucune
 * ligne, ce qui distingue sans ambiguïté « autorisé » (une ligne revient)
 * de « refusé » (zéro ligne), sans lecture préalable séparée de l'écriture.
 */
@Injectable()
export class PostgresDailyQuotaTracker implements DailyQuotaTracker {
  constructor(private readonly dataSource: DataSource) {}

  async consume(userId: string, limitPerDay: number): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);

    const rows: unknown[] = await this.dataSource.query(
      `INSERT INTO "llm_daily_quotas" ("id", "user_id", "day", "count")
       VALUES (uuid_generate_v4(), $1, $2, 1)
       ON CONFLICT ("user_id", "day") DO UPDATE
         SET "count" = "llm_daily_quotas"."count" + 1
         WHERE "llm_daily_quotas"."count" < $3
       RETURNING "count"`,
      [userId, day, limitPerDay],
    );

    if (rows.length === 0) {
      throw new LlmQuotaExceededError(
        `Quota quotidien atteint (${limitPerDay} appels)`,
      );
    }
  }
}

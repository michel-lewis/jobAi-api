import { Repository } from 'typeorm';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/integration/postgres-harness.js';
import { User } from '../auth/entities/user.entity.js';
import { validateEnv } from '../../config/env.validation.js';
import { LlmQuotaExceededError } from '../llm/llm.port.js';
import { PostgresDailyQuotaTracker } from '../llm/postgres-daily-quota-tracker.js';

const JWT_SECRET = 'a'.repeat(32);

/**
 * Preuve 18. Teste directement le tracker de quota réel (Postgres, pas un
 * faux) contre l'arithmétique posée par l'ADR-14 décision 3a, en lisant le
 * plafond quotidien par défaut via `validateEnv` — la même source unique
 * que Nest et le CLI de migration — plutôt qu'en le recopiant en dur :
 * c'est ce qui rend ce test rouge aujourd'hui (plafond encore à 20) et vert
 * une fois `LLM_DAILY_QUOTA_PER_USER` monté à 40.
 *
 * Une lettre coûte 2 unités dans le cas courant (un appel de génération, un
 * appel de correction de format) — donc 20 lettres consomment exactement
 * les 40 unités disponibles, pas une de moins.
 *
 * Ce test ne peut PAS appeler le pipeline de génération réel : aucune
 * fonction orchestrant pré-vol → génération → correction → vérification
 * n'existe dans l'interface validée de ce ticket (voir le rapport). Il
 * simule donc le coût (2 appels `consume` par lettre) directement contre
 * le tracker déjà existant et éprouvé par
 * postgres-daily-quota-tracker.int-spec.ts, la preuve la plus proche
 * atteignable sans cette fonction.
 */
describe('Quota quotidien — 20 lettres par jour au coût double du format (ADR-14)', () => {
  let db: TestDatabase;
  let users: Repository<User>;
  const COST_PER_LETTER = 2;
  const LETTERS_PER_DAY = 20;
  let dailyLimit: number;

  beforeAll(async () => {
    db = await startTestDatabase();
    users = db.dataSource.getRepository(User);
    dailyLimit = validateEnv({
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET,
      NODE_ENV: 'test',
    }).LLM_DAILY_QUOTA_PER_USER;
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  it('permet encore 20 lettres au coût double, sans rejet avant la 20e', async () => {
    const user = await users.save({
      email: 'quota-letters@example.com',
      passwordHash: 'x',
    });
    const tracker = new PostgresDailyQuotaTracker(db.dataSource);

    let caught: unknown = null;
    try {
      for (let letter = 0; letter < LETTERS_PER_DAY; letter++) {
        for (let unit = 0; unit < COST_PER_LETTER; unit++) {
          await tracker.consume(user.id, dailyLimit);
        }
      }
    } catch (error) {
      caught = error;
    }

    // Les 40 unités (20 lettres x 2) doivent se consommer sans qu'aucune
    // n'ait levé — la 20e lettre n'est pas refusée.
    expect(caught).toBeNull();
  });

  it('refuse la 21e lettre au coût double, une fois le plafond quotidien épuisé', async () => {
    const user = await users.save({
      email: 'quota-letters-over@example.com',
      passwordHash: 'x',
    });
    const tracker = new PostgresDailyQuotaTracker(db.dataSource);

    for (let letter = 0; letter < LETTERS_PER_DAY; letter++) {
      for (let unit = 0; unit < COST_PER_LETTER; unit++) {
        await tracker.consume(user.id, dailyLimit);
      }
    }

    const error = await tracker.consume(user.id, dailyLimit).catch((e) => e);

    expect(error).toBeInstanceOf(LlmQuotaExceededError);
  });
});

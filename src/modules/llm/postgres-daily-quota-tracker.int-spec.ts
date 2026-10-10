import { Repository } from 'typeorm';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/integration/postgres-harness.js';
import { User } from '../auth/entities/user.entity.js';
import { LlmQuotaExceededError } from './llm.port.js';
import { PostgresDailyQuotaTracker } from './postgres-daily-quota-tracker.js';

/**
 * Le compteur est en base, pas en mémoire : seul un Postgres réel peut
 * prouver qu'il survit à la recréation du tracker, ce qu'un faux ne peut
 * pas distinguer d'un simple objet qui remet son compteur à zéro.
 */
describe('PostgresDailyQuotaTracker — quota quotidien persistant', () => {
  let db: TestDatabase;
  let users: Repository<User>;
  const DAILY_LIMIT = 20;

  beforeAll(async () => {
    db = await startTestDatabase();
    users = db.dataSource.getRepository(User);
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  it('refuse le 21e appel du jour pour un utilisateur ayant atteint sa limite quotidienne', async () => {
    const user = await users.save({
      email: 'quota@example.com',
      passwordHash: 'x',
    });
    const tracker = new PostgresDailyQuotaTracker(db.dataSource);

    for (let i = 0; i < DAILY_LIMIT; i++) {
      await tracker.consume(user.id, DAILY_LIMIT);
    }

    const error = await tracker.consume(user.id, DAILY_LIMIT).catch((e) => e);

    expect(error).toBeInstanceOf(LlmQuotaExceededError);
  });

  it(
    'le quota survit à la recréation du tracker contre la même base, ' +
      'comme après un redémarrage du processus',
    async () => {
      const user = await users.save({
        email: 'quota-restart@example.com',
        passwordHash: 'x',
      });
      const firstProcessTracker = new PostgresDailyQuotaTracker(db.dataSource);

      for (let i = 0; i < DAILY_LIMIT; i++) {
        await firstProcessTracker.consume(user.id, DAILY_LIMIT);
      }

      // Nouvelle instance contre la même base : simule le redémarrage du
      // processus — Render endort puis réveille le service plusieurs fois
      // par jour. Rien en mémoire ne doit avoir été perdu, seule la base
      // fait foi.
      const afterRestartTracker = new PostgresDailyQuotaTracker(db.dataSource);
      const error = await afterRestartTracker
        .consume(user.id, DAILY_LIMIT)
        .catch((e) => e);

      expect(error).toBeInstanceOf(LlmQuotaExceededError);
    },
  );
});

import { QueryFailedError, Repository } from 'typeorm';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/integration/postgres-harness.js';
import { User } from './entities/user.entity.js';

/**
 * M1 — volet intégration.
 *
 * Le test unitaire prouve que TA logique renvoie un 409 quand la
 * pré-vérification trouve un utilisateur. Il ne prouve rien sur la base :
 * un faux repository ne sait pas si la contrainte UNIQUE existe.
 *
 * Ici il n'y a aucun faux. Le schéma vient des migrations, la contrainte vient
 * de Postgres. C'est le seul test des deux qui tombe si tu retires
 * `unique: true` de l'entité.
 */
describe('users table — contrainte d unicité sur email', () => {
  let db: TestDatabase;
  let users: Repository<User>;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  it('accepte un premier utilisateur', async () => {
    // Arrange

    const userExample = {
      email: 'test@example.com',
      passwordHash: 'password',
      name: 'Test User',
    };

    // Act
    const saved = await users.save(userExample);

    // Assert
    expect(saved.id).toBeDefined();
    expect(saved.id).toMatch(uuidRegex);
  });

  it('refuse un second utilisateur avec le même email', async () => {
    // Arrange

    const user1Example = {
      email: 'test@example.com',
      passwordHash: 'password',
      name: 'Test User',
    };
    const user2Example = {
      email: 'test@example.com',
      passwordHash: 'password',
      name: 'Test User 2',
    };

    // Act
    const insert1 = await users.save(user1Example);

    const insert2 = await users.save(user2Example).catch((e) => e);
    // Assert
    expect(insert1.id).toBeDefined();
    expect(insert1.id).toMatch(uuidRegex);
    expect(insert2).toBeInstanceOf(QueryFailedError);
    expect(insert2.driverError?.code).toBe('23505');
  });

  it('considère deux casses différentes comme deux emails distincts', async () => {
    // Arrange
    const user1Example = {
      email: 'lewis@example.com',
      passwordHash: 'password',
      name: 'Lewis',
    };
    const user2Example = {
      email: 'Lewis@example.com',
      passwordHash: 'password',
      name: 'Lewis 2',
    };

    // Act
    const insert1 = await users.save(user1Example);
    const insert2 = await users.save(user2Example);

    // Assert
    expect(insert1.id).toBeDefined();
    expect(insert1.id).toMatch(uuidRegex);
    expect(insert2.id).toBeDefined();
    expect(insert2.id).toMatch(uuidRegex);
  });
});

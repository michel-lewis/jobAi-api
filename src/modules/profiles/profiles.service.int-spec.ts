import { ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/integration/postgres-harness.js';
import { User } from '../auth/entities/user.entity.js';
import { Profile } from './entities/profile.entity.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Le test unitaire prouve que TA logique renvoie un 409 quand la
 * pré-vérification trouve un profil. Il ne prouve rien sur la base : un
 * faux repository ne sait pas si la contrainte UNIQUE existe.
 *
 * Ici il n'y a aucun faux. Le schéma vient des migrations, la contrainte
 * vient de Postgres. C'est le seul test des deux qui tombe si
 * `uq_profiles_user_id` disparaît de l'entité.
 */
describe('profiles table — contrainte d unicité sur user_id', () => {
  let db: TestDatabase;
  let users: Repository<User>;
  let profiles: Repository<Profile>;

  beforeAll(async () => {
    db = await startTestDatabase();
    users = db.dataSource.getRepository(User);
    profiles = db.dataSource.getRepository(Profile);
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  it('accepte un premier profil pour un utilisateur', async () => {
    const user = await users.save({
      email: 'test@example.com',
      passwordHash: 'password',
    });

    const saved = await profiles.save({
      userId: user.id,
      professionalInformation: 'x',
      personalInformation: 'y',
      education: 'z',
    });

    expect(saved.id).toBeDefined();
  });

  // Même raison que pour users : le « query failed » journalisé ici est
  // ATTENDU, pas le signe d'un test cassé.
  it('refuse un second profil pour le même utilisateur', async () => {
    const user = await users.save({
      email: 'test@example.com',
      passwordHash: 'password',
    });

    const insert1 = await profiles.save({
      userId: user.id,
      professionalInformation: 'x',
      personalInformation: 'y',
      education: 'z',
    });

    const insert2 = await profiles
      .save({
        userId: user.id,
        professionalInformation: 'autre',
        personalInformation: 'autre',
        education: 'autre',
      })
      .catch((e) => e);

    expect(insert1.id).toBeDefined();
    expect(insert2).toBeInstanceOf(QueryFailedError);
    expect(insert2.driverError?.code).toBe('23505');
  });
});

/**
 * Le test ci-dessus prouve que la contrainte existe en base, mais en
 * appelant le repository directement — pas `ProfilesService.create()`. Le
 * test unitaire du service, lui, mocke la forme de l'erreur à la main. Ni
 * l'un ni l'autre ne prouve que le vrai driver Postgres produit une erreur
 * que le `catch` de `create()` sait reconnaître. Ici, deux créations
 * concurrentes passent par le service, sur une vraie base.
 */
describe('ProfilesService.create — la course réelle à travers le service', () => {
  let db: TestDatabase;
  let users: Repository<User>;
  let service: ProfilesService;

  beforeAll(async () => {
    db = await startTestDatabase();
    users = db.dataSource.getRepository(User);
    service = new ProfilesService(db.dataSource.getRepository(Profile));
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  it('traduit la course entre deux créations concurrentes en 409', async () => {
    const user = await users.save({
      email: 'test@example.com',
      passwordHash: 'password',
    });
    const payload = {
      professionalInformation: 'x',
      personalInformation: 'y',
      education: 'z',
    };

    const [result1, result2] = await Promise.allSettled([
      service.create(user.id, payload),
      service.create(user.id, payload),
    ]);
    const outcomes = [result1, result2];

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const [rejection] = outcomes.filter((o) => o.status === 'rejected') as [
      PromiseRejectedResult,
    ];

    expect(rejection.reason).toBeInstanceOf(ConflictException);
    expect(rejection.reason.getResponse()).toEqual({
      code: 'PROFILE_EXISTS',
      message: 'Un profil existe déjà pour cet utilisateur',
    });
  });
});

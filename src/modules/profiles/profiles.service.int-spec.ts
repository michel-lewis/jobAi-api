import { ConflictException } from '@nestjs/common';
import { In, QueryFailedError, Repository } from 'typeorm';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/integration/postgres-harness.js';
import { makePutProfileDto } from '../../../test/fixtures/profile.fixture.js';
import { User } from '../auth/entities/user.entity.js';
import { Profile } from './entities/profile.entity.js';
import { ProfileExperience } from './entities/profile-experience.entity.js';
import { ExperienceBullet } from './entities/experience-bullet.entity.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Le schéma vient des migrations, la contrainte vient de Postgres — un faux
 * repository ne sait pas si `uq_profiles_user_id` existe.
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
      passwordHash: 'x',
    });

    const saved = await profiles.save({
      userId: user.id,
      fullName: 'Lewis',
      version: 1,
    });

    expect(saved.id).toBeDefined();
  });

  it('refuse un second profil pour le même utilisateur', async () => {
    const user = await users.save({
      email: 'test@example.com',
      passwordHash: 'x',
    });

    const insert1 = await profiles.save({
      userId: user.id,
      fullName: 'Lewis',
      version: 1,
    });
    const insert2 = await profiles
      .save({ userId: user.id, fullName: 'Autre', version: 1 })
      .catch((e) => e);

    expect(insert1.id).toBeDefined();
    expect(insert2).toBeInstanceOf(QueryFailedError);
    expect(insert2.driverError?.code).toBe('23505');
  });
});

/**
 * Le profil est créé par AuthService.register(), dans la même transaction
 * que l'utilisateur — pas par ces tests. Ici, on simule ce même point de
 * départ en appelant `createForUser` directement, hors de toute transaction
 * d'inscription réelle, pour isoler ce que ProfilesService.replace() fait
 * ensuite.
 */
describe('ProfilesService.replace — remplacement complet, une transaction', () => {
  let db: TestDatabase;
  let users: Repository<User>;
  let experiences: Repository<ProfileExperience>;
  let bullets: Repository<ExperienceBullet>;
  let service: ProfilesService;
  let userId: string;

  beforeAll(async () => {
    db = await startTestDatabase();
    users = db.dataSource.getRepository(User);
    experiences = db.dataSource.getRepository(ProfileExperience);
    bullets = db.dataSource.getRepository(ExperienceBullet);
    service = new ProfilesService(db.dataSource);
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.truncateAll();
    const user = await users.save({
      email: 'test@example.com',
      passwordHash: 'x',
    });
    userId = user.id;
    await service.createForUser(
      db.dataSource.manager,
      userId,
      'Lewis Kouamkouam',
    );
  });

  it('remplace le document avec un If-Match correct et incrémente la version', async () => {
    const result = await service.replace(
      userId,
      1,
      makePutProfileDto({ fullName: 'Lewis Modifié' }),
    );

    expect(result.version).toBe(2);
    expect(result.dto.fullName).toBe('Lewis Modifié');
  });

  it('refuse un If-Match périmé sans rien modifier', async () => {
    await service.replace(
      userId,
      1,
      makePutProfileDto({ fullName: 'Première modif' }),
    );

    // 1 est maintenant périmée : elle date d'avant "Première modif" (version 2).
    const error = await service
      .replace(
        userId,
        1,
        makePutProfileDto({ fullName: 'Deuxième modif, en conflit' }),
      )
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'PROFILE_VERSION_MISMATCH',
    });

    const { dto } = await service.findMine(userId);
    expect(dto.fullName).toBe('Première modif');
  });

  /**
   * LA preuve du ticket. Un PUT qui passe de 3 à 2 expériences doit laisser
   * exactement 2 lignes en base, et les puces des expériences supprimées
   * doivent avoir disparu — pas via du code applicatif qui les efface une
   * à une, mais via le ON DELETE CASCADE déclenché par la suppression de
   * leur expérience parente. Si ce CASCADE disparaît de l'entité
   * ExperienceBullet, ce test tombe : soit la suppression des anciennes
   * expériences échoue (violation de clé étrangère), soit des puces
   * orphelines survivent — dans les deux cas, l'assertion ci-dessous rate.
   */
  it('un PUT qui passe de 3 à 2 expériences laisse exactement 2 lignes et supprime les puces orphelines', async () => {
    const threeExperiences = makePutProfileDto({
      experiences: [1, 2, 3].map((n) => ({
        company: `Entreprise ${n}`,
        title: 'Développeuse',
        employmentType: 'full_time' as const,
        location: null,
        startDate: '2020-01-01',
        endDate: '2021-01-01',
        summary: null,
        bullets: [`Puce A de ${n}`, `Puce B de ${n}`],
      })),
    });

    await service.replace(userId, 1, threeExperiences);

    const twoExperiences = makePutProfileDto({
      experiences: threeExperiences.experiences.slice(0, 2),
    });

    const { dto } = await service.replace(userId, 2, twoExperiences);
    const profileId = (
      await db.dataSource.getRepository(Profile).findOneByOrFail({ userId })
    ).id;

    const remainingExperiences = await experiences.find({
      where: { profileId },
    });
    const remainingBullets = await bullets.find({
      where: { experienceId: In(remainingExperiences.map((e) => e.id)) },
    });
    const allBulletsInDb = await bullets.count();

    expect(dto.experiences).toHaveLength(2);
    expect(remainingExperiences).toHaveLength(2);
    // 2 expériences restantes x 2 puces chacune = 4. Si les puces de la
    // 3e expérience supprimée avaient survécu, ce compte serait 6.
    expect(allBulletsInDb).toBe(4);
    expect(remainingBullets).toHaveLength(4);
  });
});

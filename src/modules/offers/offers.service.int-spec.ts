import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../test/integration/postgres-harness.js';
import { User } from '../auth/entities/user.entity.js';
import { Offer } from './entities/offer.entity.js';
import { OffersService } from './offers.service.js';

/**
 * Pas de fausse base pour ce module : le filtre d'accès (preuve 2), la
 * visibilité publique (preuve 3), le tri et la pagination (preuve 4) et le
 * déterminisme du tri (preuve 6) n'ont de sens que contre de vraies lignes.
 * Un faux repository renverrait ce qu'on lui dit de renvoyer — il ne
 * prouverait jamais que la clause WHERE existe.
 */
describe('OffersService — visibilité, tri et pagination', () => {
  let db: TestDatabase;
  let users: Repository<User>;
  let offers: Repository<Offer>;
  let service: OffersService;

  beforeAll(async () => {
    db = await startTestDatabase();
    users = db.dataSource.getRepository(User);
    offers = db.dataSource.getRepository(Offer);
    service = new OffersService(offers);
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  async function makeUserRow(email: string): Promise<User> {
    return users.save({ email, passwordHash: 'x' });
  }

  /**
   * Insère une offre directement, sans passer par OffersService.create —
   * utile pour fabriquer des offres publiques (createdByUserId: null), que
   * l'API ne sait pas créer, et pour fixer un `createdAt` exact.
   *
   * `@CreateDateColumn` est écrasé à `new Date()` par TypeORM dès qu'on
   * passe par `repository.save()` (SubjectExecutor.js l. 209-210, confirmé
   * en lisant la source de la version installée) : impossible de contrôler
   * l'instant via `save()`. Le query builder d'insertion brut n'a pas ce
   * comportement, donc c'est lui qu'on utilise pour fixer `createdAt` à une
   * valeur précise — y compris une valeur IDENTIQUE pour deux lignes, ce qui
   * est la seule façon fiable de simuler deux offres créées dans la même
   * milliseconde (preuve 6), plutôt que d'espérer que deux appels suffisamment
   * rapides tombent par hasard sur le même instant.
   */
  async function insertOfferAt(overrides: {
    createdByUserId?: string | null;
    title?: string;
    createdAt?: Date;
  }): Promise<{ id: string; createdByUserId: string | null; title: string }> {
    const id = randomUUID();
    const createdAt = overrides.createdAt ?? new Date();
    const createdByUserId = overrides.createdByUserId ?? null;
    const title = overrides.title ?? 'Offre';

    await offers
      .createQueryBuilder()
      .insert()
      .into(Offer)
      .values({
        id,
        source: 'manual_paste',
        externalId: null,
        createdByUserId,
        title,
        company: null,
        location: null,
        description: 'Description',
        applyUrl: null,
        applyChannel: 'manual_only',
        createdAt,
        updatedAt: createdAt,
      })
      .execute();

    return { id, createdByUserId, title };
  }

  /**
   * LA preuve centrale du ticket. Si la clause de filtre d'accès disparaît
   * de l'implémentation (par exemple un simple `findOneBy({ id })` sans
   * condition sur `createdByUserId`), ce test devient rouge : l'offre
   * privée d'Alice redevient visible à Bob alors qu'elle ne doit jamais
   * l'être.
   */
  it('une offre d un autre utilisateur n est jamais renvoyée par findVisibleById', async () => {
    const alice = await makeUserRow('alice@example.com');
    const bob = await makeUserRow('bob@example.com');
    const aliceOffer = await insertOfferAt({
      createdByUserId: alice.id,
      title: 'Offre privée d Alice',
    });

    const error = await service
      .findVisibleById(bob.id, aliceOffer.id)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'OFFER_NOT_FOUND',
    });
  });

  it('une offre publique est renvoyée a n importe quel utilisateur connecté', async () => {
    const bob = await makeUserRow('bob@example.com');
    const publicOffer = await insertOfferAt({
      createdByUserId: null,
      title: 'Offre publique',
    });

    const result = await service.findVisibleById(bob.id, publicOffer.id);

    expect(result.id).toBe(publicOffer.id);
    expect(result.createdByUserId).toBeNull();
  });

  it('liste les offres de l utilisateur et les offres publiques, triees des plus recentes aux plus anciennes', async () => {
    const alice = await makeUserRow('alice@example.com');
    const bob = await makeUserRow('bob@example.com');

    const oldest = await insertOfferAt({
      createdByUserId: alice.id,
      title: 'Alice - ancienne',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const middle = await insertOfferAt({
      createdByUserId: null,
      title: 'Publique - milieu',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const newest = await insertOfferAt({
      createdByUserId: alice.id,
      title: 'Alice - recente',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    // Offre privée de Bob : ne doit jamais apparaître pour Alice.
    await insertOfferAt({
      createdByUserId: bob.id,
      title: 'Bob - privee',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
    });

    const page = await service.listVisible(alice.id, { limit: 10, offset: 0 });

    expect(page.total).toBe(3);
    expect(page.items.map((o) => o.id)).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ]);
  });

  it('pagine avec limit et offset', async () => {
    const alice = await makeUserRow('alice@example.com');
    await insertOfferAt({
      createdByUserId: alice.id,
      title: 'A',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const second = await insertOfferAt({
      createdByUserId: alice.id,
      title: 'B',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    await insertOfferAt({
      createdByUserId: alice.id,
      title: 'C',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });

    const page = await service.listVisible(alice.id, { limit: 1, offset: 1 });

    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(second.id);
  });

  /**
   * Vingt offres avec un `createdAt` strictement IDENTIQUE : sans
   * départage explicite par id, Postgres n'a aucune obligation de rendre
   * un ordre particulier pour des lignes à égalité sur la seule colonne de
   * tri. Avec seulement deux lignes, trois appels identiques concordent
   * presque toujours par pure coïncidence — une table neuve, jamais
   * modifiée entre les appels, ressort généralement dans le même ordre
   * physique à chaque SELECT, sans que ça prouve un départage voulu. Avec
   * vingt lignes et un départage attendu par id décroissant, une
   * implémentation qui ne départage pas explicitement a une chance
   * négligeable de produire par hasard exactement cet ordre précis : ce
   * test, lui, peut vraiment tomber rouge si le départage manque.
   */
  it('vingt offres creees avec le meme createdAt sortent triees par id decroissant', async () => {
    const alice = await makeUserRow('alice@example.com');
    const sameInstant = new Date('2026-01-01T00:00:00.000Z');

    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const offer = await insertOfferAt({
        createdByUserId: alice.id,
        title: `Offre ${i}`,
        createdAt: sameInstant,
      });
      ids.push(offer.id);
    }

    const page = await service.listVisible(alice.id, { limit: 20, offset: 0 });

    const expectedOrder = [...ids].sort().reverse();
    expect(page.items.map((o) => o.id)).toEqual(expectedOrder);
  });
});

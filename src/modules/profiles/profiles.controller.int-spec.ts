import request from 'supertest';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';
import { makePutProfileDto } from '../../../test/fixtures/profile.fixture.js';

const PASSWORD = 'motdepasse123';

async function loginAs(
  api: TestApp,
  email: string,
  name?: string,
): Promise<string> {
  await request(api.server)
    .post('/auth/register')
    .send({ email, password: PASSWORD, ...(name ? { name } : {}) });

  const response = await request(api.server)
    .post('/auth/login')
    .send({ email, password: PASSWORD });

  return response.body.token as string;
}

describe('GET /profiles/me, PUT /profiles/me', () => {
  let api: TestApp;
  let tokenLewis: string;
  let tokenAlice: string;
  let tokenBob: string;

  // Un seul login par utilisateur partagé entre tests : /auth/login est
  // plafonné à 5 requêtes/minute. Les profils ne sont jamais tronqués entre
  // tests (il n'y a plus de 404 à simuler) : chaque test qui mute l'état de
  // tokenLewis relit sa version courante par GET plutôt que de la supposer,
  // pour rester indépendant de l'ordre d'exécution.
  beforeAll(async () => {
    api = await startTestApp();
    tokenLewis = await loginAs(api, 'lewis@example.com', 'Lewis Kouamkouam');
    tokenAlice = await loginAs(api, 'alice@example.com', 'Alice');
    tokenBob = await loginAs(api, 'bob@example.com', 'Bob');
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  it('refuse une requête sans jeton', async () => {
    const response = await request(api.server).get('/profiles/me');

    expect(response.status).toBe(401);
  });

  it('refuse un jeton invalide', async () => {
    const response = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', 'Bearer ceci-n-est-pas-un-jeton');

    expect(response.status).toBe(401);
  });

  it('le profil existe dès l inscription, rempli avec le nom donné, en version 1', async () => {
    const token = await loginAs(
      api,
      'nouvelle@example.com',
      'Nouvelle Utilisatrice',
    );

    const response = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('Nouvelle Utilisatrice');
    expect(response.body.experiences).toEqual([]);
    expect(response.body).not.toHaveProperty('version');
    expect(response.headers.etag).toBe('"1"');
  });

  it('refuse un document invalide (fullName manquant)', async () => {
    const { fullName, ...invalid } = makePutProfileDto();
    void fullName;

    const response = await request(api.server)
      .put('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .set('If-Match', '"1"')
      .send(invalid);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse un PUT sans en-tête If-Match', async () => {
    const response = await request(api.server)
      .put('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send(makePutProfileDto());

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse un en-tête If-Match mal formé', async () => {
    const response = await request(api.server)
      .put('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .set('If-Match', 'pas-un-nombre')
      .send(makePutProfileDto());

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('remplace le document avec un If-Match correct', async () => {
    const before = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`);

    const response = await request(api.server)
      .put('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .set('If-Match', before.headers.etag)
      .send(makePutProfileDto({ fullName: 'Lewis Modifié' }));

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('Lewis Modifié');
    expect(response.headers.etag).not.toBe(before.headers.etag);
  });

  it('refuse un If-Match périmé', async () => {
    const before = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`);
    const staleETag = before.headers.etag;

    await request(api.server)
      .put('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .set('If-Match', staleETag)
      .send(makePutProfileDto({ fullName: 'Première modif' }));

    // staleETag date d'avant "Première modif" : il est maintenant périmé.
    const response = await request(api.server)
      .put('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .set('If-Match', staleETag)
      .send(makePutProfileDto({ fullName: 'Deuxième modif, en conflit' }));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PROFILE_VERSION_MISMATCH');
  });

  /**
   * La contrainte du ticket : un utilisateur ne doit JAMAIS voir le profil
   * d'un autre. Aucune route ne prend d'id — ce test prouve que l'isolation
   * tient malgré ça, sans même passer par PUT : chaque profil auto-créé à
   * l'inscription porte déjà le nom de SON utilisateur.
   */
  it('isole strictement les profils entre deux utilisateurs', async () => {
    const seenByAlice = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenAlice}`);

    const seenByBob = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenBob}`);

    expect(seenByAlice.body.fullName).toBe('Alice');
    expect(seenByBob.body.fullName).toBe('Bob');
  });
});

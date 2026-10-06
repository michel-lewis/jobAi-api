import request from 'supertest';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';

const PASSWORD = 'motdepasse123';

async function loginAs(api: TestApp, email: string): Promise<string> {
  await request(api.server)
    .post('/auth/register')
    .send({ email, password: PASSWORD });

  const response = await request(api.server)
    .post('/auth/login')
    .send({ email, password: PASSWORD });

  return response.body.token as string;
}

describe('POST /profiles, GET /profiles/me, PATCH /profiles/me', () => {
  let api: TestApp;
  let tokenLewis: string;
  let tokenAlice: string;
  let tokenBob: string;

  // Un seul login par utilisateur pour tout le fichier : /auth/login est
  // plafonné à 5 requêtes/minute, et ce fichier a plus de 5 tests. Refaire
  // un login par test épuiserait le quota et ferait tomber les derniers
  // tests sur un 401 qui n'a rien à voir avec ce qu'ils testent.
  beforeAll(async () => {
    api = await startTestApp();
    tokenLewis = await loginAs(api, 'lewis@example.com');
    tokenAlice = await loginAs(api, 'alice@example.com');
    tokenBob = await loginAs(api, 'bob@example.com');
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  // Les utilisateurs doivent survivre d'un test à l'autre (le jeton
  // référence leur id), donc on ne vide que profiles — jamais truncateAll.
  beforeEach(async () => {
    await api.dataSource.query(
      'TRUNCATE TABLE "profiles" RESTART IDENTITY CASCADE',
    );
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

  it('refuse un champ requis vide', async () => {
    const response = await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send({
        professionalInformation: '',
        personalInformation: 'y',
        education: 'z',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Les données envoyées sont invalides',
      errors: [
        {
          field: 'professionalInformation',
          message: 'Too small: expected string to have >=1 characters',
        },
      ],
    });
  });

  it('crée le profil et le renvoie', async () => {
    const response = await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send({
        professionalInformation: 'Développeuse backend.',
        personalInformation: 'Disponible immédiatement.',
        education: 'Master informatique.',
        location: 'Paris',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      professionalInformation: 'Développeuse backend.',
      personalInformation: 'Disponible immédiatement.',
      education: 'Master informatique.',
      location: 'Paris',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('refuse un second profil pour le même utilisateur', async () => {
    const payload = {
      professionalInformation: 'x',
      personalInformation: 'y',
      education: 'z',
    };

    await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send(payload);

    const response = await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send(payload);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PROFILE_EXISTS');
  });

  it('renvoie 404 quand le profil n existe pas encore', async () => {
    const response = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PROFILE_NOT_FOUND');
  });

  it('lit le profil créé', async () => {
    await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send({
        professionalInformation: 'x',
        personalInformation: 'y',
        education: 'z',
        location: 'Paris',
      });

    const response = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`);

    expect(response.status).toBe(200);
    expect(response.body.location).toBe('Paris');
  });

  it('modifie uniquement les champs envoyés', async () => {
    await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send({
        professionalInformation: 'x',
        personalInformation: 'y',
        education: 'z',
        location: 'Paris',
      });

    const response = await request(api.server)
      .patch('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send({ location: 'Lyon' });

    expect(response.status).toBe(200);
    expect(response.body.location).toBe('Lyon');
    expect(response.body.professionalInformation).toBe('x');
  });

  it('refuse un PATCH sans aucun champ', async () => {
    await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        professionalInformation: 'x',
        personalInformation: 'x',
        education: 'x',
      });

    const response = await request(api.server)
      .patch('/profiles/me')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('renvoie 404 en modification quand le profil n existe pas', async () => {
    const response = await request(api.server)
      .patch('/profiles/me')
      .set('Authorization', `Bearer ${tokenLewis}`)
      .send({ location: 'Lyon' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PROFILE_NOT_FOUND');
  });

  /**
   * La contrainte du ticket : un utilisateur ne doit JAMAIS voir le profil
   * d'un autre. Aucune route ne prend d'id — ce test prouve que l'isolation
   * tient malgré ça, pas seulement qu'un id étranger est refusé.
   */
  it('isole strictement les profils entre deux utilisateurs', async () => {
    await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        professionalInformation: 'Profil de Alice',
        personalInformation: 'x',
        education: 'x',
      });

    await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenBob}`)
      .send({
        professionalInformation: 'Profil de Bob',
        personalInformation: 'x',
        education: 'x',
      });

    const seenByA = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenAlice}`);

    const seenByB = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenBob}`);

    expect(seenByA.body.professionalInformation).toBe('Profil de Alice');
    expect(seenByB.body.professionalInformation).toBe('Profil de Bob');
  });

  /** Même garantie que le test précédent, pour le verbe qui modifie. */
  it('isole strictement les profils en modification', async () => {
    await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        professionalInformation: 'Profil de Alice',
        personalInformation: 'x',
        education: 'x',
      });

    await request(api.server)
      .post('/profiles')
      .set('Authorization', `Bearer ${tokenBob}`)
      .send({
        professionalInformation: 'Profil de Bob',
        personalInformation: 'x',
        education: 'x',
      });

    // Bob modifie APRÈS Alice : si le filtre par userId disparaissait,
    // `findOne({ where: {} })` renverrait la première ligne — celle d'Alice,
    // créée avant. C'est justement le cas que ce test doit attraper.
    await request(api.server)
      .patch('/profiles/me')
      .set('Authorization', `Bearer ${tokenBob}`)
      .send({ professionalInformation: 'Bob modifié' });

    const bobAfter = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenBob}`);

    const aliceAfter = await request(api.server)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${tokenAlice}`);

    expect(bobAfter.body.professionalInformation).toBe('Bob modifié');
    expect(aliceAfter.body.professionalInformation).toBe('Profil de Alice');
  });
});

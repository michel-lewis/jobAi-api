import request from 'supertest';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';

const EMAIL = 'lewis@example.com';
const PASSWORD = 'motdepasse123';

describe('POST /auth/register et /auth/login', () => {
  let api: TestApp;

  beforeAll(async () => {
    api = await startTestApp();
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  beforeEach(async () => {
    await api.truncateAll();
  });

  // ── M4 ────────────────────────────────────────────────────────────────

  it('inscrit un nouvel utilisateur', async () => {
    const response = await request(api.server)
      .post('/auth/register')
      .send({ email: EMAIL, password: PASSWORD, name: 'Lewis' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      email: EMAIL,
      name: 'Lewis',
      createdAt: expect.any(String),
    });
  });

  it('refuse un email déjà inscrit', async () => {
    // Act
    const response1 = await request(api.server)
      .post('/auth/register')
      .send({ email: EMAIL, password: PASSWORD });

    expect(response1.status).toBe(201);
    const response2 = await request(api.server)
      .post('/auth/register')
      .send({ email: EMAIL, password: PASSWORD });

    // Assert
    expect(response2.status).toBe(409);
    expect(response2.body).toEqual({
      code: 'EMAIL_TAKEN',
      message: 'Cet email est déjà utilisé',
    });
  });

  it('refuse un email invalide', async () => {
    // Act
    const response = await request(api.server)
      .post('/auth/register')
      .send({ email: 'pas-un-email', password: PASSWORD });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Les données envoyées sont invalides',
      errors: [
        {
          field: 'email',
          message: 'Invalid email address',
        },
      ],
    });
  });

  it('bloque la 6e tentative de connexion en une minute', async () => {
    const credentials = { email: EMAIL, password: 'mauvais-mot-de-passe' };

    for (let attempt = 0; attempt < 5; attempt++) {
      const refused = await request(api.server)
        .post('/auth/login')
        .send(credentials);

      expect(refused.status).toBe(401);
    }

    const blocked = await request(api.server)
      .post('/auth/login')
      .send(credentials);

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  }, 60_000);
});

import request from 'supertest';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';

const EMAIL = 'lewis@example.com';
const PASSWORD = 'motdepasse123';

/**
 * Ce test vit dans son PROPRE fichier, donc dans sa propre application.
 *
 * Le compteur du throttler est partagé par toutes les requêtes d'une app et
 * ne peut pas être remis à zéro proprement : le service garde deux
 * structures internes, dont une privée, et n'en expose qu'une. Vider la
 * moitié accessible laisse l'autre pleine — le compteur se reconstitue tout
 * seul au coup suivant.
 *
 * Plutôt que de forcer l'accès à un champ privé, on isole : un fichier, une
 * app, un compteur à soi. Ça coûte un conteneur de plus et ça ne cassera
 * pas à la prochaine mise à jour de la bibliothèque.
 */
describe('POST /auth/login — limitation de débit', () => {
  let api: TestApp;

  beforeAll(async () => {
    api = await startTestApp();
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  it('bloque la 6e tentative en une minute', async () => {
    await request(api.server)
      .post('/auth/register')
      .send({ email: EMAIL, password: PASSWORD });

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

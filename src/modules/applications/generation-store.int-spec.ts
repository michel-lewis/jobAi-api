import { randomUUID } from 'node:crypto';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';
import { AuthService } from '../auth/auth.service.js';
import { OffersService } from '../offers/offers.service.js';
import { ApplicationGenerationStore } from './generation-store.js';
import { GeneratedDocument } from '../documents/entities/generated-document.entity.js';

/**
 * Teste ApplicationGenerationStore directement contre un vrai Postgres — les
 * transitions de statut conditionnelles (UPDATE ... WHERE status = ...) et
 * le rollback d'une transaction n'ont de sens que contre de vraies lignes. Un
 * faux dataSource renverrait ce qu'on lui dit, jamais la preuve qu'une
 * course a été perdue.
 *
 * generateCoverLetter n'est jamais appelé ici : seul persist() (via
 * markSucceeded) écrit en base, et il ne parle jamais au LLM. L'application
 * complète démarrée par startTestApp() branche déjà le faux LLM
 * déterministe du mode test (voir env.validation.ts) — aucun override n'est
 * nécessaire pour ce fichier.
 */
describe('ApplicationGenerationStore — transitions de statut contre une vraie base', () => {
  let api: TestApp;
  let auth: AuthService;
  let offers: OffersService;
  let store: ApplicationGenerationStore;
  let userCounter = 0;

  beforeAll(async () => {
    api = await startTestApp();
    auth = api.app.get(AuthService);
    offers = api.app.get(OffersService);
    store = api.app.get(ApplicationGenerationStore);
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  beforeEach(async () => {
    await api.truncateAll();
  });

  async function makeDraftApplication(): Promise<{
    userId: string;
    offerId: string;
    applicationId: string;
  }> {
    userCounter += 1;
    const user = await auth.register({
      email: `store-${userCounter}-${randomUUID()}@example.com`,
      password: 'motdepasse123',
    });
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
    });

    const state = await store.startOrRetry(user.id, offer.id);

    return { userId: user.id, offerId: offer.id, applicationId: state.id };
  }

  // Preuve 8.
  it("markFailed fait passer une candidature 'draft' en generation_failed avec un motif lisible non vide", async () => {
    const { userId, applicationId } = await makeDraftApplication();

    const result = await store.markFailed(
      applicationId,
      'Le fournisseur LLM a dépassé le délai imparti.',
    );

    expect(result.applied).toBe(true);

    const state = await store.findOwnedState(applicationId, userId);
    expect(state?.status).toBe('generation_failed');
    expect(state?.failureReason).toBeTruthy();
    expect(state?.failureReason?.length).toBeGreaterThan(0);
  });

  // Preuve 11.
  it("markSucceeded appelé quand le statut n est déjà plus 'draft' renvoie applied:false et ne laisse aucune ligne generated_documents", async () => {
    const { applicationId } = await makeDraftApplication();
    await store.markFailed(applicationId, 'Échec simulé pour le test.');

    const result = await store.markSucceeded(applicationId, {
      type: 'cover_letter',
      content: 'Contenu qui ne doit jamais être conservé.',
    });

    expect(result.applied).toBe(false);
    expect(result.document).toBeNull();

    const count = await api.dataSource
      .getRepository(GeneratedDocument)
      .count({ where: { applicationId } });
    expect(count).toBe(0);
  });

  // Preuve 12 — premier ordre : péremption puis succès tardif.
  it('markFailedIfStale puis markSucceeded, dans cet ordre : le succès tardif n écrase pas l échec déjà écrit', async () => {
    const { userId, applicationId } = await makeDraftApplication();

    const staleResult = await store.markFailedIfStale(
      applicationId,
      new Date(Date.now() + 60_000),
    );
    expect(staleResult.applied).toBe(true);

    const succeededResult = await store.markSucceeded(applicationId, {
      type: 'cover_letter',
      content: 'Contenu qui arrive trop tard.',
    });
    expect(succeededResult.applied).toBe(false);

    const state = await store.findOwnedState(applicationId, userId);
    expect(state?.status).toBe('generation_failed');
  });

  // Preuve 12 — ordre inverse : succès puis péremption tardive.
  it('markSucceeded puis markFailedIfStale, dans l ordre inverse : la péremption tardive n écrase pas le succès déjà écrit', async () => {
    const { userId, applicationId } = await makeDraftApplication();

    const succeededResult = await store.markSucceeded(applicationId, {
      type: 'cover_letter',
      content: 'Contenu réel et conservé.',
    });
    expect(succeededResult.applied).toBe(true);
    expect(succeededResult.document).not.toBeNull();

    const staleResult = await store.markFailedIfStale(
      applicationId,
      new Date(Date.now() + 60_000),
    );
    expect(staleResult.applied).toBe(false);

    const state = await store.findOwnedState(applicationId, userId);
    expect(state?.status).toBe('generated');
    expect(state?.document?.content).toBe('Contenu réel et conservé.');
  });

  // Borne manquante : un seuil de péremption déjà dans le passé ne doit
  // jamais faire basculer une candidature 'draft' toute fraîche — sinon
  // n'importe quel appel à markFailedIfStale avec une horloge en retard
  // périmerait un travail qui vient tout juste de démarrer.
  it("markFailedIfStale avec un seuil déjà dans le passé ne périme pas une candidature 'draft' toute fraîche", async () => {
    const { userId, applicationId } = await makeDraftApplication();

    const result = await store.markFailedIfStale(
      applicationId,
      new Date(Date.now() - 60_000),
    );

    expect(result.applied).toBe(false);

    const state = await store.findOwnedState(applicationId, userId);
    expect(state?.status).toBe('draft');
  });
});

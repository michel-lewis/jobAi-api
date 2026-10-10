import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';
import { LLM_PORT, type LlmPort } from './llm.port.js';

/**
 * LlmModule résolvait ConfigService/DataSource paresseusement via
 * `ModuleRef.get` à l'intérieur du corps d'une fabrique déclarée avec
 * `inject: [ModuleRef]`. `ModuleRef.get` ne crée aucune arête dans le graphe
 * de dépendances Nest : rien ne garantissait que ConfigService/DataSource
 * soient déjà construits avant l'exécution de la fabrique. En environnement
 * de test, la branche fautive n'était jamais exécutée (`isTestEnv()` la
 * court-circuite), donc `llm.module.spec.ts`, qui compilait LlmModule seul,
 * ne pouvait pas l'attraper. La preuve se fait maintenant avec le vrai
 * câblage de l'application — ConfigModule.forRoot() et TypeOrmModule.forRoot()
 * réellement dans l'arbre, comme en production.
 */
describe("LlmModule — câblage réel de l'application", () => {
  it("n'effectue jamais d'appel réseau réel quand NODE_ENV=test", async () => {
    const api = await startTestApp();

    try {
      const fetchSpy = vi.fn(() => {
        throw new Error(
          'un appel réseau réel ne doit jamais partir en environnement de test',
        );
      });
      vi.stubGlobal('fetch', fetchSpy);

      const llmPort = api.app.get<LlmPort>(LLM_PORT);

      const result = await llmPort.generateText({
        userId: '3f1a9c2e-5b7d-4e8a-9c1f-2d6b8e4a7c05',
        prompt: 'Bonjour',
        maxOutputTokens: 50,
      });

      expect(result.text).toBeDefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      await api.stop();
    }
  }, 180_000);

  /**
   * C'est ce test qui aurait attrapé l'incident : hors environnement de
   * test, les fabriques de LlmModule ont réellement besoin de ConfigService
   * et de DataSource. Si la dépendance n'est pas déclarée statiquement dans
   * `inject`, rien ne garantit leur disponibilité au moment où Nest appelle
   * la fabrique — le crash en production, jamais vu en environnement de
   * test où la branche fautive est court-circuitée.
   */
  it("démarre l'application avec LlmModule hors environnement de test", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.NODE_ENV = 'production';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fake-key-for-startup-test';

    let api: TestApp | undefined;
    try {
      api = await startTestApp();

      const llmPort = api.app.get<LlmPort>(LLM_PORT);
      expect(llmPort).toBeDefined();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.ANTHROPIC_API_KEY = originalApiKey;
      if (api) {
        await api.stop();
      }
    }
  }, 180_000);
});

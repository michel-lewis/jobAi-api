import { Test } from '@nestjs/testing';
import { LlmModule } from './llm.module.js';
import { LLM_PORT, type LlmPort } from './llm.port.js';

/**
 * Le détail exact de la sélection d'implémentation (factory selon NODE_ENV)
 * n'est pas encore écrit — ce test ne postule rien sur son mécanisme interne.
 * Il postule seulement ce que le module DOIT garantir : en environnement de
 * test, aucun appel réseau réel ne part. On le prouve en faisant lever une
 * erreur au `fetch` global s'il est jamais invoqué, puis en vérifiant qu'un
 * appel normal à travers le port construit par le module réussit sans
 * jamais déclencher ce piège — ce qui exclut que le client branché soit
 * AnthropicLlmProviderClient, qui parlerait au réseau via `fetch`.
 */
describe("LlmModule — sélection de l'implémentation selon l'environnement", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("n'effectue jamais d'appel réseau réel quand NODE_ENV=test", async () => {
    process.env.NODE_ENV = 'test';
    const fetchSpy = vi.fn(() => {
      throw new Error(
        'un appel réseau réel ne doit jamais partir en environnement de test',
      );
    });
    vi.stubGlobal('fetch', fetchSpy);

    const moduleRef = await Test.createTestingModule({
      imports: [LlmModule],
    }).compile();

    const llmPort = moduleRef.get<LlmPort>(LLM_PORT);

    const result = await llmPort.generateText({
      userId: '3f1a9c2e-5b7d-4e8a-9c1f-2d6b8e4a7c05',
      prompt: 'Bonjour',
      maxOutputTokens: 50,
    });

    expect(result.text).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();

    await moduleRef.close();
  });
});

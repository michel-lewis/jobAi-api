import { FileMarketNormProvider } from './file-market-norm-provider.js';

/**
 * Corrections 3 et 6 — voir ADR-14, décision 2. `FileMarketNormProvider`
 * n'avait aucun test dédié jusqu'ici.
 */
describe('FileMarketNormProvider', () => {
  // Correction 3 — les normes canadiennes de lettre, rangées dans les
  // fichiers versionnés du dépôt, doivent passer la validation Zod au
  // démarrage : une norme invalide fait échouer le boot, jamais une
  // génération en cours.
  it('ne lève aucune exception à la construction', () => {
    expect(() => new FileMarketNormProvider()).not.toThrow();
  });

  // Correction 6 — la politique personnelle se résout à partir du seul
  // code pays, par la famille qu'il détermine lui-même, jamais d'une
  // famille fournie à la main par l'appelant.
  it('résout la politique personnelle française à partir du seul code pays FR', () => {
    const provider = new FileMarketNormProvider();

    const norm = provider.resolveNorm({ country: 'FR', language: 'fr' });

    expect(norm.personal.photo).toBe('expected');
  });

  it('résout la politique personnelle allemande à partir du seul code pays DE', () => {
    const provider = new FileMarketNormProvider();

    const norm = provider.resolveNorm({ country: 'DE', language: 'en' });

    expect(norm.personal.dateOfBirth).toBe('expected');
  });

  // Branche inverse — un pays sans famille connue retombe sur la politique
  // la plus stricte (tout à 'never'), jamais sur une supposition.
  it('un pays inconnu résout la politique personnelle la plus stricte, tout à never', () => {
    const provider = new FileMarketNormProvider();

    const norm = provider.resolveNorm({ country: 'XX', language: 'fr' });

    expect(norm.personal).toEqual({
      photo: 'never',
      dateOfBirth: 'never',
      maritalStatus: 'never',
      nationality: 'never',
      workAuthorization: 'never',
    });
  });
});

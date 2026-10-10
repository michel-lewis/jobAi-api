import { redact } from './redact.js';

describe('redact', () => {
  it('remplace les clés sensibles au premier niveau', () => {
    expect(redact({ password: 'secret123', email: 'a@b.com' })).toEqual({
      password: '[REDACTED]',
      email: 'a@b.com',
    });
  });

  it('est insensible à la casse et reconnaît une clé composée', () => {
    expect(redact({ Authorization: 'Bearer xyz', JWT_SECRET: 'abc' })).toEqual({
      Authorization: '[REDACTED]',
      JWT_SECRET: '[REDACTED]',
    });
  });

  it('descend dans les objets imbriqués', () => {
    expect(redact({ user: { name: 'Lewis', passwordHash: 'h4sh' } })).toEqual({
      user: { name: 'Lewis', passwordHash: '[REDACTED]' },
    });
  });

  it('descend dans les tableaux, y compris d objets', () => {
    expect(redact({ users: [{ token: 't1' }, { token: 't2' }] })).toEqual({
      users: [{ token: '[REDACTED]' }, { token: '[REDACTED]' }],
    });
  });

  it('laisse passer inputTokens/outputTokens — un compte, pas un secret', () => {
    expect(redact({ inputTokens: 12, outputTokens: 34 })).toEqual({
      inputTokens: 12,
      outputTokens: 34,
    });
  });

  it('redige toujours un token au singulier, y compris en préfixe composé', () => {
    expect(redact({ apiToken: 'abc', token: 'xyz' })).toEqual({
      apiToken: '[REDACTED]',
      token: '[REDACTED]',
    });
  });

  it('redige un token au pluriel qui n est pas inputTokens/outputTokens', () => {
    // Régression trouvée en revue : un motif élargi en `token(?!s)`
    // exemptait N'IMPORTE QUEL pluriel de "token", pas seulement les deux
    // clés de comptage attendues — un vrai secret comme apiTokens ou
    // refreshTokens serait alors passé en clair.
    expect(redact({ apiTokens: ['a', 'b'], refreshTokens: 'xyz' })).toEqual({
      apiTokens: '[REDACTED]',
      refreshTokens: '[REDACTED]',
    });
  });

  it('laisse passer null et undefined sans planter', () => {
    expect(redact({ a: null, b: undefined, password: null })).toEqual({
      a: null,
      b: undefined,
      password: '[REDACTED]',
    });
  });
});

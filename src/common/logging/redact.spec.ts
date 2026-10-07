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

  it('laisse passer null et undefined sans planter', () => {
    expect(redact({ a: null, b: undefined, password: null })).toEqual({
      a: null,
      b: undefined,
      password: '[REDACTED]',
    });
  });
});

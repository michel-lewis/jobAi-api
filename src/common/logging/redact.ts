/**
 * Toute clé dont le nom contient un de ces mots est remplacée par
 * `[REDACTED]`, récursivement, avant qu'une ligne de log ne soit écrite.
 * Séparée de `logger.ts` : c'est la seule garde contre une fuite de secret
 * dans les logs, elle mérite d'être testée seule plutôt que noyée dans un
 * test de plomberie (flux stdout/stderr, horodatage, etc.).
 */
const SENSITIVE_KEY_PATTERN =
  /password|secret|token|authorization|jwt|credential/i;

/**
 * Exceptions nommées, vérifiées AVANT le motif générique — jamais un
 * assouplissement du motif lui-même. Le module `llm` journalise
 * `inputTokens`/`outputTokens` (un compte, pas un secret) ; un motif
 * élargi en `token(?!s)` avait été essayé mais exemptait N'IMPORTE QUELLE
 * clé en « ...tokens » pluriel, y compris un futur `apiTokens` ou
 * `refreshTokens` — de vrais secrets. Une liste explicite ne peut pas
 * dériver de cette façon.
 */
const KNOWN_SAFE_KEYS = new Set(['inputTokens', 'outputTokens']);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        !KNOWN_SAFE_KEYS.has(key) && SENSITIVE_KEY_PATTERN.test(key)
          ? '[REDACTED]'
          : redact(v),
      ]),
    );
  }

  return value;
}

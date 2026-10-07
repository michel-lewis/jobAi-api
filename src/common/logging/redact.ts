/**
 * Toute clé dont le nom contient un de ces mots est remplacée par
 * `[REDACTED]`, récursivement, avant qu'une ligne de log ne soit écrite.
 * Séparée de `logger.ts` : c'est la seule garde contre une fuite de secret
 * dans les logs, elle mérite d'être testée seule plutôt que noyée dans un
 * test de plomberie (flux stdout/stderr, horodatage, etc.).
 */
const SENSITIVE_KEY_PATTERN =
  /password|secret|token|authorization|jwt|credential/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(v),
      ]),
    );
  }

  return value;
}

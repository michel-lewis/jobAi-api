import { redact } from './redact.js';

/**
 * Une ligne JSON par appel. `error` part sur stderr, `info` sur stdout — un
 * pipeline de logs distant sépare les niveaux par flux, pas en parsant le
 * contenu.
 */
export function log(
  level: 'info' | 'error',
  fields: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    ...(redact(fields) as Record<string, unknown>),
  });

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

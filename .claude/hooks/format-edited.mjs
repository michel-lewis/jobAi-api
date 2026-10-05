#!/usr/bin/env node
// Formate le fichier que Claude Code vient d'écrire. Le contrat des hooks :
// l'événement arrive en JSON sur stdin, pas en argument.
import { execFileSync } from 'node:child_process';

const raw = await new Promise((resolve) => {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (buffer += chunk));
  process.stdin.on('end', () => resolve(buffer));
});

const filePath = JSON.parse(raw || '{}')?.tool_input?.file_path ?? '';
if (!/\.(ts|tsx|mjs|json|md)$/.test(filePath)) process.exit(0);

try {
  execFileSync('npx', ['prettier', '--write', filePath], { stdio: 'ignore' });
} catch {
  // Un échec de formatage ne doit pas interrompre la session.
}

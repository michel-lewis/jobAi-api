---
description: Composer un ou plusieurs commits atomiques à partir du travail en cours
---

Ce qui est en cours :

!`git status --short`

Le diff complet :

!`git diff HEAD`

Les 5 derniers messages, pour le style :

!`git log -5 --format='%s%n%n%b%n---'`

## Avant d'écrire quoi que ce soit

**Découpe.** Si le travail mélange plusieurs sujets — un correctif, de
l'outillage, un renommage — propose **plusieurs commits**, avec les fichiers de
chacun. Un commit qu'on ne peut pas annuler seul est mal découpé.

**Vérifie qu'aucun secret ne part.** Clé, jeton, mot de passe, `.env`. Si tu en
vois un, arrête-toi et dis-le.

**Si `npm run verify` n'a pas été lancé depuis le dernier changement, lance-le.**
On ne commite pas du rouge.

## Le message

```
type(portée): résumé à l'impératif, minuscule, sans point final

Le corps explique POURQUOI, pas QUOI — le diff dit déjà quoi.
Le problème que ça résout, la contrainte qui a imposé ce choix,
l'alternative écartée et sa raison.

Les lignes font 72 caractères maximum.
```

Types : `feat` `fix` `refactor` `test` `docs` `chore` `perf` `build` `ci`

**Règles de fond**

- Anglais.
- Le résumé tient en 50 caractères si possible, 72 au maximum.
- Pas de corps pour un changement trivial. Un corps qui paraphrase le
  résumé est pire que pas de corps.
- Une décision non évidente mérite une phrase. « Retiré le `.trim()` »
  ne vaut rien ; « un `.trim()` après `z.email()` s'exécute après le
  contrôle de format » vaut une minute de lecture dans six mois.
- Pas de « various fixes », pas de « update code », pas d'emoji.
- Si un commit corrige un bug attrapé par un test, dis lequel.

## Ensuite

Montre-moi les messages. **Ne commite pas sans mon accord.**

---
description: Livrer un ticket JobAI de bout en bout — branche, plan, code, tests, revue, PR
---

Ticket : $ARGUMENTS

État du dépôt :

!`git status --short && git branch --show-current && git log --oneline -3`

Le déroulé ci-dessous ne se raccourcit pas. Si une étape ne s'applique pas,
dis-le et explique pourquoi — ne la saute pas en silence.

## 0 — Partir propre

L'arbre doit être vide et la branche à jour. S'il reste du travail non
commité d'un autre sujet, arrête-toi : on ne mélange pas deux tickets.

## 1 — Une branche

`feat/`, `fix/`, `chore/` + un nom court. Jamais de travail sur `main`.

## 2 — Le plan, et tu attends

Avant de toucher un fichier, présente :

- les fichiers créés ou modifiés, et pourquoi chacun
- la décision non évidente, et l'alternative écartée
- les cas d'erreur traités
- **ce que ce ticket ne fera pas**, s'il y a une limite à poser

Si le ticket est ambigu, pose la question plutôt que de choisir.
**Attends mon accord avant d'écrire du code.**

## 3 — Implémenter

Respecte `CLAUDE.md` : les 3 couches et leur sens de dépendance, conventions
d'entités, ESM avec extension `.js`, validation Zod à l'entrée, DTO de sortie
explicite, aucune décision métier dans un contrôleur.

**Discipline de périmètre** : tout ce que tu découvres et qui n'est pas le
ticket va dans une liste « à faire plus tard », pas dans le diff.

## 4 — Tester

Choisis le niveau par la question : _si je remplace la base par un faux,
est-ce que je perds la preuve ?_

- non → test unitaire
- oui → test d'intégration
- c'est le contrat HTTP qui est en jeu → test de route

Cas nominal **et** au moins un chemin d'erreur.

**Prouve chaque test** : casse volontairement le code qu'il protège et
vérifie qu'il passe au rouge. Un test qui ne tombe jamais n'est pas un test.

## 4b — Les requêtes manuelles

Toute route ajoutée ou modifiée se retrouve dans `requests/<module>.http`,
avec un bloc par code de retour possible — pas seulement le cas qui marche.

C'est le pendant manuel de la suite automatisée : ce qui permet à un humain
d'essayer l'API à la main, et de voir une réponse en entier plutôt qu'une
assertion.

## 5 — La barrière

`npm run verify`, et `npm run test:int` si le ticket touche la base ou une
route. Rien n'est « terminé » avant.

## 6 — La revue

Lance le subagent **senior-reviewer** sur le diff.

Rapporte ses conclusions **sans les filtrer**, y compris celles qui te
contredisent. Pour chacune : corrigée, ou écartée avec une raison écrite.

## 7 — Les commits

Applique les règles de `/commit` : découpage atomique, anglais, le _pourquoi_
dans le corps. Montre les messages, attends l'accord.

## 8 — Pousser et ouvrir la PR

Pousse la branche, ouvre une pull request. La description reprend le
_pourquoi_ et liste comment vérifier à la main.

## 9 — La CI verte

Attends le résultat. Si elle est rouge, c'est encore le ticket — pas un
sujet pour plus tard.

## Pour finir

Un résumé en cinq lignes : ce qui a changé, ce que la revue a trouvé, ce qui
est parti dans la liste « plus tard ».

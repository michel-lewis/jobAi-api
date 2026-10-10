---
description: Livrer un ticket JobAI de bout en bout — preuves, plan, interface, tests, code, revue, PR
---

Ticket : $ARGUMENTS

Si l'argument commence par un numéro d'issue (`#12` ou `12`), c'est l'issue GitHub
qui porte ce ticket : lis-la avec `gh issue view <n>` et traite son contenu comme le
ticket. Sa liste des preuves remplace celle que j'aurais écrite ici.

État du dépôt :

!`git status --short && git branch --show-current && git log --oneline -3`

Le déroulé ci-dessous ne se raccourcit pas. Si une étape ne s'applique pas,
dis-le et explique pourquoi — ne la saute pas en silence.

## 0 — Partir propre

L'arbre doit être vide et la branche à jour. S'il reste du travail non
commité d'un autre sujet, arrête-toi : on ne mélange pas deux tickets.

## 1 — Une branche

`feat/`, `fix/`, `chore/` + un nom court. Jamais de travail sur `main`.

## 2 — La liste des preuves, et le mode

Le ticket doit contenir une **liste des preuves** : une phrase par comportement à
démontrer, en français, sans nom de classe ni de méthode.

> *un PUT qui passe de 3 expériences à 2 laisse exactement 2 lignes et supprime les
> puces orphelines ; casser le CASCADE rend ce test rouge*

**Si elle manque, arrête-toi et demande-la.** Elle est écrite avant le plan, et par
moi : une fois le plan lu, la liste ne décrirait plus que ce que le plan rend facile.

Puis annonce le **mode**, décidé par cette seule question :

> **Peut-on écrire l'assertion sans connaître les noms de classes et de méthodes ?**

- **oui → mode A (test-first).** Les tests sont écrits et commités rouges avant le
  code. C'est le cas du comportement : une règle de calcul, une validation, un
  contrôle d'ancrage.
- **non → mode B (preuves-first).** L'interface *est* le travail : schéma, injection,
  migration, câblage. Le code vient d'abord, les tests ensuite — et ils répondent à
  la liste, pas au code.

**Le mode suit le niveau de test, pas le ticket.** Un test de route se lie au contrat
HTTP — l'URL, le corps, le code de statut — déjà écrit dans le ticket : il est donc
toujours mode A. Un test unitaire de service se lie à des signatures : mode B tant
qu'elles ne sont pas figées. Un ticket peut être mode A pour ses preuves de route et
mode B pour le reste ; dis-le ainsi plutôt que de forcer un mode unique.

En mode B, si le ticket touche une migration, charge le skill `migration-review` :
c'est la classe de bug qu'aucun test ne peut attraper.

## 3 — Le plan, et tu attends

Avant de toucher un fichier, présente :

- les fichiers créés ou modifiés, et pourquoi chacun
- la décision non évidente, et l'alternative écartée
- les cas d'erreur traités
- **ce que ce ticket ne fera pas**, s'il y a une limite à poser

Si le ticket est ambigu, pose la question plutôt que de choisir.
> **Tu t'arrêtes ici. Tu n'écris rien, tu ne commites rien, avant mon accord
> explicite. « Le plan semble validé » n'est pas un accord.**

Une exception à une règle de `CLAUDE.md` demande un ADR — charge le skill `adr`.
Une entorse non écrite devient un permis.

## 4 — L'interface, et tu attends (mode A seulement)

Les signatures, sans corps : types, noms de méthodes, formes d'entrée et de sortie.
C'est le seul contrat partagé entre les tests et l'implémentation.

**Attends mon accord.** Une interface validée après les tests ferait réécrire les
tests ; validée après le code, elle ne contraindrait plus rien.

## 5 — Les tests d'abord (mode A seulement)

Lance le subagent **test-writer** avec la liste des preuves et l'interface validée.

Tu ne lui souffles pas d'implémentation : il écrit contre l'interface, pas contre un
code qu'il ne doit pas connaître.

S'il rapporte qu'une preuve n'est pas atteignable avec ces signatures, **l'interface
est incomplète** : on retourne à l'étape 4 avant d'écrire une ligne de code.

Puis commite les tests, **rouges**, dans leur propre commit :
`test(<scope>): specify <le comportement>`.

C'est git qui garantit le dispositif : à partir d'ici, toute modification d'un
fichier de test apparaît dans le diff.

## 6 — Implémenter

Respecte `CLAUDE.md` : les 3 couches et leur sens de dépendance, conventions
d'entités, ESM avec extension `.js`, validation Zod à l'entrée, DTO de sortie
explicite, aucune décision métier dans un contrôleur.

**En mode A : tu ne touches à aucun fichier de test.** Si un test te paraît faux,
tu t'arrêtes et tu le dis — tu ne le corriges pas pour passer au vert. Un test
ajusté par celui qui écrit le code ne contraint plus rien.

**Discipline de périmètre** : tout ce que tu découvres et qui n'est pas le
ticket va dans une liste « à faire plus tard », pas dans le diff.

## 7 — Tester

Charge le skill `test-policy` : il porte la règle qui choisit le niveau, les harnais
et fixtures à réutiliser, et ce qui disqualifie un test.

**En mode A**, les tests existent : il reste à les faire passer sans les modifier, et
à compléter ce que l'implémentation a révélé — en l'annonçant.

**En mode B**, tu les écris maintenant, et tu rends un **tableau de correspondance** :
chaque ligne de la liste des preuves, le fichier et le nom du test qui la couvre.
Une ligne peut être ajoutée, jamais retirée en silence : une suppression demande une
raison écrite.

Dans les deux modes : cas nominal **et** au moins un chemin d'erreur.

**Prouve chaque test** : casse volontairement le code qu'il protège et
vérifie qu'il passe au rouge. Un test qui ne tombe jamais n'est pas un test.

## 7b — Les requêtes manuelles

Toute route ajoutée ou modifiée se retrouve dans `requests/<module>.http`,
avec un bloc par code de retour possible — pas seulement le cas qui marche.

C'est le pendant manuel de la suite automatisée : ce qui permet à un humain
d'essayer l'API à la main, et de voir une réponse en entier plutôt qu'une
assertion.

## 8 — La barrière

`npm run verify`, et `npm run test:int` si le ticket touche la base ou une
route. Rien n'est « terminé » avant.

## 9 — La revue

Lance le subagent **senior-reviewer** sur le diff.

Rapporte ses conclusions **sans les filtrer**, y compris celles qui te
contredisent. Pour chacune : corrigée, ou écartée avec une raison écrite.

Puis réponds toi-même à deux questions que son périmètre ne couvre pas :

- **Un fichier de test a-t-il été modifié après le commit rouge ?** Si oui, lequel et
  pourquoi.
- **Le ticket atteint-il son but ?** Le relecteur regarde le diff ; cette question
  reste la mienne, et c'est elle qui a sauvé le chemin de migration du palier 2.

## 10 — Les commits

Applique les règles de `/commit` : découpage atomique, anglais, le _pourquoi_
dans le corps.

> **Tu montres les messages et tu attends mon accord. Aucun `git commit` avant.**
> C'est arrivé une fois : trois commits partis sans accord, dont un étiqueté
> `test(...)` qui contenait sept fichiers de production. Un message de commit qui
> dit le contraire de son contenu est pire qu'une étape sautée.

## 11 — Pousser et ouvrir la PR

Pousse la branche, ouvre une pull request. La description reprend le
_pourquoi_ et liste comment vérifier à la main.

**Si le ticket vient d'une issue, la description contient `Closes #<n>`.** C'est ce
mot-clé qui ferme l'issue à la fusion et la passe en Done sur le projet — rien d'autre
ne le fait. Sans lui, l'issue reste ouverte et le tableau ment.

## 12 — La CI verte

Attends le résultat. Si elle est rouge, c'est encore le ticket — pas un
sujet pour plus tard.

## Pour finir

Un résumé en cinq lignes : le mode retenu, ce qui a changé, le tableau de
correspondance preuves/tests, ce que la revue a trouvé, ce qui est parti dans la
liste « plus tard ».

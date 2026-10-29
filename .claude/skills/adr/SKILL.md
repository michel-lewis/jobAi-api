---
name: adr
description: Écrire un ADR JobAI — format, emplacement et critère d'acceptation. À charger quand un ticket demande une décision d'architecture, ou quand une convention du projet reçoit une exception.
---

# Écrire un ADR

Un ADR enregistre **une décision**, pas un tutoriel. Il existe pour que dans six
mois on sache *pourquoi*, et surtout **ce qui a été écarté**.

Emplacement : `docs/adr/NNNN-slug-court.md`, numérotation continue. Le code cite
l'ADR par son numéro en commentaire (`// … (ADR-06)`), donc le numéro ne change
jamais après le commit.

> Note : les ADR 01 à 12 sont cités dans le code mais ne sont pas encore dans le
> dépôt. Un développeur qui lit `ADR-06` ne peut pas le trouver. À importer dans
> `docs/adr/` quand l'occasion se présente — pas en passant au milieu d'un autre ticket.

## Le format — cinq sections, une page maximum

```markdown
# ADR-NN — <la décision, à l'affirmative>

- **Date** : AAAA-MM-JJ
- **Statut** : accepté | remplacé par ADR-NN

## Contexte

Le problème, et les contraintes réelles qui le cadrent. Des faits, pas des
intentions. Si un chiffre existe, il est là.

## Décision

Ce qu'on fait, à l'affirmative et au présent. Une à trois phrases.

## Alternatives écartées

Une par sous-titre, avec la raison du refus. **C'est la section qui donne sa valeur
à l'ADR** : sans elle, on relira le même débat.

## Conséquences

Ce que la décision coûte, pas seulement ce qu'elle apporte. Y compris ce qui
devient plus difficile.

## Ce qui remettrait cette décision en cause

La condition observable qui justifierait de la rouvrir. Si rien ne peut la
remettre en cause, ce n'est pas une décision, c'est un dogme.
```

## Le critère d'acceptation

**Un autre développeur peut appliquer la décision sans te parler, et sait à quelle
condition la rouvrir.**

## Quand un ADR est obligatoire

- Un choix d'infrastructure (hébergeur, base, file d'attente, exécution asynchrone).
- Une **exception à une règle de `CLAUDE.md`**. Une entorse non écrite devient un
  permis : au ticket suivant, quelqu'un citera le précédent pour justifier bien pire.
- Un arbitrage où l'alternative était défendable. Si elle ne l'était pas, un
  commentaire dans le code suffit.

## Ce qui n'est pas un ADR

Un choix de nommage, une préférence de style, une décision qu'un commentaire de
cinq lignes au bon endroit documente mieux. L'ADR qui raconte l'évident fait
baisser la crédibilité de ceux qui comptent.

## Avant de rendre : l'auto-relecture

Un ADR rendu sans cette passe coûte trois tours de relecture. Chaque point vient d'un
défaut réellement trouvé après coup sur l'ADR-14.

**D'abord, les critères d'acceptation.** Avant d'écrire une ligne, note les questions
auxquelles cet ADR doit répondre, et montre-les. C'est la liste de preuves d'un document :
la relecture vérifie ces points, pas les 400 lignes.

**Puis, avant de rendre, relis contre ces six règles :**

1. **Chaque justification est vraie.** Une bonne décision adossée à une fausse raison se
   propage comme une règle, et c'est la règle qui survit. Vérifie-la comme tu vérifies la
   décision.
2. **Une décision qui nomme deux sujets a sa donnée atteignable depuis les deux.** Écrire
   « ceci vaut pour A et pour B » puis ranger la donnée chez A fait un vœu, pas une règle.
3. **Aucun nombre n'est possédé par deux documents.** Si un autre ADR fixe un budget, un
   seuil ou un délai, renvoie à lui — ne le redéfinis jamais, même à l'identique.
4. **Chaque catégorie de défaut a sa correction et son coût.** Une catégorie se décide par
   ce qu'il faut pour réparer, jamais par la gravité qu'elle évoque : un superlatif de trop
   sonne grave et se retire en une ligne, un chiffre faux sonne anodin et ne se répare pas
   sans la source.
5. **Un repli est le plus strict, jamais une moyenne**, quand le risque est asymétrique.
   Et un repli n'est pas une valeur réelle choisie par défaut : omettre ne tue pas,
   deviner peut tuer.
6. **Rien n'est renvoyé à « plus tard » sans être nommé maintenant.** Une forme qu'un
   ticket futur devra changer — une signature, un type de retour, une clé — se pose
   aujourd'hui, vide, avec une ligne disant qu'elle est vide exprès.

**Un coût écrit n'est pas un coût décidé.** Une conséquence qui change ce que l'utilisateur
reçoit demande un oui ou un non dans la décision, pas une note de bas de page.

**Commite l'ADR avant de demander la relecture.** Un ADR non suivi par git se relit en
entier à chaque tour ; commité, il se relit en diff. C'est la différence entre 400 lignes
et 20.

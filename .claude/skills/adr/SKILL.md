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

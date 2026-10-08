---
name: migration-review
description: Checklist de relecture d'une migration TypeORM avant de la jouer. À charger dès qu'un ticket génère, modifie ou joue une migration — c'est la classe de bug que les tests ne peuvent pas attraper.
---

# Relire une migration avant de la jouer

**Pourquoi une checklist et pas des tests.** Les testcontainers partent d'une table
vide. Une migration qui n'échoue que sur des données existantes passe donc au vert
en test et casse en production. Aucun test ne ferme ce trou ; une relecture le ferme.

Règle du projet : **on ne joue jamais une migration générée sans l'avoir lue.**

## Les cinq pièges, par ordre de fréquence

**1. `NOT NULL` sans valeur par défaut sur une table qui a des lignes.**

```sql
-- échoue : « column "x" of relation "t" contains null values »
ALTER TABLE "t" ADD "x" text NOT NULL;

-- la forme correcte : ajout, remplissage, puis contrainte
ALTER TABLE "t" ADD "x" text;
UPDATE "t" SET "x" = <valeur dérivée d'une colonne existante>;
ALTER TABLE "t" ALTER COLUMN "x" SET NOT NULL;
```

Avant de conclure, **compte les lignes** de la table visée, en local *et* sur la base
distante. Zéro ligne en local ne prouve rien.

**2. Le `down()` qui ne peut pas revenir.** S'il remet une colonne supprimée en
`NOT NULL`, il échoue pour la même raison. Et s'il recrée une colonne dont le
contenu a été détruit par le `up()`, il est décoratif : le dire dans un commentaire
plutôt que laisser croire à une réversibilité qui n'existe pas.

**3. Les données ne sont pas migrées, seulement le schéma.** TypeORM génère des
`ALTER`, jamais de reprise de données. Chaque colonne supprimée ou renommée demande
une décision explicite : on perd, ou on remplit depuis une autre source.

**4. Une contrainte d'unicité avec une colonne nullable ne déduplique pas.** Dans
Postgres, `NULL` n'est jamais égal à `NULL` : `UNIQUE (a, b)` laisse passer autant
de lignes qu'on veut quand `b IS NULL`. Vérifier que l'intention correspond.

**5. Les conventions du projet.** Énumérations en `text` + `CHECK`, jamais en `ENUM`
natif (ADR-06). `ON DELETE` choisi explicitement pour chaque clé étrangère —
`CASCADE` pour ce qui n'a pas de vie propre, `RESTRICT` pour ce qu'on ne doit pas
perdre par ricochet.

## Les trois vérifications mécaniques

- La migration est ajoutée à `src/migrations/index.ts` — en ESM il n'y a pas de glob.
- Les nouvelles entités sont ajoutées à `src/config/entities.ts`.
- `migration:show` liste bien la migration, et `migration:run` la coche `[X]`.

## Le chemin de production

`npm run migration:run` utilise `tsx` et `src/` : ni l'un ni l'autre n'existe dans
l'image Docker. En production c'est `migration:run:prod`, qui tourne contre
`dist/config/data-source.js`. Vérifier que la commande qu'on documente est celle qui
peut réellement s'exécuter là où on la lance.

## Le verdict

Une migration est acceptée quand on peut répondre à ces deux questions :

1. **Que se passe-t-il si la table cible contient déjà mille lignes ?**
2. **Si je la joue deux fois, ou si je la joue puis je reviens, qu'est-ce qui reste ?**

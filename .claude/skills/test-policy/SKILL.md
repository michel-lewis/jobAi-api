---
name: test-policy
description: La politique de test de JobAI — les trois niveaux, la règle qui choisit le niveau, les harnais et fixtures existants, ce qu'on ne mocke jamais, et ce qui disqualifie un test. À charger avant d'écrire ou de relire un test.
---

# Politique de test — JobAI

## La règle qui choisit le niveau

> **Si je remplace Postgres par un faux, est-ce que je perds la preuve ?**

- non → **test unitaire** (`*.spec.ts`)
- oui → **test d'intégration** (`*.int-spec.ts`)
- c'est le contrat HTTP qui est en jeu → **test de route** (`*.int-spec.ts` + Supertest)

| Niveau | Ce qu'il couvre | Base réelle |
|---|---|---|
| Unitaire | Logique pure sans I/O : schémas Zod, pipes, guards, helpers, mappers non triviaux, règles métier calculables | non |
| Intégration | Service + vraie base : contraintes d'unicité, CHECK, CASCADE, transactions, migrations, requêtes TypeORM | oui |
| Route | Validation → guard → contrôleur → service → base → code HTTP et forme de la réponse | oui |

Le **contrôleur ne se teste pas en unitaire** : il n'a aucune logique, le test de
route le traverse. Le **repository ne se teste jamais** directement : c'est du code
TypeORM, pas le nôtre.

## Les quatre questions, pour chaque unité de code

1. Si ça se trompe, l'utilisateur le voit ou des données sont perdues ? → ça se teste.
2. Y a-t-il au moins une branche (`if`, `catch`, cas limite) ? → un test par branche qui compte.
3. Est-ce que ça a déjà cassé une fois ? → test de régression, non négociable.
4. **Si je débranche la chose, ce test devient-il rouge ?** → si non, il teste autre
   chose que ce qu'on croit.

Les trois premières décident *s'il faut* un test. La quatrième décide *s'il en est un*.

## Ce qu'on mocke, ce qu'on ne mocke jamais

On mocke ce qu'on ne contrôle pas et qui est lent, cher ou non déterministe :
l'appel LLM, l'envoi d'email, l'horloge.

**On ne mocke jamais la base de données.** C'est précisément elle qui casse : la
contrainte d'unicité, la colonne oubliée dans un `select`, la migration mal
ordonnée. Mocker le repository, c'est tester que le mock fait ce qu'on lui a dit.
C'est l'erreur n°1 et elle produit une suite verte sur du code cassé.

**On ne mocke jamais la chose sous test.** Un `vi.mock('argon2')` dans le test
d'`AuthService.login` ne prouve plus rien : il prouve que le mock a renvoyé ce
qu'on lui a demandé.

## Les harnais existants — les réutiliser, jamais les réécrire

- `test/integration/postgres-harness.ts` → `startTestDatabase()` renvoie
  `{ dataSource, truncateAll, stop }`
- `test/integration/app-harness.ts` → `startTestApp()` renvoie
  `{ server, app, dataSource, truncateAll, stopDatabase, stop }`
- `test/integration/database.ts` → `testDataSourceOptions(container)`, `truncateAllTables(dataSource)`
- `test/fixtures/*.fixture.ts` → fabriques **typées** (`makeUser(overrides): User`).
  Elles existent parce que trois tests ont écrit `password` au lieu de
  `passwordHash` : le compilateur doit refuser ce qu'un humain relit sans voir.

Un fichier d'intégration qui rend l'app inutilisable après son dernier test
(coupure de la base, compteur de throttle consommé) vit **dans son propre
fichier** : un fichier = une app = un état.

## Ce qui disqualifie un test

- **Il teste le *comment* au lieu du *quoi*.** `expect(argon2.verify).toHaveBeenCalledWith(...)`
  vérifie l'implémentation. Si la logique est juste et l'appel différent, le test
  tombe pour rien.
- **`toBeDefined()` sur une erreur attrapée.** Ça ne distingue que `undefined` du
  reste : un test est déjà passé au vert en prouvant l'inverse de ce qu'il
  affirmait.
- **`toThrow('ConflictException')`** — une chaîne compare le *message*, pas la
  classe. Passer la classe, sans guillemets.
- **Une assertion sur une exception de service posée sur un appel de repository** :
  le repository ne traverse pas le service, TypeORM lève `QueryFailedError`.
- **Un test qu'on ne peut pas rendre rouge.** S'il double une garde déjà
  appliquée ailleurs, ce n'est pas de la défense en profondeur, c'est du code mort.

## La preuve

Un test n'est accepté que si on a **cassé volontairement** le code qu'il protège et
constaté le rouge. Le nom du test dit ce qu'il prouve, en français, sans jargon :

```
it('ne renvoie jamais le profil d un autre utilisateur')
it('un PUT qui passe de 3 à 2 expériences laisse exactement 2 lignes')
```

Pas `it('should work')`, pas `it('test case 3')`.

## Les limites à connaître

- Les testcontainers partent d'une **table vide**. Ils ne peuvent donc pas attraper
  une migration qui n'échoue que sur des données existantes. Cette classe de bug se
  prend par relecture — voir le skill `migration-review`.
- `npm run verify` ne lance **pas** les tests d'intégration. Un fichier
  d'intégration qui ne démarre même pas reste invisible jusqu'à la CI.

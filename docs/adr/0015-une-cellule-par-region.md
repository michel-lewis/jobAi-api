# ADR-15 — Une cellule par région, pas une app qui route vers plusieurs bases

- **Date** : 2026-10-15
- **Statut** : proposé

## Contexte

La question posée est de séparer les données par localisation, avec des realms ou
des serveurs dédiés par région. Deux choses s'y mélangent, et les confondre coûte
cher :

- **Le comportement par marché** (format de lettre, format de CV, normes locales)
  est une **fonction pure de `country` + `language`**. Il vit dans `MARKET_NORMS`,
  dans le code (ADR-14). Séparer la base de données n'y change rien : le même code,
  avec la même table de constantes, tourne sur n'importe quelle cellule.
- **La résidence des données** est une **contrainte juridique** (RGPD, Loi 25 au
  Québec, NDPR au Nigeria) qui, elle, exige une vraie séparation physique — pas une
  simple distinction de format.

Un utilisateur n'appartient d'ailleurs pas à une région : un compte canadien
postule à une offre française. La logique de marché reste attachée à l'offre,
quelle que soit la topologie des bases — ce n'est jamais le compte qui décide dans
quelle base une ligne doit vivre.

## Décision

**Pour quand le seuil sera franchi (voir déclencheur ci-dessous) : une cellule par
région — la même image Docker, son propre `DATABASE_URL`, son propre domaine.**

Pas de routage de connexion au moment de la requête : `TypeOrmCoreModule` est
`@Global()` et chaque service injecte l'unique `DataSource` existant. Un routage
par requête (choisir la bonne base selon l'utilisateur ou l'offre en cours)
traverserait tout le code qui touche à la persistance, alors qu'une cellule ne
coûte qu'une variable d'environnement différente par déploiement.

## Alternatives écartées

### Une application qui route vers N bases

Écartée : même bénéfice légal qu'une cellule par région, mais pour un coût
structurel bien plus élevé — chaque service qui injecte `DataSource` aujourd'hui
devrait choisir la bonne base à l'exécution, alors que la cellule obtient la même
séparation en ne changeant rien dans le code.

### Des schémas Postgres séparés par région, sur la même base physique

Écartée : si la base physique et le pays d'hébergement restent les mêmes, séparer
par schéma n'apporte aucun bénéfice de résidence — le problème juridique n'est pas
résolu — tout en multipliant la complexité des migrations (une migration à jouer
correctement par schéma, sur une seule instance Postgres).

### Ne rien étiqueter maintenant, décider à la bascule

Écartée : sans colonne de région sur les lignes dès aujourd'hui, un découpage futur
demande de retraiter les données existantes pour leur assigner une région a
posteriori — et rien dans un champ comme `location: "Lyon 3e"` ne donne
mécaniquement `FR`. Attendre coûte une migration de données en plus de la
séparation elle-même.

## Conséquences

**Aujourd'hui, trois contraintes gratuites à respecter — elles ne coûtent rien
tant qu'il n'y a qu'une cellule, et rendent la bascule possible le jour venu :**

- `Offer.country` est posé dès le ticket D : sans ce champ, rien ne permet de
  décider plus tard à quelle cellule une ligne appartient.
- Aucun agrégat inter-utilisateurs n'est écrit dans l'application — il n'en
  existe aucun aujourd'hui, et le premier rendrait le découpage par cellule
  impossible sans le reconstruire par région.
- `DATABASE_URL` reste la seule source de configuration de connexion — pas de
  deuxième mécanisme de configuration à défaire avant de pouvoir varier cette
  variable par cellule.

**Le jour de la bascule, ce qui devient plus difficile :**

- Les migrations, déjà jouées à la main parce que le pre-deploy de Render est
  payant, sont multipliées par le nombre de cellules — avec le risque de schémas
  qui divergent entre cellules si l'une d'elles est oubliée.
- Le palier gratuit ne suit pas la bascule : Render gratuit ne couvre qu'un seul
  service, Neon gratuit plafonne à 100 CU-heures par projet — une cellule
  supplémentaire est un coût réel, pas une simple ligne de configuration.
- L'identité devient un sous-système à part : un compte reste global, mais ses
  données applicatives deviennent régionales — il faut décider où vit le compte
  lui-même, séparément d'où vivent ses offres et ses documents.

## Ce qui remettrait cette décision en cause

**Le déclencheur est le premier utilisateur payant dans une juridiction qui exige
la résidence des données.** Un utilisateur européen gratuit ne déclenche rien ; un
contrat signé, oui — c'est la différence entre une obligation légale réelle et une
simple population d'utilisateurs dans une région donnée.

# Backlog — Palier 3 : le produit, et l'échelle avec lui

> **État au 11 octobre 2026.** A0, A et B sont livrés et mergés. C est écrit, vérifié en
> local, pas encore mergé. D, E, F et G sont les tickets suivants, ajoutés le 11 octobre.
>
> | Ticket | Capacité | État |
> |---|---|---|
> | A0 | Profil structuré | ✅ mergé (PR #5) |
> | A | Coller une offre | ✅ mergé (PR #6) |
> | B | Module `llm` | ✅ mergé (PR #7, #14) |
> | C | Générer une lettre | ✅ mergé (PR #21) |
> | D | Qualité et localisation de la lettre | ⏳ ADR-14 et ADR-15 validés, 0 code |
> | E | Tableau de bord des candidatures | ⬜ à faire |
> | F | Le CV adapté | ⬜ après D |
> | G | L'échelle, pour de vrai | ⬜ à faire |
> | H | Lire un ancien CV | ⬜ ajouté le 17 oct |
> | I | Noter la qualité du profil | ⬜ ajouté le 17 oct |
> | J | Score de compatibilité et seuil | ⬜ ajouté le 17 oct |
>
> **Ordre recommandé : C → dettes → D → J → E → H → I → F → G.** E est petit et ferme la boucle
> utilisateur ; D est la plus grosse valeur produit mais demande un ADR ; F dépend de D.

Huit tickets. **A0 → A → B → C** d'abord, dans cet ordre : B et C ont besoin d'un profil structuré, et C a besoin de B.

Chaque bloc `/ticket` est à coller tel quel dans Claude Code. Rappel : Claude Code ne connaît que `CLAUDE.md`, ton message, et les fichiers qu'il ouvre. Il n'a jamais lu cette conversation — c'est pourquoi chaque ticket répète son contexte.

---

## A0 — Profil structuré  ✅ *livré — PR #5*

**Le but.** Remplacer trois colonnes de texte libre par un modèle interrogeable. Sans ça, impossible de choisir les trois expériences les plus pertinentes pour une offre donnée — ce qui est exactement le métier de JobAI.

**La compétence.** Ta première **évolution** de schéma. Jusqu'ici tu n'as écrit qu'une migration initiale. Celle-ci supprime des colonnes, en crée huit tables, et casse des tests existants. C'est gratuit aujourd'hui : zéro utilisateur en base. Dans deux mois, c'est un week-end.

### Le schéma

**`profiles`** — une ligne par utilisateur (contrainte unique sur `user_id`, déjà en place)

| Colonne | Type | Pourquoi |
|---|---|---|
| `full_name` | text | Le nom tel qu'il doit apparaître sur le CV. Séparé de `users` : on change son CV sans toucher à son compte. |
| `headline` | text null | « Fullstack Developer · React / NestJS ». La première ligne du CV, celle que le LLM adapte à l'offre. |
| `summary` | text null | Le paragraphe de présentation. Matière première à reformuler, jamais à inventer. |
| `email` | text null | L'email du CV, qui peut différer de l'email de connexion. |
| `phone` | text null | |
| `location` | text null | « Calgary, AB, Canada ». |
| `willing_to_relocate` | boolean, défaut false | Détermine si une offre hors Calgary vaut la peine d'être traitée. |
| `work_preference` | text null + CHECK | `onsite` / `hybrid` / `remote`. Même usage. |
| `work_authorization_note` | text null | **Texte libre saisi par l'utilisateur**, à afficher ou copier tel quel. Jamais déduit, jamais rempli automatiquement dans un formulaire — la règle du projet interdit de générer des réponses aux questions de filtrage. |
| `raw_cv_text` | text null | Filet de sécurité : tout ce que l'utilisateur colle et qui n'entre dans aucune case. Sert d'appui au LLM, et garantit que rien n'est perdu. |

**`profile_experiences`** — N par profil

`company`, `title`, `employment_type` (CHECK : `full_time` / `part_time` / `contract` / `freelance` / `internship`), `location` null, `start_date` (date), `end_date` (date null = poste actuel), `summary` null, `sort_order` (int).

- `employment_type` : un contrat de 4 mois ne se lit pas comme un CDI de 4 mois. Sans ce champ, un CV donne l'impression d'instabilité.
- `end_date` null **est** la source unique de « poste actuel ». Pas de colonne `is_current` : deux sources de vérité finissent toujours par divergir.
- CHECK : `end_date IS NULL OR end_date >= start_date`.
- `sort_order` : deux postes commencés le même mois ont besoin d'un ordre décidé par un humain.

**`experience_bullets`** — N par expérience

`experience_id`, `text`, `sort_order`.

> **C'est la table qui rend le CV ciblé possible.** Un CV adapté choisit 3 puces sur 8 selon l'offre. Si les puces sont noyées dans un bloc de texte, le LLM doit les **réécrire** — et c'est exactement là qu'il invente. Séparées, il **sélectionne**. Sélectionner est vérifiable, réécrire ne l'est pas. C'est le fondement des contrôles d'ancrage de la roadmap.

**`profile_education`** — N par profil

`school`, `degree`, `field` null, `location` null, `start_date` null, `end_date` null, `credential_evaluation` null, `honours` null, `sort_order`.

- `credential_evaluation` : spécifique au Canada. « Évalué par WES comme équivalent à un baccalauréat canadien » est la ligne qui rend un diplôme étranger lisible pour un recruteur local. Sans elle, le diplôme est ignoré.

**`profile_skills`** — N par profil

`name`, `category` (CHECK : `language` / `framework` / `database` / `tool` / `cloud` / `soft`), `sort_order`. Unique sur `(profile_id, name)`.

- `category` sert au regroupement dans le CV rendu, et permet plus tard de faire correspondre les compétences exigées par l'offre.
- Pas de niveau auto-déclaré : « expert en React » n'informe personne.

**`profile_languages`** — N par profil

`name`, `proficiency` (CHECK : `native` / `fluent` / `professional` / `intermediate` / `basic`), `sort_order`.

- Section réelle d'un CV canadien, et critère de sélection d'offre.

**`profile_certifications`** — N par profil

`name`, `issuer` null, `issued_on` null, `expires_on` null, `credential_url` null, `sort_order`.

**`profile_links`** — N par profil

`kind` (CHECK : `linkedin` / `github` / `portfolio` / `other`), `url`, `label` null, `sort_order`.

### L'API

**Deux routes, pas vingt-quatre.**

- `GET /profiles/me` → le document complet imbriqué
- `PUT /profiles/me` → remplace le document complet, enfants compris, **dans une seule transaction**

Pourquoi : six sous-ressources × 4 routes = 24 routes à écrire, tester et documenter. Un CV s'édite dans un formulaire et se sauvegarde d'un bloc. Un `PUT` complet correspond à l'usage réel et coûte dix fois moins de code.

Le prix à payer, qui doit être traité : **deux onglets ouverts, et une sauvegarde écrase l'autre**. Le `PUT` doit donc refuser une écriture périmée avec un `409 CONFLICT` dans le contrat d'erreur du projet. Le mécanisme est à proposer dans le plan, pas imposé ici.

`POST /profiles` et `PATCH /profiles/me` disparaissent. Changement cassant assumé : aucun utilisateur.

### Les tests attendus

- **Unitaire** : les schémas Zod — dates incohérentes, `employment_type` hors énumération, document vide, tableaux trop longs.
- **Intégration** : le `PUT` remplace bien les enfants (3 expériences → 2, il doit en rester 2 et non 5) ; le CHECK sur les dates rejette ; l'unicité des compétences rejette ; le rollback de la transaction si un enfant échoue.
- **HTTP** : `GET`/`PUT` 200 avec la forme exacte, 401 sans jeton, 409 sur écriture périmée, 400 sur document invalide.

### La preuve

Insère un profil avec 3 expériences. Envoie un `PUT` qui n'en contient que 2. Vérifie en base qu'il en reste **2**, et que les puces des expériences supprimées ont disparu avec elles. Puis casse volontairement le `ON DELETE CASCADE` et vérifie que ce test passe au rouge.

### Hors périmètre

Le rendu PDF. L'extraction LLM depuis un CV existant. Le module `offers`. Toute forme de recherche ou de filtre.

### Le texte à coller

```
/ticket Profil structuré — remplacer les 3 colonnes texte de `profiles` par un modèle
interrogeable, parce que générer un CV ciblé demande de sélectionner des expériences et
des puces, ce qu'un bloc de texte interdit.

Schéma — 8 tables (voir docs/backlog-palier-3.md section A0 pour le détail et les
justifications, à lire avant de planifier) :
- profiles : full_name, headline, summary, email, phone, location,
  willing_to_relocate, work_preference (CHECK onsite/hybrid/remote),
  work_authorization_note, raw_cv_text
- profile_experiences : company, title, employment_type (CHECK), location,
  start_date, end_date (NULL = poste actuel, source unique — pas de is_current),
  summary, sort_order + CHECK end_date IS NULL OR end_date >= start_date
- experience_bullets : experience_id, text, sort_order
- profile_education : school, degree, field, location, start_date, end_date,
  credential_evaluation, honours, sort_order
- profile_skills : name, category (CHECK), sort_order + UNIQUE (profile_id, name)
- profile_languages : name, proficiency (CHECK), sort_order
- profile_certifications : name, issuer, issued_on, expires_on, credential_url, sort_order
- profile_links : kind (CHECK), url, label, sort_order

Conventions à respecter : énumérations en text + CHECK, jamais en ENUM natif (ADR-06,
déjà appliqué sur offers et applications). Entités ajoutées à src/config/entities.ts.
Migration ajoutée à src/migrations/index.ts. ON DELETE CASCADE depuis profiles.

API : GET /profiles/me renvoie le document imbriqué complet. PUT /profiles/me le
remplace entièrement, enfants compris, dans UNE transaction. POST /profiles et
PATCH /profiles/me sont supprimés — changement cassant assumé, aucun utilisateur en base.
Le PUT doit refuser une écriture périmée avec 409 CONFLICT dans le contrat d'erreur du
projet ; propose le mécanisme de concurrence optimiste dans le plan, ne l'impose pas.

Contraintes : aucun champ déduit — work_authorization_note est saisi par l'utilisateur
et n'est jamais rempli automatiquement dans un formulaire. Plafond de taille sur chaque
champ texte et sur la longueur de chaque tableau, côté serveur, dans le schéma Zod.
Les tests d'intégration et HTTP existants de profiles doivent être mis à jour, pas
supprimés.

Hors périmètre : rendu PDF, extraction LLM, module offers, recherche, pagination.

Preuve attendue : un PUT qui passe de 3 expériences à 2 laisse exactement 2 lignes et
supprime les puces orphelines ; casser le CASCADE rend ce test rouge.

Arrête-toi après le plan. Je lirai la migration générée avant qu'elle ne soit jouée.
```

---

## A — Coller une offre  ✅ *livré — PR #6*

**Le but.** Déposer une offre d'emploi dans le système. Sans offre stockée, rien à analyser.

**La compétence.** Écrire une **autorisation explicite**. Sur `profiles`, aucune route ne prend d'id : la fuite était structurellement impossible. Ici il y a un `GET /offers/:id`, donc une vraie règle d'accès à écrire et à tester.

### Les quatre décisions, déjà prises

1. **Le titre est fourni par l'utilisateur.** Pas de détection par mots-clés. Une heuristique juste 70 % du temps est pire qu'un champ obligatoire : les 30 % restants sont invisibles jusqu'à ce que le CV généré soit à côté de la plaque. Le LLM le pré-remplira plus tard, **en suggestion à confirmer**.
2. **La règle d'accès vit à un seul endroit.** Un utilisateur voit ses offres (`created_by_user_id = moi`) et les offres publiques (`created_by_user_id IS NULL`). Pas de double vérification : si le filtre est correct, un second contrôle ne peut jamais passer au rouge — ce n'est donc pas un test, c'est du code mort qui rassure.
3. **Le plafond est serveur : 50 Ko sur `description`.** Le frontend est une suggestion, n'importe qui fait un `curl`. Et pas 1 Mo : Express rejette les corps JSON au-delà de 100 Ko **avant** que Zod ne s'exécute, et le 413 qui en résulte n'est pas dans `CODE_BY_STATUS`.
4. **Aucune récupération d'URL.** `apply_url` est stocké tel quel, pour le palier auto-apply. On ne va rien chercher : les grands sites bloquent le scraping serveur — c'est précisément pourquoi les concurrents passent par une extension navigateur.

### Dette connue, à écrire dans le ticket

`@Unique(['source', 'externalId'])` ne protège de rien pour une offre collée : `external_id` vaut `NULL`, et `NULL` n'est jamais égal à `NULL` dans une contrainte unique Postgres. Un utilisateur peut donc coller quinze fois la même offre, et l'unicité `(user_id, offer_id)` de `applications` ne le rattrape pas puisque les `offer_id` diffèrent.

**On ne le corrige pas maintenant** — détecter « la même offre » depuis du texte brut demande une règle qu'on ne saura écrire qu'avec l'extraction LLM. On l'écrit comme limitation connue, datée, avec sa raison. Une dette écrite est une décision ; non écrite, c'est un bug.

### Le texte à coller

```
/ticket Module offers, première capacité — un utilisateur colle une offre d'emploi et
peut la relire. L'entité Offer et sa table existent déjà (src/modules/offers/entities) :
ne touche pas au schéma, il n'y a pas de migration dans ce ticket.

Routes :
- POST /offers — crée une offre privée : source = 'manual_paste',
  created_by_user_id = l'utilisateur du JWT, apply_channel = 'manual_only' par défaut.
  Champs acceptés : title (requis), description (requis), company, location, apply_url.
- GET /offers/:id — une offre visible par l'utilisateur
- GET /offers — ses offres et les offres publiques, les plus récentes d'abord, paginé

Règle d'accès, à UN seul endroit : created_by_user_id = moi OU created_by_user_id IS NULL.
Je ne veux pas de double vérification service + SQL : si le filtre est correct, le second
contrôle ne peut jamais passer au rouge, donc ce n'est pas un test. Rends l'oubli
impossible plutôt que de vérifier deux fois — expose une seule méthode de lecture nommée
pour ça et explique dans le plan comment rien d'autre ne peut atteindre la table.

Validation Zod : title 1..200 après trim ; description 1..50_000 caractères (plafond
SERVEUR délibéré — Express rejette les corps au-delà de 100 Ko avant Zod, et 413 n'est pas
dans CODE_BY_STATUS) ; apply_url optionnelle, http(s) uniquement ; company et location
optionnelles.

Pas d'extraction automatique du titre, pas de récupération du contenu d'une URL,
pas de LLM dans ce ticket.

À documenter dans le README, section Design decisions : la contrainte
UNIQUE (source, external_id) ne déduplique PAS les offres collées, parce que
external_id est NULL et que NULL n'est jamais égal à NULL dans une contrainte unique
Postgres. Conséquence : un utilisateur peut coller la même offre plusieurs fois.
Dette assumée, datée, à revoir quand le LLM saura extraire titre et entreprise.

Tests attendus — unitaire : le schéma Zod (titre vide, description à 50_001, URL non http).
Intégration : une offre d'un autre utilisateur n'est jamais renvoyée ; une offre publique
l'est ; la pagination. HTTP : 201 et la forme exacte, 401 sans jeton, 404 sur l'offre d'un
autre (jamais 403 — ne révèle pas l'existence), 400 sur description trop longue.

Preuve attendue : le test « ne renvoie jamais l'offre d'un autre utilisateur » passe au
rouge si on retire la clause de filtre. Mets-le en évidence dans ton rapport.

requests/offers.http dans le même commit, un bloc par code de statut.

Arrête-toi après le plan.
```

---

## B — Le module `llm`  ✅ *livré — PR #7 et #14*

**Le but.** Un seul point de passage vers le fournisseur de modèle, avec ses garde-fous.

**La compétence.** Travailler avec une dépendance **lente, chère et faillible**. C'est le premier endroit du projet où « ça marche sur ma machine » ne veut plus rien dire : l'appel peut durer 20 secondes, échouer à mi-chemin, coûter de l'argent, et renvoyer du texte qui ne respecte pas le format demandé.

### Les décisions à prendre dans le plan, pas après

- **Timeout** : combien, et que se passe-t-il au-delà ?
- **Retry** : sur quelles erreurs (429 et 5xx oui, 400 non), combien de fois, avec quel délai croissant ?
- **Plafond** : un nombre maximal de jetons par appel, et un compteur par utilisateur et par jour.
- **Le faux** : la CI ne doit **jamais** appeler une vraie API. Un `LlmPort` avec deux implémentations — la vraie, et une fausse déterministe qui peut aussi simuler un timeout et une réponse malformée.
- **Les logs** : le prompt et la réponse ne partent **pas** dans les logs. On journalise la durée, le nombre de jetons, le coût estimé et le résultat. `redact()` ne protège que les clés d'objet, pas le contenu d'une chaîne.

### Le texte à coller

```
/ticket Module llm — un point de passage unique vers le fournisseur de modèle, avec ses
garde-fous. Aucune route HTTP dans ce ticket : c'est une brique que le module documents
consommera au ticket suivant.

Livrables :
- Un port LlmPort (interface) : la seule chose que le reste du projet connaîtra
- Une implémentation réelle pour un fournisseur, clé lue via ConfigService et validée au
  démarrage par le schéma Zod d'environnement
- Un faux déterministe, utilisable en test, capable de simuler : réponse normale,
  timeout, 429, réponse malformée
- Un module Nest qui expose le port et choisit l'implémentation selon l'environnement

Décisions à proposer dans le plan avec leur justification, pas à coder d'emblée :
timeout, politique de retry (sur quels codes, combien de fois, quel délai croissant),
plafond de jetons par appel, compteur par utilisateur et par jour.

Contraintes :
- Le prompt et la réponse ne sont JAMAIS journalisés. On journalise durée, jetons, coût
  estimé, résultat. redact() ne protège que les clés d'objet, pas le contenu des chaînes.
- La clé d'API n'apparaît ni dans un log, ni dans un message d'erreur, ni dans une
  réponse HTTP.
- La CI n'appelle jamais une vraie API : aucune clé dans ci.yml, et un test qui échoue
  si l'implémentation réelle est instanciée en environnement de test.
- Aucune génération de réponse à une question de filtrage (autorisation de travail,
  salaire, diversité) — règle du projet, à faire respecter par le code, pas par le prompt.

Hors périmètre : la génération de documents, les files d'attente, toute route HTTP.

Tests attendus — unitaire : le timeout déclenche bien l'erreur attendue ; le retry
s'arrête au bon nombre de tentatives ; une réponse malformée est rejetée proprement ;
le plafond de jetons refuse l'appel avant de partir. Tous avec le faux, zéro appel réseau.

Preuve attendue : un test prouve qu'aucun appel réseau ne part en environnement de test.
Et un test lit les champs journalisés pour prouver que le prompt n'y est pas.

Arrête-toi après le plan.
```

---

## C — Générer un document  ✅ *livré — PR #21*

**Le but.** Produire une lettre de motivation ancrée dans le profil, pour une offre donnée.

**La compétence.** **L'asynchrone et l'idempotence.** Une requête HTTP ne peut pas attendre 20 secondes. Et deux clics sur « générer » ne doivent pas produire deux documents facturés deux fois.

### Ce qui rend ce ticket difficile

- **La file.** Redis + BullMQ. Mais le service Render gratuit s'endort : un worker endormi ne traite rien. **C'est une décision d'architecture à documenter en ADR avant de coder** — worker dans le même processus, worker séparé, ou traitement synchrone avec un timeout court en attendant.
- **L'idempotence.** Deux requêtes identiques, un seul document. Une clé d'idempotence fournie par le client, ou l'unicité `(user_id, offer_id)` de `applications` comme garde-fou naturel.
- **L'ancrage.** Le document généré ne doit contenir **aucun fait absent du profil**. Pas d'entreprise inventée, pas de date déplacée, pas de compétence ajoutée. C'est précisément pourquoi `experience_bullets` existe : le modèle **sélectionne** des puces, il ne les réinvente pas. Un contrôle automatique vérifie que chaque nom d'entreprise et chaque année du document apparaissent dans le profil.
- **La dégradation.** Si le LLM est indisponible, l'utilisateur voit un état d'échec lisible, pas un 500.

### Le texte à coller

```
/ticket Génération d'un document — un utilisateur choisit une de ses offres et reçoit une
lettre de motivation ancrée dans son profil. Les entités Application et GeneratedDocument
existent déjà ; vérifie si une migration est nécessaire pour l'état du travail et dis-le
dans le plan.

AVANT de coder : écris un ADR sur l'exécution asynchrone. Le contexte est que le service
Render gratuit s'endort après 15 minutes d'inactivité, donc un worker BullMQ endormi ne
traite rien. Propose deux ou trois options avec leurs conséquences réelles (worker dans le
même processus, worker séparé, synchrone avec timeout court), recommande-en une, et
attends ma validation avant d'implémenter.

Routes :
- POST /applications { offerId } — met un travail en file, renvoie 202 avec l'id et l'état
- GET /applications/:id — l'état du travail et, quand il est prêt, le document

Contraintes :
- Idempotence : deux requêtes identiques produisent UN document, jamais deux appels
  facturés. Explique ton mécanisme dans le plan.
- Ancrage : le document ne doit contenir aucun fait absent du profil. Un contrôle
  automatique vérifie que chaque nom d'entreprise et chaque année présents dans le
  document apparaissent dans le profil. Si le contrôle échoue, le travail est marqué en
  échec — on ne livre pas un document inventé.
- Dégradation : LLM indisponible => état d'échec lisible et motif, jamais un 500.
- Aucune réponse générée à une question de filtrage.
- GeneratedDocument n'a pas de updated_at (règle du projet) : un document généré ne se
  modifie pas, on en génère un nouveau.

Hors périmètre : le rendu PDF, l'envoi par email, l'auto-apply, le frontend.

Tests attendus — unitaire : le contrôle d'ancrage rejette un document qui mentionne une
entreprise absente du profil (c'est LE test du ticket) ; la construction du prompt ne
contient que des données du profil. Intégration : deux POST identiques ne créent qu'un
travail ; un LLM qui échoue laisse le travail dans un état d'échec consultable.
HTTP : 202 puis un GET qui passe de « en cours » à « prêt », 404 sur l'offre d'un autre,
401 sans jeton.

Preuve attendue : fais échouer le contrôle d'ancrage en injectant une fausse entreprise
dans la réponse du faux LLM, et montre que le travail finit en échec plutôt que de livrer.

Arrête-toi après l'ADR.
```

---

## D — Qualité et localisation de la lettre  *(révisé le 17 oct — voir la section « Révision du ticket D » plus bas)*

**Le but.** Passer d'une lettre générique à une lettre qu'un lead recruiter RH de 10 ans d'expérience lit jusqu'au bout. Le ticket C a prouvé la plomberie ; il n'a jamais prétendu produire une bonne lettre.

**La compétence.** Mesurer une sortie qu'aucun test unitaire ne peut juger. Un test dira si la lettre contient un nom ; jamais si elle est bonne. Il faut une grille d'évaluation, et c'est un autre métier.

### Les dix manques constatés dans `buildCoverLetterPrompt`

1. **Le français est codé en dur.** Annonce en anglais à Calgary → lettre en français → candidature morte.
2. **Aucune norme de marché.** Une lettre canadienne n'est pas une lettre française : ton direct, 250–350 mots, trois paragraphes, pas de « Veuillez agréer ». `profile.location` et `offer.location` existent et ne sont pas utilisés.
3. **Aucune longueur demandée.** Sans borne, un LLM écrit 600 mots. Un recruteur lit 20 secondes.
4. **Aucune structure imposée.** Accroche liée au poste, une ou deux preuves chiffrées, lien avec l'entreprise, clôture avec appel à l'action.
5. **Aucune hiérarchie des faits.** Toutes les expériences partent à plat : le modèle parle de tout, donc de rien. C'est exactement ce que `experience_bullets` permet de corriger — sélectionner, pas réécrire.
6. **Neuf champs du profil sont ignorés** : `headline`, `summary`, `location`, `willing_to_relocate`, `work_authorization_note`, `education`, `languages`, `certifications`, `links`. Le plus grave est `work_authorization_note` : au Canada, c'est le premier filtre du recruteur, il est en base et jamais envoyé.
7. **Aucune interdiction de style.** Les ouvertures creuses (« Je vous écris pour exprimer mon intérêt »), les superlatifs non prouvés, les tirets cadratins.
8. **L'interdiction d'inventer ne couvre que l'expérience.** Rien n'empêche d'inventer sur l'entreprise visée — c'est rattrapé en aval par l'ancrage, donc payé pour rien.
9. **Aucune consigne de ton.**
10. **Un seul prompt pour tous les marchés.** Ne tiendra pas le jour de la vente.

### Le piège, à traiter dans le même ticket

Changer la langue casse l'ancrage. `FRENCH_LETTER_OPENING_WORDS` ne connaît que le français : « Dear Hiring Manager » serait rejeté comme nom propre inventé. Langue et ancrage sont couplés ; les toucher séparément casse la production.

### Les trois décisions à prendre avant d'écrire une ligne

1. La langue vient de l'offre, du profil, ou d'un choix explicite de l'utilisateur ?
2. Le marché — format, longueur, formules — est une donnée en base ou du code ? Vendu dans plusieurs pays, ce doit être une donnée.
3. Comment on mesure qu'une lettre est bonne, sans y mettre un humain à chaque fois ?

### Le texte à coller

```
/ticket Qualité et localisation de la lettre de motivation. Le ticket précédent a livré la
plomberie (transaction, course, péremption, ancrage) avec un prompt volontairement minimal.
Ce ticket s'attaque au contenu. Lis d'abord src/modules/documents/prompt.ts et
src/modules/documents/anchoring.ts.

AVANT de coder : écris un ADR sur la localisation du document. Trois décisions, avec
leurs conséquences réelles :
- d'où vient la langue de la lettre (offre, profil, ou choix explicite de l'utilisateur)
- si le format de marché (longueur, structure, formules d'ouverture et de clôture) est
  une donnée en base ou du code — l'application sera vendue dans plusieurs pays
- comment on mesure qu'une lettre est bonne sans un humain à chaque génération
Attends ma validation avant d'implémenter.

Manques à corriger dans le prompt :
- le français est codé en dur ; une annonce en anglais doit produire une lettre en anglais
- aucune norme de marché : une lettre canadienne fait 250 à 350 mots, trois paragraphes,
  ton direct, sans formule de politesse à la française
- aucune longueur ni structure demandées
- aucune hiérarchie : les expériences et les puces pertinentes pour CETTE offre doivent
  être sélectionnées, jamais réécrites (c'est la raison d'être de experience_bullets)
- neuf champs du profil ne sont pas transmis : headline, summary, location,
  willing_to_relocate, work_authorization_note, education, languages, certifications,
  links. work_authorization_note est le premier filtre d'un recruteur canadien.
- aucune interdiction de style : ouvertures creuses, superlatifs non prouvés, tirets
  cadratins
- l'interdiction d'inventer ne couvre que l'expérience, pas l'entreprise visée

Couplage à traiter dans le même ticket : FRENCH_LETTER_OPENING_WORDS ne connaît que le
français. Une lettre en anglais ferait rejeter « Dear Hiring Manager » comme nom propre
inventé. Langue et ancrage changent ensemble.

Contraintes inchangées : aucune réponse générée à une question de filtrage ; le prompt
et la réponse ne sont jamais journalisés ; work_authorization_note est transmis tel quel,
jamais reformulé ni déduit.

Hors périmètre : le CV, le rendu PDF, le frontend.

Tests attendus — unitaire : le prompt change de langue selon l'entrée ; le prompt contient
les neuf champs quand ils sont renseignés et ne contient rien quand ils sont vides ;
l'ancrage accepte une ouverture anglaise quand la langue est l'anglais, et la refuse
quand elle est le français. Plus une grille d'évaluation exécutable sur dix offres
réelles, dont le résultat est un rapport, pas une assertion.

Preuve attendue : la même offre, en français puis en anglais, produit deux prompts dans
la bonne langue, et les deux passent l'ancrage.

Arrête-toi après l'ADR.
```

---

## E — Le tableau de bord des candidatures

**Le but.** Voir ses candidatures et leur état. Aujourd'hui un utilisateur peut créer une candidature et la relire une par une, s'il connaît son id. C'est inutilisable.

**La compétence.** Les **transitions d'état**. `draft → generated → reviewed → sent → answered` : quelles transitions sont permises, qui les déclenche, et qu'est-ce qui est interdit. C'est la première fois du projet qu'un état a plus de deux valeurs utiles.

### Ce qui existe déjà et n'est pas branché

La table `application_events` et son entité sont en base depuis le 28 septembre. Zéro ligne de code les utilise. C'est elle qui répondra à « qu'est-ce qui s'est passé sur cette candidature, et quand ».

### Les décisions à prendre dans le plan

- La liste est-elle paginée par curseur ou par décalage ? Le choix du module `offers` fait précédent.
- Une transition interdite renvoie quel code ? `409` est dans le contrat d'erreur, `422` non.
- `submitted_at` et `answered_at` existent déjà sur l'entité. Qui les écrit, et une transition peut-elle revenir en arrière ?

### Le texte à coller

```
/ticket Tableau de bord des candidatures. Les entités Application et ApplicationEvent
existent déjà ; ApplicationEvent n'est utilisée par aucune ligne de code à ce jour.

Routes :
- GET /applications — les candidatures de l'utilisateur, les plus récentes d'abord,
  paginées, avec leur statut et le titre de l'offre
- PATCH /applications/:id/status — change le statut

Transitions permises : draft → generated est écrite par la génération et par elle seule.
L'utilisateur peut aller de generated à reviewed, de reviewed à sent, de sent à answered.
Toute autre transition est refusée. Propose le code HTTP dans le plan — 409 est dans
CODE_BY_STATUS, 422 non — et justifie-le.

Chaque changement de statut écrit une ligne dans application_events. submitted_at est
écrit au passage à sent, answered_at au passage à answered.

Pagination : aligne-toi sur ce que fait déjà offers, ou explique pourquoi tu t'en écartes.

Contraintes : la règle d'accès vit à un seul endroit, comme sur offers ; une candidature
d'un autre utilisateur renvoie 404, jamais 403.

Hors périmètre : l'envoi réel, le frontend, les notifications.

Tests attendus — unitaire : la table des transitions permises. Intégration : une
transition interdite laisse le statut inchangé ET n'écrit aucun événement ; la liste ne
renvoie jamais la candidature d'un autre. HTTP : 200 sur la liste avec la forme exacte,
409 sur transition interdite, 404 sur la candidature d'un autre, 401 sans jeton, 400 sur
un id qui n'est pas un UUID.

Preuve attendue : une transition refusée ne laisse aucune trace — ni statut modifié, ni
ligne dans application_events. Compte les lignes avant et après.

requests/applications.http mis à jour dans le même commit.

Arrête-toi après le plan.
```

---

## F — Le CV adapté

**Le but.** Un CV qu'un lead recruiter RH de dix ans d'expérience classe dans la pile « à rappeler », et pas dans l'autre. La table `generated_documents` attend `'cv'` depuis le 28 septembre, et `findLatestForApplication` filtre déjà sur `'cover_letter'` pour lui laisser la place.

**La compétence.** Réutiliser une plomberie sans la dupliquer. Si ce ticket copie-colle le ticket C, le découpage était faux.

**Pré-requis : le ticket D.** Le CV partage la même table de règles de marché que la lettre. Pas une deuxième table, pas un deuxième jeu de règles.

### Ce que personne ne voit venir : un CV a deux lecteurs

**La machine lit avant l'humain.** Chez la plupart des employeurs, le CV passe dans un ATS qui en extrait le texte avant qu'un recruteur le voie. Un CV magnifique mais illisible par la machine n'arrive jamais devant un humain. Ça dicte la structure, pas l'esthétique :

- **Une seule colonne.** Deux colonnes se lisent en zigzag à l'extraction.
- **Aucun tableau**, aucune zone de texte, aucun en-tête ni pied de page : le contenu qui y est placé est souvent perdu.
- **Titres de sections standards** et dans la langue du marché : `Experience`, `Education`, `Skills`. Pas « Mon parcours », pas « Ce que je sais faire ».
- **Aucune icône, aucun graphique, aucun texte dans une image.** Une barre de niveau « React ████░ » n'informe aucun humain et casse l'extraction.
- **Un seul format de date**, constant partout.
- Les acronymes **et** leur forme longue au moins une fois : un ATS qui cherche « Continuous Integration » ne trouve pas « CI ».

### Les normes par marché — le même jeu de règles que le ticket D

| | Canada / États-Unis | France |
|---|---|---|
| Photo | **Jamais** | Tolérée |
| Date de naissance, état civil, nationalité | **Jamais** | Courant |
| Longueur | 2 pages acceptées au-delà de 3 ans d'expérience | 1 page attendue en dessous de 10 ans |
| Diplôme étranger | **L'évaluation WES se mentionne** — c'est la ligne qui rend le diplôme lisible | Sans objet |
| « Références sur demande » | **Jamais** — une ligne morte qui occupe une ligne vivante | Idem |
| Ordre | Expérience avant formation, sauf jeune diplômé | Idem |

Au Canada, une photo ou une date de naissance n'est pas une maladresse de style : le recruteur **écarte** le CV, parce que le conserver l'expose à une accusation de discrimination. C'est la règle la plus coûteuse de ce tableau, et c'est exactement ce qu'un modèle entraîné sur des CV français produira spontanément.

`credential_evaluation` et `location` sont en base depuis le ticket A0, précisément pour ça.

### La sélection, et sa limite

Trois puces sur huit, choisies pour **cette** offre. Le modèle **sélectionne**, il ne réécrit pas — c'est la raison d'être de `experience_bullets`, et la seule garantie vérifiable.

Deux interdictions qui vont ensemble :

- **Aucun chiffre inventé.** Un lead recruiter attend « verbe d'action + résultat mesurable ». Si la puce de l'utilisateur n'a pas de chiffre, elle **reste** sans chiffre. Un chiffre inventé sur un CV se découvre en entretien, et c'est pire qu'une puce faible.
- **Aucune compétence ajoutée.** Les compétences exigées par l'annonce et présentes dans le profil **remontent** en tête. Celles qui sont absentes du profil ne sont jamais ajoutées, même si l'annonce les réclame.

### L'ancrage est plus strict que pour la lettre

Une lettre est un argumentaire : une tournure maladroite se pardonne. Un CV est un document factuel, lu comme une déclaration. **Zéro tolérance** : chaque entreprise, chaque intitulé, chaque date, chaque école, chaque certification du CV généré doit exister à l'identique dans le profil. L'heuristique du ticket C ne suffit pas ici — il faut une correspondance par champ, pas par mot.

### La relecture simulée — à décider, pas à imposer

Un deuxième appel au modèle, qui joue le recruteur senior du marché visé et note le CV sur une grille fixe : lisibilité machine, pertinence par rapport à l'annonce, preuves chiffrées, conformité au marché, longueur. Il **ne réécrit rien** : il renvoie une note et des remarques.

Ça coûte un appel de plus par génération, donc c'est une décision de coût : toujours, jamais, ou seulement sur demande de l'utilisateur. À trancher dans le plan avec le chiffre.

### Hors périmètre

**Le rendu PDF est un ticket à lui seul.** Celui-ci produit le **contenu structuré** du CV — validé contre un schéma, ancré, conforme au marché. Le fichier vient après, et c'est lui qui portera la mise en page à une colonne.

### Le texte à coller

```
/ticket Le CV adapté — deuxième type de document. generated_documents accepte déjà
'cv' et findLatestForApplication filtre explicitement sur 'cover_letter' pour lui laisser
la place. Le ticket D a introduit les règles de marché : réutilise-les, n'en crée pas un
second jeu. Lis d'abord src/modules/documents/ en entier.

Livrable : le CONTENU STRUCTURÉ du CV, pas un fichier. Validé contre un schéma Zod,
ancré dans le profil, conforme au marché de l'offre. Le rendu PDF est hors périmètre.

Le CV a deux lecteurs, la machine avant l'humain. La structure produite doit respecter :
une seule colonne ; aucun tableau, zone de texte, en-tête ni pied de page ; titres de
sections standards dans la langue du marché (Experience, Education, Skills) ; aucune
icône, aucun graphique, aucun niveau en barres ; un seul format de date partout ;
chaque acronyme accompagné de sa forme longue au moins une fois.

Normes par marché, à brancher sur la table du ticket D :
- Canada et États-Unis : jamais de photo, de date de naissance, d'état civil ni de
  nationalité — un recruteur canadien ÉCARTE un CV qui en contient. 2 pages acceptées
  au-delà de 3 ans d'expérience. L'évaluation WES se mentionne (credential_evaluation
  est en base pour ça). Jamais de « références sur demande ».
- France : photo tolérée, 1 page attendue en dessous de 10 ans d'expérience.
Un modèle entraîné sur des CV français produira spontanément une photo et une date de
naissance : la règle doit être imposée par le schéma de sortie, pas seulement par le
prompt.

Sélection : 3 puces sur 8 choisies pour CETTE offre, jamais réécrites — le modèle
sélectionne, il ne reformule pas. Deux interdictions : aucun chiffre inventé (une puce
sans chiffre reste sans chiffre) ; aucune compétence ajoutée (celles exigées par
l'annonce et présentes dans le profil remontent en tête, les absentes ne sont jamais
ajoutées même si l'annonce les réclame).

Ancrage strict, plus strict que pour la lettre : chaque entreprise, intitulé, date,
école et certification du CV doit exister À L'IDENTIQUE dans le profil. Correspondance
par champ, pas par mot — l'heuristique de la lettre ne suffit pas pour un document
factuel.

À décider dans le plan, avec le coût chiffré : une relecture simulée par un second appel
au modèle, jouant le recruteur senior du marché visé, notant sur une grille fixe
(lisibilité machine, pertinence vs annonce, preuves chiffrées, conformité marché,
longueur) sans rien réécrire. Toujours, jamais, ou sur demande de l'utilisateur ?

Contraintes inchangées : aucune réponse générée à une question de filtrage ;
work_authorization_note transmis tel quel, jamais reformulé ni déduit ; le prompt et la
réponse ne sont jamais journalisés ; generated_documents n'a pas de updated_at.

Hors périmètre : le rendu PDF, le frontend, l'envoi.

Tests attendus — unitaire : le schéma de sortie refuse une photo, une date de naissance
et un état civil quand le marché est le Canada ; il refuse un CV de 3 pages ; les puces
produites sont un sous-ensemble EXACT des puces du profil (égalité de chaînes, pas
similarité) ; une compétence exigée par l'annonce et absente du profil n'apparaît pas ;
un chiffre absent de la puce d'origine n'apparaît pas dans la puce retenue.
Intégration : un CV généré crée une ligne de type 'cv' sans toucher la lettre existante ;
findLatestForApplication continue de ne renvoyer que la lettre.

Preuve attendue : fais renvoyer au faux modèle une puce légèrement reformulée au lieu de
la puce exacte du profil, et montre que le document est refusé. C'est LE test du ticket :
sélectionner est vérifiable, réécrire ne l'est pas.

Arrête-toi après le plan.
```

---

## G — L'échelle, pour de vrai

**Le but.** Les trois pressions annoncées au palier 3 et jamais exercées : volume, concurrence, durée.

**La compétence.** Mesurer avant d'optimiser. « C'est plus rapide » n'est pas un résultat ; « 8 s → 40 ms » en est un.

### Les quatre travaux

1. **100 000 offres générées, puis `EXPLAIN ANALYZE`** sur les vraies requêtes de `offers` et `applications`. Un index posé, un gain chiffré avant/après. C'est une sortie non remplie du palier 3.
2. **Le magasin du throttler passe en Redis.** Aujourd'hui il est en mémoire : avec deux instances, la limite de débit est doublée, et au redémarrage elle est remise à zéro. ADR-13 le nomme comme un défaut de correction à régler **avant la mise en vente**. Décider aussi ce qui se passe si Redis tombe : refuser ou laisser passer.
3. **La déduplication des offres collées.** Dette écrite au ticket A : `UNIQUE(source, external_id)` ne protège de rien quand `external_id` est `NULL`. Le module `llm` existe maintenant, donc la règle devient écrivable — titre + entreprise + empreinte normalisée de la description.
4. **Les métriques de la génération.** Combien de générations par jour, combien d'échecs, combien de péremptions, quel coût. Sans ça, une file qui se remplit plus vite qu'elle ne se vide ne se voit pas.

---

## Révision du ticket D — l'architecture en paliers

> **Ajoutée le 17 octobre, après validation de l'architecture.** Le ticket D ne
> livre plus seulement un meilleur prompt : il pose le squelette que les tickets
> F et J réutiliseront sans le dupliquer.

### Les quatre étapes, et ce que chacune coûte

```
0. PRÉ-VOL ──────────────────────────────────── 0 appel
   Profil assez rempli ? Marché connu ? (Score de compatibilité : branché au ticket J)
   Si non : on ne génère pas, on dit ce qui manque.
                    ↓
1. GÉNÉRATION ─────────────────────────────── 1 appel
   Profil + offre + norme du marché → texte
                    ↓
2. CORRECTION MÉCANIQUE ─────────────────────── 0 appel
   Tirets cadratins, espaces, formule isolée dans sa phrase → réparé par `replaceAll`
                    ↓
3a. VÉRIFICATEUR DE FAITS      3b. VÉRIFICATEUR DE FORMAT     0 appel
    voit profil + offre            voit UNIQUEMENT la norme    en parallèle
    chiffres, noms propres,        longueur, paragraphes,
    dates, rang du verbe           interdits, sections
                    ↓
   VERDICT : toutes les violations rassemblées
        ↓ aucune       ↓ faute          ↓ imprécision
     on livre        on rejette      UN SEUL appel de correction
```

**La règle de coût.** Pire cas : **2 appels**, jamais 3. Le tour de correction porte
**toutes** les violations d'un coup, et son prompt ne contient que le texte produit plus
la liste — pas le profil, pas l'offre.

**La règle qui rend ça possible.** Les étapes 0, 2, 3a et 3b sont du **code pur**. Aucune
ne parle au modèle. Compter des mots, chercher une formule, comparer deux ensembles de
faits : rien de tout cela ne demande de réfléchir. Le seul juge qui a besoin d'un
cerveau, c'est le ton — et il reste le rapport humain périodique de la décision 3b de
l'ADR-14, pas un appel par lettre.

### Le vérificateur de format est aveugle, par signature

`format.checker.ts` ne reçoit **que** la `MarketNorm`. Pas l'offre, pas le profil, pas de
`ProfilesService` injecté. Un vérificateur qui voit le contexte peut être influencé par
lui ; celui-là ne le peut pas, et c'est garanti par le type, pas par la discipline. Même
raisonnement que la règle d'accès unique du ticket A : rendre l'oubli impossible plutôt
que vérifier deux fois.

### Reformuler est autorisé. Se promouvoir, non.

Décision corrigée : « dire la même chose avec des mots plus justes » n'est pas inventer,
ni pour la lettre ni pour le CV. Refuser la reformulation enlève au produit la valeur
qu'il doit apporter. Ce qui change, ce n'est pas l'autorisation, c'est **ce qu'on
vérifie** :

1. **Les faits sont identiques, pas seulement présents.** Chiffres, noms propres, dates,
   durées, volumes : on compare les deux ensembles, égalité exacte.
2. **Pas de montée en responsabilité.** Le piège que personne ne voit : aucun chiffre ne
   change et c'est pourtant faux. « Participé à la migration » ne devient pas « Dirigé la
   migration ». Une échelle fermée par langue — `participé < contribué < développé <
   réalisé < conduit < dirigé` — et le verbe de sortie doit être de rang inférieur ou égal
   à celui de la source.
3. **Pas de superlatif absent de la source.** « Majeur », « critique », « stratégique »
   n'apparaissent pas tout seuls.

Les trois sont vérifiables sans modèle.

### Les normes derrière un port, pas en dur

`MARKET_NORMS` ne tient plus dans une constante TypeScript : 197 pays, et des descriptions
qui nourrissent le prompt et seront réglées souvent. Mais une table en base tout de suite
coûte cher : une norme changée en production n'est plus relue, plus testée, plus annulable
par `git revert`, et sans écran d'administration on édite du SQL à la main en prod.

**La forme et les valeurs se séparent.**

| Chose | Change quand | Où |
|---|---|---|
| Les types, la liste des familles, les valeurs permises | le code qui les lit change | **code** |
| Les valeurs par pays | quelqu'un apprend un fait | **fichier de données** |
| Les descriptions qui entrent dans le prompt | on règle la qualité | **fichier de données** |

```
MarketNormProvider          (port — même motif que LlmPort)
   ├─ FileMarketNormProvider   ← JSON/YAML du dépôt, validé par Zod AU DÉMARRAGE
   └─ DbMarketNormProvider     ← le jour où un écran d'administration existe
```

Une norme invalide fait échouer le **démarrage**, pas la génération. Déclencheur du
passage en base : le même qu'ADR-13 pour Redis, le premier client qui paie.

### Famille, exception, marché — pas une liste de pays

Les pays se regroupent en **onze familles de format** (nord-américaine, Commonwealth,
française, allemande, Europe du Sud, Europe du Nord, Europe centrale et de l'Est,
Amérique latine, Golfe, Asie de l'Est, Asie du Sud). Onze objets couvrent le monde ;
ajouter un pays, c'est trois lignes d'exception, pas un objet entier.

Repères utiles : l'Afrique francophone suit le modèle français (Sénégal, Maroc, Algérie,
Tunisie), l'Afrique anglophone le Commonwealth, l'Afrique lusophone l'Europe du Sud.
Exceptions qui comptent : **Afrique du Sud** — Commonwealth, mais deux ou trois références
nommées et pas de photo ; **Nigeria** — l'année de NYSC va dans l'expérience, pas dans la
formation ; **Ghana** — les certifications vont dans la ligne du nom.

**Le repli `unknown` prend la norme la plus STRICTE, jamais une moyenne.** Le risque est
asymétrique : un CV sans photo n'est jamais rejeté en France, un CV avec photo est écarté
au Canada. Omettre ne tue pas ; inclure peut tuer.

**La source de vérité.** Il n'en existe aucune : aucun organisme ne publie les normes de
CV, et Europass est un modèle de l'UE, pas une règle pour les recruteurs. Donc chaque
norme porte sa **preuve** (d'où elle vient), sa **date de vérification**, et son **niveau
de confiance** (`verified` / `inherited` / `neutral`). Une norme de plus de 24 mois repasse
en revue. Le produit peut alors dire honnêtement : « norme héritée du modèle français,
non vérifiée pour le Sénégal ».

### La structure

```ts
type Family =
  | 'north_american' | 'commonwealth' | 'french' | 'german'
  | 'southern_european' | 'northern_european' | 'cee'
  | 'latin_american' | 'gulf' | 'east_asian' | 'south_asian';

type Expect = 'never' | 'optional' | 'expected';

interface PersonalPolicy {
  photo: Expect; dateOfBirth: Expect; maritalStatus: Expect;
  nationality: Expect; workAuthorization: Expect;
}

interface LetterNorm {
  words: [number, number]; paragraphs: number;
  openings: string[]; closings: string[];      // alimente aussi l'ancrage
  bannedPhrases: string[]; tone: 'direct' | 'formal';
  verbLadder: string[];                        // l'échelle de responsabilité
}

interface CvNorm {
  pages: [number, number]; sectionOrder: CvSection[];
  references: 'omit' | 'on_request' | 'named';   // 'named' = Afrique du Sud
  dateFormat: 'MM/YYYY' | 'Mon YYYY' | 'YYYY-MM';
  credentialEquivalence: boolean;                // WES, ENIC-NARIC
  localFields: LocalField[];                     // NYSC, service national
}

interface AtsNorm {
  singleColumn: true; noTables: true;
  standardHeadings: Record<CvSection, string>;
  spellOutAcronyms: boolean;
}

interface Evidence {
  source: string; checkedOn: string;
  confidence: 'verified' | 'inherited' | 'neutral';
}

interface MarketNorm {
  family: Family; language: LanguageCode;
  personal: PersonalPolicy;
  letter: LetterNorm;
  cv: CvNorm;              // vide au ticket D, rempli au ticket F
  ats: AtsNorm;
  evidence: Evidence;
  userOverridable: FieldGroup[];   // V2 : ce qu'un utilisateur a le droit de changer
}
```

### Le point d'entrée prend un CONTEXTE, pas deux valeurs

```ts
interface NormContext {
  country: CountryCode;
  language: LanguageCode;
  userId?: string;          // ignoré au ticket D. Branché en V2.
}

function resolveNorm(ctx: NormContext): MarketNorm;
```

**C'est la décision la moins chère du ticket et la plus rentable.** Avec deux scalaires,
la personnalisation utilisateur de la V2 change la signature de tous les appelants. Avec
un contexte, elle ajoute une couche dans la fusion et ne touche aucun appelant.

La fusion est **ordonnée et nommée** dès maintenant :

```
famille → exception pays → langue → (V2) préférences utilisateur
```

Une fusion improvisée rendrait l'ajout d'une couche impossible sans réécriture.

Et `userOverridable` existe dès le ticket D, même inutilisé : **un utilisateur ne pourra
jamais activer la photo pour le Canada.** Les champs à risque juridique ne sont pas
négociables, et c'est le type qui le dit.

---

## J — Le score de compatibilité et le seuil de génération

**Le but.** Ne pas produire une candidature pour une offre où le candidat n'a aucune
chance. Chaque génération coûte de l'argent, et une lettre sur une offre à 20 % de
correspondance est une lettre creuse : l'ancrage interdit d'inventer, donc elle ne dira
rien.

**La compétence.** Décider avec une règle écrite plutôt qu'avec un modèle. Le score est
du calcul, pas du jugement.

### L'extraction des exigences : un appel, amorti

Un appel au modèle **à la création de l'offre**, pas à chaque génération. Il transforme
le texte de l'annonce en structure : compétences requises, compétences souhaitées, années
d'expérience, langue de travail, autorisation de travail exigée, type de contrat, lieu.

Stocké sur l'offre. Réutilisé pour tous les profils et tous les documents.

**Et il règle la dette du ticket A** : titre et entreprise extraits donnent enfin
l'empreinte stable qui permettra de dédupliquer les offres collées deux fois.

### La formule

**D'abord les éliminatoires.** Un blocage dur ne rogne pas le score, il le plafonne :

- langue de travail de l'offre absente du profil
- autorisation de travail exigée et absente
- diplôme ou certification légalement obligatoire absent

→ **score plafonné à 30**, avec le motif affiché. Aucune compétence ne rattrape ça.

**Sinon, quatre composantes sur 100 :**

| Composante | Poids | Calcul |
|---|---|---|
| Compétences requises | **50** | présentes / exigées |
| Compétences souhaitées | **15** | présentes / souhaitées |
| Séniorité | **20** | années du profil / années demandées, plafonné à 1 |
| Recevabilité | **15** | lieu, télétravail, type de contrat |

### Le seuil : 60 %

En dessous de 60, le candidat n'a pas la moitié des compétences exigées. La lettre serait
surtout de l'aspiration, et l'ancrage la viderait de sa substance. C'est aussi la barre
des 6/10 déjà appliquée à la main sur les adaptations de CV : même décision, même seuil.

### Le forçage manuel, toujours

**Un score bas n'interdit rien. Il informe.**

`POST /applications { offerId, force: true }` génère quand même. L'utilisateur reste le
patron de sa candidature — c'est la même règle produit que « JobAI prépare, l'utilisateur
envoie ».

Trois contraintes :

- Le refus n'est **pas une erreur HTTP**. La candidature est créée en `draft` avec
  `generationBlockedReason = 'low_match'`, le score et la liste des manques. Le client
  affiche « 42 % — voici ce qui manque » et un bouton. Un 4xx voudrait dire que la requête
  était fautive ; elle ne l'est pas.
- Un document forcé porte une marque (`generatedBelowThreshold`) : le tableau de bord doit
  pouvoir le montrer, et l'utilisateur doit savoir que celle-là est un pari.
- Le quota s'applique pareil. Forcer ne rend pas gratuit.

### Les preuves attendues

- une offre exigeant une langue absente du profil plafonne le score à 30, quelles que
  soient les compétences
- un `POST` sous le seuil crée une candidature en `draft`, **n'appelle jamais le modèle**,
  et renvoie le score et les manques
- le même `POST` avec `force: true` génère, et le document produit porte la marque
- le score de la même offre et du même profil est **identique** à deux appels — c'est du
  calcul, pas du jugement

---

## H — Lire un ancien CV

**Le but.** Personne ne remplira huit tables à la main. `raw_cv_text` existe en base
depuis le ticket A0 et rien ne le lit. Sans ce ticket, le produit n'a pas de porte
d'entrée.

**La compétence.** Faire remplir une structure par un modèle sans lui laisser inventer :
tout champ extrait est une **proposition à confirmer**, jamais un fait acquis. Même
principe que le titre de l'offre au ticket A.

---

## I — Noter la qualité du profil

**Le but.** « Tes quatre puces n'ont aucun chiffre. » Un profil sans résultats mesurables
produit une candidature creuse, et le produit doit le dire avant de générer, pas après.

**La compétence.** Mesurer une qualité d'entrée avec des règles, pas un modèle. Une puce
sans verbe d'action, sans chiffre, de moins de six mots : tout cela se compte.

---

## Notes pour la V2 — à ne pas perdre

- **Personnalisation utilisateur des `MarketNorm`.** Rendue possible par `NormContext`
  (`userId` déjà présent, ignoré) et par la fusion ordonnée. Bornée par `userOverridable` :
  les champs à risque juridique restent hors de portée.
- **Mise en cache du prompt.** Le bloc profil ne change pas d'une offre à l'autre. Le
  fournisseur sait le réutiliser ; gain direct sur le coût, sans toucher l'architecture.
- **Normes en base** avec un écran d'administration, en changeant l'implémentation du
  port, pas ses appelants.

---

## Les dettes opérationnelles — à vider avant le ticket D

Aucune ne demande de réflexion. Toutes bloquent ou mentent.

| Dette | Pourquoi ça compte |
|---|---|
| **12 ADR sur 13 ne sont pas versionnés** | Ils n'existent que sur un disque. Tout le raisonnement du projet tient dans un dossier non suivi par git. |
| `ANTHROPIC_API_KEY` absente de Render | L'application ne démarre pas sans elle. |
| Migration `LlmDailyQuota` non jouée sur Neon | Migration d'abord, code ensuite. Toujours. |
| `.env.example` : 8 variables manquantes | Un nouveau développeur ne peut pas démarrer le projet. |
| Roadmap du README fausse | « Authentication » n'est pas cochée, elle est livrée depuis le 7 octobre. |
| Redis annoncé dans le tableau de la stack | Branché nulle part, et ADR-13 dit qu'on ne le branche pas maintenant. Écrire « prévu, non branché » ou le retirer. |
| Board GitHub inexistant | `gh auth refresh -s project`, puis le script. Avec une colonne `In Review`. |
| Titre orphelin `# jobAi-api` dans le README | Résidu. |

---

## Rappels de méthode

- **Un ticket, une capacité.** Si Claude Code propose onze fichiers, c'est le signal de découper.
- **Arrête-toi après le plan**, chaque fois. C'est là que corriger coûte une phrase.
- **Lis la migration générée avant de la jouer.** Règle du projet.
- Après chaque ticket : `senior-reviewer`, puis **ta** question à toi — *qu'est-ce que le relecteur n'a pas regardé ?* Son périmètre est le diff ; « le ticket atteint-il son but ? » reste ta responsabilité.
- **5 minutes d'explication à voix haute en anglais** à la fin de chaque soirée. C'est la seule note du bilan qui n'a pas bougé en un mois.

# ADR-14 — La langue et le marché viennent de l'offre, le format reste dans le code, la qualité objective se vérifie à chaque génération et le ton se relit dans un rapport périodique

- **Date** : 2026-10-11
- **Statut** : accepté

## Contexte

Le ticket précédent a livré la plomberie (transaction, course, péremption, ancrage)
avec un prompt volontairement minimal, en français, sans structure imposée. Celui-ci
s'attaque au contenu, et quatre questions doivent être tranchées avant d'y toucher :

- **D'où vient la langue de la lettre.** Le prompt actuel écrit « Tu écris le corps
  d'une lettre de motivation en français » en dur. Une offre en anglais produit
  aujourd'hui une lettre en français — un signal immédiat, pour un recruteur, que le
  candidat n'a pas lu l'annonce.
- **D'où vient le MARCHÉ** — pas seulement la langue. Un marché, c'est un pays plus
  une langue : une lettre montréalaise (250–350 mots, trois paragraphes, ton direct,
  sans politesse à la française) n'a pas la forme d'une lettre parisienne, même
  toutes les deux en français. Indexer le format sur la langue seule confondrait les
  deux et enverrait un format montréalais à une offre parisienne.
- **Comment mesurer qu'une lettre est bonne** sans relire chaque génération à la
  main — et, pour ce qui EST mesurable mécaniquement, que fait-on d'une lettre qui
  échoue la mesure : on la rejette, ou on l'accepte avec un défaut ?
- **Comment garantir que la grille d'évaluation ne consomme jamais de ressources de
  production** — elle appelle un vrai LLM et écrit dans `llm_daily_quotas`, une table
  dont la limite par défaut est de 20 appels par jour et par utilisateur.

Une cinquième contrainte, mécanique plutôt que décisionnelle, découle directement de
la première : `anchoring.ts` a une liste `FRENCH_LETTER_OPENING_WORDS` qui n'existe
qu'en français. Une lettre en anglais ferait rejeter « Dear Hiring Manager » comme
nom propre inventé si cette liste ne suit pas la langue choisie. Langue et liste
d'exclusion changent dans le même geste, pas dans deux décisions séparées.

## Décision

**1. La langue est un champ explicite de l'offre** (`Offer.language`, `'fr' | 'en'`
pour commencer — texte + `CHECK` nommé, pas un `ENUM` natif), posé par l'utilisateur
à la création de l'offre, jamais déduit du texte. Toutes les lettres générées pour
cette offre — y compris une relance après échec — utilisent cette même langue, sans
redemander.

**2. Le marché est `country + language`, sans analyse de texte, et le format est
indexé par marché, jamais par langue seule** — `MARKET_NORMS['ca-fr']`,
`MARKET_NORMS['ca-en']`, même avec deux entrées au lancement. `Offer.country`
(ISO 3166-1 alpha-2 — `'CA'`, `'FR'`... — texte + `CHECK` nommé, pas un `ENUM`
natif) est un champ explicite, demandé à l'utilisateur à la création de l'offre
exactement comme `language`, jamais déduit d'un texte libre. `deriveMarket`, qui
aurait cherché des marqueurs de pays dans `location`, est retirée de la décision :
`location` reste un champ de confort pour l'affichage, il ne porte plus aucune
logique de marché.

`'unknown'` reste une entrée de `MARKET_NORMS`, mais change de sens : ce n'est
plus le résultat d'une analyse de texte ratée, puisqu'il n'y a plus d'analyse —
c'est l'entrée utilisée quand la combinaison `country + language` d'une offre n'a
pas encore de norme écrite (par exemple une offre allemande en anglais, avant
qu'une entrée `MARKET_NORMS['de-en']` n'existe), avec une norme neutre documentée
(fourchette de longueur large, pas de formule d'ouverture/clôture spécifique à un
marché réel) — pas un refus de générer, puisqu'ajouter un marché reste un commit,
pas une opération immédiate.

**3a. Les cinq critères objectifs ne sont pas de même nature — un fait inventé est
une faute, un écart de longueur est une imprécision, un tiret cadratin ou une
formule interdite qui constitue sa propre phrase est une erreur mécaniquement
corrigeable sans jamais appeler le LLM.** Classement, chacun avec sa conséquence :

| Critère                                        | Catégorie                  | Correction                                                 | Tolérance chiffrée                                                                  |
| ---------------------------------------------- | -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ancrage (fait non ancré)                       | **Faute**                  | Rejet immédiat (`generation_failed`)                       | aucune                                                                              |
| Longueur                                       | Imprécision                | Nouvel essai LLM (consigne renforcée)                      | ± 10 % de la largeur de la fourchette du marché (ex. 250–350 mots → toléré 240–360) |
| Nombre de paragraphes                          | Imprécision                | Nouvel essai LLM (consigne renforcée)                      | ± 1 paragraphe par rapport à la cible du marché                                     |
| Formule interdite intégrée à une phrase        | Imprécision                | Nouvel essai LLM (consigne renforcée)                      | 0 occurrence tolérée dans le résultat final, mais pas de rejet au premier coup      |
| Formule interdite constituant sa propre phrase | **Corrigeable sans appel** | Suppression mécanique, avant tout contrôle                 | 0 occurrence après correction, jamais de rejet pour ce sous-cas                     |
| Tirets cadratins                               | **Corrigeable sans appel** | Remplacement mécanique (`replaceAll`), avant tout contrôle | 0 occurrence après correction, jamais de rejet                                      |

**La catégorie « corrigeable sans appel » n'ajoute pas une troisième voie
arbitraire : elle existe parce que ces deux défauts ne demandent aucune
compréhension du contenu pour être corrigés.** Un tiret cadratin se remplace par
une virgule ou un point sans jamais changer le sens. Une formule interdite qui
constitue sa propre phrase (« N'hésitez pas à me contacter. ») se supprime sans
laisser de trou grammatical. La correction s'applique sur le texte brut renvoyé
par `generateText`, avant que `checkAnchoring` et le futur `checkMarketFormat` ne
voient le résultat — ces deux contrôles ne peuvent donc jamais échouer sur ces
deux cas, puisqu'ils sont déjà corrigés quand les contrôles s'exécutent. Ni l'un
ni l'autre ne coûte de quota ni de budget de temps.

Une formule interdite qui n'est **pas** sa propre phrase — une clause insérée
dans une phrase plus longue (« Fort de mon expérience, je... ») — reste une
**imprécision** : la retirer mécaniquement laisserait une virgule ou une
conjonction orpheline, donc seule une réécriture complète par le LLM restaure une
phrase grammaticale. C'est cette distinction, pas la nature de la formule
elle-même, qui décide de la catégorie.

Une **faute** (ancrage) est **rejetée immédiatement** — `generation_failed`, motif
lisible, pas de nouvel essai automatique : inventer un fait n'est pas corrigé par
le simple fait de recommencer, l'utilisateur relance lui-même via `POST`, comme
aujourd'hui.

Une **imprécision** déclenche un **nouvel essai avec une consigne renforcée** —
mais PAS dans le budget de `LLM_MAX_ATTEMPTS`. Ce budget vit à l'intérieur d'un
seul appel à `GuardedLlmService.generateText` (`attemptWithRetries`) : il couvre
les tentatives de TRANSPORT (429, 5xx) d'UN appel, pas les appels que `documents`
refait par-dessus pour corriger le format. Chaque nouvel essai de format est un
nouvel appel à `generateText` au complet — avec sa propre consommation de quota
(`quota.consume` est dans la boucle de `attemptWithRetries`, une fois par
tentative de transport qui atteint réellement le fournisseur) et son propre
budget de temps plein (`remainingBudgetMs` repart de `totalBudgetMs` à chaque
appel). Le contrôle de format vit hors de `GuardedLlmService`, dans `documents` :
il ne peut pas réutiliser un budget qui a déjà fini de s'exécuter.

**Le nouvel essai de format a donc son propre budget nommé, séparé :
`FORMAT_MAX_ATTEMPTS = 2`** (le nombre total d'appels à `generateText` par
lettre, premier essai compris — donc une seule relance de format au plus). Si
l'écart reste dans la tolérance une fois ce budget épuisé, la lettre est livrée
telle quelle — la tolérance définit ce qui est assez bon pour partir sans
relance infinie. Si l'écart dépasse encore la tolérance, c'est un rejet
(`generation_failed`), au même titre qu'une faute à ce stade.

**Parce que `FORMAT_MAX_ATTEMPTS` double la consommation de quota par lettre dans
le cas courant (chiffré dans les conséquences ci-dessous), `LLM_DAILY_QUOTA_PER_USER`
passe de 20 à 40.** Ce n'est pas une conséquence qu'on constate après coup : la
limite de 20 promettait 20 lettres par jour à l'utilisateur, pas 20 appels LLM —
la laisser telle quelle ferait chuter ce nombre à 10 sans qu'aucune décision ne
l'ait choisi. Doubler la constante restaure la promesse initiale dans le cas
courant ; le pire cas (épuisement des tentatives de transport à chaque essai de
format) reste dégradé, de 20 à 6 lettres par jour au lieu de 3 — accepté pour la
même raison que `LLM_MAX_ATTEMPTS` existe déjà : un pire cas rare ne doit pas
dicter le réglage du cas courant.

Techniquement, un nouveau contrôle (`checkMarketFormat` ou équivalent) rejoint
`checkAnchoring` dans le même pipeline de validation, à trancher à l'étape de
l'interface. Le coût réel de ce deuxième budget — sur le quota et sur la
péremption — est chiffré dans les conséquences ci-dessous, pas laissé implicite.

**3b. Le ton reste jugé par un humain, via un rapport périodique, jamais par un
test automatique ni par un second LLM-juge.** Un script (pas un test Vitest, pas
lancé en CI) fait tourner `generateCoverLetter` contre une vraie clé API et dix
offres réelles fixées, et produit un rapport : le résultat des contrôles objectifs
(3a) ET le texte généré en entier, pour qu'un humain juge ce qu'aucun des deux ne
peut trancher — le ton, les clichés non couverts par la liste de formules
interdites, l'impression générale.

**4. Garde-fou obligatoire sur le script d'évaluation : il refuse de démarrer si
l'hôte effectif de connexion n'est pas local** (`localhost`/`127.0.0.1`/`::1`).
Pas une vérification de `DATABASE_URL` : cette variable n'existe qu'en production
(Render/Neon) — un `.env` local n'a que les `POSTGRES_*` séparées, `DATABASE_URL`
y est absente, et un garde-fou qui la lit se contenterait de ne jamais se
déclencher en local, ce qui est l'inverse de protéger quoi que ce soit. Le
garde-fou importe `dataSourceOptions` (`src/config/data-source.ts`, déjà la
source unique pour Nest et le CLI de migration) et lit l'hôte réellement résolu —
`new URL(dataSourceOptions.url).hostname` si la forme `DATABASE_URL` a été
utilisée, `dataSourceOptions.host` sinon — vérifié avant toute connexion, erreur
explicite sinon. Dix offres réelles, c'est dix appels LLM et dix écritures dans
`llm_daily_quotas` : sur la base de production, contre le quota réel d'un
utilisateur réel, par défaut 20 par jour. Le script n'a textuellement aucune
raison de jamais toucher une base distante.

## Alternatives écartées

### Langue détectée automatiquement depuis le texte de l'offre

Écartée : exige une dépendance de détection de langue (ou un appel LLM dédié,
rallongeant et re-fragilisant le chemin), avec un vrai risque de mauvaise détection
sur un titre court ou une offre bilingue — fréquente au Canada, justement le premier
marché visé (« Développeur Backend / Backend Developer »). Un champ explicite coûte
une question à la création de l'offre ; une mauvaise détection coûte une lettre dans
la mauvaise langue envoyée à un recruteur.

### Langue dérivée du profil de l'utilisateur

Écartée : `profile.languages` liste les langues parlées par le candidat, pas la
langue dans laquelle il veut écrire CETTE lettre à CETTE offre. Un candidat
bilingue postule en anglais à une offre anglophone et en français à une offre
francophone — c'est l'offre qui fixe la langue de la réponse, pas le CV du candidat.

### Format indexé par langue seule

Écartée — c'est l'erreur que la correction de cette ADR vient de corriger : la
langue ne dit rien du pays. Une erreur de format révélée tard, après que le produit
soit vendu dans un deuxième pays francophone ou anglophone, coûterait une migration
de données en plus du code ; distinguer marché et langue dès la première entrée ne
coûte rien de plus aujourd'hui qu'une clé composite.

### Format de marché en base de données

Écartée pour l'instant, par le même raisonnement que Redis dans l'ADR-13 : il n'y a
aucune interface d'administration dans ce projet, et le nombre de marchés au
lancement (deux) ne justifie pas un modèle de données, une migration, une couche de
cache et une invalidation pour une poignée de constantes qui changent rarement.
Modifier une entrée de `MARKET_NORMS` est un commit relu et déployé, au même rythme
que n'importe quel autre changement de ce projet.

### Note qualité calculée par un second appel LLM (« LLM-as-judge »)

Écartée : ça ajoute une deuxième dépendance lente et faillible pour juger la
première, avec son propre risque de biais et d'hallucination — exactement le genre
de chaîne que `GuardedLlmService` existe pour éviter de construire sans y penser.

### Aucune grille d'évaluation, seulement des tests unitaires sur le prompt

Écartée : un test unitaire prouve que le prompt CONTIENT une instruction de longueur
ou de structure — jamais que le LLM l'a RESPECTÉE. C'est précisément ce que 3a
automatise désormais à chaque génération ; la grille existe pour ce que même 3a ne
peut pas mesurer.

### Traiter les cinq critères objectifs comme des fautes, rejet immédiat pour tous

Écartée : fait payer un appel LLM pour ne rien livrer sur un écart de quelques mots
ou une formule isolée, alors qu'une consigne renforcée la corrige fiablement la
plupart du temps — le modèle manquera une fourchette stricte souvent, pas rarement.
Seule l'invention d'un fait justifie un rejet sans tentative de correction : rien
dans la nature d'un écart de longueur ne garantit qu'un deuxième essai la reproduit,
contrairement à une hallucination.

### Accepter une lettre hors format avec un défaut signalé

Écartée : contredit la règle déjà actée pour l'ancrage (« on ne livre pas un
document inventé ») sans raison de la traiter différemment pour le format — les
deux sont des critères objectifs que le produit peut vérifier avant de livrer.
Une acceptation silencieuse, c'est le défaut qu'aucune décision n'empêcherait.

## Conséquences

- **Changement cassant de `POST /offers`, sur deux champs dans la même rupture** :
  `language` ET `country` deviennent chacun un champ obligatoire du corps de la
  requête, au même titre que la suppression de `POST /profiles` au ticket A0 —
  tout client existant qui n'envoie pas les deux verra sa requête rejetée. Un seul
  changement cassant à annoncer, pas deux successifs.
- **Le remplissage des offres déjà en base est une devinette assumée, pas un
  silence — sur les deux colonnes.** `language` ET `country` deviennent chacune
  `NOT NULL`, remplies respectivement à `'en'` et `'CA'` pour les lignes
  existantes — un choix qui tombe volontairement sur une entrée déjà définie de
  `MARKET_NORMS` (`'ca-en'`), pas sur `'unknown'`. Une vraie supposition, fausse
  pour toute offre déjà en base dont le marché réel diffère. Acceptée parce qu'il
  n'existe aujourd'hui aucun utilisateur réel (« Zéro utilisateur », ADR-13) : le
  coût d'une mauvaise supposition sur des données de développement est nul. Les
  deux migrations suivent le schéma de l'ADR-13 : colonne nullable, `UPDATE ...
SET language = 'en' WHERE language IS NULL`, `UPDATE ... SET country = 'CA'
WHERE country IS NULL`, puis `SET NOT NULL` sur chacune — jamais un `ADD NOT
NULL` direct.
- `FRENCH_LETTER_OPENING_WORDS` devient une table par langue
  (`LETTER_OPENING_WORDS_BY_LANGUAGE` ou équivalent) ; `buildAnchoringFacts` doit
  recevoir la langue pour choisir la bonne liste — un paramètre de plus sur une
  signature déjà publique, à faire approuver à l'étape de l'interface.
- Un rejet 3a (format non conforme, hors tolérance même après relance) consomme
  un appel LLM déjà facturé sans jamais livrer de document, exactement comme un
  rejet d'ancrage aujourd'hui — accepté pour la même raison : livrer un document
  qu'on sait non conforme coûte plus cher à la confiance que de le refuser.
- **`FORMAT_MAX_ATTEMPTS` multiplie le quota ET le temps consommés par lettre**,
  puisque chaque essai de format est un appel `generateText` complet, pas une
  itération interne à un budget déjà existant (`quota.consume` est dans la boucle
  de `attemptWithRetries`, une fois par tentative de transport ; `remainingBudgetMs`
  repart de `totalBudgetMs` à chaque appel). Cette multiplication ne touche que les
  vraies imprécisions (longueur, nombre de paragraphes, formule interdite intégrée
  à une phrase) : les tirets cadratins et les formules interdites qui sont leur
  propre phrase sont corrigés avant tout contrôle (3a) et ne déclenchent jamais ce
  deuxième appel.
  - **Quota, cas normal** (aucune tentative de transport nécessaire) :
    `FORMAT_MAX_ATTEMPTS` × 1 unité = **2 unités par lettre**. C'est la raison de
    la décision, en 3a, de monter `LLM_DAILY_QUOTA_PER_USER` de 20 à 40 : à
    l'ancienne limite, un utilisateur serait passé de 20 lettres par jour à **10**
    sans qu'aucune décision ne l'ait choisi ; à la nouvelle, le cas courant reste
    à **20**.
  - **Quota, pire cas** (chaque essai de format épuise aussi ses
    `LLM_MAX_ATTEMPTS = 3` tentatives de transport) : 2 × 3 = **6 unités par
    lettre** → **6 lettres par jour** à la nouvelle limite de 40 (contre 3 à
    l'ancienne limite de 20) — un pire cas rare, pas le réglage qui dicte la
    constante.
  - **Temps, pire cas** : `FORMAT_MAX_ATTEMPTS` × `LLM_TOTAL_BUDGET_MS` =
    2 × 55 000 ms = **110 000 ms** de pur temps LLM, avant même le temps non-LLM
    (profil, double contrôle ancrage + format, transaction d'écriture). Contre
    l'ancien `GENERATION_STALE_TIMEOUT_MS` de 120 000 ms, la marge réelle devenait
    nulle à négative une fois ce temps non-LLM compté — la course même que le
    ticket précédent a protégée : `markSucceeded` aurait perdu contre
    `markFailedIfStale`, et une lettre déjà payée aurait été jetée.
  - **`GENERATION_STALE_TIMEOUT_MS` monte donc à 150 000 ms** — 40 s de marge
    réelle au-delà du pire cas LLM pur, assez pour le temps non-LLM. La
    contrainte vérifiée au démarrage doit devenir
    `GENERATION_STALE_TIMEOUT_MS ≥ FORMAT_MAX_ATTEMPTS × LLM_TOTAL_BUDGET_MS +
marge` (150 000 ≥ 2 × 55 000 + 10 000) — le refine actuel dans
    `env.validation.ts` (`≥ LLM_TOTAL_BUDGET_MS + marge`, sans le facteur
    `FORMAT_MAX_ATTEMPTS`) est maintenant incorrect et doit être corrigé à
    l'implémentation, pas laissé tel quel.
  - **Fait produit, pas seulement technique : 150 000 ms est aussi l'attente
    maximale visible par l'utilisateur avant qu'une réponse — succès ou échec —
    n'arrive, jusqu'à 2 min 30 pour une seule lettre dans le pire cas.** On monte
    ce plafond plutôt que de faire porter une échéance décroissante au second
    appel de `generateText`, parce que `GuardedLlmService.generateText` n'expose
    aujourd'hui aucun paramètre d'échéance — une limite actuelle de
    l'implémentation, pas une contrainte définitive : propager un budget restant
    plutôt que reconduire un budget plein à chaque essai de format réduirait ce
    pire cas, mais reste hors du périmètre de ce ticket.
- Ajouter un marché demande un commit dans `MARKET_NORMS`, relu comme le reste du
  code — pas de délai d'exploitation, mais pas de self-service pour une personne non
  développeuse non plus : aucun outil ici ne permet de corriger un champ de marché
  sans passer par un développeur.
- La grille d'évaluation consomme un vrai quota d'API (dix offres × un vrai appel
  LLM) à chaque exécution, sur une base locale uniquement (décision 4) — jamais en
  CI, jamais sur une base distante, jamais sur une clé qui n'est pas celle du
  développeur qui la lance volontairement.
- Rien ne garantit mécaniquement qu'une lettre jugée « bonne » par la grille le reste
  après le prochain changement de prompt, sauf à la relancer à la main — un
  processus, pas un garde-fou automatique, pour la partie 3b seulement (3a, elle,
  est un garde-fou automatique réel).

## Ce qui remettrait cette décision en cause

- **Un marché dont la langue ne peut pas être fixée une fois pour toutes par
  l'offre** — par exemple une offre qui accepterait une réponse dans plusieurs
  langues au choix du candidat. Reviendrait sur la décision 1.
- **Une offre réelle (pas de développement) créée avant ce ticket, dont la langue
  réelle n'est pas `'en'` ou dont le pays réel n'est pas `'CA'`** — invaliderait la
  supposition de remplissage et demanderait une correction de données ciblée, pas
  une réouverture de la décision elle-même.
- **Un nombre de marchés qui rend un commit par changement de norme réellement
  lent** à livrer (plusieurs par semaine, ou une demande de self-service par une
  personne non développeuse) — déclencherait le passage de `MARKET_NORMS` vers une
  table.
- **Une dérive de ton répétée que la grille ne détecte pas** parce que ses dix
  offres fixes ne couvrent plus les cas réels — signe qu'il faut l'élargir ou la
  faire tourner plus souvent, pas qu'elle est inutile.
- **Le volume de génération qui rend la relecture humaine périodique (3b)
  intenable** — seuil auquel une automatisation plus poussée (pas nécessairement un
  LLM-juge) deviendrait justifiée.

## À ne pas perdre au plan

Rappel explicite, puisque cette ADR ne les nomme pas ailleurs : les neuf champs du
profil que le prompt actuel ignore — `headline`, `summary`, `location`,
`willingToRelocate`, `workAuthorizationNote` (en premier : c'est le premier filtre
d'un recruteur canadien, et il doit être transmis tel quel, jamais reformulé ni
déduit), `education`, `languages`, `certifications`, `links` — sont dans le
périmètre du ticket, pas de cette ADR, et doivent figurer dans le plan qui suit.

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

**2. Le marché est `country + language`, sans analyse de texte — mais la norme
qui en découle hérite d'une famille de format, elle n'est pas une entrée par
paire.** `Offer.country` (ISO 3166-1 alpha-2 — `'CA'`, `'FR'`... — texte + `CHECK`
nommé, pas un `ENUM` natif) reste un champ explicite, demandé à l'utilisateur à
la création de l'offre exactement comme `language`, jamais déduit d'un texte
libre. `deriveMarket`, qui aurait cherché des marqueurs de pays dans `location`,
reste retirée de la décision : `location` reste un champ de confort pour
l'affichage, il ne porte plus aucune logique de marché.

**Les pays se regroupent en onze familles de format** — nord-américaine,
Commonwealth, française, allemande, Europe du Sud, Europe du Nord, Europe
centrale et de l'Est, Amérique latine, Golfe, Asie de l'Est, Asie du Sud. Un
pays sans entrée propre hérite intégralement de la norme de sa famille ; une
exception pays ne porte **que les champs qui diffèrent** de cette famille, jamais
une norme complète dupliquée. Quelques repères pour peupler les familles :
l'Afrique francophone suit le modèle français, l'Afrique anglophone suit le
modèle Commonwealth, l'Afrique lusophone suit le modèle Europe du Sud —
l'héritage se fait par ressemblance de format, pas par continent. Trois
exceptions à écrire dès ce ticket : **Afrique du Sud** (références nommées
exigées, pas de photo), **Nigeria** (le NYSC apparaît dans la section
expérience), **Ghana** (les certifications se placent dans la ligne du nom, pas
dans une section séparée).

**Les normes passent derrière un port, `MarketNormProvider`.** L'implémentation
d'aujourd'hui lit des fichiers de données versionnés dans le dépôt, validés par
Zod **au démarrage** : une norme invalide fait échouer le boot, jamais une
génération en cours — l'erreur doit apparaître avant qu'un seul utilisateur ne
la rencontre, pas dans les logs d'une requête. Une implémentation en base de
données reste possible plus tard, avec le même déclencheur que Redis à
l'ADR-13 : pas de modèle de données ni de couche de cache pour un nombre de
normes qui tient aujourd'hui dans des fichiers relus en revue de code.

**Chaque norme porte sa provenance, sa date de dernière vérification, et un
niveau de confiance** — `verified` / `inherited` / `neutral`. Ce n'est pas un
détail d'audit : il n'existe aucune source officielle des normes de CV ou de
lettre par pays, et présenter une norme héritée ou neutre comme vérifiée serait
une fausse affirmation que le produit ferait à la place de l'utilisateur.

**Le point d'entrée prend un contexte, pas deux valeurs positionnelles** :
`resolveNorm({ country, language, userId? })`. `userId` est accepté mais ignoré
aujourd'hui — une réservation de forme, pas une fonctionnalité. La fusion est
ordonnée et nommée, dans cet ordre précis : **famille → exception pays →
langue → (V2) utilisateur**. Chaque champ d'une norme porte aussi un indicateur
`userOverridable`, posé dès maintenant même si rien ne le lit encore : certains
champs ne seront **jamais** ouverts à une préférence personnelle — un
utilisateur ne pourra jamais activer la photo sur un CV destiné au marché
canadien, quel que soit son souhait, parce que ce n'est pas une question de
goût mais une norme de marché.

**La norme résolue porte sa propre identification, et une branche par type de
document.** `MarketNorm` expose `family` et `language` (ce qui a été résolu),
puis `verbLadder` et `superlatives` au même niveau — pas sous une branche
document : l'échelle de verbes ou la liste de superlatifs d'une langue ne
changent pas selon qu'on écrit une lettre ou un CV (décision 5, « sur la
lettre comme sur le CV »), les loger sous une seule des deux forcerait l'autre
à relire l'intérieur de la première ou à dupliquer la liste. Vient ensuite une
branche par type de document : `letter` (fourchette de longueur, paragraphes,
formules d'ouverture/clôture) et `cv`.

**`personal: PersonalPolicy` se déclare aussi à la racine, et se remplit dès ce
ticket — contrairement à `cv`.** Photo, date de naissance, état civil,
nationalité, autorisation de travail : chaque champ vaut `'never'`,
`'optional'` ou `'expected'`. `cv` n'a pas de contenu aujourd'hui parce que rien
ne le consomme avant le ticket F ; `personal` est différent, la recherche
existe déjà et ne dépend d'aucun pipeline CV pour avoir un sens — la retenir
jusqu'au ticket F serait forcer le port à changer de forme deux fois pour la
même raison qu'on vient d'éviter pour `cv`. Non consommé par le pipeline lettre
d'aujourd'hui (aucun contrôle ADR-16 ne le lit), mais déjà vrai, déjà typé.

**`cv` est déclaré dès ce ticket, et volontairement vide.** Les exceptions déjà
écrites plus haut — l'absence de photo pour l'Afrique du Sud, le NYSC pour le
Nigeria, la ligne de certifications pour le Ghana — sont des faits de CV que
rien ne porte encore : pages, ordre des sections, références, format de date,
champs locaux, règles ATS restent à écrire au ticket F. Un port dont le type de
retour change au ticket suivant n'est pas un port, c'est ce que cette décision
existe pour éviter : poser la forme maintenant, même vide, évite exactement ça.

`'unknown'` reste l'entrée de secours la plus neutre de ce système, mais change
de sens : ce n'est plus le résultat d'une analyse de texte ratée, puisqu'il n'y
a plus d'analyse — c'est la norme utilisée quand ni la famille ni aucune
exception pays ne couvrent encore la combinaison `country + language` d'une
offre, avec un niveau de confiance `neutral` — pas un refus de générer, puisqu'
ajouter une famille ou une exception reste un commit, pas une opération
immédiate.

**« Le repli le plus strict » n'est pas une règle uniforme sur `unknown` — elle
ne s'applique qu'aux champs dont le risque est asymétrique.** Un champ est à
risque asymétrique quand l'inclure peut faire écarter la candidature alors que
l'omettre ne le peut jamais : photo, date de naissance, nationalité,
autorisation de travail. Pour ces champs, `unknown.personal` prend le plus
strict — tout à `'never'` — parce que deviner faux dans le sens « expected »
coûte une candidature, deviner faux dans le sens « never » ne coûte qu'une
mention absente. `unknown.letter` reste permissif (fourchette de longueur
large, pas de formule d'ouverture/clôture spécifique à un marché réel) parce
que la longueur et la structure n'ont pas cette asymétrie — une fourchette
étroite serait elle-même un marché réel (montréalais ou parisien), pas un
repli neutre : resserrer « par prudence » réintroduirait exactement l'erreur
que cette ADR vient de corriger. `unknown.cv` suivra la règle stricte au
ticket F, pour les mêmes raisons que `personal` : les champs de CV qu'il
portera (photo, références, format de date) sont du même genre à risque
asymétrique.

**3a. Les critères objectifs ne sont pas tous de même nature — un fait inventé est
une faute, un écart de longueur est une imprécision, un tiret cadratin ou une
formule interdite qui constitue sa propre phrase est une erreur mécaniquement
corrigeable sans jamais appeler le LLM.** Classement, chacun avec sa conséquence :

| Critère                                        | Catégorie                  | Correction                                                 | Tolérance chiffrée                                                                                        |
| ---------------------------------------------- | -------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Ancrage (fait non ancré)                       | **Faute**                  | Rejet immédiat (`generation_failed`)                       | aucune                                                                                                    |
| Longueur                                       | Imprécision                | Nouvel essai LLM (consigne renforcée)                      | ± 10 % de la largeur de la fourchette du marché (ex. 250–350 mots → toléré 240–360)                       |
| Nombre de paragraphes                          | Imprécision                | Nouvel essai LLM (consigne renforcée)                      | ± 1 paragraphe par rapport à la cible du marché                                                           |
| Formule d'ouverture                            | Imprécision                | Nouvel essai LLM (consigne renforcée)                      | Doit correspondre à `letter.openingFormula` de la norme résolue ; absente ou différente déclenche l'essai |
| Formule de clôture                             | Imprécision                | Nouvel essai LLM (consigne renforcée)                      | Doit correspondre à `letter.closingFormula` de la norme résolue ; absente ou différente déclenche l'essai |
| Formule interdite intégrée à une phrase        | Imprécision                | Nouvel essai LLM (consigne renforcée)                      | 0 occurrence tolérée dans le résultat final, mais pas de rejet au premier coup                            |
| Formule interdite constituant sa propre phrase | **Corrigeable sans appel** | Suppression mécanique, avant tout contrôle                 | 0 occurrence après correction, jamais de rejet pour ce sous-cas                                           |
| Tirets cadratins                               | **Corrigeable sans appel** | Remplacement mécanique (`replaceAll`), avant tout contrôle | 0 occurrence après correction, jamais de rejet                                                            |

Sans ces deux lignes, `letter.openingFormula` et `letter.closingFormula`
existeraient dans la norme sans qu'aucun contrôle ne les lise — exactement le
genre de champ mort que cette ADR refuse ailleurs. Une lettre montréalaise ne
s'ouvre pas comme une lettre parisienne (contexte) ; c'est cette paire de
critères qui le fait respecter, pas seulement la longueur et les paragraphes.

**Les deux formes de formule interdite partagent une seule liste, par langue :
`MarketNorm.letter.forbiddenFormulas`, scindée en `standalone` et `embedded`.**
Elle vit sous `letter`, pas au niveau de la langue comme `verbLadder` ou
`superlatives` : rien dans cette ADR n'affirme qu'un cliché de lettre de
motivation s'applique à un CV, contrairement à la décision 5. Si le ticket F
en a besoin pour le CV, il le dira lui-même plutôt que d'hériter d'une
affirmation que cette ADR n'a jamais faite.

**C'est la position dans le texte produit qui tranche la catégorie, jamais le
mot lui-même.** Le même cliché est **corrigeable sans appel** s'il forme, dans
cette occurrence, une phrase entière — rien avant, rien après dans la même
phrase, elle se retire sans laisser de trou. Il est une **imprécision** s'il
apparaît à l'intérieur d'une phrase plus longue, quelle que soit la liste
(`standalone` ou `embedded`) d'où provient la chaîne cherchée. Les deux listes
cataloguent la matière à chercher — une majorité de phrases complètes dans
`standalone`, une majorité de fragments dans `embedded`, parce que c'est leur
forme la plus fréquente — elles ne décident pas la catégorie à la place du
texte réellement produit.

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
utilisateur réel, par défaut 40 par jour (décision 3a). Le script n'a
textuellement aucune raison de jamais toucher une base distante.

**5. Reformuler est autorisé, sur la lettre comme sur le CV.** Dire la même
chose avec des mots plus justes n'est pas inventer, et l'interdire enlèverait
au produit la seule valeur qu'il ajoute à un simple copier-coller du profil.
L'ancrage (3a) interdit d'ajouter un fait ; cette décision trace la frontière
de ce qui reste une reformulation légitime du même fait. Trois contrôles
bornent cette liberté, tous **sans modèle** — déterministes, dans le même
esprit que 3a. **Mais les trois ne sont pas de même nature, exactement comme en
3a** — une valeur qui change est une faute, un rang de verbe qui monte est une
imprécision que la source suffit à corriger, un superlatif ajouté est
mécaniquement retirable :

| Contrôle                                                                                    | Catégorie                  | Correction                                 | Raison                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité des faits (chiffres, noms propres, dates, durées, volumes)                         | **Faute**                  | Rejet immédiat (`generation_failed`)       | Un chiffre qui change de valeur ne se répare pas sans relire la source, et un modèle qui l'a fait une fois le refera.                                |
| Montée en responsabilité (`participé < contribué < développé < réalisé < conduit < dirigé`) | Imprécision                | Nouvel essai LLM, informé du verbe source  | Le verbe source est connu : l'écart est corrigeable de façon fiable. Rejeter une lettre déjà payée pour un rang d'échelle jette de l'argent.         |
| Superlatif absent de la source (« exceptionnel », « unique »...)                            | **Corrigeable sans appel** | Suppression mécanique, avant tout contrôle | Retirer « exceptionnelle » de « une expérience exceptionnelle » laisse une phrase grammaticale au sens intact — exactement le cas du tiret cadratin. |

L'**identité des faits** vérifie une valeur, pas sa présence : l'ancrage (3a)
vérifie qu'un fait existe dans la source, ce contrôle vérifie qu'il n'a pas
changé en chemin — même conséquence que l'ancrage, rejet immédiat, parce qu'un
modèle qui a changé une valeur une fois la changera de nouveau au prochain
essai.

**La correspondance se fait par ensemble, pas par appariement à une puce.**
Pour une lettre en prose, rien ne dit à quelle ligne précise du profil une
phrase produite se rapporte. Une valeur trouvée dans le texte produit (un
chiffre, une date, une durée, un volume, un nom propre) est conforme si sa
forme normalisée appartient à l'ensemble des valeurs connues de ce même genre,
dans tout le profil et l'offre — jamais en la rapprochant d'une puce précise.
Une valeur qui n'appartient à aucun ensemble connu de son genre est la faute :
inventée purement, ou mutation d'une valeur réelle, le contrôle ne distingue
pas les deux, parce que les deux ont la même conséquence — rejet immédiat.

La **montée en responsabilité** se contrôle contre un champ nommé de la norme,
`MarketNorm.verbLadder` — par langue, posé au niveau de la langue plutôt que
sous `letter` (voir décision 2) : une langue sans échelle écrite ne peut tout
simplement pas être contrôlée.

**Chaque rang est une liste de synonymes, pas un mot** — `verbLadder:
string[][]`, pas `string[]`. Six mots plats ne se déclenchent presque jamais :
le modèle écrit « piloté », « orchestré », « owned », « spearheaded », et
aucun des quatre n'apparaîtrait dans une échelle à six entrées. Un contrôle qui
ne se déclenche jamais n'est pas une protection, c'est un test vert parce que
rien ne l'atteint.

**Pour une lettre, aucune phrase produite ne correspond un pour un à une puce
du profil** — rien ne dit que « dirigé » reformule précisément telle ligne
d'expérience plutôt qu'une autre. La règle est donc volontairement grossière :
**le rang du verbe produit ne dépasse jamais le rang le plus élevé présent
dans le profil**, pas le rang d'une puce précise. Grossier, mais défini, et ça
attrape le vrai abus : un profil qui ne dépasse jamais « développé » ne
produit pas une lettre qui dit « dirigé ». Le ticket F pourra resserrer vers
une correspondance puce à puce si le CV, structuré en sections, le permet
mieux qu'une lettre en prose.

**Un verbe absent de toutes les listes n'est pas une violation** — un
passe-droit assumé, pas un oubli à corriger plus tard : une échelle fermée ne
peut pas couvrir tous les verbes d'une langue, et refuser une lettre sur un mot
qu'elle n'a pas prévu serait pire que la laisser passer. Une liste élargie
réduit ce passe-droit, elle ne le supprime jamais complètement — ce n'est pas
son but.

Le rang rejoint la grille 3a comme imprécision : le verbe source est connu,
donc le tour de correction peut viser une valeur précise plutôt que redemander
une génération à l'aveugle (la forme de cette correction — quelle valeur
attendue porte la violation — est posée dans l'ADR-16).

Le **superlatif ajouté** a besoin du même traitement : `MarketNorm.superlatives`,
une liste fermée par langue, au même niveau que `verbLadder` — sans elle, ce
contrôle n'a rien à chercher. Il rejoint les tirets cadratins en « corrigeable
sans appel » :
le retirer ne laisse jamais de trou grammatical, donc aucune des deux raisons
qui justifient un appel LLM (recomposer une phrase, ou viser une valeur
précise) ne s'applique — mais contrairement au tiret cadratin, qui ne demande
rien, et à la formule interdite, qui demande la norme, ce contrôle demande en
plus la source (profil et offre) : savoir qu'un superlatif est « ajouté »
suppose de savoir qu'il n'y était pas déjà. L'ADR-16 tranche où ce calcul a
lieu dans le pipeline.

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
aucune interface d'administration dans ce projet, et onze familles plus une
poignée d'exceptions pays ne justifient pas un modèle de données, une migration,
une couche de cache et une invalidation pour des constantes qui changent
rarement. Modifier ou ajouter une entrée reste un commit relu et déployé, au
même rythme que n'importe quel autre changement de ce projet — c'est précisément
ce que le port `MarketNormProvider` encode : une interface stable, pas un
couplage à son implémentation actuelle en fichiers.

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

- **`MarketNorm.cv` est vide à l'issue de ce ticket, et c'est volontaire, pas un
  oubli.** Les exceptions pays qui le concernent (photo, NYSC, ligne de
  certifications) sont déjà écrites plus haut dans cette ADR sans que rien ne
  les porte encore dans le type — une relecture future qui trouverait `cv`
  vide ne doit pas le corriger en silence ni le lire comme du travail oublié :
  c'est le ticket F qui le remplit, précisément parce que poser la forme du
  port avant d'avoir le contenu évite de changer son type de retour plus tard.
- **`MarketNorm.personal` est rempli dès ce ticket, mais non consommé par le
  pipeline lettre.** Aucune étape de l'ADR-16 ne le lit aujourd'hui — il
  attend le CV (ticket F), seul document où photo/date de naissance/état
  civil/nationalité ont un sens. Une relecture future qui le trouverait
  inutilisé ne doit pas le lire comme du code mort à retirer : la recherche
  qu'il porte (par famille, verrouillée par un test de donnée par famille)
  est le travail coûteux, le brancher au CV est la partie bon marché.
- **La sélection des puces d'expérience pertinentes pour l'offre n'est pas
  traitée par ce ticket.** Le prompt transmet aujourd'hui toutes les puces de
  chaque expérience, sans les choisir par rapport à CETTE offre — le manque
  n°5 du ticket original. Choisir suppose de savoir quelles exigences
  l'annonce porte, ce que seule l'extraction structurée du ticket J produit ;
  sans elle, « pertinent » n'a aucune définition vérifiable, et le trancher
  ici reviendrait à demander au modèle de choisir — l'inverse de « sélectionner,
  jamais réécrire », qui doit rester un calcul, pas un jugement. Une issue
  dédiée, liée au ticket J, porte ce travail séparément.
- **Un document peut désormais être refusé avant toute génération.** Les
  rejets décrits plus haut (ancrage, reformulation en 5, format hors
  tolérance) supposent tous qu'au moins un appel LLM a déjà eu lieu. Le pré-vol
  du pipeline partagé (ADR-16) ajoute un chemin de rejet qui précède le premier
  appel : si le profil ou le marché ne suffisent pas pour tenter une
  génération honnête, aucun appel n'est fait, aucun quota n'est consommé.
- **Changement cassant de `POST /offers`, sur deux champs dans la même rupture** :
  `language` ET `country` deviennent chacun un champ obligatoire du corps de la
  requête, au même titre que la suppression de `POST /profiles` au ticket A0 —
  tout client existant qui n'envoie pas les deux verra sa requête rejetée. Un seul
  changement cassant à annoncer, pas deux successifs.
- **Le remplissage des offres déjà en base est une devinette assumée, pas un
  silence — sur les deux colonnes.** `language` ET `country` deviennent chacune
  `NOT NULL`, remplies respectivement à `'en'` et `'CA'` pour les lignes
  existantes — un choix qui tombe volontairement sur une combinaison déjà
  couverte par la famille nord-américaine (`CA` + `en`), pas sur `'unknown'`.
  Une vraie supposition, fausse
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
  à une phrase, montée en responsabilité en décision 5) : les tirets cadratins,
  les formules interdites qui sont leur propre phrase, et les superlatifs ajoutés
  sont corrigés avant tout contrôle (3a et 5) et ne déclenchent jamais ce
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
- Ajouter une famille ou une exception pays demande un commit dans les fichiers
  de normes derrière `MarketNormProvider`, relu comme le reste du code — pas de
  délai d'exploitation, mais pas de self-service pour une personne non
  développeuse non plus : aucun outil ici ne permet de corriger un champ de
  marché sans passer par un développeur.
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
- **Un nombre de familles ou d'exceptions qui rend un commit par changement de
  norme réellement lent** à livrer (plusieurs par semaine, ou une demande de
  self-service par une personne non développeuse) — déclencherait le passage
  des fichiers de normes vers une table, derrière le même port
  `MarketNormProvider`.
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

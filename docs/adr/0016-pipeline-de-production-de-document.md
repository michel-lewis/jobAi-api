# ADR-16 — Un document se produit en quatre étapes : pré-vol, génération, correction mécanique, vérification indépendante

- **Date** : 2026-10-16
- **Statut** : accepté

## Contexte

L'ADR-14 pose une politique de qualité et de correction — ancrage, reformulation,
format, catégorie « corrigeable sans appel », budget `FORMAT_MAX_ATTEMPTS` — mais
l'écrit pour un seul type de document : la lettre de motivation. Le CV a besoin
de la même forme de contrôle (des défauts mécaniquement corrigeables, une
vérification des faits, une vérification du format, un tour de correction), pas
d'une politique différente. Faire vivre cette forme dans le module de la lettre,
ou la réécrire à l'identique dans celui du CV, créerait deux implémentations du
même mécanisme, avec le risque qu'elles divergent en silence dès que l'une des
deux reçoit un correctif que l'autre ne reçoit pas.

Cet ADR sépare donc la **forme** du pipeline (générique, partagée, définie ici)
des **seuils et noms propres à la lettre** (`FORMAT_MAX_ATTEMPTS`, les tolérances
de longueur, la grille 3a) qui restent et resteront dans l'ADR-14, seule
propriétaire de ces chiffres.

## Décision

**Tout document — lettre ou CV — se produit en quatre étapes, dans cet ordre :**

0. **Pré-vol** — code pur, aucun appel LLM. Vérifie que le profil est suffisant
   et que le marché est connu (`MarketNormProvider` résout au moins une norme
   neutre), et calcule `superlatifsAutorisés` : l'intersection entre
   `MarketNorm.superlatives` (la liste fermée de la langue résolue) et les
   superlatifs effectivement présents dans le profil et l'offre. Ce calcul
   revient à l'étape 0, pas à l'étape 2 ni à l'étape 3 : l'étape 2 en a besoin
   et s'exécute juste après — elle ne peut pas le produire elle-même sans
   recevoir le profil et l'offre, ce que sa signature lui interdit. L'étape 3
   voit les mêmes données (le vérificateur de faits lit le profil et l'offre
   pour l'ancrage et l'identité des faits), mais trop tard : son résultat
   arrive après l'étape 2, qui a déjà dû livrer un texte corrigé. Le score du
   ticket J rejoindra l'étape 0 plus tard, sans changer sa forme.
1. **Génération** — un seul appel LLM.
2. **Correction mécanique sans appel** — une fonction pure de quatre entrées,
   pas d'une seule : `(texteBrut, norme, superlatifs, superlatifsAutorisés)`.
   Les transformations déterministes de la catégorie « corrigeable sans
   appel » de l'ADR-14 — tirets cadratins, formules interdites constituant
   leur propre phrase, superlatifs absents de la source — s'appliquent sur
   `texteBrut`, mais aucune des trois ne lit la même entrée : le tiret
   cadratin ne demande rien d'autre, la formule interdite demande `norme`
   (la liste change par langue), le superlatif demande deux choses
   distinctes — `superlatifs`, le catalogue complet du marché, pour
   reconnaître qu'un mot du texte produit EST un candidat à vérifier, et
   `superlatifsAutorisés` calculé à l'étape 0, pour savoir lequel de ces
   candidats garder. Le sous-ensemble autorisé seul ne suffit pas : il dit
   quoi garder, jamais quoi chercher. Aucun appel LLM.
3. **Deux vérificateurs indépendants** — faits (ancrage et reformulation,
   décision 5 de l'ADR-14) et format (conformité à la norme de marché résolue).
   Aucun des deux ne dépend du résultat de l'autre, ce qui laisse l'exécution —
   séquentielle ou concurrente — libre : l'information utile est leur
   indépendance, pas la façon dont elle est exploitée.

**Les étapes 0, 2 et 3 sont du code pur** : compter des mots, chercher une
formule dans une chaîne, comparer deux ensembles de faits ne demande aucun
modèle. Seule l'étape 1 touche le LLM. L'étape 2 ne perd pas pour autant son
absence de contexte : elle ne reçoit jamais le profil ni l'offre directement,
seulement ce qu'une étape antérieure en a déjà extrait (`superlatifsAutorisés`)
— le même principe que l'aveuglement du vérificateur de format ci-dessous,
appliqué une étape plus tôt dans le pipeline.

**Le rejet du pré-vol porte son propre mécanisme, pas `generation_failed`.**
Rien n'a été tenté : réutiliser le motif d'un échec de génération serait faux,
et le ticket G compte les échecs de génération comme métrique — un pré-vol
raté n'en est pas un. Le mécanisme est nommé dès maintenant, avant même qu'un
deuxième cas n'existe : `generationBlockedReason`, avec `'incomplete_profile'`
aujourd'hui et `'low_match'` réservé au score du ticket J. Un seul mécanisme,
deux causes — pour que le ticket J n'en invente pas un second.

**Le vérificateur de format ne reçoit que la norme de marché résolue** — jamais
l'offre, jamais le profil, aucun service injecté. L'aveuglement est garanti par
la **signature** de la fonction, pas par la discipline de qui l'appelle — le
même principe que la règle d'accès unique du ticket A : ce qu'une fonction ne
peut pas recevoir, elle ne peut pas fuiter, sans qu'aucun relecteur n'ait besoin
de le vérifier à chaque appel.

**Une faute trouvée par l'un ou l'autre vérificateur court-circuite tout le
reste : rejet immédiat, aucun tour de correction** — exactement la règle de
l'ADR-14 pour l'ancrage et l'identité des faits, qui ne distingue pas d'où vient
la faute. Ce n'est qu'en l'absence de toute faute que les **imprécisions** des
deux vérificateurs sont rassemblées et envoyées en un seul tour de correction.
Le prompt de ce tour ne contient que le texte produit et la liste des
violations — jamais le profil, jamais l'offre : la correction n'a besoin de
savoir que ce qui est faux et ce qui doit changer, pas de retrouver le contexte
complet qui a produit le texte.

**Chaque violation porte sa valeur attendue, pas seulement son nom** — par
exemple `{ type: 'verb_rank', found: 'dirigé', expected: 'participé' }` pour une
montée de verbe (ADR-14, décision 5). C'est ce qui rend la correction possible
sans jamais repasser le profil ni l'offre dans le prompt : le modèle n'a besoin
ni de retrouver la source ni de deviner la bonne valeur, la violation la lui
donne déjà.

**Pire cas : deux appels** — la génération, puis une correction. Cet ADR **ne
redéfinit pas** `FORMAT_MAX_ATTEMPTS` : son nom et sa valeur restent ceux fixés
par l'ADR-14, qui seul les possède. Deux documents ne portent jamais le même
chiffre sous deux noms, ni le même nom sous deux chiffres.

## Alternatives écartées

### Vérificateurs séquentiels (faits, puis format)

Écartée : les deux contrôles sont indépendants — le résultat de l'un ne change
rien à l'exécution de l'autre. Les enchaîner doublerait la latence sans qu'aucune
correction supplémentaire n'en sorte.

### Un tour de correction par vérificateur

Écartée : ferait deux appels de correction au lieu d'un, pour un ensemble de
violations déjà connu en entier avant le premier appel — double le coût sans que
la seconde passe apporte une information que la première n'avait pas.

### Donner au vérificateur de format un accès à l'offre et au profil

Écartée : le contrôle de format est purement structurel (longueur, paragraphes,
formules) et n'a besoin de rien de tout cela. Élargir ce qu'une fonction peut
voir pour un gain hypothétique recrée exactement le couplage que l'aveuglement
par signature existe pour éviter, et rend plus difficile, pour toujours, de
savoir ce qui peut fuiter où.

### Une pipeline séparée par type de document

Écartée : c'est le problème que cet ADR existe pour résoudre. Sans forme
partagée, le CV réinvente son propre pré-vol, sa propre génération, sa propre
correction — avec le risque, déjà nommé dans le contexte, qu'un correctif à la
lettre ne se propage jamais au CV.

## Conséquences

- **Deux signatures ont changé pendant l'implémentation, après avoir été
  validées à l'étape 4 — figées ici pour que le ticket F hérite de la
  bonne, pas celle validée puis dépassée sans accord.** Les deux
  changements sont justes ; c'est l'interface validée qui était
  insuffisante, découverte en écrivant le code contre elle.
  - `applyMechanicalCorrections(rawText: string, letterNorm: LetterNorm,
superlatives: string[], allowedSuperlatives: string[]): string` —
    quatre entrées, pas trois. `superlatives` (le catalogue complet du
    marché) manquait pour reconnaître qu'un mot du texte produit est un
    candidat superlatif au départ ; `allowedSuperlatives` seul ne porte
    que lequel garder parmi les candidats déjà reconnus.
  - `buildAnchoringFacts(profile: ProfileDto, offer: { title, company,
description }, language: string, verbLadder: string[][]):
AnchoringFact[]` — `verbLadder` est un paramètre **obligatoire**, sans
    valeur par défaut. Une version antérieure l'avait optionnelle (défaut
    vide) pour ne rien casser des appels déjà commités ; un appelant qui
    l'omettait désactivait alors silencieusement le contrôle de montée en
    responsabilité, puisque `checkFacts` ne pose jamais de plafond sans
    au moins un fait `kind: 'verb'` — exactement le bug trouvé en revue
    senior. Un paramètre dont l'oubli éteint un garde-fou doit être
    obligatoire : le compilateur doit refuser l'appel, pas le laisser
    passer avec une liste vide.
- Le pipeline devient un **contrat partagé** entre la lettre et le CV : un
  correctif à une étape profite aux deux sans duplication — mais une régression
  dans une étape partagée touche les deux à la fois, pas un seul.
- L'aveuglement du vérificateur de format est désormais un contrat de **type**,
  pas une convention : tout besoin futur de contexte supplémentaire doit être
  nommé explicitement dans sa signature, jamais ajouté en silence par un import
  de commodité.
- L'étape 0 ouvre un chemin de rejet **sans aucun appel LLM**, en plus de ceux
  déjà posés par l'ADR-14 (faute, imprécision hors tolérance) — c'est la
  correction déjà apportée à l'ADR-14 (« un document peut désormais être refusé
  avant toute génération »), dont ce pipeline est l'implémentation.
  `generationBlockedReason` devient le troisième mécanisme de rejet du produit,
  à ne jamais confondre avec `generation_failed` dans une métrique ou un
  filtre : l'un dit qu'une tentative a échoué, l'autre qu'aucune n'a eu lieu.
- `FORMAT_MAX_ATTEMPTS`, son nom et sa valeur, restent définis et possédés par
  l'ADR-14 seul. Toute modification de ce budget se fait là, jamais ici — pour
  qu'un des deux documents ne devienne pas périmé en silence par rapport à
  l'autre.
- Le score du ticket J n'est pas encore défini ; le pré-vol d'aujourd'hui ne
  vérifie que le profil et le marché. Le score s'ajoutera à cette étape plus
  tard, sans changer la forme en quatre étapes.

## Ce qui remettrait cette décision en cause

- **Un type de document dont le contrôle de faits ou de format ne peut pas se
  réduire à du code pur** — nécessiterait un modèle même aux étapes 0, 2 ou 3,
  et invaliderait la prémisse qui porte toute cette décision.
- **Un besoin réel de contexte supplémentaire dans le vérificateur de format**
  (par exemple une norme qui dépendrait du profil, pas seulement du marché) —
  redéfinirait sa signature, donc cette décision.
- **Une divergence entre le pipeline de la lettre et celui du CV** suffisamment
  grande pour que le partage coûte plus cher qu'il ne fait gagner — justifierait
  de les scinder à nouveau.

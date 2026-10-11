# ADR-13 — La génération de document s'exécute en tâche de fond, dans le même processus que l'API, sans file d'attente externe

- **Date** : 2026-10-10
- **Statut** : accepté

## Contexte

Le ticket C (`POST /applications`) doit renvoyer `202` immédiatement, puis laisser
`GET /applications/:id` observer une transition « en cours » → « prêt » ou
« échec ». La génération ne peut donc pas être entièrement synchrone dans le `POST`.

**JobAI est destiné à être commercialisé.** Cette décision est donc un choix de
_phase_, pas un choix définitif, et l'ADR doit nommer précisément ce qui la remet en
cause — voir la dernière section.

Ce qui cadre le choix aujourd'hui :

- **Zéro utilisateur.** Une file externe coûte du Redis à provisionner, du code de
  worker, et de la surveillance. Construire une file avant d'avoir la charge qui la
  justifie, c'est payer l'exploitation d'un système qu'on ne mesure pas encore.
  C'est la raison principale, et elle ne dépend d'aucun hébergeur.
- **Une seule instance d'API.** Rien ne doit aujourd'hui être reparti entre
  plusieurs processus.
- **Durée haute connue et courte.** `GuardedLlmService` plafonne tout appel à
  `LLM_TOTAL_BUDGET_MS` (55 s par défaut). Aucune tâche de génération ne peut durer
  des minutes.
- `redis` figure dans `docker-compose.yml` et dans le tableau des choix techniques
  du README, mais n'est **branché nulle part** : aucun usage dans `src/`, aucune
  variable Redis en déploiement. `ThrottlerModule` tourne en mémoire. Redis a donc
  deux emplois futurs, pas un : le magasin de file, et le magasin du throttler.
- Accessoirement, le plan Render gratuit utilisé pendant le développement suspend un
  service sans trafic HTTP entrant, et ne propose pas de type « Background Worker ».
  C'est une contrainte réelle du moment, pas le motif de la décision.

## Décision

La génération s'exécute en tâche de fond asynchrone, dans le **même processus** que
celui qui a reçu le `POST` : la requête insère la ligne `Application`, répond `202`,
puis lance la génération sans l'attendre.

L'état du travail est lu et écrit **exclusivement en Postgres**, jamais en mémoire ni
dans une file. `GET /applications/:id` n'a qu'une seule source de vérité.

## Ce que la décision impose dès maintenant

Trois contraintes, non négociables, qui rendent le passage ultérieur à une vraie
file peu coûteux :

1. **L'état ne vit qu'en Postgres.** Aucune structure en mémoire ne porte
   l'avancement d'un travail. Un redémarrage ne perd donc aucune information, même
   s'il perd le travail en vol.
2. **Un seul point de lancement.** Une unique fonction décide de démarrer le
   travail. Passer à BullMQ change le corps de cette fonction, pas ses appelants.
   Si le lancement se retrouve écrit à deux endroits, cette décision est déjà violée.
3. **Aucun travail ne reste bloqué.** Un travail « en cours » dont l'horodatage de
   démarrage dépasse un délai configurable est **lu comme échoué** par
   `GET /applications/:id`, sans qu'aucun worker ne soit nécessaire pour le marquer.
   C'est ce qui empêche un redéploiement de laisser une ligne en attente à vie.

## Alternatives écartées

### Worker séparé, avec BullMQ et Redis

Rejetée **parce qu'il n'y a pas de charge à répartir**, pas parce que l'hébergement
du moment l'interdit. Elle demanderait de provisionner Redis en production, d'écrire
et déployer un second exécutable, et de surveiller une profondeur de file qui vaudra
zéro pendant des mois.

C'est l'option à retenir le jour où un des déclencheurs plus bas se produit. Le
travail de migration est connu et borné : un Redis managé, `bullmq`, le corps du
point de lancement unique, et le magasin du throttler au passage.

### Synchrone, dans la requête `POST`, avec timeout court

Rejetée pour deux raisons concrètes :

1. Elle ne peut pas produire la transition que le ticket exige : si tout se termine
   avant la réponse, aucun `GET` n'observe jamais « en cours ».
2. Elle garde la connexion ouverte jusqu'à ~55 s, sans marge pour l'écriture en base
   et le contrôle d'ancrage qui suivent. Un client qui se déconnecte perd le
   résultat d'un appel déjà facturé.

## Conséquences

**Ce n'est pas l'architecture d'un produit vendu.** Elle est juste, aujourd'hui, et
voici précisément ce qu'elle ne fait pas :

- **Un redémarrage perd le travail en vol**, et l'appel LLM a déjà été payé. La
  contrainte 3 garantit que l'utilisateur voit un échec au lieu d'une attente
  infinie, mais rien ne retente.
- **Aucune reprise automatique.** Un échec est final jusqu'à ce que l'utilisateur
  relance.
- **Aucune métrique de charge.** Sans file, on ne peut pas observer une profondeur
  qui monte : le premier signe de saturation sera un utilisateur qui se plaint.
- **Pas d'échelle horizontale.** La tâche reste attachée à l'instance qui a reçu le
  `POST`. Et le throttler en mémoire a le même défaut : deux instances donnent deux
  compteurs, donc le double de la limite annoncée.
- En échange : aucune dépendance d'infrastructure nouvelle, et le coût est à
  l'implémentation, pas à l'exploitation.

## Ce qui remettrait cette décision en cause

Des conditions observables, pas des intentions. La première est franchie bien avant
que le volume ne devienne un sujet :

- **Le premier utilisateur qui paie.** C'est le déclencheur principal. Le jour où de
  l'argent change de main, perdre un travail dont l'appel LLM a déjà été facturé
  cesse d'être une dette acceptable. Ce seuil arrive bien avant une charge mesurable,
  et il est daté avec précision — pas « quand ça ramera ».
- **Une deuxième instance d'API.** Elle casse d'un coup la tâche de fond _et_ le
  throttler. Redis devient requis pour les deux. Déclenché par un changement de
  configuration d'hébergement, pas par du trafic.
- **Des travaux perdus en production**, vus dans les logs ou signalés : déploiements
  fréquents, ou travaux lus comme échoués alors qu'ils avaient démarré normalement.
- **Un deuxième type de travail de fond** (`autoapply`, couche 2), qui doit survivre
  à un redémarrage ou être partagé.
- **Une durée de génération qui dépasse le budget HTTP**, par exemple si une
  génération enchaîne plusieurs appels LLM.

**Passer à un plan payant n'est pas, à lui seul, un déclencheur.** Payer l'hébergement
lève une contrainte technique ; ça ne crée pas le besoin.

## Pourquoi ne pas construire la file tout de suite, puisque le produit doit tenir l'échelle

Parce que les décisions de scalabilité ne sont pas de même nature.

Celles qui coûtent cher _plus tard_ sont prises **maintenant**, et le sont déjà : où
vit l'état, la forme du schéma, le point de lancement unique, l'idempotence, les
frontières de port. Elles ne coûtent presque rien aujourd'hui et coûtent une
réécriture dans six mois. C'est l'objet de la section « Ce que la décision impose dès
maintenant » : cette architecture _est_ une préparation à l'échelle, sans la file.

Celle-ci coûte cher _chaque jour_ : un Redis à payer et surveiller, un worker à
déployer, une politique de reprise, une file des morts, une alerte sur la profondeur.

Et surtout, elle serait construite à l'aveugle. Dimensionner une file correctement
demande de connaître la durée réelle d'un travail, le taux d'échec, la forme des
rafales, et si une reprise peut refacturer un appel LLM. Aucun de ces quatre chiffres
n'existe aujourd'hui. Une file mal dimensionnée coûte plus qu'aucune file : un
`retry: 3` posé sans idempotence facture trois appels LLM pour un seul travail.

**Exception assumée : le magasin du throttler.** Ce n'est pas un sujet de charge, c'est
un défaut de correction. `ThrottlerModule` en mémoire donne un compteur par instance :
deux instances doublent la limite annoncée. Ce défaut se déclenche par un changement
de configuration, pas par du trafic, et son correctif est bon marché dès maintenant.
Il est donc traité avant la mise en vente, indépendamment de la file — et c'est lui
qui amènera Redis en production le premier.

## Ce que le contrôle d'ancrage garantit réellement

Décision apparentée, prise pendant ce même ticket : le contrôle d'ancrage compare
les candidats du document mot par mot contre un ensemble de mots connus (profil +
offre), pas phrase par phrase.

Nommer précisément ce que ça garantit, pour ne pas s'en servir à tort : **ça
garantit l'absence de nom propre nouveau, pas l'absence d'entreprise inventée.**
Une recombinaison de deux mots connus pris séparément (« Google Cloud » passe si
« Google » et « Cloud » sont chacun déjà connus, même si cette entreprise précise
n'a jamais existé dans le profil) traverse le contrôle. C'est le compromis retenu
plutôt qu'une correspondance de phrase exacte, qui aurait rejeté des recombinaisons
légitimes (un intitulé de poste composé de mots déjà connus séparément, par
exemple) — mais la garantie réelle est plus étroite que le nom du contrôle ne le
laisse penser.

Deuxième trou, plus large que celui-ci : seules les suites de **2 mots
capitalisés ou plus** sont des candidats. Un nom propre inventé d'un seul mot
(« Netflix », « Deloitte ») ne matche jamais le motif de détection et n'est donc
jamais soumis au contrôle — ni rejeté, ni même examiné. Nécessaire pour éviter
les faux positifs de début de phrase (un seul mot capitalisé après un point est
la norme, pas l'exception, en français) ; la conséquence est qu'un nom
d'entreprise halluciné d'un seul mot passe aussi sûrement qu'une recombinaison
de deux mots connus.

## Dette liée, à traiter à part

`redis` est annoncé dans le tableau des choix techniques du README alors qu'il n'est
branché nulle part. Un lecteur du README croit donc qu'une file existe. À corriger :
soit l'annoter « prévu, non branché », soit le retirer du tableau et de
`docker-compose.yml` jusqu'au ticket qui l'utilisera réellement.

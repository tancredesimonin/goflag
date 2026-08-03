# goflag — Plan de développement

> **Rédigé** 2026-07-29 · **Mis à jour** 2026-08-02
> **Portée** — `goflag` (le produit), `@goflag/next` (un second outil sous la
> même marque), et les 4 sites qui servent de terrain : `openfinanceguide`,
> `stereo-house`, `tancrede`, `tancredo`.
> **Lié** — `docs/rules-catalog-plan.md` pour la couche règles.

---

## 0. Où on en est

| Phase                                     | État                                             |
| ----------------------------------------- | ------------------------------------------------ |
| **0** — Nettoyer openbankinglab           | ✅ livrée (`openbankinglab!45`)                  |
| **1** — Rendre goflag utilisable          | ✅ livrée (`goflag!30` → `!37`, 5 MR)            |
| **2** — Corriger les bugs mesurés         | ⏳ 2 sites sur 4 ; les 2 autres parkés (voir §6) |
| **2 bis** — Outil utilisable au quotidien | ✅ livrée (`goflag!34` → `!37`)                  |
| **2 ter** — Monorepo                      | ✅ livrée (`goflag!39`)                          |
| **Distribution**                          | ✅ livrée — `@goflag/cli@0.1.3` sur npm          |
| **3** — Durcir la spec                    | ⬜ **prochaine**                                 |
| **4 à 7** — La lib, le contenu, public    | ⬜ à faire                                       |

**Chiffres actuels** : 516 tests, 12 règles par page + 3 règles site, monorepo
en place, publié en `0.1.3`. Release et publication automatisées, sans aucune
credential npm en CI — voir §2, « Distribution ».

### Ce qu'il reste à faire, dans l'ordre

| #   | Quoi                                                                                                                        | Qui                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `GOFLAG_VERSION` de stereo-house à `0.1.3` — la CI y épingle encore `0.1.0`, dont le `bin` est cassé                        | Renovate le proposera sous 3 jours (plancher `minimumReleaseAge`), ou à la main |
| 2   | Capturer la baseline de stereo-house : le premier audit publie `goflag-report.json`, à committer en `.goflag/baseline.json` | après le premier `deploy-develop`                                               |
| 3   | Resserrer le garde de release sur « `packages/cli/src` a bougé »                                                            | voir §2, « Dette laissée derrière »                                             |
| 4   | Étendre le gate aux 3 autres sites                                                                                          | après la baseline de stereo-house                                               |
| 5   | **Phase 3** — `rigor` et `Source` par règle, `goflag rules --json`                                                          | le vrai travail suivant                                                         |

Les points 1 à 4 sont de la finition sur ce qui vient d'être livré. **Le travail
qui compte est la phase 3** : l'outil est installable et gaté en CI ; ce qui
manque, c'est qu'une règle puisse citer sa source.

---

## 1. Vision cible

Un seul document fait autorité — **la spec** : ce qui doit être vrai du HTML
produit par un site Next.js multilingue (metadata, hreflang, canonical, sitemap,
robots, OG, contenu lisible par les LLM).

Deux projections de ce document, jamais en désaccord :

```
                    ┌─────────────────┐
                    │      SPEC       │   règles sourcées, versionnées
                    │  Page → Issue[] │   (WHATWG / Google / doc Next)
                    └────────┬────────┘
                 ┌───────────┴───────────┐
         runtime │                       │ devDependency (tests only)
                 ▼                       ▼
        ┌────────────────┐      ┌──────────────────┐
        │     goflag     │      │   @goflag/next   │
        │  VÉRIFIE que   │      │  PRODUIT ce qui  │
        │  c'est vrai    │      │  est attendu     │
        │  sur un site   │      │  par construction│
        └────────────────┘      └──────────────────┘
                 ▲                       │
                 └───────────────────────┘
                   manifeste de routes
                   (intention déclarée)
```

**goflag est le produit principal** (arbitré 2026-07-30). `@goflag/next` est un
outil _supplémentaire_ sous la même marque, pas la ligne d'arrivée. Conséquence
directe : ce qui rend goflag utilisable, publiable et adopté passe devant ce qui
fait avancer la lib.

### Invariants

Ils ne se négocient pas — ils existent pour qu'aucun des deux produits ne bloque
l'autre.

| #      | Invariant                                                             | Pourquoi                                                                |
| ------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **I1** | Le **runtime** de la lib ne dépend de rien (ni goflag, ni spec)       | un petit paquet sans dépendance se fait adopter ; un paquet couplé, non |
| **I2** | goflag reste utile **seul**, sur un site qui n'utilise pas la lib     | ce n'est plus une précaution : c'est la thèse du produit                |
| **I3** | Dépendance **unidirectionnelle** : `spec ← goflag`, `spec ← lib(dev)` | coupler deux produits inachevés, c'est n'en livrer aucun                |
| **I4** | Le paquet `spec` n'est extrait qu'à **2 consommateurs** réels         | sinon on recrée le problème qu'on prétend résoudre                      |
| **I5** | Scope **Next.js App Router** assumé                                   | permet des diagnostics et des remèdes au bon niveau d'abstraction       |

**I3 est désormais appliqué par lint**, pas seulement documenté : une règle
`no-restricted-imports` empêche `packages/next` et `apps/**` d'importer depuis
`packages/cli`. Un monorepo rend trivial le « juste ce helper » qui transforme
deux produits indépendants en un bloc.

---

## 2. Nommage, dépôt, distribution

> Disponibilité npm vérifiée le 2026-07-29 : `goflag`, `goflag-next`,
> `goflag-detect` et **le scope `@goflag` entier** sont libres. Rien n'était
> contraint.

### Une marque, des outils nommés

| Rôle              | Nom                | Statut                                    |
| ----------------- | ------------------ | ----------------------------------------- |
| Analyseur         | **`@goflag/cli`**  | ✅ publié · installe la commande `goflag` |
| Lib Next          | **`@goflag/next`** | à créer (phase 4)                         |
| Spec, si extraite | `@goflag/spec`     | seulement si I4 est satisfait             |
| Scope npm         | `@goflag`          | ✅ revendiqué                             |
| Nom nu `goflag`   | panneau indicateur | `tools/name-holder`, déprécié vers le CLI |

**Tout vit dans le scope (arbitré 2026-08-01).** Le plan initial faisait du nom
nu le paquet principal. La publication l'a mis à l'épreuve : trois échecs
successifs — `403` (un _granular token_ npm ne se restreint qu'à des paquets
déjà publiés), `EOTP` (publier depuis une CI avec le 2FA sur les écritures),
`404` (session npm expirée en local). Tous d'authentification, aucun lié au nom.

Une fois le diagnostic fait, revenir au nom nu était possible — et a été
préparé, puis annulé. La raison retenue n'est pas technique : **un seul scope
est plus simple et plus uniforme**. `@goflag/cli`, `@goflag/next`,
`@goflag/spec` se lisent comme une famille ; un nom nu à côté de deux paquets
scopés se lit comme une exception à expliquer. Et `pnpm i @goflag/cli` ne coûte
rien à personne.

Le nom nu est quand même publié, en paquet vide qui renvoie vers `@goflag/cli`
et déprécié dans la foulée : il reste pris, et il pointe vers le bon endroit
plutôt que vers rien — ou vers quelqu'un d'autre.

**Ce qu'on en retient** : ne pas laisser un obstacle d'outillage décider d'un
nom de produit. Le renommage a été proposé après deux échecs, avant que le
diagnostic soit terminé ; il s'est trouvé aller dans la bonne direction, mais
pour de mauvaises raisons.

**Le scope plutôt que des tirets.** `goflag-next` laisse n'importe qui publier
`goflag-ui` et créer la confusion ; `@goflag/*` donne le namespace. Revendiquer
coûte zéro et n'est pas réversible dans l'autre sens. Contrepartie assumée : un
paquet scopé est un peu moins découvrable que les `next-intl` / `next-themes`
que les gens cherchent sur npm — d'où l'intérêt de revendiquer le scope _et_ de
choisir le nom de publication séparément.

**Pas de verbe sur le CLI.** `goflag detect` a été envisagé et écarté : si
`goflag` est l'outil et `@goflag/next` la lib, le CLI n'a pas besoin d'un second
nom, et le mot veut déjà dire « signaler ». Si des sous-commandes deviennent
nécessaires — `goflag rules` pour l'export du catalogue en phase 3 est le
premier candidat réel — elles s'ajoutent **à côté** de `goflag <url>`, qui
continue de marcher. Si un verbe s'impose un jour, `audit` ou `check` décrivent
mieux : l'outil ne détecte pas, il juge.

### Où vit le code

|                                         | Où                                        | Visibilité           |
| --------------------------------------- | ----------------------------------------- | -------------------- |
| Développement, CI, templates partagés   | `gitlab.com/tancredesimonin-indie/goflag` | **privé**            |
| Vitrine, issues, champ `repository` npm | `github.com/tancredesimonin/goflag`       | public               |
| Scope npm                               | `@goflag`                                 | indépendant des deux |

**Pourquoi rester dans le groupe `-indie`.** Pas pour la marque — le namespace
GitLab est privé, personne ne le voit. Pour les `include:` : le `.gitlab-ci.yml`
tire trois templates de `tancredesimonin-indie/infrastructure`. Sortir du groupe
les rend cross-namespace, ce qui marche mais ouvre une surface de permissions
(les jetons de job CI peuvent bloquer l'accès inter-projets) — le genre de chose
qui casse six mois plus tard sans qu'on comprenne pourquoi.

Vérifié : créer un groupe est **gratuit** sur GitLab.com (Free : 5 utilisateurs,
400 minutes CI/mois, 10 Gio). Si un coût existe, ce sont les **minutes**, pas le
groupe — et le namespace n'y change rien. Le monorepo, lui, en économise :
`rules:changes` évite de relancer les tests quand seul un doc a bougé.

**Avant le premier push du miroir** : l'historique complet part sur GitHub, pas
seulement l'état courant. Contrôlé le 2026-07-29 — seul `.env.example` est
tracké, aucun `.env` n'a jamais été commité. Recontrôlé le 2026-08-02 : toutes
ses révisions ne contenaient que des placeholders et des valeurs vides. Le
fichier a été supprimé depuis — il venait du template Next.js d'origine et
aucune de ses variables n'était lue par le CLI.

**Friction assumée** : un miroir GitHub est en lecture seule, donc les issues
ouvertes là-bas ne seront pas vues. Bannière explicite dans le README GitHub
renvoyant vers GitLab. Acceptable tant qu'on ne cherche pas de contributeurs ;
à revoir si l'outil prend.

### Structure du dépôt

```
packages/cli/     goflag — le CLI
packages/next/    @goflag/next          (glob prêt, répertoire absent)
apps/website/     doc et marketing      (glob prêt, répertoire absent)
```

`packages/` et `apps/` séparent **ce qui est publié** de **ce qui est déployé**.
Aucun répertoire vide n'est créé : stubber ce qui n'existe pas est exactement
comment un dépôt accumule du code que personne n'appelle.

**Propriété gratuite** : le site sera un site Next, donc le **premier
consommateur externe de `@goflag/next`** — et goflag pourra l'auditer dans sa
propre CI. Les deux outils s'exercent l'un l'autre sur quelque chose de réel qui
n'est pas un site client.

### Distribution — livrée par npm, pas par une image

**Arbitré 2026-07-31.** Le tableau qui suivait comparait une image Docker à un
template clone-and-build. npm n'y figurait pas, parce qu'au moment de l'écrire
goflag n'était publiable nulle part — la comparaison est devenue caduque le jour
où on a décidé de publier.

Ce qui a tranché n'est pas le coût CI mais le dogfooding : **une image
construite depuis ce monorepo ne prouve rien de ce qu'un utilisateur reçoit.**
`dist/` y est parce qu'on vient de le builder, les dépendances résolvent parce
que le workspace est là. Rien n'y teste `files`, `bin`, `exports`, ni la
résolution depuis un vrai `node_modules`.

Ce n'était pas théorique. Trois défauts n'existaient que sur le chemin public :

| Défaut                                 | Conséquence                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `playwright` en `optionalDependencies` | npm les installe par défaut, et son postinstall télécharge Chromium — imposé à qui ne veut que `--static` |
| Aucun fichier `LICENSE`                | le badge MIT du README mentait depuis le premier commit                                                   |
| README hors du répertoire du paquet    | npm ne regarde jamais au-dessus : la page npm serait partie vide                                          |

D'où **`test:package`** : `pnpm pack`, installation du tarball dans un
répertoire vierge **avec npm**, et vérification que Chromium reste dehors et que
le binaire répond. À chaque MR.

### La chaîne de release

```
merge develop → main
  → job `release`   calcule la version, écrit le changelog, tague,
                    repousse le commit sur main ET develop
  → pipeline du tag → `publish:npm` échange un jeton OIDC contre le droit
                      de publier ce seul paquet
  → npm
```

Merger sur `main` **est** la décision de publier : c'est déjà le geste qui veut
dire « ça part » sur les 4 sites. Rien à lancer depuis un portable, et **aucune
credential npm en CI** — le trusted publisher npm reconnaît le projet et le
chemin du fichier CI, et GitLab forge un jeton de quelques minutes. Il n'y a
plus rien à voler, à faire tourner, ni qui survive à une fuite.

### Ce que la première publication a coûté

Quatre défauts, chacun caché derrière le précédent, tous invisibles autrement
qu'en publiant pour de vrai :

| #   | Défaut                                                                                                      | Pourquoi il ne se voyait pas                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Le garde de release s'inversait : `git log \| grep -q` sous `pipefail`, SIGPIPE lu comme « rien à publier » | Il échoue **quand il y a quelque chose à publier** ; les deux essais précédents avaient un intervalle vide          |
| 2   | Le pipeline de tag mourait à la création : `include: project:` irrésoluble pour le bot du jeton de projet   | Zéro job, aucune erreur YAML — indiscernable d'un filtrage de règles                                                |
| 3   | Puis la surcharge `trivy-deps` orpheline, une fois l'include sauté                                          | Même symptôme que le n°2, une couche plus bas                                                                       |
| 4   | `bin: "./dist/cli.js"` — npm 11 le **supprime** au lieu de le normaliser                                    | `test:package` teste le tarball qu'on empaquette ; npm réécrit `package.json` à la publication, pas à l'empaquetage |

Le n°4 est le pire : la publication aurait livré un CLI **sans commande**, et
rien dans le pipeline ne l'aurait vu.

**La leçon commune** — un pipeline vert ne dit pas qu'une chaîne fonctionne,
seulement qu'elle n'a pas été exercée. Trois de ces quatre défauts vivaient
depuis des jours dans une CI verte.

### Dette laissée derrière

- **Le garde de release se déclenche sur le préfixe du commit**, pas sur ce qui
  a bougé dans le paquet. Un `fix(ci)` consomme donc un numéro de version et
  ouvre une MR Renovate sur chaque site consommateur — exactement ce que le
  commentaire du garde dit vouloir éviter. À conditionner sur `packages/cli/src`.
- **Rien ne vérifie le paquet _publié_.** `test:package` s'arrête au tarball
  local. Une assertion post-publication sur les métadonnées du registre aurait
  attrapé le n°4.
- `v0.1.1` et `v0.1.2` sont tagués et non publiés. npm lit `0.1.0 → 0.1.3` ;
  un trou est sans conséquence.

---

## 3. Les deux usages, et pourquoi ils ne se mélangent pas

Ce sont deux **formes** du même outil, pas deux options concurrentes :

|                 | Local                                      | CI                            |
| --------------- | ------------------------------------------ | ----------------------------- |
| Périmètre       | la page qu'on vient de toucher             | le site entier                |
| Durée tolérable | < 5 s                                      | 30 s – 4 min                  |
| Question        | « ce que je viens d'écrire est correct ? » | « est-ce qu'on a régressé ? » |

Un audit qui vaut le coup en CI est intolérable en hook local ; l'inverse est
presque inutile en CI. Les traiter comme le _même_ audit est ce qui les fait
paraître exclusifs.

**La CI est la maison.** Post-`deploy-develop` (les environnements
`develop.<domaine>` existent sur les 4 sites), `--regressions-only`, baseline
commitée dans chaque repo pour que grandfather un finding apparaisse dans un
diff relu.

**En local : une commande, pas un hook.** Un `pnpm seo` par site,
`goflag <url> --start "pnpm start" --depth 0`, lancé délibérément quand on a
touché à la metadata. Un hook qui ajoute 60 s à chaque `pnpm build` est
désactivé en une semaine — c'est le mode d'échec combattu toute la phase 1
(le gate toujours rouge, le faux négatif rassurant) : coût payé à chaque
itération, valeur délivrée rarement.

**Signal à surveiller** : si la commande manuelle n'est jamais lancée après un
mois, c'est qu'il faut un mode ciblé — « audite exactement ces URLs, sans
crawler », que goflag ne sait pas faire. Pas avant : le construire sans preuve
du besoin serait la même erreur que `discoverSitemap`, écrit et jamais appelé.

### Coût CI mesuré (`--static --no-external`)

| Site             | Pages | Durée  |
| ---------------- | ----- | ------ |
| stereo-house     | 41    | ~30 s  |
| tancredo         | 49    | ~40 s  |
| openfinanceguide | 456   | ~4 min |

Pour openfinanceguide : `--max-pages 150` sur les MR, audit complet en nocturne
(le pattern existe — `security-scheduled.yml`).

---

## Phase 0 — Nettoyer openbankinglab ✅

Retirer le code mort derrière le redirecteur 301.

**Livré** — `openbankinglab!45` : 1013 fichiers, −248 780 lignes. Restent le
proxy, `redirect-map.json`, `robots.ts`, `sitemap.ts`, une page de secours.

**Piège trouvé en route** : `prebuild` régénérait `redirect-map.json` depuis le
sitemap live du site — devenu circulaire une fois le site transformé en
redirecteur, et un fetch en échec aurait vidé la carte et fait retomber toutes
les redirections sur `/`. La carte est désormais un artefact figé.

---

## Phase 1 — Rendre goflag utilisable ✅

> On répare l'instrument de mesure avant de mesurer.

**Le bug d'origine** — `goflag https://stereo.house` annonçait
`0 missing translations` sur un site à 4 locales **sans un seul hreflang**. Pas
un seuil mal réglé : l'axe des locales venait des pages atteintes par le crawl
et des alternates qu'elles déclarent. Site muet → rien à suivre → une seule
colonne → tous les checks satisfaits par vacuité.

> goflag détectait l'absence de hreflang **en lisant les hreflang**.

**Livré** (`goflag!30` → `!37`) :

| MR    | Contenu                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------- |
| `!30` | Découverte amorcée par le sitemap, contrat `SiteRule`, 2 règles hreflang, `--fail-on`, `--start`, remèdes App Router |
| `!31` | `--ignore-holes` : déclarer les traductions volontairement partielles                                                |
| `!32` | Fin des locales inventées, des ressources non-HTML jugées, du crawl vide en vert                                     |
| `!33` | Liens sondés tels qu'écrits (barre oblique préservée)                                                                |

**Critère de sortie atteint** — stereo.house passe de `YELLOW / 24 pages /
0 missing translations` à `RED / 42 pages / 36 findings hreflang`, et révèle
6 × 404 invisibles jusque-là.

### Les cinq faux positifs trouvés en capturant la baseline

C'est le vrai produit de cette phase : mesurer avec un instrument faussé aurait
envoyé corriger des choses inexistantes.

| #   | Faux positif                                                     | Conséquence                                       |
| --- | ---------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Locales inventées depuis la forme du chemin (`/cv` → tchouvache) | 31 trous fantômes sur tancrede                    |
| 2   | PDF liés jugés comme des pages                                   | le seul finding `error` du run, gate rouge à tort |
| 3   | Crawl vide rapporté `GREEN`                                      | un hôte injoignable passait la CI                 |
| 4   | Barre oblique retirée avant de sonder un lien                    | 159 citations EUR-Lex déclarées mortes à tort     |
| 5   | Variantes `?tag=` jugées malgré leur canonical                   | 37 % des findings de stereo-house                 |

Le n°4 est le pire : il **envoyait corriger du contenu déjà correct**.

---

## Phase 2 — Corriger les bugs que la baseline révèle ⏳

**Livré**

| Site               | Correctif                                                     | Résultat mesuré     |
| ------------------ | ------------------------------------------------------------- | ------------------- |
| `openfinanceguide` | 12 liens vers `/open-banking/glossary` (chemin d'avant split) | 12 liens cassés → 0 |
| `stereo-house`     | Traduction des pages légales + `/credits` au sitemap          | 6 × 404 → 0         |
| `stereo-house`     | `hreflang` sur toutes les pages, `availableLocales` dérivé    | 41 findings → 0     |

**Parké**

- `tancrede` — mesuré sur un déploiement périmé (`Disallow: /` en prod, sitemap
  vide). À recapturer après passage de `develop` en production.
- `tancredo` — WIP assumé ; les 27 × 404 viennent de routes liées mais non
  construites (`/{facet}/releases`, `/epk`). Décision produit, pas correction.

**Reste ouvert** — l'`og:image` de stereo-house (38 findings) : les pages hors
capsules n'ont aucune image, et leur en donner une demande soit un asset, soit
une route `/og` dynamique. C'est une décision, pas un correctif.

**Leçon** — le plan annonçait « 10 à 30 lignes par site ». C'était juste pour la
metadata (un seul générateur par site) et faux pour le reste : les 404 dominent,
et ils relèvent du contenu ou du routing, pas du SEO.

---

## Phase 2 bis — Rendre l'outil utilisable au quotidien ✅

> Phase non prévue, née de l'usage réel pendant la phase 2.

| MR    | Contenu                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------- |
| `!34` | `--regressions-only` + `--baseline` + `--max-debt` — le gate devient tenable sur un site à backlog |
| `!35` | Règle `robots.blocks-site` — le `Disallow: /` de tancrede.eu passait inaperçu                      |
| `!36` | Déduplication par canonical — 37 % de bruit en moins                                               |
| `!37` | `--start-cwd` + échecs qui nomment leur répertoire                                                 |

**Ce que `!34` a appris** — la première version laissait passer les bugs connus
en affichant « no new findings » en vert : le mode d'échec de tout fichier de
suppression. Corrigé en rendant le mode **opt-in nommé** (`--baseline` seul est
une erreur), en **interdisant le vert** tant qu'il reste des findings, et en
ajoutant un **cliquet** (`--max-debt`) — le seul mécanisme qui force la dette à
descendre plutôt qu'à simplement ne pas monter.

---

## Phase 2 ter — Monorepo ✅

Livré (`goflag!39`) avant publication, la fenêtre pas chère : `0.0.0`, jamais
publié, jamais cloné. Voir §2 pour la structure. I3 appliqué par lint, tests
CI ciblés par `rules:changes`, historique préservé (renommages détectés).

---

## Phase 3 — Durcir la spec ⬜

**Objectif** — transformer un jeu de règles en artefact citable.

| #   | Livrable                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| 3.1 | Chaque règle porte son `rigor` (`spec-required` › `spec-recommended` › `vendor-spec` › `guideline` › `heuristic`)              |
| 3.2 | Chaque règle cite ≥ 1 `Source` (`id`, `publisher`, `url`, `retrievedAt`, paraphrase — jamais de copie verbatim de doc éditeur) |
| 3.3 | Le catalogue s'exporte en Markdown lisible **et** en JSON (`goflag rules --json`)                                              |
| 3.4 | Les règles i18n sont couvertes en priorité                                                                                     |
| 3.5 | **Dette de la phase 1** : absorber `missingTranslations` (trous + réciprocité) dans le registre de règles                      |

**Critère de sortie** — `goflag rules --json` produit le catalogue complet ;
chaque règle i18n a une source normative ou éditeur datée.

**Sur 3.5** — les trous de traduction et la réciprocité vivent hors du catalogue
depuis la phase 1, délibérément : les migrer touchait 16 fichiers pour zéro
changement de comportement. C'est ici que ça se fait, quand `rigor` et `Source`
arrivent de toute façon.

**Hors phase** — l'extraction en paquet `spec` séparé (I4 : un seul
consommateur).

---

## Phase 4 — Le cœur de la lib ⬜

**Objectif** — déclarer les routes une fois, en dériver metadata + sitemap +
robots + URL OG.

| #   | Livrable                                                                                  |
| --- | ----------------------------------------------------------------------------------------- |
| 4.1 | `defineSite({ baseUrl, locales, defaultLocale, name, indexable, og })`                    |
| 4.2 | `site.routes({...})` avec `collection` → disponibilité par locale **déduite**             |
| 4.3 | Sorties : `routes.sitemap`, `site.robots`, `routes.X.metadata()`, `routes.X.staticParams` |
| 4.4 | Adaptateur `content-collections`                                                          |
| 4.5 | Suite de tests = les règles de la phase 3, jugées sur la sortie rendue                    |

**Critère de sortie — le test d'ergonomie, non négociable :**

> Migrer `stereo-house` doit **supprimer du code net**. Si le solde n'est pas
> négatif, l'API est ratée et on la refait.

**Pourquoi stereo-house en premier** — son modèle de contenu (capsules, covers,
players) ne ressemble pas à un blog. Si l'API tient là, elle tient partout.
Migrer `tancrede` d'abord donnerait une fausse confiance : c'est le site dont la
lib est tirée.

**Hors phase** — `llms.txt`, `/raw/*.md`, les composants React, le template OG.

---

## Phase 5 — Les autres consommateurs + le manifeste ⬜

| #   | Livrable                                                                          |
| --- | --------------------------------------------------------------------------------- |
| 5.1 | `tancrede`, `tancredo`, `openfinanceguide` migrés                                 |
| 5.2 | La lib émet `.goflag/routes.json` au build — l'**intention déclarée**             |
| 5.3 | goflag consomme ce manifeste : compare intention et observation                   |
| 5.4 | Sous-module `og` : template `ImageResponse` piloté par tokens, partagé au favicon |

**Critère de sortie** — sur un site avec manifeste, retirer _tous_ les hreflang
du rendu doit produire une **erreur**. C'est ce qui ferme définitivement la
circularité que la phase 1 n'a fait que contourner.

---

## Phase 6 — Couche contenu / AI ⬜

| #   | Livrable                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------- |
| 6.1 | `/raw/[locale]/[slug].md` dérivé du registre (le code existe dans ofg, testé)                           |
| 6.2 | **`llms.txt` + `llms-full.txt` multilingues** — personne n'a tranché publiquement la forme              |
| 6.3 | Règles goflag correspondantes                                                                           |
| 6.4 | Export de `AI_PROVIDERS` / `buildAiPrompt` **sans** les composants React (ils traînent shadcn — cf. I1) |

**Risque** — le créneau bouge vite (`next-geo` de Continue.dev,
[discussion Next.js #90579](https://github.com/vercel/next.js/discussions/90579)
pour un support natif). **Seul l'angle multilingue est défendable** : aucun
entrant ne le traite. Si Vercel rend le markdown natif, cette phase se réduit à
`llms.txt`, et c'est très bien.

---

## Phase 7 — Public ⬜

| #   | Livrable                                                             |
| --- | -------------------------------------------------------------------- |
| 7.1 | Miroir GitHub public + bannière « issues → GitLab »                  |
| 7.2 | ✅ `@goflag/cli` publié sur npm, release et publication automatisées |
| 7.3 | ✅ Scope `@goflag` revendiqué, nom nu tenu en panneau indicateur     |
| 7.4 | README qui met la spec en avant autant que le code                   |

**Critère de sortie** — un lecteur externe peut, en 10 minutes : lire la spec,
lancer goflag sur son propre site, voir ses findings.

**Posture assumée** — `0.x`, README explicite (« extrait de mes propres sites,
API instable »). Le dépôt public capte l'essentiel du signal ; c'est **npm** qui
crée l'obligation de maintenance.

---

## 4. Ce qu'on a appris en chemin

Consigné parce que ces leçons ont chacune changé une décision, et qu'elles se
répètent :

**Le signal collecté et jamais jugé.** Trois fois : `discoverSitemap()` écrit,
testé, appelé par personne ; les empreintes conçues pour un baseline sans
consommateur ; `blocksAll` calculé et jeté. À chaque fois, la fonctionnalité
était à quelques lignes de câblage. **Avant de construire, vérifier ce qui
existe déjà.**

**Un check qu'on n'a pas de raison de croire est ignoré.** Le gate toujours
rouge, le faux négatif rassurant, le hook disproportionné, le rapport qui ne
peut jamais atteindre zéro — quatre formes du même échec. Toute contrainte doit
être soit crédible, soit proportionnée, sinon elle sera contournée.

**Ne jamais juger ce qu'on a soi-même altéré.** Quatre des cinq faux positifs
en relèvent : locale inventée, canonical ignoré, barre oblique retirée, page
non-HTML lintée. La question à se poser : _est-ce que je juge ce que le site a
déclaré, ou ce que j'en ai fait ?_

**Une suppression silencieuse ment.** Un compteur qui baisse sans explication se
lit « le problème a disparu ». D'où `ignoredHoles`, `duplicatePages`, et le
refus du vert en mode régression.

---

## 5. Points de décision restés ouverts

| Sujet                   | Question                                                                                       | Quand trancher                             |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `og:image` stereo-house | Asset statique ou route `/og` dynamique ?                                                      | quand l'envie vient                        |
| `tancrede`              | Recapturer la baseline après passage de `develop` en prod                                      | après le déploiement                       |
| `tancredo`              | Construire `/releases` et `/epk`, ou masquer les liens ?                                       | quand le WIP se termine                    |
| `lib/stet`              | Publier les ~2 150 lignes de conversion OpenAPI ? Le moat est le contenu, pas le convertisseur | phase 7                                    |
| Paquet `spec`           | Extraire de goflag, ou laisser dedans ?                                                        | quand les tests de la lib l'importent (I4) |
| `fix-my-youtube-links`  | Migrer un jour, ou jamais ?                                                                    | après la phase 5                           |
| Mode local ciblé        | « audite ces URLs sans crawler » — seulement si le `pnpm seo` manuel n'est pas lancé           | après un mois d'usage réel                 |

---

## 6. Ce que ce plan ne fait pas

- Pas de fusion de repos de sites. Ils restent indépendants.
- Pas d'extraction de `components/ui` (c'est shadcn : la copie _est_ le modèle),
  de `assets/svg`, ni des presets eslint/tsconfig.
- Pas de wrapper sur `next-intl` (`routing.ts`, `request.ts`, `proxy.ts` : 40
  lignes sans valeur ajoutée).
- `generate-locales` / `validate-locales` deviennent une commande **goflag**,
  pas une lib — c'est de l'outillage CLI, et goflag valide déjà l'i18n.
- Pas de révolution : scope Next.js App Router, 4 sites, un auteur.

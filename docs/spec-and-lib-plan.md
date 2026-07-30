# Spec → goflag + lib — Plan de développement

> **Statut :** planifié, non exécuté · **Rédigé :** 2026-07-29
> **Portée :** `goflag`, une nouvelle lib Next.js, et les 4 sites consommateurs
> (`openfinanceguide`, `stereo-house`, `tancrede`, `tancredo`).
> **Lié :** `docs/rules-catalog-plan.md` (couche règles), `openbankinglab!45`
> (phase 0, ouverte).

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
        │     goflag     │      │       lib        │
        │  VÉRIFIE que   │      │  PRODUIT ce qui  │
        │  c'est vrai    │      │  est attendu     │
        │  sur un site   │      │  par construction│
        └────────────────┘      └──────────────────┘
                 ▲                       │
                 └───────────────────────┘
                   manifeste de routes
                   (intention déclarée)
```

**Invariants d'architecture** — ils ne se négocient pas, ils existent pour
qu'aucun des deux produits ne bloque l'autre :

| #   | Invariant                                                                    | Pourquoi                                                                |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| I1  | Le **runtime** de la lib ne dépend de rien (ni goflag, ni spec)              | un petit paquet sans dépendance se fait adopter ; un paquet couplé, non |
| I2  | goflag reste utile **seul**, sur un site qui n'utilise pas la lib            | sinon il n'a qu'un utilisateur : moi                                    |
| I3  | La dépendance est **unidirectionnelle** : `spec ← goflag`, `spec ← lib(dev)` | coupler deux produits inachevés, c'est n'en livrer aucun                |
| I4  | Le paquet `spec` n'est extrait que quand **2 consommateurs** l'importent     | sinon on recrée le problème qu'on prétend résoudre                      |
| I5  | Scope **Next.js App Router** assumé                                          | permet des diagnostics et des remèdes au bon niveau d'abstraction       |

**Ce que ça donne, concrètement, quand c'est fini :**

- `goflag --start "pnpm start"` tourne en CI sur chaque MR des 4 sites et
  bloque une régression SEO avant le merge.
- Les 4 sites déclarent leurs routes une fois ; metadata, sitemap, robots, OG
  et `llms.txt` en dérivent. Il devient **impossible** d'écrire un `<head>` qui
  contredit le sitemap.
- La spec est un artefact citable, publiable seul, qui ne pourrit pas comme du
  code.

---

## 2. État de départ (mesuré, 2026-07-29)

| Fait                                              | Valeur                                                      |
| ------------------------------------------------- | ----------------------------------------------------------- |
| Sites Next.js concernés                           | 4 (+ `fix-my-youtube-links`, hors scope : stack antérieure) |
| Lignes TS/TSX, ces sites                          | 47 766                                                      |
| Lignes strictement dupliquées                     | 6 407 (13 %)                                                |
| Constructions manuelles de `x-default`            | 15                                                          |
| Générations divergentes du générateur de metadata | 3                                                           |
| goflag : règles / tests                           | 11 règles · 377 tests · 40 fichiers                         |
| stereo-house en prod                              | 4 locales servies, **0 hreflang**, 21 pages sans `og:image` |
| openfinanceguide                                  | `<head>` filtre les locales par slug, **le sitemap non**    |

**L'argument n'est pas le volume dupliqué (13 %, c'est peu). C'est la dérive.**

---

## Phase 0 — Nettoyer openbankinglab ✅

**Objectif** — retirer le code mort derrière le redirecteur 301.

**Livrables** — `openbankinglab!45` : 1013 fichiers, −248 780 lignes. Reste le
proxy, `redirect-map.json`, `robots.ts`, `sitemap.ts`, une page de secours.

**Critère de sortie** — MR mergée, déployée, 301 vérifiés en prod.

**Statut** — MR ouverte, en attente de merge.

---

## Phase 1 — Rendre goflag utilisable

> On répare l'instrument de mesure avant de mesurer. Rien dans ce plan n'a de
> sens tant que goflag rend un rapport vert sur un site cassé.

**Objectif** — goflag détecte réellement les problèmes i18n, et tourne avant le
déploiement plutôt qu'après.

**Livrables**

| #   | Livrable                                                                                                                                   | Taille |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1.1 | **Découverte amorcée par le sitemap** — le parseur existe (`core/sitemap/parse.ts`) mais n'alimente pas le frontier de crawl. Le brancher. | S      |
| 1.2 | **Axe locale explicite** — `--locales fr,en,pt-br,es` en secours quand le sitemap est absent ou partiel                                    | S      |
| 1.3 | **Mode local** — `goflag --start "pnpm start"` : boot, attente du ready, crawl de `localhost`, kill                                        | M      |
| 1.4 | **3 règles i18n** — `hreflang.missing`, `hreflang.reciprocity` (promouvoir la logique de `core/i18n.ts`), `hreflang.sitemap-mismatch`      | M      |
| 1.5 | **Remèdes Next-aware** — `fix.snippet` en code App Router, plus en `<meta>` brut                                                           | S      |

**Critère de sortie** — mesurable, pas déclaratif :

- `goflag https://stereo.house` remonte **≥ 1 finding hreflang**. Aujourd'hui il
  affiche `0 missing translations` sur un site à 4 locales sans aucun hreflang :
  c'est le faux négatif qui rend l'outil inutile.
- `goflag --start` tourne en CI sur un des 4 sites et échoue sur une régression
  introduite exprès.
- Une **baseline JSON archivée** pour les 4 sites. C'est l'entrée de tout le
  reste du plan.

**Hors phase** — le catalogue de 60 règles, la couche MCP, le baseline/diff
(M1–M3 de `rules-catalog-plan.md`). On ajoute _trois_ règles, pas un moteur.

---

## Phase 2 — Corriger les bugs que la baseline révèle

> Ce sont des bugs de production. Rien ne justifie de les faire attendre une
> refonte. Petites MR, sans tests, par site.

**Objectif** — les 4 sites passent au vert sur les règles qui existent.

**Livrables**

| Site                   | Correctif                                                                          | Taille            |
| ---------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| `stereo-house`         | hreflang absent, `og:locale` brut (`fr` au lieu de `fr_FR`), aucune `og:image`     | ~30 lignes        |
| `openfinanceguide`     | passer `localesForSlug` au bloc blog du sitemap                                    | ~10 lignes        |
| `tancrede`, `tancredo` | hreflang déclaré pour toutes les locales, y compris celles où la page n'existe pas | ~20 lignes chacun |

**Critère de sortie** — la baseline de la phase 1 rejouée : 0 finding hreflang
sur les 4 sites.

**Décision assumée** — ce code sera **supprimé** en phase 4. C'est voulu :
migrer du code correct rend les régressions visibles, migrer du code cassé les
masque. Si la phase 4 arrive vite, on peut se limiter à `stereo-house` (le seul
réellement cassé) et laisser le reste.

---

## Phase 3 — Durcir la spec

**Objectif** — transformer un jeu de règles en artefact citable.

**Livrables**

| #   | Livrable                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| 3.1 | Chaque règle porte son `rigor` (`spec-required` › `spec-recommended` › `vendor-spec` › `guideline` › `heuristic`)              |
| 3.2 | Chaque règle cite ≥ 1 `Source` (`id`, `publisher`, `url`, `retrievedAt`, paraphrase — jamais de copie verbatim de doc éditeur) |
| 3.3 | Le catalogue s'exporte en Markdown lisible **et** en JSON                                                                      |
| 3.4 | Les règles i18n de la phase 1 sont couvertes en priorité                                                                       |

**Critère de sortie** — `goflag rules --json` produit le catalogue complet ;
chaque règle i18n a une source normative ou éditeur datée.

**Hors phase** — l'extraction en paquet `spec` séparé. Voir I4 : un seul
consommateur pour l'instant. Les règles restent dans goflag.

---

## Phase 4 — Le cœur de la lib

> Maintenant seulement : avec une baseline mesurée et une spec écrite.

**Objectif** — déclarer les routes une fois, en dériver metadata + sitemap +
robots + URL OG.

**Livrables**

| #   | Livrable                                                                                  |
| --- | ----------------------------------------------------------------------------------------- |
| 4.1 | `defineSite({ baseUrl, locales, defaultLocale, name, indexable, og })`                    |
| 4.2 | `site.routes({...})` avec `collection` → disponibilité par locale **déduite**             |
| 4.3 | Sorties : `routes.sitemap`, `site.robots`, `routes.X.metadata()`, `routes.X.staticParams` |
| 4.4 | Adaptateur `content-collections`                                                          |
| 4.5 | Suite de tests = les règles de la phase 3, jugées sur la sortie rendue                    |

**Critère de sortie — le test d'ergonomie, non négociable :**

> Migrer `stereo-house` doit **supprimer du code net** : son `sitemap.ts`
> (60 lignes) et son `metadata-generator.ts` (90 lignes) contre ~20 lignes de
> config. Si le solde n'est pas négatif, l'API est ratée et on la refait.

Et : `goflag --start` vert sur `stereo-house` migré.

**Pourquoi stereo-house en premier** — c'est le plus abîmé, et son modèle de
contenu (capsules, covers, players) ne ressemble pas à un blog. Si l'API tient
là, elle tient partout. Migrer `tancrede` d'abord donnerait une fausse
confiance : c'est le site dont la lib est tirée.

**Hors phase** — `llms.txt`, `/raw/*.md`, les composants React, le template OG.

---

## Phase 5 — Les 3 autres consommateurs + le manifeste

**Objectif** — fermer la circularité de goflag.

**Livrables**

| #   | Livrable                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------- |
| 5.1 | `tancrede`, `tancredo`, `openfinanceguide` migrés                                                    |
| 5.2 | La lib émet `.goflag/routes.json` au build — l'**intention déclarée**                                |
| 5.3 | goflag consomme ce manifeste : compare intention et observation                                      |
| 5.4 | Sous-module `og` : template `ImageResponse` piloté par tokens, partagé avec le générateur de favicon |

**Critère de sortie** — le test qui prouve que la circularité est morte :

> Sur un site avec manifeste, retirer _tous_ les hreflang du rendu doit produire
> une **erreur** goflag. Aujourd'hui ça produit un rapport vert, parce que
> l'absence de hreflang rend le détecteur de hreflang muet.

Et : 4 consommateurs indépendants — condition pour qu'une API publique soit
défendable.

---

## Phase 6 — Couche contenu / AI

**Objectif** — la brique qui manque, et le seul angle réellement libre dans
l'écosystème.

**Livrables**

| #   | Livrable                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | `/raw/[locale]/[slug].md` dérivé du registre (le code existe dans ofg, testé)                                                                                             |
| 6.2 | **`llms.txt` + `llms-full.txt` multilingues** — personne n'a tranché publiquement la forme (section par locale ? fichier par locale ? `x-default` ?). Position à prendre. |
| 6.3 | Règles goflag correspondantes                                                                                                                                             |
| 6.4 | Export des fonctions `AI_PROVIDERS` / `buildAiPrompt` **sans** les composants React (ils traînent shadcn en dépendance — cf. I1)                                          |

**Critère de sortie** — `llms.txt` servi sur les 4 sites, découvrable, cohérent
avec le sitemap.

**Risque à surveiller** — le créneau bouge vite (`next-geo` de Continue.dev,
[discussion Next.js #90579](https://github.com/vercel/next.js/discussions/90579)
pour un support natif). **Seul l'angle multilingue est défendable** : aucun
entrant ne le traite. Si Vercel rend le markdown natif, cette phase se réduit à
`llms.txt` et c'est très bien.

---

## Phase 7 — Public

**Objectif** — sortir, en montrant la spec autant que le code.

**Livrables**

| #   | Livrable                                                                        |
| --- | ------------------------------------------------------------------------------- |
| 7.1 | Dépôt public (spec + lib), README qui met la spec en titre, pas la lib          |
| 7.2 | npm : **`core` seulement**. Le reste reste lisible sans être installable.       |
| 7.3 | goflag publié (déjà MIT, README prêt, `private: true` à lever)                  |
| 7.4 | Nommage : voir §2 bis. `goflag` (CLI) + `@goflag/next` (lib), scope revendiqué. |

**Critère de sortie** — un lecteur externe peut, en 10 minutes : lire la spec,
lancer goflag sur son propre site, voir ses findings.

**Posture assumée** — `0.x`, README explicite (« extrait de mes propres sites,
API instable »). Le dépôt public capte l'essentiel du signal ; c'est **npm** qui
crée l'obligation de maintenance.

---

## 2 bis. Nommage et distribution

> Ajouté 2026-07-29, après la phase 1. Disponibilité npm vérifiée le même jour :
> `goflag`, `goflag-next`, `goflag-detect` et **le scope `@goflag` entier** sont
> libres.

### Une marque, des outils nommés

**Arbitré 2026-07-30 : `goflag` est le produit principal.** La marque et l'outil
d'analyse portent le même nom nu ; `@goflag/next` est un outil _supplémentaire_
sous cette marque, pas l'inverse.

C'est un déplacement par rapport à la version initiale de ce plan, où goflag
n'était que la phase 1 et la lib occupait les phases 4 à 6. Conséquences à
tenir :

- Ce qui rend **goflag** utilisable, publiable et adopté passe devant ce qui
  fait avancer la lib. Les phases 4–6 restent valides mais cessent d'être la
  ligne d'arrivée.
- L'invariant **I2** (« goflag reste utile seul, sur un site qui n'utilise pas
  la lib ») cesse d'être une précaution et devient la thèse du produit.
- La phase 7 (public) concerne d'abord goflag. La lib peut sortir plus tard,
  sous la même marque, sans rien renégocier.

| Rôle              | Nom                | Statut                                    |
| ----------------- | ------------------ | ----------------------------------------- |
| CLI d'analyse     | **`goflag`** (nu)  | `npx goflag` ; `private: true` à lever    |
| Lib Next          | **`@goflag/next`** | à créer (phase 4)                         |
| Spec, si extraite | `@goflag/spec`     | seulement si I4 est satisfait             |
| Scope npm         | `@goflag`          | **à revendiquer maintenant**, par défense |

**Pourquoi le scope plutôt que des tirets.** `goflag-next` laisse n'importe qui
publier `goflag-ui` ou `goflag-cli` et créer la confusion ; `@goflag/*` donne le
namespace. Le revendiquer coûte zéro et n'est pas réversible dans l'autre sens.
Contrepartie assumée : un paquet scopé est un peu moins découvrable que les
`next-intl` / `next-themes` que les gens cherchent sur npm — d'où l'intérêt de
revendiquer le scope _et_ de choisir le nom de publication séparément.

**Pas de verbe sur le CLI.** `goflag detect` a été envisagé et écarté : si
`goflag` est l'outil et `@goflag/next` la lib, le CLI n'a pas besoin d'un second
nom, et « goflag detect » frôle le pléonasme (le nom veut déjà dire « signaler »).
Si des sous-commandes deviennent nécessaires — `goflag rules` pour l'export du
catalogue en phase 3 est le premier candidat réel — elles s'ajoutent **à côté**
de `goflag <url>`, qui continue de marcher. Casser l'invocation principale pour
la symétrie serait un mauvais échange. Si un verbe s'impose un jour, `audit` ou
`check` décrivent mieux que `detect` : l'outil ne détecte pas, il juge.

### Où vit le code

**Arbitré 2026-07-30.** GitLab reste l'atelier, GitHub est la vitrine.

|                                            | Où                                        | Visibilité           |
| ------------------------------------------ | ----------------------------------------- | -------------------- |
| Développement, CI, templates partagés      | `gitlab.com/tancredesimonin-indie/goflag` | **privé**            |
| Vitrine, issues, champ `repository` de npm | `github.com/tancredesimonin/goflag`       | public               |
| Scope npm                                  | `@goflag`                                 | indépendant des deux |

**Pourquoi rester dans le groupe `-indie` plutôt que sous le nom personnel.**
Pas pour la marque — le namespace GitLab n'est vu par personne, puisqu'il est
privé. Pour les `include:` : le `.gitlab-ci.yml` de goflag tire trois templates
de `tancredesimonin-indie/infrastructure`. Sortir du groupe les rend
cross-namespace, ce qui marche mais ouvre une surface de permissions (les
réglages de jeton de job CI peuvent bloquer l'accès inter-projets) — le genre de
chose qui casse six mois plus tard sans qu'on comprenne pourquoi.

Vérifié : créer un groupe est **gratuit** sur GitLab.com (plan Free, plafonné à
5 utilisateurs, 400 minutes CI/mois, 10 Gio). Si un coût existe aujourd'hui,
ce sont les **minutes**, pas le groupe — et changer de namespace n'y change
rien. En revanche le monorepo, lui, en économise : `rules:changes` évite de
relancer les tests du CLI quand seul le site a bougé.

**À faire avant le premier push du miroir** : l'historique complet part sur
GitHub, pas seulement l'état courant. Vérifier qu'aucun secret n'y a jamais
transité. (Contrôlé le 2026-07-29 : seul `.env.example` est tracké, aucun `.env`
n'a jamais été commité.)

**Friction assumée** : un miroir GitHub est en lecture seule, donc les issues
ouvertes là-bas ne seront pas vues. Bannière explicite dans le README GitHub
renvoyant vers GitLab. Acceptable tant qu'on ne cherche pas de contributeurs ;
à revoir si l'outil prend.

### Les deux usages, et pourquoi ils ne se mélangent pas

Ce sont deux **formes** différentes du même outil, pas deux options concurrentes :

|                 | Local                                      | CI                            |
| --------------- | ------------------------------------------ | ----------------------------- |
| Périmètre       | la page qu'on vient de toucher             | le site entier                |
| Durée tolérable | < 5 s                                      | 30 s – 4 min                  |
| Question        | « ce que je viens d'écrire est correct ? » | « est-ce qu'on a régressé ? » |

Un audit qui vaut le coup en CI est intolérable en hook local ; l'inverse est
presque inutile en CI. Les traiter comme le _même_ audit est ce qui les fait
paraître exclusifs.

**La CI est la maison.** Post-`deploy-develop` (les environnements
`develop.<domaine>` existent déjà sur les 4 sites), `--regressions-only`,
baseline commitée dans chaque repo pour que grandfather un finding apparaisse
dans un diff relu.

**En local : une commande, pas un hook.** Un `pnpm seo` dans chaque site,
`goflag <url> --start "pnpm start" --depth 0`, lancé délibérément quand on a
touché à la metadata. Un hook qui ajoute 60 s à chaque `pnpm build` est
désactivé en une semaine — c'est le mode d'échec qu'on a combattu toute la
phase 1 (le gate toujours rouge, le faux négatif rassurant) : coût payé à chaque
itération, valeur délivrée rarement.

**Signal à surveiller** : si la commande manuelle n'est jamais lancée après un
mois, c'est qu'il faut un mode ciblé — « audite exactement ces URLs, sans
crawler », que goflag ne sait pas faire aujourd'hui (il prend une URL d'entrée
et crawle). Pas avant : construire ce mode sans preuve du besoin, c'est la même
erreur que `discoverSitemap` écrit et jamais appelé.

### Coût CI mesuré (phase 1, `--static --no-external`)

| Site             | Pages | Durée  |
| ---------------- | ----- | ------ |
| stereo-house     | 41    | ~30 s  |
| tancredo         | 49    | ~40 s  |
| openfinanceguide | 456   | ~4 min |

Pour openfinanceguide : `--max-pages 150` sur les MR, audit complet en nocturne
(le pattern existe déjà — `security-scheduled.yml`).

### Structure du dépôt

**Monorepo, et la fenêtre est maintenant** — goflag est en `0.0.0`, jamais
publié, jamais cloné. Restructurer après publication casse les clones et le
lien npm → repo ; avant, c'est un `git mv` sur 207 fichiers.

```
goflag/
  packages/cli/     → goflag
  packages/next/    → @goflag/next
  apps/website/     → documentation et marketing
```

`packages/` vs `apps/` sépare **ce qui est publié** de **ce qui est déployé** :
un script de release qui itère sur les packages ne ramasse pas le site.

**Propriété gratuite** : le site est un site Next, donc le **premier
consommateur externe de `@goflag/next`** — et goflag peut l'auditer dans sa
propre CI. Le tool et la lib s'exercent l'un l'autre sur quelque chose de réel
qui n'est pas un site client.

**Risque à tenir** : l'invariant I3. Un monorepo rend trivial le fait que
`packages/next` importe « juste ce helper » depuis `packages/cli`, ce qui
transformerait deux produits indépendants en un bloc. Une règle
`no-restricted-imports` suffit.

**Contrainte de séquencement** : restructurer pendant que des MR goflag sont
ouvertes oblige à les rebaser à travers un `git mv` de tous les fichiers.
Merger d'abord, restructurer ensuite.

### Distribution

goflag n'est installable nulle part aujourd'hui : `private: true`, `bin` pointe
sur `dist/`, `dist/` est gitignoré, aucun script `prepare`. Deux options :

|                                  |                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Image Docker** (recommandé) | Un job dans la CI de goflag pousse `registry.gitlab.com/…/goflag:x.y.z` ; les sites l'utilisent comme `image:`. C'est **le pattern déjà en place** pour Trivy (`image: aquasec/trivy:0.59.1`). Jobs rapides, version épinglée. |
| B. Template qui clone et build   | Zéro infrastructure, mais ~1–2 min de `clone + install + build` à chaque job, sur chaque site. Bon pour essayer, mauvais à garder.                                                                                             |

Le template partagé va dans `infrastructure/gitlab-templates/`, que les 4 sites
incluent déjà.

---

## 3. Points de décision restés ouverts

| Sujet                  | Question                                                                                                                                        | Quand trancher                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Phase 2                | Corriger les 4 sites, ou seulement `stereo-house` ?                                                                                             | après la baseline de la phase 1            |
| `lib/stet`             | Publier les ~2 150 lignes de conversion OpenAPI/spec bancaire ? Le moat est le contenu, pas le convertisseur — mais c'est un arbitrage business | phase 7                                    |
| Paquet `spec`          | Extraire de goflag, ou laisser dedans ?                                                                                                         | quand les tests de la lib l'importent (I4) |
| `fix-my-youtube-links` | Migrer un jour, ou jamais ?                                                                                                                     | après la phase 5                           |
| Monorepo               | pnpm workspace pour la lib + spec ; les 4 sites restent des repos séparés                                                                       | phase 4                                    |
| Distribution goflag    | Image Docker (A) ou template clone-and-build (B) — voir §2 bis                                                                                  | avant de brancher la CI d'un site          |
| Mode local ciblé       | « audite ces URLs sans crawler » — seulement si le `pnpm seo` manuel n'est pas lancé                                                            | après un mois d'usage réel                 |

## 4. Ce que ce plan ne fait pas

- Pas de fusion de repos de sites. Ils restent indépendants.
- Pas d'extraction de `components/ui` (c'est shadcn : la copie _est_ le modèle),
  de `assets/svg`, ni des presets eslint/tsconfig.
- Pas de wrapper sur `next-intl` (`routing.ts`, `request.ts`, `proxy.ts` : 40
  lignes sans valeur ajoutée).
- `generate-locales` / `validate-locales` deviennent une commande **goflag**,
  pas une lib — c'est de l'outillage CLI, et goflag valide déjà l'i18n.
- Pas de révolution : scope Next.js App Router, 4 sites, un auteur.

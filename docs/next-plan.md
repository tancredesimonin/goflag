# goflag — Plan `@goflag/next` : produire ce que goflag vérifie

> **Rédigé** 2026-08-06
> **Portée** — le paquet `@goflag/next` : registre de routes, metadata, sitemap,
> robots. Remplace en détail les phases 4 et 5.1–5.3 de
> `docs/spec-and-lib-plan.md`, qui restent la vue d'ensemble.
> **Lié** — `docs/og-plan.md` (le paquet frère `@goflag/og`),
> `docs/rules-catalog-plan.md` (les règles que la sortie de cette lib doit
> satisfaire), `docs/sitemap-robots-plan.md` (phase G — les règles qui jugent
> les deux artefacts que cette lib produit).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------- |
| **N1** | Le périmètre de la v0 est **routes + metadata + sitemap + robots**, dans un seul registre           |
| **N2** | La lib ne lit **aucune variable d'environnement** — le site calcule, la lib dérive                  |
| **N3** | La politique de locales est **par route**, pas par site — le premier consommateur l'exige déjà      |
| **N4** | `apps/website` est le consommateur n°1, `stereo-house` le n°2 et le test d'ergonomie                |
| **N5** | Le manifeste `.goflag/routes.json` et `llms.txt` sont **hors v0**, et le registre les rend triviaux |

---

## 1. Pourquoi maintenant

La phase détection est faite : le catalogue de règles est sourcé, versionné,
overlayable par profil, et sait poser les questions qu'il refuse de trancher
(`--advisories`). goflag dit **ce qui est faux**. Il ne dit toujours pas
**comment ne pas l'écrire faux**.

```
             ┌─────────────────┐
             │      SPEC       │   règles sourcées, phases A–E livrées
             └────────┬────────┘
          ┌───────────┴───────────┐
          ▼                       ▼
   ┌─────────────┐         ┌──────────────────┐
   │   goflag    │         │  @goflag/next    │
   │ SIGNALE que │         │  PRODUIT ce qui  │
   │ c'est faux  │◄────────│  est attendu     │
   └─────────────┘ routes  └──────────────────┘
                   (hors v0)
```

Le remède doit exister, sinon la règle devient de la dette permanente — c'est le
mode d'échec consigné au §4 du plan principal (« un check qu'on n'a pas de
raison de croire est ignoré »), et l'`og:image` de stereo-house en est
l'illustration : 38 findings parkés pendant des semaines faute de remède.

**La preuve est déjà dans le dépôt.** `apps/website` implémente à la main
l'intégralité de ce que cette lib doit fournir :

| Fichier                     | Lignes  | Ce qu'il fait                               |
| --------------------------- | ------- | ------------------------------------------- |
| `src/lib/seo/metadata.ts`   | 166     | canonical, hreflang, x-default, OG, twitter |
| `src/app/sitemap.ts`        | 49      | entrées + `alternates.languages`            |
| `src/app/robots.ts`         | 25      | gate production, `Sitemap:`, `host`         |
| `src/app/manifest.ts`       | 22      | manifeste d'application                     |
| `src/app/llms.txt/route.ts` | 67      | hors v0, mais tiré du même registre à terme |
| **Total du périmètre v0**   | **262** | ce que la migration doit faire descendre    |

Ce n'est pas un prototype jetable : ce site est audité par goflag dans sa propre
CI (`pnpm --filter @goflag/website seo`). Le code est donc **déjà vérifié par la
spec** qu'il est censé produire. C'est le meilleur point de départ possible, et
c'est ce qui fait de `apps/website` le consommateur n°1 au sens de I4.

---

## 2. Ce que la lecture du consommateur n°1 a appris

Trois contraintes de design qu'aucun plan écrit d'avance n'aurait trouvées.
Elles viennent du code réel, et deux d'entre elles cassent l'API telle qu'elle
était esquissée en 4.1.

### 2.1 Un site a plusieurs politiques de locales, pas une (N3)

`metadata.ts` exporte **deux** constructeurs, et la raison n'est pas cosmétique :

- `buildPageMetadata` — page localisée sous `/[locale]`, cluster hreflang
  complet, `x-default` → locale par défaut.
- `buildDocsMetadata` — `/docs` **hors** du segment de locale, anglais
  uniquement, hreflang auto-référentiel (`en` et `x-default` pointent sur
  elle-même).

Un `defineSite({ locales })` qui suppose un cluster uniforme échoue sur le
premier consommateur. La politique de locales est donc un attribut **de route** :

| Politique     | Cluster                        | `x-default`       |
| ------------- | ------------------------------ | ----------------- |
| `localized`   | toutes les locales disponibles | locale par défaut |
| `monolingual` | la route seule                 | elle-même         |
| `unlocalized` | aucun `alternates.languages`   | absent            |

Et `availableLocales` reste surchargeable par route — le champ existe déjà dans
`LocalizedInput`, et la phase 2 l'avait déjà dérivé à la main sur stereo-house.
C'est aussi ce qui rend `--ignore-holes` moins nécessaire : une route qui
**déclare** n'exister qu'en deux locales n'est plus un trou, c'est une intention.

### 2.2 La lib ne lit pas l'environnement (N2)

`getBaseUrl()` lit `NEXT_PUBLIC_WEBSITE_FRONTEND_URL`, `isProduction()` lit
`APP_ENV`. Ce sont des conventions **de ce site** — les quatre autres n'ont ni
les mêmes noms ni la même sémantique.

Une lib qui lit `process.env` impose sa convention et devient impossible à
tester sans mutation globale. `defineSite` prend donc des **valeurs** :

```ts
export const site = defineSite({
  baseUrl: process.env.NEXT_PUBLIC_WEBSITE_FRONTEND_URL ?? "https://goflag.tech",
  indexable: process.env.APP_ENV === "production",
  // ...
});
```

Les deux lectures d'environnement restent dans le site, sur une ligne chacune,
et la lib est une fonction pure de sa configuration. Corollaire direct : les
tests de la lib n'ont rien à stubber.

### 2.3 Le sitemap et le `<head>` doivent venir du même objet

`sitemap.ts` reconstruit à la main la même carte `route × locale` que
`metadata.ts`, à partir des mêmes collections. Deux dérivations parallèles de la
même vérité, tenues d'accord par la vigilance.

C'est très exactement ce que la règle `hreflang.sitemap-mismatch` signale — une
règle que goflag a écrite parce que ce désaccord arrive. La lib le rend
**structurellement impossible** : une route déclarée une fois, projetée en
`metadata()` et en entrée de sitemap par le même code.

C'est le seul argument qui justifie à lui seul l'existence du paquet.

---

## 3. L'API

### 3.1 `defineSite`

```ts
import { defineSite } from "@goflag/next";

export const site = defineSite({
  baseUrl: string,           // absolu, sans barre finale
  name: string,              // og:site_name
  locales: readonly string[],
  defaultLocale: string,
  indexable: boolean,        // pilote robots.txt ET la metadata robots
  titleTemplate?: string,    // "%s · goflag"
  twitter?: { card?: "summary" | "summary_large_image"; site?: string },
  og?: OgConfig,             // → docs/og-plan.md, purement optionnel
});
```

`locales` porte les tags **applicatifs** (`pt-br`), et la lib fait les deux
traductions que le site refait aujourd'hui à la main : BCP 47 pour `hreflang`
et `lang` (`pt-BR`), et le format Open Graph pour `og:locale` (`pt_BR`). Ces
deux tables sont recopiées dans les quatre sites, et la règle `locale.invalid`
existe précisément parce qu'elles se recopient mal.

### 3.2 Les routes

```ts
export const routes = site.routes({
  home: { path: "", policy: "localized" },
  changelog: { path: "/changelog", policy: "localized" },
  legal: { collection: allLegals, path: (d) => `/${d.slug}`, policy: "localized" },
  docs: { collection: allDocs, path: (d) => docsHref(d.slug), policy: "monolingual", locale: "en" },
});
```

Pour une `collection`, la disponibilité par locale est **déduite** des entrées
présentes, pas déclarée. C'est le point 4.2 du plan principal, et c'est ce qui
fait qu'une traduction ajoutée met à jour hreflang, sitemap et `availableLocales`
sans qu'on y pense — le cas que la phase 2 a corrigé à la main sur stereo-house.

### 3.3 Les sorties

| Sortie                                 | Consomme    | Remplace                             |
| -------------------------------------- | ----------- | ------------------------------------ |
| `routes.X.metadata({ locale, entry })` | une route   | `buildPageMetadata` / `Docs`         |
| `routes.X.staticParams()`              | une route   | les `generateStaticParams` à la main |
| `routes.X.href({ locale, entry })`     | une route   | `docsHref` et ses cousins            |
| `site.sitemap(routes)`                 | le registre | `app/sitemap.ts`                     |
| `site.robots(routes)`                  | le registre | `app/robots.ts`                      |

Chaque sortie renvoie le type Next natif (`Metadata`, `MetadataRoute.Sitemap`,
`MetadataRoute.Robots`) : rien à désapprendre, et un site peut adopter une
sortie sans adopter les autres. Une lib qu'on ne peut adopter qu'entièrement ne
se fait pas adopter.

### 3.4 Ce que `site.robots` sait faire que le site ne fait pas

Aujourd'hui `robots.ts` renvoie `Disallow: /` hors production. Correct, et
incomplet : rien n'empêche un site non-indexable de servir quand même des pages
qui demandent l'indexation. La lib branche `indexable` sur **les deux
déclarations à la fois** — `robots.txt` et la metadata `robots` de chaque page —
ce qui rend la règle `robots.conflict` insatisfiable par construction.

C'est le motif général de la lib : une seule source, deux projections, jamais en
désaccord.

---

## 4. Les tests sont les règles

La suite de tests du paquet n'invente pas ses assertions : elle **rend** la
sortie et la juge avec le catalogue de la phase 3.

```
routes.docs.metadata({ locale: "en", entry }) → <head> rendu
                                              → Extraction
                                              → evaluate(RULES, profile: "strict")
                                              → 0 finding attendu
```

Trois propriétés en tombent :

1. La lib ne peut pas dériver de la spec sans casser sa propre CI.
2. Une règle ajoutée au catalogue **casse la lib** si la lib ne la satisfait
   pas — c'est la boucle qu'on veut, pas un accident à corriger.
3. I3 tient quand même : la lib importe le catalogue en **devDependency**,
   jamais au runtime. La règle `no-restricted-imports` qui protège
   `packages/next` doit donc être ajustée pour autoriser l'import de test, et
   uniquement lui. À faire en N-1, explicitement, pas en douce.

Le point 3 est le premier endroit où I4 se posera pour de vrai : deux
consommateurs du catalogue (le CLI + les tests de la lib) est la condition
d'extraction du paquet `@goflag/spec`. La réponse par défaut reste **non** — un
import de devDependency intra-monorepo n'est pas un consommateur externe, et
extraire un paquet pour ça recréerait le problème que I4 prétend éviter.

---

## 5. Ce que la lib ne fera pas

- **Pas de wrapper sur `next-intl`.** `routing.ts`, `request.ts`, `proxy.ts` :
  40 lignes sans valeur ajoutée, déjà arbitré au §6 du plan principal.
- **Pas de composants React.** Ils traînent shadcn — I1.
- **Pas de lecture de `process.env`** (N2).
- **Pas de JSON-LD en v0.** Le catalogue ne juge pas encore les données
  structurées au-delà de leur présence ; produire ce qu'on ne sait pas vérifier,
  c'est le signal collecté et jamais jugé, quatrième occurrence.
- **Pas de `metadataBase` implicite.** Il est dérivé de `baseUrl`, donc écrit
  une fois — mais la lib ne devine pas l'origine depuis les en-têtes de requête.
- **Pas de support Pages Router.** I5.

---

## 6. Phasage

| Étape   | Contenu                                                                                                                                                                                                                          | État        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **N-0** | **Mise au propre dans `apps/website`, sans paquet** : fusionner les deux constructeurs derrière une politique par route, sortir `process.env` des builders, faire dériver `sitemap.ts` du même tableau de routes que le `<head>` | ✅ livrée   |
| **N-1** | Créer `packages/next` : `defineSite`, `site.routes()`, `routes.metadata()`. `apps/website` migre                                                                                                                                 | ✅ livrée   |
| **N-2** | `routes.sitemap()` + `routes.robots()` depuis le même registre                                                                                                                                                                   | ✅ livrée   |
| **N-3** | **stereo-house migre** — le test d'ergonomie                                                                                                                                                                                     | ⬜ suivante |
| **N-4** | Publication `@goflag/next@0.1.0`                                                                                                                                                                                                 | ⬜          |
| hors v0 | `.goflag/routes.json` (5.2/5.3), `llms.txt` (phase 6), `tancrede` / `tancredo` / `openfinanceguide` (5.1)                                                                                                                        | ⬜          |

### Deux écarts assumés, décidés en écrivant le code

**`staticParams` et `href` ne sont pas livrés.** La forme des paramètres est une
propriété de la route de système de fichiers — `[slug]` contre `[[...slug]]` —
que le registre ne connaît pas. La dériver serait deviner, et une devinette dans
`generateStaticParams` produit des pages manquantes plutôt qu'une erreur.
`routes.family(nom)` rend les routes d'une famille ; le site en tire ses
segments en trois lignes visibles. À reprendre quand un deuxième site aura
montré la forme réelle du besoin.

**Le §4 — « les tests sont les règles » — n'est pas branché.** `@goflag/cli`
exporte `runAudit` et les types du rapport, pas le registre ni le modèle
d'extraction, et I3 interdit de contourner son point d'entrée public. Aucun
ajustement de `no-restricted-imports` n'a donc été nécessaire, et I4 n'a pas
bougé. À la place, `src/conformance.test.ts` porte des invariants écrits à la
main, chacun nommé d'après la règle qu'il couvre — réciprocité hreflang,
`x-default` dans son propre cluster, sitemap et `<head>` d'accord, `og:locale`
territorialisé. Ce fichier est explicitement provisoire : quand
`goflag rules --json` livrera le catalogue, il est remplacé par un harnais qui
évalue les vraies règles.

**N-0 d'abord, et sans paquet.** C'est la leçon du §4 appliquée : on n'extrait
qu'une fois que la forme est juste sur un consommateur réel. Les trois
contraintes du §2 ont été trouvées en lisant du code écrit à la main ; il y en a
probablement une quatrième que seule la fusion des deux constructeurs révélera.
N-0 ne coûte pas de temps perdu — c'est le refactoring que la migration ferait
de toute façon, fait pendant qu'il est encore gratuit d'avoir tort.

### Critères de sortie

| Étape   | Critère                                                                                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N-0** | Une seule fonction construit la metadata des deux familles de pages, et `sitemap.ts` ne reconstruit plus la carte des locales                                                          |
| **N-2** | ✅ `pnpm --filter @goflag/website seo` : 0 lien cassé, 0 trou de traduction, 0 problème de site, avant comme après. Les 3 `title.length` restants sont de la copy traduite, antérieurs |
| **N-3** | Migrer stereo-house **supprime du code net**. Solde positif ⇒ l'API est ratée, on la refait (non négociable, hérité de la phase 4)                                                     |
| **N-4** | Un `pnpm add -D @goflag/next` dans un projet vierge, hors monorepo, produit un `<head>` que goflag juge propre                                                                         |

Le critère N-2 est nouveau et vaut mieux que le compte de lignes : le site est
le seul consommateur qui **prouve** sa propre conformité à chaque pipeline.

**Mesuré sur le consommateur n°1** : `apps/website` passe de 252 à 140 lignes de
code de production sur ce périmètre, soit **−112 en solde**, en gagnant au
passage les validations et deux correctifs. La bibliothèque coûte 919 lignes de
source pour 858 de tests. Le vrai test d'ergonomie reste N-3 : le site dont
l'API n'a pas été tirée.

---

## 7. Risques

| Risque                                                                        | Traitement                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| L'API des routes ne tient pas sur un modèle de contenu non-blog               | C'est pourquoi stereo-house (capsules, covers, players) est le n°2 et pas `tancrede`                |
| Next change ses conventions de metadata entre deux majeures                   | La lib renvoie des types Next natifs : la surface exposée au changement est la leur, pas la nôtre   |
| Les tests de la lib importent le catalogue et le couplent au CLI              | devDependency uniquement, lint ajusté nommément en N-1, I4 réévalué mais réponse par défaut « non » |
| N-0 fait dériver le site pendant que le catalogue de règles bouge (phase F/G) | N-0 ne change aucun comportement observable : `pnpm seo` doit rester vert à chaque commit           |

---

## 8. Ce que ce plan ne fait pas

- Pas de fusion des dépôts de sites : ils restent indépendants.
- Pas d'extraction de `@goflag/spec` (I4 : toujours un seul consommateur réel).
- Pas de `defineSite` générique multi-framework — I5, scope Next App Router.
  Le paquet frère `@goflag/og`, lui, est agnostique par construction ; voir
  `docs/og-plan.md` §2.

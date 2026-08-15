# goflag — Plan `@goflag/og` : images de partage dynamiques

> **Rédigé** 2026-08-02 · **Réécrit** 2026-08-06 (frontière du paquet, et un
> consommateur réel est apparu entre-temps) · **Amendé** 2026-08-08 (le `.ico`,
> §6.4 et §7.1 — la lacune que la convention Next ne couvre pas) · **Amendé**
> 2026-08-15 (OG-1a livrée : §7 rectifié, OG-1 scindé, D8 au §10.1)
> **Portée** — le paquet `@goflag/og`, les règles OG du catalogue, et la
> frontière avec le pipeline d'illustrations, qui reste **hors goflag**.
> **Lié** — `docs/next-plan.md` (le paquet frère), `docs/spec-and-lib-plan.md`
> (§5 décision « og:image stereo-house »), `docs/rules-catalog-plan.md` (§4.2
> ogp.me, §4.4 `og.image.missing`).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| **D1** | `@goflag/og` est un **paquet à part**, à cœur **sans moteur de rendu** — agnostique par construction                 |
| **D2** | L'image se rend **au build**, pas en route dynamique ni en asset dessiné à la main                                   |
| **D3** | Un **gabarit par défaut piloté par tokens**, pas une galerie de gabarits                                             |
| **D4** | Les **illustrations de contenu** (blog, LinkedIn, vidéo) ne rentrent pas dans goflag                                 |
| **D5** | L'OG entre d'abord par les **règles**, pas par la lib — l'auditeur avant l'outil                                     |
| **D6** | Le `.ico` est **empaqueté** par le cœur, jamais rendu par lui — le site fournit les buffers                          |
| **D7** | C'est le seul artefact **committé** de la lib : il est livré avec sa garde d'idempotence                             |
| **D8** | Une règle ne touche jamais au réseau : une **passe de sondage dédiée** le fait, et reverse dans l'extraction (§10.1) |

---

## 1. Pourquoi l'OG appartient à goflag

Pas par extension de périmètre : parce que la boucle est déjà ouverte d'un côté.

```
             ┌─────────────────┐
             │      SPEC       │  og.image.* , og.locale.*  (ogp.me, vendor-spec)
             └────────┬────────┘
          ┌───────────┴───────────┐
          ▼                       ▼
   ┌─────────────┐         ┌──────────────────┐
   │   goflag    │         │   @goflag/og     │
   │ SIGNALE que │         │  PRODUIT l'image │
   │ l'image     │◄────────│ par construction │
   │ manque      │         └──────────────────┘
   └─────────────┘
```

`og.image.missing` est livrée depuis la phase 1 et produit **38 findings sur
stereo-house**, parkés au §5 du plan principal parce qu'aucun remède n'était
disponible. C'est le mode d'échec du §4 :

> « Un check qu'on n'a pas de raison de croire est ignoré. »

Une règle dont le remède demande « soit un asset, soit une route à écrire »
finit en dette permanente. Ce paquet est ce remède. Il ne change pas la thèse du
produit — **I2 tient** : goflag reste utile seul, et la règle garde tout son sens
sur un site qui n'utilise pas la lib.

### Où ça s'arrête

| Brique                                                   | Dans goflag ?                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| Règles `og.image.*` / `og.locale.*` sourcées ogp.me      | ✅ catalogue — renforce l'auditeur, indépendant de la lib             |
| Règles `icons.*` — le Fact est extrait, rien ne le juge  | ✅ catalogue — §7.1                                                   |
| Empaquetage `.ico` multi-tailles                         | ✅ cœur — la seule sortie que Next ne sait pas produire (§6.4)        |
| Mécanisme : gabarit, locale, fontes, tokens, alt traduit | ✅ `@goflag/og` — remède de la règle                                  |
| Un gabarit par défaut, piloté par tokens                 | ✅ le strict nécessaire pour que le remède soit utilisable            |
| Une galerie de gabarits                                  | ⛔ `ogimagecn` (shadcn-labs) occupe le terrain ; rien à y gagner      |
| Illustrations d'articles générées par agent (Playwright) | ⛔ dépôt privé — juger un site ≠ fabriquer son contenu                |
| Vidéo / animation (Remotion)                             | ⛔ dépôt privé ; licence source-available, payante au-delà de 3 pers. |
| Composants React de présentation                         | ⛔ I1 — ils traînent shadcn                                           |

**Seul artefact partagé entre le public et le privé : les tokens.** Le pipeline
privé lit le même `og.tokens` que la lib, et rien d'autre.

---

## 2. D1 — La frontière du paquet

La version précédente de ce plan faisait de l'OG un sous-module
`@goflag/next/og`. C'était l'hypothèse implicite de I5 (« scope Next App
Router »), pas une décision prise. Elle est reprise ici, et renversée.

### Ce qui est réellement lié au framework

Presque rien. Une image OG, c'est trois choses distinctes :

| Brique                                                                        | Liée au framework ? | Taille         |
| ----------------------------------------------------------------------------- | ------------------- | -------------- |
| Le gabarit (arbre JSX + styles)                                               | non                 | l'essentiel    |
| La dégression de taille, l'alt, les tokens                                    | non                 | l'essentiel    |
| Le **rendu** (JSX → SVG → PNG)                                                | non, mais coûteux   | satori + resvg |
| La **convention de fichier** (`opengraph-image.tsx`, `generateImageMetadata`) | oui                 | ~30 lignes     |

Un arbre JSX est un objet nu — `{ type, props }`. Satori le mange ; `next/og`,
qui embarque satori, aussi. Donc la portabilité ne demande pas de porter le
moteur : elle demande de **ne pas le mettre dans le cœur**.

### La forme retenue

```
@goflag/og          cœur : tokens, gabarit, fitTitle, alt.
                    Retourne { element, size, alt } — ne rend rien.
                    Runtime : aucune dépendance (peer react/jsx-runtime).

@goflag/og/next     30 lignes : ImageResponse + generateImageMetadata.
                    peerDependency: next.

@goflag/og/render   satori + @resvg/resvg-js. ÉCRIT LE JOUR OÙ UN
                    CONSOMMATEUR NON-NEXT EXISTE, pas avant.
```

### Pourquoi pas satori tout de suite

C'est la question posée, et la réponse est **non, pas encore** :

- `@resvg/resvg-js` est un binaire natif à `optionalDependencies` par
  plateforme — la friction classique en CI, en Docker et sur Alpine. `next/og`
  absorbe ce problème pour nous.
- Sur les quatre sites, qui sont tous des sites Next, ça installerait satori
  **deux fois** : une dans `next`, une chez nous. Coût de disque et
  d'installation imposé à tout le monde, contre I1.
- Écrire un moteur pour un site Astro qui n'existe pas, c'est le mode d'échec
  consigné au §4 du plan principal — `discoverSitemap()` écrit, testé, appelé
  par personne. Troisième occurrence connue.

**Ce que la migration Astro coûtera vraiment** : écrire `@goflag/og/render`,
une cinquantaine de lignes, sans redessiner ni le gabarit ni la logique i18n. Le
design est portable dès aujourd'hui ; seul le binding ne l'est pas, et c'est le
morceau jetable.

### Le couplage résiduel, assumé

Le cœur a besoin d'une fabrique JSX. `react/jsx-runtime` en peer est le choix
pragmatique : Next l'a déjà, ça coûte zéro sur les quatre sites. Hors React,
`preact/jsx-runtime` fonctionne, et une fabrique locale de quinze lignes lève le
couplage complètement si le besoin apparaît. C'est consigné ici pour que la
sortie soit un choix, pas une découverte.

### Pourquoi un paquet et pas un sous-module

Un sous-module rendrait l'OG inadoptable sans adopter le registre de routes. Ce
sont deux décisions indépendantes : un site peut vouloir de belles cartes sans
laisser une lib décider de ses routes. `@goflag/next` **peut** dépendre de
`@goflag/og` pour câbler l'URL de l'image dans la metadata ; l'inverse n'existe
jamais.

---

## 3. D2 — Ni asset statique, ni route dynamique

`opengraph-image.tsx` dans une route à `generateStaticParams` est **rendu au
build** : Next produit un PNG et le sert en fichier immuable à URL hashée. On a
l'écriture dynamique (code + données + locale) **et** le service statique (CDN,
zéro runtime, zéro route à maintenir).

| Option                    | Écrit en code | Coût requête | Route à maintenir |
| ------------------------- | ------------- | ------------ | ----------------- |
| Asset dessiné à la main   | ❌            | 0            | non               |
| Route `/og` dynamique     | ✅            | 50–100 ms    | oui               |
| **`opengraph-image.tsx`** | ✅            | **0**        | **non**           |

**Coût à mesurer, pas à supposer** : openfinanceguide fait ~456 pages ; à
50–100 ms l'image, cela ajoute ~25–45 s de build. Acceptable a priori — à
vérifier sur le premier gros site. Si ça dérape : `generateStaticParams`
partiel, le reste en ISR.

**Runtime `nodejs`**, pas edge : le build lit les fontes depuis le disque.

---

## 4. Le contrat technique — satori, vérifié le 2026-08-02

| Disponible                                                                | Absent                          |
| ------------------------------------------------------------------------- | ------------------------------- |
| `flex`, `contents`, `none` · `position` relative/absolute · `gap`         | `display: grid`                 |
| `boxShadow`, `filter`, `clipPath`, `maskImage`, `transform` 2D, `opacity` | `z-index`, transforms 3D        |
| `backgroundImage` : dégradés linéaires/radiaux, URL                       | `calc()`                        |
| `lineClamp`, `textWrap: balance`, `textOverflow: ellipsis`, `textShadow`  | kerning, ligatures              |
| `<img>` : URL distante, data URI, buffer                                  | `<style>`, `<link>`, `<script>` |

Trois conséquences directes :

1. **Pas de `z-index` → l'empilement suit l'ordre du DOM.** Le fond vient en
   premier, le contenu ensuite. C'est ce qui rend le motif « fond Canva + texte
   en code » trivial : `<img>` du fond, puis un voile, puis le texte.
2. **WOFF2 non supporté** (TTF/OTF/WOFF seulement). La plupart des CDN de fontes
   servent du woff2 : il faut committer le fichier.
3. **RTL non supporté.** Locales actuelles — `fr`, `en`, `es`, `de`, `it`,
   `pt-BR` — toutes latines, donc non-sujet. Mais c'est une **frontière dure**.

### 4.1 Les fontes appartiennent au site

La lib n'embarque **aucun fichier de fonte** — ce serait des centaines de Ko
imposés à tout le monde, contre I1. Le site fournit ses buffers ; la lib fournit
un `loadFont()` mémoïsé (une lecture par processus de build, pas par image).

Les locales étant latines, **un seul fichier couvre tout** : pas de résolution
fonte-par-script à écrire aujourd'hui.

### 4.2 Le texte qui déborde — le vrai problème i18n

C'est là que la valeur se trouve, et personne ne la traite. Un gabarit calibré
sur un titre anglais casse en allemand : les traductions s'allongent
couramment de 15 à 30 %.

Satori **ne sait pas mesurer le texte** avant le rendu. Donc pas de `fitText`
exact ; une dégression déterministe :

```
fitTitle(text, locale) → { fontSize, lineClamp }
   longueur en graphèmes → paliers de taille (72 / 60 / 52 / 44)
   + facteur par locale, surchargeable dans les tokens
   + lineClamp: 3 et textOverflow: ellipsis en filet de sécurité
   + textWrap: 'balance' pour éviter la ligne orpheline
```

Les facteurs par locale sont une **heuristique assumée**, au sens du catalogue de
règles. Ils ne se devinent pas : ils se vérifient par snapshot, une image par
locale. Comme le cœur ne rend rien, ces snapshots tournent dans vitest **sans
build Next** — c'est le bénéfice concret de la frontière du §2, et il vaut plus
que l'argument Astro.

---

## 5. L'état du consommateur n°1

`apps/website` a déjà écrit tout ça à la main. C'est OG-0, livré — mais sur le
site du produit, pas sur stereo-house comme le plan le prévoyait.

| Fichier                                | Lignes | Contenu                                                |
| -------------------------------------- | ------ | ------------------------------------------------------ |
| `src/lib/seo/og.tsx`                   | 100    | le gabarit : terminal sombre, logo, titre, pastilles   |
| `src/app/[locale]/opengraph-image.tsx` | 12     | home, titre traduit via `next-intl`                    |
| 4 autres `opengraph-image.tsx`         | ~48    | changelog, slug, docs/cli, docs/rules, docs/rules/[id] |
| `src/app/og/docs/[...slug]/route.tsx`  | 29     | contournement du catch-all                             |

### Ce qu'il prouve

Le motif marche, il tient en 100 lignes, et le contournement du catch-all est un
vrai savoir : **Next refuse de placer une image de metadata sous un segment
catch-all**, donc les docs passent par un route handler `force-static` avec
`generateStaticParams`. C'est exactement le genre de chose qu'on n'a pas envie de
redécouvrir sur cinq sites, et donc exactement ce qui justifie la lib.

### Ce qu'il n'a pas — et que goflag saurait reprocher

| Manque                                                                                                     | Règle concernée                              |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| ~~Aucun `alt`~~ — **réglé en OG-2** : `generateImageMetadata` porte un alt traduit sur les six cartes      | `og.image.alt`, livrée en OG-1a              |
| ~~Le titre n'est pas dégressé~~ — **réglé en OG-2** : `fitTitle`, `lineClamp` et `textWrap: balance`       | aucune ; c'était le trou du §4.2             |
| Aucune fonte chargée : rendu à la fonte ambiante, donc `fontWeight: 600` n'a pas de fonte grasse à trouver | aucune ; documenté et assumé dans le fichier |
| ~~Couleurs en hex avec un commentaire~~ — **réglé en OG-2** : `OG_TOKENS`, comparés au thème par un test   | aucune ; c'est ce que les tokens résolvent   |

Le premier était le plus parlant : **le site de goflag échouait à une règle OG
que goflag n'avait pas encore écrite.** C'est le bon ordre — D5, la règle avant
l'outil — et c'est ce qui rend l'étape OG-1 non négociable avant l'extraction.
La règle l'a dit 46 fois avant que le remède existe, ce qui est exactement ce que
le §1 demandait.

**Ce que l'écriture du remède a appris**, et qui rejoint le contournement du
catch-all dans ce que `@goflag/og` devra emballer : `getTranslations` ne peut pas
être appelé depuis `generateImageMetadata`. Next l'exécute comme
`generateStaticParams` — au build, sans requête — et la configuration next-intl y
touche `headers()`, donc le build échoue net plutôt que de dégrader :

```
Route /[locale]/changelog/opengraph-image/[__metadata_id__] used
`headers()` inside `generateStaticParams`.
```

Le remède est un traducteur construit directement sur les messages JSON
(`src/i18n/static.ts`), et il sert au **titre comme à l'alt** : une image et sa
description lues par deux chemins différents sont précisément la dérive que
`og:image:alt` existe pour fermer.

---

## 6. L'API

### 6.1 Les tokens

```ts
import { defineOg } from "@goflag/og";

export const og = defineOg({
  tokens: {
    bg,
    fg,
    accent, // 3 couleurs, pas 5
    font: { regular, bold }, // buffers TTF/OTF fournis par le site
    logo, // data URI ou buffer
  },
  fallback: "/og-default.png", // routes sans image dédiée
  fit: { scale: { de: 0.85 } }, // surcharge des facteurs par locale
});
```

Quand `@goflag/next` est présent, `defineSite({ og })` prend ce même objet et
câble l'URL de l'image dans la metadata. Quand il est absent, `defineOg` se
suffit — c'est tout l'intérêt de D1.

### 6.2 La route — deux lignes d'export

```tsx
// app/[locale]/capsules/[slug]/opengraph-image.tsx
import { ogImage } from "@goflag/og/next";
import { og } from "@/lib/og";

const image = ogImage(og, async ({ params }) => {
  const capsule = await getCapsule(params.slug, params.locale);
  return {
    eyebrow: capsule.kind,
    title: capsule.title,
    meta: formatDate(capsule.date, params.locale),
    alt: t("og.alt", { title: capsule.title }), // traduit
    background: capsule.cover, // optionnel
  };
});

export const generateImageMetadata = image.generateImageMetadata;
export default image.render;
```

**Pourquoi `generateImageMetadata` et pas l'export `alt`** : l'export statique
`alt` de Next est une chaîne constante. Un `alt` traduit et dérivé des données
doit passer par `generateImageMetadata`, qui le porte par image. C'est le détail
qui rend l'OG réellement multilingue — et celui qui manque aujourd'hui sur les
cinq fichiers du site.

Le contenu reste **dans le site**. La lib ne connaît que des champs neutres.

### 6.3 Le catch-all, et le favicon en prime

`ogImage.route(og, loader)` emballe le contournement du §5 : un route handler
`force-static` pour les segments catch-all, avec la même signature. Le savoir
tient dans la lib au lieu d'être recopié.

`icon.tsx` et `apple-icon.tsx` utilisent le même arbre et les mêmes tokens. Un
jeu de tokens → og:image + `icon.png` + apple-touch-icon, tous cohérents. C'est
gratuit une fois les tokens posés.

Deux corrections à la version précédente de ce paragraphe, qui promettait trop :

- **« favicon » n'inclut pas le `.ico`.** `ImageResponse` sort du PNG ;
  `icon.tsx` émet donc un `<link rel="icon" type="image/png">`. Un `/favicon.ico`
  à la racine reste hors d'atteinte de la convention — voir §6.4.
- **« le catalogue couvre déjà `links.icons` »** était faux. `icons` est
  **extrait** (`extraction/from-page.ts`, `Fact<unknown>`) et **aucune règle ne
  le juge** : aucun id `icons.*` n'existe. C'est le signal collecté et jamais
  jugé, cinquième occurrence. Le §7.1 le corrige.

### 6.4 D6 — Le `.ico`, la seule sortie que Next ne sait pas produire

Next n'a **aucune convention de fichier générant un `.ico`** : `favicon.ico` est
un fichier statique, et `icon.tsx` passe par `ImageResponse`, qui sort du PNG. Un
conteneur ICO multi-tailles — en-tête `ICONDIR`, table `ICONDIRENTRY`, PNG
concaténés — ne sort de nulle part dans la chaîne.

C'est une lacune réelle, et elle est **déjà comblée à la main quatre fois** :
`tancrede`, `tancredo`, `openfinanceguide` et `stereo-house` embarquent chacun
leur `scripts/generate-favicon*.mjs`, avec le même empaquetage ICO recopié. Ce
n'est pas `discoverSitemap()` : ce sont quatre appelants qui existent aujourd'hui.

#### La forme

L'empaquetage est de la manipulation de `Buffer` pure — une trentaine de lignes,
**aucune dépendance, aucun moteur de rendu**. Il consomme des PNG déjà rasterisés
et rend un buffer :

```ts
buildIco(entries: { width: number; buffer: Buffer }[]) → Buffer
```

Il appartient donc au **cœur**, à côté de `fitTitle`, et non à `@goflag/og/next` :
il ne connaît ni React, ni satori, ni Next. C'est même la partie la plus pure du
paquet — le reste du cœur a au moins besoin d'une fabrique JSX en peer.

#### Qui rasterise

Le site, exactement comme il fournit ses fontes (§4.1). Même contrat, même
raison : la lib n'embarque pas ce que le site a déjà.

Et il l'a déjà. **`sharp` est en dépendance directe des cinq sites**,
`apps/website` compris, parce que Next s'en sert pour l'optimisation d'images.
Rasteriser le gabarit en 16/32/48 coûte donc zéro installation supplémentaire.
C'est ce qui fait que le `.ico` **ne rouvre pas le débat du §2** : il ne demande
ni satori dupliqué, ni binaire natif `resvg`, ni friction Alpine. Le rasteur est
déjà là, sur chaque site concerné.

#### D7 — le seul artefact committé, donc le seul qui peut dériver

Tout le reste de `@goflag/og` est rendu au build (D2) et n'entre jamais dans git.
Le `.ico`, lui, **doit être committé** : c'est un fichier statique servi à la
racine.

Un artefact généré **et** committé a un mode d'échec propre, observé sur ces
sites : un hook de pre-commit le régénère à chaque commit, et les octets changent
sans que les pixels changent — les encodeurs PNG ne sont pas stables d'une version
de `sharp` à l'autre. Le fichier est sali à chaque commit, et le bruit finit
committé. Constaté sur `stereo-house` (trois icônes modifiées, pixels vérifiés
identiques) et corrigé sur `tancrede`.

La lib ne peut donc pas se contenter de produire le fichier : elle diffuserait ce
défaut à chaque site adoptant. L'empaquetage est livré **idempotent par
construction** :

```ts
writeIco(path, entries, { fingerprintOf: sources }) → "written" | "unchanged"
```

L'empreinte porte sur les **entrées** (le SVG source, les tailles demandées),
jamais sur les octets produits — sinon un bump de `sharp` compte comme un
changement. Un mode `--check` en découle, qui échoue sans rien écrire : c'est ce
qui rend le fichier vérifiable en CI plutôt que régénéré en pre-commit.

---

## 7. Les règles à ajouter (catalogue, avant la lib)

Toutes sourcées ogp.me (`vendor-spec`, déjà au §4.2 du catalogue) :

| Règle                      | Rigueur     | Ce qu'elle juge                                              | État     |
| -------------------------- | ----------- | ------------------------------------------------------------ | -------- |
| `og.image.absolute`        | vendor-spec | ogp.me exige une URL absolue                                 | ✅ OG-1a |
| `og.image.dimensions`      | vendor-spec | `og:image:width` / `height` déclarés                         | ✅ OG-1a |
| `og.image.ratio`           | vendor-spec | la forme réelle, contre le 1.91:1 de la carte                | ✅ OG-1a |
| `og.image.alt`             | guideline   | `og:image:alt` présent                                       | ✅ OG-1a |
| **`og.locale.missing`**    | vendor-spec | `og:locale` absent sur un site multilingue                   | ✅ OG-1a |
| **`og.locale.alternates`** | vendor-spec | `og:locale:alternate` cohérent avec les hreflang             | ✅ OG-1a |
| `og.image.reachable`       | vendor-spec | 200 + content-type image — demande le réseau, voir **OG-1b** | ⬜ OG-1b |

**La ligne `dimensions` de la version précédente en portait deux.** « Déclarés »
et « ratio ~1.91:1 » sont deux défauts distincts, avec deux remèdes et deux
sévérités : une règle booléenne n'a qu'une sévérité, et un ratio est une mesure,
donc une règle `scored`. Les séparer coûte une entrée de catalogue et rend les
deux verdicts lisibles.

Les deux dernières sont **l'angle défendable** : `og:locale` /
`og:locale:alternate` sont dans le protocole, personne ne les vérifie, et goflag
connaît déjà l'axe des locales et la réciprocité hreflang. Même raisonnement que
pour `llms.txt` multilingue — la valeur est dans l'intersection i18n, pas dans le
sujet générique.

Ces règles ne dépendent pas de la lib et se livrent dans le catalogue.

### 7.1 La famille `icons.*` — un Fact extrait que rien ne juge

`icons` est déjà collecté par l'extraction (`extraction/from-page.ts`), et le
catalogue n'expose **aucun id `icons.*`**. Le signal est là, personne ne s'en
sert. C'est le mode d'échec du §4, à l'envers : au lieu d'un check qu'on ignore,
une donnée qu'on ne juge pas.

Les sources sont déjà au catalogue (§4.2 / §4.3) — WHATWG link types, MDN `<link>`
types, la doc Apple, le W3C Web App Manifest. Rien à sourcer de neuf.

| Règle                       | Rigueur     | Ce qu'elle juge                                             | État     |
| --------------------------- | ----------- | ----------------------------------------------------------- | -------- |
| `icons.missing`             | guideline   | aucune icône déclarée, ni `<link rel="icon">` ni manifeste  | ✅ OG-1c |
| `icons.apple-touch.missing` | vendor-spec | pas d'`apple-touch-icon` (doc Apple, déjà sourcée)          | ✅ OG-1c |
| `icons.manifest-mismatch`   | guideline   | le manifeste et le `<head>` se contredisent (voir plus bas) | ✅ OG-1c |
| `icons.ico.missing`         | guideline   | aucun `/favicon.ico` servi à la racine                      | ✅ OG-1d |
| `icons.unreachable`         | vendor-spec | une icône déclarée ne répond pas 200 + content-type image   | ⬜ OG-1b |
| `icons.sizes-mismatch`      | guideline   | le `sizes` déclaré ne correspond pas aux dimensions réelles | ⬜ OG-1b |

**Ce que le manifeste apporte, et ce qu'il coûte.** Le manifeste est sondé par
page depuis toujours (`probeManifest`, appelé par `inspect.ts`) et **son contenu
n'atteignait rien** : sixième occurrence du signal collecté et jamais jugé. Il
entre donc dans l'extraction, en champ additif sous `links.manifest` — donc sans
bump d'`EXTRACTION_VERSION` — avec un `parsed` à **trois états** : absent quand
aucune sonde n'a tourné, `false` quand elle a échoué, `true` avec les icônes
sinon. « Pas regardé » et « regardé, rien trouvé » sont deux affirmations
différentes, et une seule des deux dit quelque chose sur le site.

**`icons.manifest-mismatch` ne juge pas la divergence des deux listes.** Elles
divergent normalement : un `apple-touch-icon` n'est pas une icône de manifeste,
et une icône PWA de 192 px n'a rien à faire dans le `<head>`. Une règle qui
comparerait les ensembles à plat se déclencherait sur tous les sites corrects —
`apps/website` compris. Elle ne juge donc que deux vraies contradictions : le
**même fichier** décrit avec deux `sizes` ou deux `type`, et un manifeste qui
déclare des icônes quand le `<head>` n'en déclare aucune — là où l'onglet du
navigateur va chercher, et où il ne trouverait rien.

Deux remarques d'honnêteté sur la rigueur.

`icons.ico.missing` est **guideline, pas vendor-spec** : aucune spec n'exige un
`/favicon.ico`. C'est une convention de repli — les navigateurs modernes suivent
le `<link>` déclaré, mais les clients naïfs (lecteurs de flux, dépliage de liens,
certains crawlers) tapent la racine à l'aveugle. La règle mérite d'exister, pas
d'être présentée comme normative. `apps/website` la déclenchera : il ne sert
aucun `.ico`.

`icons.unreachable` et `icons.sizes-mismatch` réutilisent le sondage de liens
existant, comme `og.image.reachable`. `sizes-mismatch` est la plus rentable des
six en pratique : `tancrede` déclare aujourd'hui
`{ url: "/favicon.ico", sizes: "48x48" }` alors que le conteneur porte 16, 32
**et** 48. La déclaration est à moitié vraie, et rien ne le dit.

---

## 8. Le gabarit par défaut — ce qu'il encode

Des contraintes, pas du goût :

| Règle                                                                     | Pourquoi                               |
| ------------------------------------------------------------------------- | -------------------------------------- |
| 1200 × 630, marge 72 px                                                   | ratio 1.91:1 attendu par les unfurls   |
| 3 zones flex : eyebrow / titre / pied                                     | une structure lisible en vignette      |
| **Un seul grand corps** (titre 44–72), tout le reste ≤ 24                 | le contraste d'échelle _est_ le design |
| 1 famille, 2 graisses max                                                 | plus = amateur                         |
| 1 accent, jamais 3                                                        | idem                                   |
| Fond : aplat, dégradé à 2 arrêts proches, ou image assombrie par un voile | un dégradé arc-en-ciel date le visuel  |
| Grain SVG en data URI à 3–5 % d'opacité                                   | tue l'aspect « CSS plat »              |
| Logo en bas à gauche, meta en bas à droite                                | l'œil lit en Z                         |
| Contraste ≥ 4.5:1                                                         | la vignette est vue en 300 px de large |

**Le motif Canva** : exporter le fond **sans le texte**, l'utiliser en `<img>` de
fond, superposer le texte en code. L'ordre DOM suffit (pas de `z-index`).

À éviter : tout centré, un titre sur 4 lignes, une capture d'écran en fond, du
texte sur une zone chargée sans voile.

---

## 9. Limites connues

| Limite                                                    | Conséquence                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| Satori ne gère pas le RTL                                 | une locale arabe/hébraïque exigerait un autre moteur (Playwright) |
| Pas de mesure de texte                                    | le calage est heuristique, validé par snapshot                    |
| Pas de WOFF2                                              | fonte committée en TTF/OTF                                        |
| Fonte non latine = fichier lourd                          | à sous-ensembler le jour où ça arrive, pas avant                  |
| Rendu au build → un changement de token = rebuild du site | acceptable ; c'est déjà vrai du reste de la metadata              |
| `ImageResponse` ne sait pas produire de `.ico`            | conteneur empaqueté par le cœur, rasterisé par le site (§6.4)     |
| Le `.ico` doit être committé, pas rendu                   | livré idempotent (D7), sinon la lib diffuse la dérive d'encodeur  |
| Cœur sans moteur → le snapshot passe par un binding       | assumé : c'est ce qui rend le cœur testable sans build Next       |

---

## 10. Phasage

| Étape     | Contenu                                                                                                                                                                                                                                                                | Dépend de |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **OG-0**  | ✅ **livré** — gabarit écrit à la main dans `apps/website` (§5)                                                                                                                                                                                                        | —         |
| **OG-1a** | ✅ **livrée** — les 6 règles locales du §7 dans le catalogue sourcé. Sur `apps/website` : **46 `og.image.alt` et 20 `og.locale.alternates`**, et rien d'autre — les quatre autres passent déjà                                                                         | catalogue |
| **OG-1b** | `og.image.reachable`, `icons.unreachable`, `icons.sizes-mismatch` — les trois règles qui demandent le réseau (§10.1). Hors chemin critique : elles ne partagent rien avec le reste de l'OG                                                                             | catalogue |
| **OG-1c** | ✅ **livrée** — `icons.missing`, `icons.apple-touch.missing`, `icons.manifest-mismatch`, plus le contenu du manifeste dans l'extraction. `apps/website` les passe déjà toutes les trois : `icon.svg`, `apple-icon.tsx` et un manifeste qui ne se contredit pas         | catalogue |
| **OG-1d** | `icons.ico.missing` — une sonde d'origine calquée sur `probeRobots`. Elle fait échouer le site de goflag, qui ne sert aucun `.ico` ; le remède est le script d'OG-2, donc les deux se livrent ensemble                                                                 | catalogue |
| **OG-2**  | ✅ **livrée** — alt traduit via `generateImageMetadata`, `alternateLocale` dans `@goflag/next`, `OG_TOKENS` comparés au thème par un test, `fitTitle` + `lineClamp`, le catch-all derrière `ogCatchAllRoute`, et le `.ico` par script local (consommateur n°1 du §6.4) | OG-1a     |
| **OG-3**  | **stereo-house écrit sa propre carte à la main** avec le même motif → les 38 findings tombent. Son `generate-favicons.mjs` existant en fait le **consommateur n°2 du `.ico` sans travail supplémentaire** — et sa variante à 7 sorties révèle la forme réelle          | OG-2      |
| **OG-4**  | Extraction en `@goflag/og` + `@goflag/og/next` (deux consommateurs, I4 satisfait). `buildIco` / `writeIco` entrent dans le **cœur**                                                                                                                                    | OG-3      |
| **OG-5**  | `@goflag/next` câble l'URL de l'image dans la metadata via `defineSite({ og })`                                                                                                                                                                                        | OG-4, N-2 |
| hors      | `@goflag/og/render` (satori direct) — le jour où un consommateur non-Next existe                                                                                                                                                                                       | —         |
| hors      | Un helper qui rasterise le `.ico` avec `sharp` en peer optionnel — seulement si fournir les buffers s'avère pénible sur les quatre sites                                                                                                                               | OG-4      |
| hors      | Pipeline d'illustrations (Playwright) et vidéo (Remotion), dépôt privé                                                                                                                                                                                                 | —         |

**OG-1 avant tout le reste.** D5 : la règle avant l'outil. Aujourd'hui le site
de goflag ne déclare aucun `og:image:alt` et rien ne le lui reproche — écrire la
règle d'abord, c'est le seul ordre qui garantit que le remède vise un défaut
réel plutôt qu'un défaut supposé.

**Ce qu'OG-1a a mis en défaut n'est pas seulement le site.** `og.locale.alternates`
échoue sur les 20 pages localisées parce que `metadata.ts` de `@goflag/next`
écrit `openGraph.locale` et **jamais `alternateLocale`** : la lib produit
elle-même le défaut, sur tous les sites qui l'adoptent. Le §1 dit que goflag
signale et que la lib produit ; c'est la première fois que la boucle se referme
dans ce sens-là, et c'est une ligne de code, pas un chantier.

### 10.1 D8 — comment les règles réseau atteignent le réseau

Le §7 affirmait que « le sondage de liens existe ». Il existe comme module, mais
`includeAssets` n'a **aucun appelant** hors tests, et `og:image` est un `<meta>`,
jamais un lien : les trois règles réseau n'héritent de rien. Trois formes ont été
pesées — recâbler le link-audit, une passe de sondage dédiée, ou attendre les
modèles d'observation site de la phase G.

**Retenu : une passe dédiée dans `runAudit`.** Elle collecte les URL d'`og:image`
et d'icônes de toutes les extractions, les déduplique globalement comme le fait
le link-audit, sonde une fois, et **reverse le résultat dans l'extraction en
champ additif** — ce qui ne coûte pas de bump d'`EXTRACTION_VERSION` (§ le
contrat : ajouter un champ optionnel n'en est pas un). Les évaluateurs restent
purs et synchrones ; aucune règle n'acquiert le droit de toucher au réseau. C'est
la seule des trois qui préserve la propriété sur laquelle repose la testabilité
du catalogue entier.

`icons.sizes-mismatch` demande un pas de plus : décoder les octets (IHDR pour un
PNG, `ICONDIR` pour un `.ico`) au lieu de constater un 200. Une trentaine de
lignes sans dépendance — la même manipulation de `Buffer` que `buildIco` au §6.4,
prise dans l'autre sens.

**OG-3 à la main, pas depuis un paquet.** On n'extrait qu'après deux
consommateurs (I4), et le second doit être écrit sans l'API pour qu'on voie ce
que l'API aurait dû faire. Bénéfice immédiat — 38 findings de moins — pour zéro
engagement d'API.

### 10.2 Ce qu'OG-2 a trouvé en se faisant

Trois défauts que personne ne cherchait, et qui disent chacun quelque chose sur
l'ordre du plan.

**Les quatre gris du gabarit n'étaient pas ceux du thème.** Le commentaire
affirmait qu'ils étaient les équivalents sRGB des mêmes stops Tailwind ; ils ne
l'étaient pour aucun des quatre — la surface d'un pas de teinte, le premier plan
de seize. Invisible à l'œil, ce qui est exactement pourquoi un commentaire ne
suffisait pas. Le test qui convertit l'`oklch()` de `globals.css` en sRGB l'a dit
au premier run, et les tokens sont désormais ceux du thème, calculés.

**Le premier palier de `fitTitle` coupait le hero du site en deux.** Les quatre
traductions font 42 à 49 caractères, et la frontière tombait à 48 : deux locales
auraient rendu une taille au-dessus des deux autres pour un caractère d'écart —
un défaut pire que celui que la dégression corrige. Les frontières sont posées
là où le contenu réel ne les traverse pas, et un test le tient. C'est aussi la
réponse mesurée au facteur par locale du §4.2 : une fois les paliers bien posés,
les quatre locales tombent sur le même, et le facteur reste à écrire le jour où
une locale déborde vraiment.

**Les cartes de la documentation pointaient sur un 404 depuis toujours.** Le
matcher du proxy excluait `docs`, `raw` et `llms.txt`, mais pas `og` : chaque
requête vers `/og/docs/...` était redirigée vers `/en/og/...`, que rien ne rend.
Un `og:image` présent, bien formé, absolu — et mort. Aucune règle du catalogue ne
pouvait le dire, parce que **c'est précisément `og.image.reachable`**, parkée en
OG-1b. Le plan prévoyait cette règle comme la moins urgente des six ; le premier
site audité prouve le contraire.

**Critère de sortie d'OG-4** — le même que pour `@goflag/next` : migrer
`apps/website` **et** stereo-house doit supprimer du code net, et le snapshot
par locale doit tourner dans vitest sans build Next. Sinon l'API est ratée.

**Pour le `.ico`, le critère est plus dur et plus lisible** : les quatre
`generate-favicon*.mjs` recopiés doivent disparaître au profit d'un appel, et le
`--check` doit tourner en CI sur les quatre sites sans qu'aucun hook de
pre-commit ne réécrive quoi que ce soit. Si un seul site doit garder son script,
c'est que le contrat des buffers est mal posé.

**Le `.ico` ne rallonge pas le chemin critique.** Il n'ajoute aucune étape : une
règle en OG-1, un script local en OG-2 — que `apps/website` devra écrire de toute
façon pour satisfaire `icons.ico.missing` — et un consommateur n°2 gratuit en
OG-3. La seule décision réellement nouvelle est D6, et elle est déjà tranchée par
la forme du cœur.

---

## 11. Ce que ce plan ne fait pas

- Pas de galerie de gabarits, ni de registry shadcn.
- Pas de moteur de rendu dans le cœur, ni dans le CLI : `next/og` embarque
  satori, la lib n'ajoute **aucune dépendance runtime** (I1 tient).
- Pas de génération d'illustrations d'articles ni de vidéo — dépôt privé.
- Pas de résolution fonte-par-script tant que toutes les locales sont latines.
- Pas de service HTTP de rendu à la demande : le build suffit.
- Pas de `@goflag/og/render` tant qu'aucun site non-Next n'existe.
- **Pas de rasteur dans le cœur, y compris pour le `.ico`.** Le cœur empaquette
  des buffers ; c'est le site qui les produit, avec le `sharp` qu'il a déjà. D1
  tient sans exception.

# goflag — Plan `@goflag/og` : images de partage dynamiques

> **Rédigé** 2026-08-02 · **Réécrit** 2026-08-06 (frontière du paquet, et un
> consommateur réel est apparu entre-temps)
> **Portée** — le paquet `@goflag/og`, les règles OG du catalogue, et la
> frontière avec le pipeline d'illustrations, qui reste **hors goflag**.
> **Lié** — `docs/next-plan.md` (le paquet frère), `docs/spec-and-lib-plan.md`
> (§5 décision « og:image stereo-house »), `docs/rules-catalog-plan.md` (§4.2
> ogp.me, §4.4 `og.image.missing`).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                     |
| ------ | -------------------------------------------------------------------------------------------- |
| **D1** | `@goflag/og` est un **paquet à part**, à cœur **sans moteur de rendu** — agnostique par construction |
| **D2** | L'image se rend **au build**, pas en route dynamique ni en asset dessiné à la main            |
| **D3** | Un **gabarit par défaut piloté par tokens**, pas une galerie de gabarits                      |
| **D4** | Les **illustrations de contenu** (blog, LinkedIn, vidéo) ne rentrent pas dans goflag           |
| **D5** | L'OG entre d'abord par les **règles**, pas par la lib — l'auditeur avant l'outil               |

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

| Brique                            | Liée au framework ? | Taille    |
| --------------------------------- | ------------------- | --------- |
| Le gabarit (arbre JSX + styles)   | non                 | l'essentiel |
| La dégression de taille, l'alt, les tokens | non        | l'essentiel |
| Le **rendu** (JSX → SVG → PNG)    | non, mais coûteux   | satori + resvg |
| La **convention de fichier** (`opengraph-image.tsx`, `generateImageMetadata`) | oui | ~30 lignes |

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

| Fichier                                | Lignes | Contenu                                          |
| -------------------------------------- | ------ | ------------------------------------------------ |
| `src/lib/seo/og.tsx`                   | 100    | le gabarit : terminal sombre, logo, titre, pastilles |
| `src/app/[locale]/opengraph-image.tsx` | 12     | home, titre traduit via `next-intl`              |
| 4 autres `opengraph-image.tsx`         | ~48    | changelog, slug, docs/cli, docs/rules, docs/rules/[id] |
| `src/app/og/docs/[...slug]/route.tsx`  | 29     | contournement du catch-all                       |

### Ce qu'il prouve

Le motif marche, il tient en 100 lignes, et le contournement du catch-all est un
vrai savoir : **Next refuse de placer une image de metadata sous un segment
catch-all**, donc les docs passent par un route handler `force-static` avec
`generateStaticParams`. C'est exactement le genre de chose qu'on n'a pas envie de
redécouvrir sur cinq sites, et donc exactement ce qui justifie la lib.

### Ce qu'il n'a pas — et que goflag saurait reprocher

| Manque                                                       | Règle concernée                            |
| ------------------------------------------------------------ | ------------------------------------------ |
| Aucun `alt` : les fichiers exportent `size` et `contentType`, jamais `alt` ni `generateImageMetadata` | `og.image.alt` (à écrire, §7) |
| Le titre n'est **pas** dégressé — `fontSize: 66` en dur, seul le sous-titre est coupé à 160 | aucune ; c'est le trou du §4.2 |
| Aucune fonte chargée : rendu à la fonte ambiante, donc `fontWeight: 600` n'a pas de fonte grasse à trouver | aucune ; documenté et assumé dans le fichier |
| Couleurs en hex dupliquées depuis le thème Tailwind, avec un commentaire pour l'expliquer | aucune ; c'est ce que les tokens résolvent |

Le premier est le plus parlant : **le site de goflag échouerait à une règle OG
que goflag n'a pas encore écrite.** C'est le bon ordre — D5, la règle avant
l'outil — et c'est ce qui rend l'étape OG-1 non négociable avant l'extraction.

---

## 6. L'API

### 6.1 Les tokens

```ts
import { defineOg } from "@goflag/og";

export const og = defineOg({
  tokens: {
    bg, fg, accent,              // 3 couleurs, pas 5
    font: { regular, bold },     // buffers TTF/OTF fournis par le site
    logo,                        // data URI ou buffer
  },
  fallback: "/og-default.png",   // routes sans image dédiée
  fit: { scale: { de: 0.85 } },  // surcharge des facteurs par locale
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
    background: capsule.cover,                  // optionnel
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
jeu de tokens → og:image + favicon + apple-touch-icon, tous cohérents. C'est
gratuit une fois les tokens posés, et le catalogue couvre déjà `links.icons` et
la doc Apple.

---

## 7. Les règles à ajouter (catalogue, avant la lib)

Toutes sourcées ogp.me (`vendor-spec`, déjà au §4.2 du catalogue) :

| Règle                      | Rigueur     | Ce qu'elle juge                                       |
| -------------------------- | ----------- | ----------------------------------------------------- |
| `og.image.absolute`        | vendor-spec | ogp.me exige une URL absolue                          |
| `og.image.dimensions`      | vendor-spec | `og:image:width` / `height` déclarés, ratio ~1.91:1   |
| `og.image.alt`             | guideline   | `og:image:alt` présent                                |
| `og.image.reachable`       | vendor-spec | 200 + content-type image (le sondage de liens existe) |
| **`og.locale.missing`**    | vendor-spec | `og:locale` absent sur un site multilingue            |
| **`og.locale.alternates`** | vendor-spec | `og:locale:alternate` cohérent avec les hreflang      |

Les deux dernières sont **l'angle défendable** : `og:locale` /
`og:locale:alternate` sont dans le protocole, personne ne les vérifie, et goflag
connaît déjà l'axe des locales et la réciprocité hreflang. Même raisonnement que
pour `llms.txt` multilingue — la valeur est dans l'intersection i18n, pas dans le
sujet générique.

Ces règles ne dépendent pas de la lib et se livrent dans le catalogue.

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
| Cœur sans moteur → le snapshot passe par un binding       | assumé : c'est ce qui rend le cœur testable sans build Next       |

---

## 10. Phasage

| Étape    | Contenu                                                                                                 | Dépend de |
| -------- | ------------------------------------------------------------------------------------------------------- | --------- |
| **OG-0** | ✅ **livré** — gabarit écrit à la main dans `apps/website` (§5)                                          | —         |
| **OG-1** | Les 6 règles du §7 dans le catalogue sourcé. `og.image.alt` fait alors échouer le site de goflag : le corriger sur place | catalogue |
| **OG-2** | Mise au propre dans `apps/website`, sans paquet : tokens extraits du thème, `fitTitle`, `alt` traduit via `generateImageMetadata`, le catch-all isolé derrière une fonction | OG-1      |
| **OG-3** | **stereo-house écrit sa propre carte à la main** avec le même motif → les 38 findings tombent           | OG-2      |
| **OG-4** | Extraction en `@goflag/og` + `@goflag/og/next` (deux consommateurs, I4 satisfait)                       | OG-3      |
| **OG-5** | `@goflag/next` câble l'URL de l'image dans la metadata via `defineSite({ og })`                         | OG-4, N-2 |
| hors     | `@goflag/og/render` (satori direct) — le jour où un consommateur non-Next existe                        | —         |
| hors     | Pipeline d'illustrations (Playwright) et vidéo (Remotion), dépôt privé                                  | —         |

**OG-1 avant tout le reste.** D5 : la règle avant l'outil. Aujourd'hui le site
de goflag ne déclare aucun `og:image:alt` et rien ne le lui reproche — écrire la
règle d'abord, c'est le seul ordre qui garantit que le remède vise un défaut
réel plutôt qu'un défaut supposé.

**OG-3 à la main, pas depuis un paquet.** On n'extrait qu'après deux
consommateurs (I4), et le second doit être écrit sans l'API pour qu'on voie ce
que l'API aurait dû faire. Bénéfice immédiat — 38 findings de moins — pour zéro
engagement d'API.

**Critère de sortie d'OG-4** — le même que pour `@goflag/next` : migrer
`apps/website` **et** stereo-house doit supprimer du code net, et le snapshot
par locale doit tourner dans vitest sans build Next. Sinon l'API est ratée.

---

## 11. Ce que ce plan ne fait pas

- Pas de galerie de gabarits, ni de registry shadcn.
- Pas de moteur de rendu dans le cœur, ni dans le CLI : `next/og` embarque
  satori, la lib n'ajoute **aucune dépendance runtime** (I1 tient).
- Pas de génération d'illustrations d'articles ni de vidéo — dépôt privé.
- Pas de résolution fonte-par-script tant que toutes les locales sont latines.
- Pas de service HTTP de rendu à la demande : le build suffit.
- Pas de `@goflag/og/render` tant qu'aucun site non-Next n'existe.

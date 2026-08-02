# goflag — Plan OG : images de partage dynamiques

> **Rédigé** 2026-08-02
> **Portée** — le sous-module `og` de `@goflag/next` (phase 5.4), les règles OG
> du catalogue (phase 3), et la frontière avec le pipeline d'illustrations, qui
> reste **hors goflag**.
> **Lié** — `docs/spec-and-lib-plan.md` (§5 décision « og:image stereo-house »,
> phases 4 · 5.4), `docs/rules-catalog-plan.md` (§4.4 `og.image.missing`, §4.2
> ogp.me).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                   |
| ------ | ------------------------------------------------------------------------------------------ |
| **D1** | L'og:image se rend **au build**, pas en route dynamique ni en asset dessiné à la main      |
| **D2** | Un **template par défaut piloté par tokens**, pas une galerie de templates                 |
| **D3** | Les **illustrations de contenu** (blog, LinkedIn, vidéo) ne rentrent pas dans goflag       |
| **D4** | L'OG entre d'abord par les **règles** (phase 3), pas par la lib — l'auditeur avant l'outil |

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
   │   goflag    │         │ @goflag/next/og  │
   │ SIGNALE que │         │ PRODUIT l'image  │
   │ l'image     │◄────────│ par construction │
   │ manque      │ manifeste└─────────────────┘
   └─────────────┘  (5.2/5.3)
```

`og.image.missing` existe depuis la phase 1 et produit **38 findings sur
stereo-house**, parkés en §5 du plan principal parce qu'aucun remède n'était
disponible. C'est exactement le mode d'échec consigné au §4 :

> « Un check qu'on n'a pas de raison de croire est ignoré. »

Une règle dont le remède demande « soit un asset, soit une route à écrire »
finit en dette permanente. Le sous-module `og` est ce remède. Il ne change pas
la thèse du produit — **I2 tient** : goflag reste utile seul, et la règle garde
tout son sens sur un site qui n'utilise pas la lib.

### Où ça s'arrête

| Brique                                                   | Dans goflag ?                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| Règles `og.image.*` / `og.locale.*` sourcées ogp.me      | ✅ phase 3 — renforce l'auditeur, indépendant de la lib               |
| Mécanisme : route, locale, fontes, tokens, alt traduit   | ✅ phase 5.4 — remède de la règle                                     |
| Un template par défaut, piloté par tokens                | ✅ le strict nécessaire pour que le remède soit utilisable            |
| Une galerie de templates                                 | ⛔ `ogimagecn` (shadcn-labs) occupe le terrain ; rien à y gagner      |
| Illustrations d'articles générées par agent (Playwright) | ⛔ dépôt privé — juger un site ≠ fabriquer son contenu                |
| Vidéo / animation (Remotion)                             | ⛔ dépôt privé ; licence source-available, payante au-delà de 3 pers. |
| Composants React de présentation                         | ⛔ I1 — ils traînent shadcn (déjà arbitré en 6.4)                     |

**Seul artefact partagé entre le public et le privé : les tokens.** Le pipeline
privé lit le même `og.tokens` que la lib, et rien d'autre.

---

## 2. D1 — Ni asset statique, ni route dynamique

La décision ouverte du §5 posait un choix binaire. Il est faux.

`opengraph-image.tsx` dans une route à `generateStaticParams` est **rendu au
build** : Next produit un PNG, le sert en fichier immuable à URL hashée. On a
l'écriture dynamique (code + données + locale) **et** le service statique (CDN,
zéro runtime, zéro route à maintenir).

| Option                    | Écrit en code | Coût requête | Route à maintenir |
| ------------------------- | ------------- | ------------ | ----------------- |
| Asset dessiné à la main   | ❌            | 0            | non               |
| Route `/og` dynamique     | ✅            | 50–100 ms    | oui               |
| **`opengraph-image.tsx`** | ✅            | **0**        | **non**           |

**Coût à mesurer, pas à supposer** : openfinanceguide fait ~456 pages ; à
50–100 ms l'image, cela ajoute ~25–45 s de build. Acceptable a priori — à
vérifier sur le premier site migré. Si ça dérape : `generateStaticParams`
partiel, le reste en ISR.

**Runtime `nodejs`**, pas edge : le build lit les fontes depuis le disque.

---

## 3. Le contrat technique

### 3.1 Satori — vérifié le 2026-08-02

Le moteur est plus riche que « flexbox + styles inline ». Ce qui compte :

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
   `pt-BR` — toutes latines, donc non-sujet. Mais c'est une **frontière dure** :
   le jour où une locale RTL arrive, ce moteur ne peut pas la rendre. Consigné
   en §7.

### 3.2 Les fontes appartiennent au site

La lib n'embarque **aucun fichier de fonte** — ce serait des centaines de Ko
imposés à tout le monde, contre I1. Le site fournit ses buffers ; la lib fournit
un `loadFont()` mémoïsé (une lecture par processus de build, pas par image).

Les 6 locales étant latines, **un seul fichier couvre tout** : pas de résolution
fonte-par-script à écrire aujourd'hui. Ne pas la construire avant qu'une locale
non-latine existe — c'est exactement le piège du « signal collecté et jamais
jugé » (§4 du plan principal).

### 3.3 Le texte qui déborde — le vrai problème i18n

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

Les facteurs par locale sont une **heuristique assumée** — au sens du catalogue
de règles. Ils ne se devinent pas : ils se vérifient par snapshot, une image par
locale, dans les tests du site. La lib fournit la dégression ; le site prouve
qu'elle tient sur son contenu réel.

---

## 4. L'API

### 4.1 Les tokens vivent dans `defineSite`

Le champ `og` est déjà prévu en 4.1. Sa forme :

```ts
defineSite({
  baseUrl,
  locales,
  defaultLocale,
  name,
  indexable,
  og: {
    tokens: {
      bg,
      fg,
      accent, // 3 couleurs, pas 5
      font: { regular, bold }, // buffers TTF/OTF
      logo, // data URI ou chemin
    },
    fallback: "/og-default.png", // routes sans image dédiée
  },
});
```

### 4.2 La route — deux lignes d'export

```tsx
// app/[locale]/capsules/[slug]/opengraph-image.tsx
import { ogImage } from "@goflag/next/og";
import { site } from "@/lib/site";

const image = ogImage(site, async ({ params }) => {
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
doit passer par `generateImageMetadata`, qui le porte par image. C'est le
détail qui rend l'OG réellement multilingue, et le genre de chose qu'on n'écrit
pas deux fois sur cinq sites.

Le contenu reste **dans le site** — titre, date, image de couverture. La lib ne
connaît que des champs neutres.

### 4.3 Le favicon en prime

`icon.tsx` et `apple-icon.tsx` utilisent la même `ImageResponse` et les mêmes
tokens. Un jeu de tokens → og:image + favicon + apple-touch-icon, tous cohérents.
Déjà annoncé en 5.4 ; c'est gratuit une fois les tokens posés, et le catalogue
couvre déjà `links.icons` et la doc Apple.

---

## 5. De belles OG — ce que le template par défaut encode

Le sujet n'est pas la plomberie mais le rendu. Des contraintes, pas du goût :

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

**Le motif Canva** : exporter le fond **sans le texte**, l'utiliser en `<img>`
de fond, superposer le texte en code. On garde un visuel travaillé et un
contenu programmatique. L'ordre DOM suffit (pas de `z-index`).

À éviter : tout centré, un titre sur 4 lignes, une capture d'écran en fond, du
texte sur une zone chargée sans voile.

---

## 6. Les règles à ajouter (phase 3)

L'OG entre par le catalogue avant d'entrer par la lib. Toutes sourcées ogp.me
(`vendor-spec`, déjà listé en §4.2 du catalogue) :

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
connaît déjà l'axe des locales et la réciprocité hreflang. C'est le même
raisonnement qu'en 6.2 pour `llms.txt` multilingue — la valeur est dans
l'intersection i18n, pas dans le sujet générique.

Ces règles ne dépendent pas de la lib. Elles se livrent en phase 3.

---

## 7. Limites connues

| Limite                                                    | Conséquence                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| Satori ne gère pas le RTL                                 | une locale arabe/hébraïque exigerait un autre moteur (Playwright) |
| Pas de mesure de texte                                    | le calage est heuristique, validé par snapshot                    |
| Pas de WOFF2                                              | fonte committée en TTF/OTF                                        |
| Fonte non latine = fichier lourd                          | à sous-ensembler le jour où ça arrive, pas avant                  |
| Rendu au build → un changement de token = rebuild du site | acceptable ; c'est déjà vrai du reste de la metadata              |

---

## 8. Phasage

| Étape    | Contenu                                                                       | Dépend de   |
| -------- | ----------------------------------------------------------------------------- | ----------- |
| **OG-0** | Une route OG **écrite à la main** sur stereo-house → les 38 findings tombent  | rien        |
| **OG-1** | Les 6 règles du §6 dans le catalogue sourcé                                   | phase 3     |
| **OG-2** | Extraction en `@goflag/next/og` quand un **2e site** en a besoin              | phase 4     |
| **OG-3** | L'URL OG dans `.goflag/routes.json` → goflag compare intention et observation | phase 5.2/3 |
| **hors** | Pipeline d'illustrations (Playwright) et vidéo (Remotion), dépôt privé        | —           |

**OG-0 d'abord, et à la main.** Écrire le template dans un site réel avant de
l'abstraire, c'est la leçon du §4 appliquée : on n'extrait qu'après deux
consommateurs. Bénéfice immédiat — 38 findings de moins — pour zéro engagement
d'API.

**Critère de sortie d'OG-2** — le même que la phase 4 : migrer le second site
doit **supprimer du code net**. Sinon l'API est ratée.

---

## 9. Ce que ce plan ne fait pas

- Pas de galerie de templates, ni de registry shadcn.
- Pas de moteur de rendu dans le CLI : `next/og` embarque Satori, la lib
  n'ajoute **aucune dépendance runtime** (I1 tient).
- Pas de génération d'illustrations d'articles ni de vidéo — dépôt privé.
- Pas de résolution fonte-par-script tant que toutes les locales sont latines.
- Pas de service HTTP de rendu à la demande : le build suffit.

# goflag — Le modèle de locales : spec technique

> **Rédigé** 2026-08-07
> **Portée** — la refonte du modèle de locales à travers les quatre blocs qui
> le portent : `@goflag/next`, un paquet agnostique à extraire, le dépôt goflag
> (CLI + site), et stereo-house.
> **Lié** — `docs/next-plan.md` (le registre de routes), `docs/publishing.md`
> (la chaîne de release), `docs/spec-and-lib-plan.md` §6 (« pas de wrapper sur
> next-intl », qui borne le bloc A).

---

## 0. Le constat, mesuré

Tout ce document découle de six faits vérifiés, pas déduits.

| #   | Fait                                        | Preuve                                                                            |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | La lib valide la **forme**, pas l'existence | `toBcp47("xx-YZ")` → `"xx-YZ"`, `"qq"`, `"pt-ZZ"` acceptés                        |
| 2   | Le CLI a **le même défaut**, en miroir      | `isValidLocale` accepte `pt-ZZ`, `qq`, `xx-YZ` ; refuse `zh-Hant`, qui est valide |
| 3   | Le CLI **possède** la liste ISO 639-1       | `isKnownLanguageTag`, utilisée seulement pour classer des candidats               |
| 4   | `og:locale` contamine l'entrée              | `locales: ["en"]` refusé sans surcharge ; deux sites recopient quatre lignes      |
| 5   | `lang` n'est fourni par personne            | stereo-house `lang="pt-br"`, goflag.tech `lang="pt-BR"`                           |
| 6   | Les **cinq** sites déclarent `pt-br`        | `tancrede`, `tancredo`, `openfinanceguide`, `stereo-house`, `apps/website`        |

Et le fait qui rend la refonte gratuite : les **likely subtags** de CLDR donnent
`en→US`, `fr→FR`, `es→ES`, `pt→BR` — exactement les tables que les deux sites
ont écrites à la main.

### La décision de fond

Une locale se déclare **une fois**, en langue seule quand rien ne justifie une
région (RFC 5646 §4.1 : pas plus spécifique que justifié). Tout le reste est
dérivé :

| Sortie             | Dérivation             | `pt` donne              |
| ------------------ | ---------------------- | ----------------------- |
| segment d'URL      | la chaîne déclarée     | `/pt/`                  |
| `hreflang`, `lang` | casse canonique        | `pt`                    |
| `og:locale`        | likely subtags CLDR    | `pt_BR`                 |
| alias acceptés     | RFC 4647 §3.4 _Lookup_ | `/pt-BR/`, `/PT/` → 301 |

Le contenu est brésilien, l'audience ne l'est pas : `pt` cible tous les
lusophones, et `og:locale` reste `pt_BR` parce qu'ogp.me exige un territoire et
que c'est bien celui-là.

---

## Bloc A — `@goflag/next`

**Objet** — porter le modèle ci-dessus. Aucune de ces quatre briques ne touche
Next : ce sont des fonctions pures de la liste de locales, ce qui les rend
extractibles telles quelles (bloc B).

### A.1 Typage fort contre l'ISO

```ts
locales: ["en", "fr", "es", "pt"]; // validé au type ET à l'exécution
```

- `Language` = union ISO 639-1, `Region` = union ISO 3166-1 alpha-2 + numériques
  (`419`).
- Validation par **type conditionnel sur le littéral écrit**, pas par union
  précalculée. Énumérer toutes les combinaisons langue-région fait ~46 000
  membres : ça compile, et ça rend les messages d'erreur illisibles. Un
  `ValidTag<T>` qui décompose le tag écrit valide autant sans rien matérialiser.
- Même validation à l'exécution, pour les locales venues d'une collection.
- **Périmètre aligné sur le CLI** : pas de sous-balise de script en v1. Le CLI
  refuse `zh-Hant` ; une lib qui l'émettrait produirait ce que son propre
  auditeur rejette. Les deux évoluent ensemble ou pas du tout.

### A.2 Casse canonique

`bcp47(locale)` → langue en minuscules, script en capitale initiale, région en
majuscules. Sert `hreflang` **et** `lang`.

Possible seulement parce que le CLI replie désormais la casse à l'identité
(`fix(i18n)`, livré) : sans ça, `hreflang="pt-BR"` au-dessus de `/pt-br/`
refabrique la locale fantôme.

### A.3 `og:locale` par les likely subtags

`openGraphLocale(locale)` → `language_TERRITORY` en dérivant la région la plus
probable. Supprime le fait n°4 : plus aucune table recopiée.

**Sous-ensemble curé, pas CLDR entier.** La table complète fait ~1000 entrées ;
la lib en porte les langues dont la région est établie, et **refuse en nommant
la correction** pour les autres :

```
Locale "xy" has no likely region. Add one:
  localeTags: { xy: { openGraph: "xy_ZZ" } }
```

Inventer une région serait décider à la place du site quelle audience il vise.

### A.4 `resolveLocale` — RFC 4647 §3.4 _Lookup_

```ts
site.resolveLocale("pt-BR"); // → "pt"        variante régionale d'une langue servie
site.resolveLocale("PT"); // → "pt"        casse
site.resolveLocale("pt"); // → "pt-BR"     l'inverse, si c'est ce qui est servi
site.resolveLocale("it"); // → undefined   langue non servie
```

**L'invariant qui compte : jamais de repli vers la locale par défaut.**
Rediriger une langue non servie vers la langue par défaut transforme tout
segment de deux lettres en soft-404 — `/de/`, `/it/`, `/ru/` renvoyant de
l'anglais en 200. C'est un défaut que goflag triage déjà dans son contrôle de
liens ; le produire serait se contredire. Le matcher répond `undefined` et
laisse le 404 arriver.

### A.5 Ce que le bloc A ne fait pas

- **Pas de middleware, pas de redirection.** §6 du plan principal tranche « pas
  de wrapper sur next-intl » ; la lib fournit la fonction, le site écrit sa 301
  en une ligne.
- **Pas de négociation `Accept-Language`.** next-intl le fait, et le fait bien.
- `localeTags` survit comme **échappatoire**, plus comme obligation. Deux usages
  légitimes connus : un site dont la langue et la cible divergent
  (`{ bcp47: "pt" }` sur un `pt-br` conservé), et un `og:locale` que la table
  ne couvre pas.

### A.6 Rupture et version

`0.2.0`. Cassant sur trois points : `locales` refuse un tag inexistant, les
surcharges `openGraph` deviennent inutiles, `bcp47()` change de valeur pour un
tag à région. Un seul consommateur externe existe (stereo-house), migré dans le
même mouvement.

**Critère de sortie** — les deux sites rendent `hreflang`, `lang` et `og:locale`
sans une seule table locale ; `pnpm --filter @goflag/website seo` reste au même
niveau de findings ; les tests couvrent les quatre briques.

---

## Bloc B — hors Next : le paquet agnostique

**Objet** — les tables ISO et la notion de validité sont maintenant nécessaires
à **deux** paquets, et correctement câblées dans aucun.

### B.1 Ce que la duplication coûte déjà

|                   | `@goflag/cli`                   | `@goflag/next` |
| ----------------- | ------------------------------- | -------------- |
| Liste ISO 639-1   | oui, non câblée à la validation | à écrire       |
| Liste ISO 3166-1  | absente                         | à écrire       |
| Validité d'un tag | forme seule (`pt-ZZ` accepté)   | forme seule    |
| Repli de casse    | `localeIdentity`                | `toBcp47`      |

Deux réponses à « ce tag est-il valide ? », dans un dépôt dont la thèse est
qu'une seule vérité doit avoir une seule source. Si elles divergent, l'auditeur
signale ce que le producteur émet, ou l'inverse.

### B.2 La forme

`@goflag/locale` — zéro dépendance, aucun import framework :

- tables ISO 639-1 et ISO 3166-1, typées
- `isLanguage`, `isRegion`, `parseTag`
- `toBcp47` (casse canonique + existence)
- `localeIdentity` (repli de casse)
- `lookup` (RFC 4647 §3.4)

I3 est respecté : ni le CLI ni la lib ne dépendent l'un de l'autre. C'est
exactement l'échappatoire que la règle de lint documente — « extract to a third
package both may depend on, and only once two consumers actually want it ».
I4 est satisfait : deux consommateurs réels.

### B.3 Quand — et pourquoi pas maintenant

**Pas dans la 0.2.0.** Un troisième paquet, c'est une troisième publication, un
troisième espace de tags, un troisième trusted publisher — le coût qu'on vient
de payer une fois, à refaire avant d'avoir la preuve que la forme est la bonne.

Donc : **écrire ces primitives dans `packages/next/src/locale/`, sans aucun
import de Next**, pour que l'extraction soit un déplacement de fichiers et non
une réécriture.

**Le déclencheur est nommé, et il est proche** : le jour où la règle
`locale.invalid` du CLI est réparée pour vérifier l'existence — c'est-à-dire
dès qu'on veut refuser `pt-ZZ` et accepter `zh-Hant` — elle a besoin de la
liste des régions, que seule la lib aura. Ce jour-là on extrait, et pas avant.

### B.4 Ce qui est déjà livré côté CLI

`fix(i18n)` — repli de casse à l'identité. Un site routant sur `/pt-br/` et
déclarant `hreflang="pt-BR"` ne récolte plus deux colonnes ni de trou fantôme.
Vérifié avant/après sur stereo-house, même site, même commande.

### B.5 Ce qui reste dû au CLI, et n'est pas dans ce lot

- `isValidLocale` vérifie la forme, pas l'existence : `pt-ZZ`, `qq`, `xx-YZ`
  passent. La règle `locale.invalid` ne tient donc pas sa promesse.
- Elle refuse `zh-Hant`, valide.

À traiter avec B.3, dont c'est le déclencheur.

---

## Bloc C — dépôt goflag, `apps/website`

**Objet** — premier consommateur, et il consomme la lib **en `workspace:*`**,
donc la boucle est courte : éditer `packages/next/src`, rebuilder, le site
prend. Aucune publication nécessaire pour tester.

### C.1 Renommage `pt-br` → `pt`

| Chemin                                    | Action                                                            |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `messages/pt-br.json`                     | → `messages/pt.json`                                              |
| `content/legal/pt-br/`                    | → `content/legal/pt/` (3 fichiers)                                |
| `src/i18n/config.ts`                      | `locales`, et **suppression** de `ogLocaleMap` + `bcp47LocaleMap` |
| `src/components/site/locale-switcher.tsx` | libellé                                                           |
| script `seo`                              | `--locales en,fr,es,pt-br` → `en,fr,es,pt`                        |

Zéro visiteur, à peine indexé : la migration d'URL est gratuite ici et sert de
répétition avant les sites qui comptent.

### C.2 Ce que le site cesse de porter

- `localeToOGCompatibleLocale` — dérivé par les likely subtags
- `localeToBcp47` — `layout.tsx` appelle `site.lang(locale)`, ce qui supprime la
  seconde réponse au « quel est le tag de cette locale »

### C.3 La 301

`src/proxy.ts` consomme `site.resolveLocale()` : un segment qui résout vers une
autre locale servie part en 301 vers la forme canonique ; un segment qui résout
vers `undefined` passe et finit en 404.

**Critère de sortie** — `/pt-br/` → 301 → `/pt/` ; `/de/` → 404 ; l'audit ne
gagne aucun finding ; le sitemap ne contient aucune URL en `pt-br`.

---

## Bloc D — stereo-house

**Objet** — seul consommateur **externe**, donc le seul qui exerce le chemin
public. C'est lui qui a produit les six faits du §0.

### D.1 Dette à solder d'abord

La branche `feat/goflag-next-migration` porte un commit `wip` passé en
`--no-verify`, faute de dépendance publiable. À réécrire proprement :
dépendance `^0.2.0`, lockfile, et ses propres gardes qui repassent.

### D.2 Renommage, même forme qu'en C.1

`messages/pt-br.json`, `content/legal/pt-br/` (3 fichiers), `src/i18n/config.ts`
— et `ogLocaleMap` disparaît. Les capsules et les pages n'existent qu'en `en`,
donc rien à y faire.

### D.3 Plomberie de release

| Élément                 | Action                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`   | `minimumReleaseAgeExclude: ["@goflag/*"]` — **déjà appliqué**. La période de refroidissement vise un amont compromis, pas un paquet publié par notre propre CI en OIDC ; sans l'exemption, un correctif est invérifiable pendant trois jours |
| `.gitlab-ci.yml`        | `GOFLAG_VERSION` → la version portant `fix(i18n)`                                                                                                                                                                                            |
| `.goflag/baseline.json` | recapture après migration                                                                                                                                                                                                                    |
| `GOFLAG_ARGS`           | `--max-debt` réajusté                                                                                                                                                                                                                        |

### D.4 Redirections

Mêmes règles qu'en C.3. Ici elles ont une valeur supplémentaire : les URL
`/pt-br/` **sont** indexées, et la 301 est ce qui rend le renommage sans perte.

**Critère de sortie** — l'audit rapporte le même jeu de findings qu'avant
migration, aux `pt-br` près ; aucune URL `pt-br` dans le sitemap ; `/pt-br/…`
répond 301 en un seul saut.

---

## Ordre d'exécution

```
1. Bloc A            @goflag/next 0.2.0, primitives isolées dans src/locale/
2. Bloc C            apps/website migré — boucle courte, workspace, pas de npm
3. publication       0.2.0 + la version CLI portant fix(i18n)
4. Bloc D            stereo-house migré et rebaseliné
5. Bloc B            extraction, au déclencheur nommé en B.3
```

Les blocs 1 et 2 sont une seule branche : le site est le banc d'essai de la lib,
et les séparer ferait publier une API que rien n'a exercée.

---

## Les trois autres sites, hors périmètre

`tancrede`, `tancredo` et `openfinanceguide` déclarent aussi `pt-br`.
**openfinanceguide est le seul où le SEO est un enjeu** (~456 pages), et il
n'a pas besoin de la migration d'URL pour en tirer le bénéfice : le ciblage
vient du tag, pas du segment — le ciblage par répertoire ne valait que couplé au
réglage International Targeting de la Search Console, retiré en 2022.

Donc : `localeTags: { "pt-br": { bcp47: "pt" } }`, URL inchangées, bénéfice
immédiat, zéro redirection. La migration complète, si elle se fait, se fait
après que les deux sites à zéro visiteur aient servi de répétition.

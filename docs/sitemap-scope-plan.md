# goflag — Plan : sortir une route du sitemap sans la sortir du registre

> **Rédigé** 2026-08-09
> **Portée** — un champ optionnel sur une route et sur une collection de
> `@goflag/next`, qui décide si elle entre dans `routes.sitemap()`. Le registre
> continue de la connaître : canonical, cluster hreflang et validation ne
> changent pas.
> **Origine** — la migration de `openfinanceguide`, quatrième consommateur, la
> seule qui n'a pas pu aboutir. C'est le rôle que `docs/next-plan.md` §6 donne
> aux sites consommateurs : révéler ce qu'aucun plan écrit d'avance ne trouve.
> **Lié** — `docs/next-plan.md` (le registre), `docs/sitemap-robots-plan.md`
> (les règles qui jugent l'artefact), `docs/rules-catalog-plan.md` (§7 pour la
> règle nouvelle proposée en S6).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------- |
| **S1** | Le défaut est **listé**. L'omission se déclare, jamais l'inverse                                     |
| **S2** | Le champ s'appelle `sitemap`, vaut `false` ou un prédicat par entrée, et n'est jamais requis         |
| **S3** | Exclure du sitemap **ne retire rien d'autre** : la route garde canonical, cluster, validation, refus |
| **S4** | Aucun refus de build sur une exclusion — c'est une décision éditoriale, pas une erreur               |
| **S5** | `routes.sitemap()` ne gagne **aucune** option : la vérité se déclare à la route, pas à la projection |
| **S6** | goflag gagne un **advisory**, pas une règle : « cette page est indexable, liée, et hors sitemap »    |

---

## 1. Le problème, tel qu'il s'est présenté

`openfinanceguide` sert **3520 pages** sous `/stet/[version]`, réparties en neuf
familles imbriquées — endpoints, flows, framework, resources, schemas, changelog.
Son sitemap n'en liste qu'une : la version courante. La raison est écrite dans le
code, datée du plan handbook, étape 1.2.

Le registre n'a pas de position intermédiaire. Une page qui demande sa metadata
doit être déclarée — c'est le refus « a path no route declares », et il est bon.
Mais `routes.sitemap()` projette **tout** ce qui est déclaré. Donc :

```
déclarer les 3520   →  sitemap de 3520 entrées, décision éditoriale annulée
n'en déclarer qu'une →  3519 pages sans canonical ni cluster, ou deux systèmes
                        de metadata dans le même dépôt
```

Les deux sont pires que ne rien faire, et c'est pourquoi la migration s'est
arrêtée là plutôt que de forcer.

---

## 2. La question préalable : est-ce qu'une page hors sitemap est indexée ?

Il faut y répondre avant de construire l'outil, parce que la réponse change ce
que l'outil doit permettre — et parce que la raison invoquée par
`openfinanceguide` ne tient pas.

**Un sitemap est une aide à la découverte, pas une porte d'indexation.** Une page
absente du sitemap mais liée depuis le site et crawlable est indexée normalement.
Réciproquement, une page listée n'est pas garantie d'être indexée. Google le dit
dans les deux sens.

Donc :

| Croyance                                            | Réalité                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| « Hors sitemap ⇒ pas indexée »                      | Faux si la page est liée. Le crawl suit les liens                                     |
| « 3520 URLs diluent le budget de crawl »            | Le plafond d'un sitemap est de 50 000 URLs. 3520 n'est pas un volume                  |
| « Le sitemap protège des contenus quasi-dupliqués » | Non. `canonical` et `noindex` font ça ; omettre du sitemap ne fait ni l'un ni l'autre |

**Conclusion pour `openfinanceguide` : le handbook devrait probablement être
listé.** Les pages sont liées, le volume est trivial, et si les anciennes versions
posent un problème de duplication, l'instrument correct est un `canonical` vers la
version courante ou un `noindex`, pas une absence de sitemap. C'est un arbitrage
éditorial qui appartient au propriétaire du site, pas à la bibliothèque.

**Mais la fonctionnalité reste justifiée**, parce qu'il existe des exclusions
légitimes, et qu'elles ont toutes la même forme : _la page ne doit pas être un
point d'entrée._

| Cas légitime                                 | Pourquoi                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| Page en `noindex`                            | La lister est une contradiction que Search Console signale                        |
| Page canonicalisée ailleurs                  | Lister une URL non-canonique envoie deux signaux opposés                          |
| Variante à facettes, filtre, tri, pagination | Des milliers d'URLs équivalentes, dont une seule mérite d'être une porte d'entrée |
| Vue utilitaire — impression, export, `/raw/` | Servie, liée, jamais un résultat de recherche souhaitable                         |

C'est cette liste que la fonctionnalité sert, et c'est elle que la documentation
doit montrer — pas l'archive de version, qui est presque toujours un `canonical`
mal posé.

---

## 3. L'API

### 3.1 Route simple

```ts
export const routes = site.routes({
  home: { path: "" },
  search: { path: "/search", sitemap: false },
});
```

### 3.2 Collection, tout ou rien

```ts
legacy: collection(archivedVersions, {
  path: (v) => `/stet/${v.version}`,
  locale: (v) => v.locale,
  sitemap: false,
}),
```

### 3.3 Collection, par entrée

La forme qui règle le cas d'origine, et qui est la raison pour laquelle un
booléen seul ne suffit pas :

```ts
versions: collection(allVersions, {
  path: (v) => `/stet/${v.version}`,
  locale: (v) => v.locale,
  sitemap: (v) => v.version === STET_LATEST_VERSION,
}),
```

Le prédicat prend la même entrée que `path`, `locale` et `lastModified`. Une
signature de plus dans une famille qui en a déjà quatre, pas un concept de plus.

### 3.4 Ce que le champ ne touche pas (S3)

| Reste vrai pour une route exclue                        |
| ------------------------------------------------------- |
| `routes.metadata()` la sert                             |
| Son canonical est émis                                  |
| Son cluster hreflang est complet                        |
| Elle compte dans le refus « deux routes sur un chemin » |
| Elle compte dans la validation des locales              |

Une exclusion dit **« pas une porte d'entrée »**, jamais « pas une page ». C'est
la distinction qui rend le champ sûr : il ne peut pas produire une page orpheline,
seulement une page qu'on ne met pas en avant.

### 3.5 Le nom

`sitemap` plutôt que `listed`, `inSitemap` ou `indexable`.

- `indexable` est déjà pris au niveau du site et veut dire autre chose ; le
  réutiliser ferait croire qu'exclure du sitemap désindexe, ce que le §2 réfute.
- `listed` est plus juste sémantiquement mais ne dit pas _listé où_.
- `sitemap: false` se lit sans documentation et se cherche sans la connaître.

---

## 4. Pourquoi pas une option de projection (S5)

L'alternative évidente :

```ts
routes.sitemap({ exclude: ["/search", "/stet/1.5.0"] }); // NON
```

Elle est refusée pour la raison qui a justifié le registre en premier lieu. Ces
chemins seraient écrits une deuxième fois, à côté de ceux que les routes
déclarent, et rien ne les tiendrait d'accord. Un slug renommé laisserait une
exclusion muette derrière lui — la page réapparaîtrait dans le sitemap et personne
ne le remarquerait.

C'est exactement `hreflang.sitemap-mismatch` sous un autre nom : la même vérité
dérivée à deux endroits.

---

## 5. Ce que ça ne fait pas

- **Pas de refus de build** (S4). Une exclusion est une décision éditoriale, et
  une bibliothèque qui refuse une intention légitime se fait contourner.
- **Pas de `noindex` implicite.** Les deux sont indépendants : une page peut être
  hors sitemap et parfaitement indexable, c'est même le cas courant.
- **Pas d'exclusion de `robots.txt`.** `disallow` est un autre artefact, avec une
  autre sémantique — il empêche le crawl, pas la mise en avant.
- **Pas de filtrage a posteriori documenté.** `routes.sitemap().filter(...)` reste
  possible en JavaScript et restera un contournement, pas une API.

---

## 6. La règle que ça appelle (S6)

Le champ crée une combinaison nouvelle et invisible : une page **indexable,
liée depuis le site, et absente du sitemap**. Ce n'est pas une erreur — c'est le
cas nominal de `/search`. Mais c'en est une quand elle n'est pas voulue, et rien
ne la signale aujourd'hui.

Donc un **advisory**, pas une règle : goflag pose la question et refuse de
trancher, ce qui est exactement le mécanisme du §7 de `rules-catalog-plan.md`.

```
sitemap.unlisted-indexable   advisory
  La page répond 200, se déclare indexable, est atteinte par le crawl,
  et n'apparaît dans aucun sitemap déclaré.
  → intentionnel (utilitaire, facette) ou oubli ?
```

Le motif est le même que celui qui a fait exister ce plan : le remède doit
exister avant que la règle ne devienne de la dette. Ici l'ordre s'inverse — la
fonctionnalité crée le cas, donc elle arrive avec la question.

---

## 7. Phasage

| Étape   | Contenu                                                                                    | État |
| ------- | ------------------------------------------------------------------------------------------ | ---- |
| **X-0** | `sitemap?: boolean` sur une route simple, `boolean \| (entry) => boolean` sur `collection` | ✅   |
| **X-1** | Tests : exclue du sitemap, présente en metadata, présente dans le cluster des sœurs        | ✅   |
| **X-2** | `@goflag/next@0.3.0`, documentation `/docs/next/routes` avec le tableau du §2              | ✅   |
| **X-3** | `openfinanceguide` migre — et **tranche d'abord** s'il liste le handbook (§2)              | ⬜   |
| **X-4** | Advisory `sitemap.unlisted-indexable` au catalogue                                         | ⬜   |

X-3 n'est pas une migration mécanique : la question du §2 se pose avant le code.
Si la réponse est « on liste tout », la fonctionnalité n'est pas ce qui débloque
ce site — elle reste due pour `/raw/` et les facettes, et le handbook entre au
sitemap sans elle.

### Critères de sortie

| Étape   | Critère                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------- |
| **X-0** | Une route exclue est absente de `sitemap()` et inchangée dans `metadata()`                                |
| **X-1** | Une entrée exclue reste dans le cluster hreflang de ses sœurs — l'exclusion est locale à l'artefact       |
| **X-3** | `openfinanceguide` passe au registre entier, avec un sitemap dont chaque omission est écrite et justifiée |

---

## 8. Risques

| Risque                                                              | Traitement                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Le champ devient l'outil réflexe pour « cacher » une page           | La doc mène par le §2 : ça ne cache rien. L'advisory S6 rattrape l'usage à contre-emploi |
| Une exclusion massive prive un gros site de découverte              | C'est le cas d'origine, et le §2 dit qu'il était probablement mal posé                   |
| `sitemap: false` lu comme « pas de sitemap du tout »                | Nom arbitré en 3.5 ; la doc l'illustre sur `/search`, pas sur une archive                |
| Le prédicat par entrée invite à une logique métier dans le registre | Même exposition que `lastModified`, qui prend déjà une fonction et n'a pas dérivé        |

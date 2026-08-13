# goflag — Plan : ce qui identifie une traduction, quand ce n'est pas le chemin

> **Rédigé** 2026-08-13
> **Portée** — l'identité d'une ligne de la matrice `route × locale`. Aujourd'hui
> c'est le pathname amputé de son segment de locale ; sur un site qui traduit
> ses slugs, c'est faux, et la mesure est en §1.
> **Origine** — l'audit de documentation du 2026-08-13, qui cherchait des
> écarts entre la doc et le code et a trouvé quatre défauts de code. Trois sont
> corrigés (`locale.invalid` par ICU, repli Chromium annoncé, `self-mismatch`
> supprimé). Celui-ci ne l'est pas : il change le modèle d'identité, donc il
> passe par un plan.
> **Lié** — `docs/locale-model-plan.md` (le bug fondateur, §B.2 la sévérité
> propre à un auditeur), `docs/coverage-plan.md` (l'échantillonnage, qui décide
> ici), `docs/sitemap-robots-plan.md`.
> **État** — X5 tranché le 2026-08-13 (§6), livré en deux temps : la matrice
> (`feat/cluster-identity-from-sitemap`, v0.2.7) puis les règles de site
> (`fix/site-rules-follow-declared-clusters`, 2026-08-13). Les §1 à §4 sont
> mesurés et restent vrais quoi qu'il arrive ensuite. Ce qui reste ouvert est
> en fin de §7 — l'appariement depuis le `<head>` au premier chef.

---

## 0. Ce que ce plan tranche, et ce qu'il laisse ouvert

| #      | Décision                                                                             | État        |
| ------ | ------------------------------------------------------------------------------------ | ----------- |
| **X1** | Le défaut est réel, mesuré, et il produit des faux positifs — pas seulement du bruit | acquis (§1) |
| **X2** | Aucune conception qui exige que **les deux** côtés soient explorés ne peut marcher   | acquis (§2) |
| **X3** | `parseSitemap` jette une déclaration de cluster qu'un site de terrain émet déjà      | acquis (§3) |
| **X4** | Une déclaration de traduction **ment**, et goflag la croit sans réserve aujourd'hui  | acquis (§4) |
| **X5** | Identité par la déclaration du sitemap, repli en retrait de prétention               | arrêté (§6) |
| **X6** | Le `<head>` apparie aussi, sous réciprocité et ancre membre ; le sitemap prime       | arrêté (§9) |

---

## 1. Le constat, mesuré

`buildI18nMatrix` (`packages/cli/src/lib/core/i18n.ts:150-181`) écrit une case
par `(route, locale)`. La route sort de `splitRoute(pathname)` — **y compris
pour une alternative**, dont la route est tirée de _son propre_ chemin
(`i18n.ts:175`) et non de la page qui la déclare.

Reproduit contre la source réelle, quatre pages, hreflang réciproque des deux
côtés, sitemap complet :

```
route    | x-default   | en          | fr
/about   | /en/about   | /en/about   | /fr/about     ← témoin, slugs partagés
/pricing | /en/pricing | /en/pricing | —
/tarifs  | —           | —           | /fr/tarifs

holes (2):  /pricing manque fr   ·   /tarifs manque en
reciprocityIssues: []
```

**Le même rapport certifie le cluster correct et le déclare à moitié traduit.**

Le dégât ne s'arrête pas aux trous. `site-rules.ts:50` et `:145` utilisent le
même `splitRoute`, donc la même paire récolte deux avertissements
`hreflang.sitemap-mismatch` : « le `<head>` annonce fr, le sitemap n'a pas
d'entrée pour cette route ». Un site cohérent avec lui-même s'entend dire qu'il
se contredit. **Deux pages, quatre findings, zéro défaut réel.**

Sur un site de neuf paires sous couverture structurelle : **16 faux trous sur
17 routes.** Seule `/` survit, parce que les deux accueils partagent leur
chemin.

Les slugs traduits sont la norme sur les sites français et espagnols, c'est-à-
dire le marché de goflag.

---

## 2. L'échantillonnage décide, et il élimine la moitié des conceptions

`selectByStructure` groupe par locale (`coverage.ts:172`, clé
`${localePart}|${pattern}`) et tire dans l'ordre lexicographique
(`representatives`, `:110-119`).

- slugs partagés → les deux locales tirent **les mêmes** slugs : 3 paires sur 3
  alignées ;
- slugs traduits → l'ordre lexicographique diffère par locale, les tirages sont
  **disjoints** : **0 paire sur 8** avec les deux côtés tirés.

**Donc toute conception qui apparie en inspectant les deux membres ne répare
rien sur une famille échantillonnée** — c'est-à-dire dans le mode par défaut.
Ce qu'il faut, c'est qu'un membre soit **connu**, pas qu'il soit **exploré** :
une case se remplit depuis `cell.url` et jamais depuis `cell.inspected`
(`build.ts:238`).

---

## 3. Le sitemap déclare déjà les clusters, et on les jette

`fixtures/sites/tancrede/sitemap.xml` — instantané d'un site de terrain — porte
`xhtml:link rel="alternate" hreflang` sur chaque `<url>` : **150 liens pour 30
entrées**. `parseSitemap` (`sitemap/parse.ts:56-69`) lit `loc`, `lastmod`,
`changefreq`, `priority` et **ignore les `xhtml:link`**.

C'est la façon dont Google documente la déclaration d'un cluster au niveau du
sitemap, et c'est la seule source d'appariement qui survit à §2 : une entrée
`<url>` déclare tout son cluster, que ses membres aient été tirés ou non.

C'est aussi un consommateur **dans le dépôt**, ce qui compte pour la doctrine :
la donnée existe, elle est produite par un vrai site, et on la détruit au
parsing.

---

## 4. Le fait qui dérange : une déclaration ment

Toujours dans `fixtures/sites/tancrede/sitemap.xml`, mesuré :

```
entrées <loc>                : 30
cibles distinctes d'alternates : 36
cibles absentes du jeu de <loc> : 6
   /{en,pt-br,es}/blog/architecture-api-dsp2
   /{en,pt-br,es}/blog/comprendre-psd2-visuellement
```

Deux billets français annoncés comme existant dans trois locales où ils
n'existent pas.

**Et goflag remplit la case depuis la déclaration** (`i18n.ts:180`). Donc sur ce
site, aujourd'hui, six vrais trous de traduction sont invisibles : la
déclaration les bouche. Ce n'est pas une régression introduite par une
conception à venir — c'est le comportement actuel, et il est **plus grave que
le défaut qui a ouvert ce plan**, parce qu'un faux négatif ne se voit jamais.

Toute conception qui tire l'identité des alternatives doit donc répondre à :
_que fait-on d'une déclaration qui nomme une page inexistante ?_ La réponse
« on la croit » est celle d'aujourd'hui et elle est fausse.

---

## 5. Les quatre conceptions, et pourquoi les juges ne sont pas d'accord

Quatre conceptions écrites en aveugle l'une de l'autre, puis jugées sous trois
angles indépendants. **Les trois classements diffèrent**, et c'est le résultat
le plus utile du lot : le désaccord n'est pas du bruit, il vient de ce que les
angles pèsent des risques différents.

| Conception                                                              | Faux positifs | Bug fondateur | Doctrine |
| ----------------------------------------------------------------------- | ------------- | ------------- | -------- |
| **A. Identité par cluster hreflang** (union-find sur les alternatives)  | 3ᵉ            | 3ᵉ            | 1ᵉʳ      |
| **B. Identité déclarée** (sitemap `xhtml:link` → identité, jamais case) | **1ᵉʳ**       | 2ᵉ            | 3ᵉ       |
| **C. Retirer la prétention** (détecter la divergence, taire le compte)  | 2ᵉ            | 4ᵉ            | 2ᵉ       |
| **D. `--route-alias`** (l'opérateur déclare la carte des slugs)         | 4ᵉ            | **1ᵉʳ**       | 4ᵉ       |

Ce que chaque angle a vu :

- **Faux positifs** — B est la seule à atteindre zéro trou fantôme _sous
  échantillonnage_, parce que l'identité vient du sitemap entier pendant que les
  cases viennent de la sélection. Reproche retenu : son arête « canonical »
  fusionne des lignes en silence, et son étiquette de cluster dépend de
  l'appartenance — ajouter une locale renomme la route, donc fait bouger toutes
  les empreintes et fait crier une baseline sans qu'un défaut ait bougé.
- **Bug fondateur** — sur un site **sans aucun hreflang**, A, B et C sont des
  non-opérations avouées. Seule D change la réponse, parce que sa preuve
  d'appariement ne vient pas du site audité. Reproche retenu : le drapeau est
  éteint par défaut, donc le premier audit d'un site français inconnu reste
  faux — et muet sur le fait qu'il l'est.
- **Doctrine** — A gagne pour une raison inhabituelle : c'est la seule qui
  s'exclut elle-même du présent (« zéro consommateur exercé, écrire le plan et
  attendre »). Reproche retenu : le sous-ensemble d'une ligne qu'elle propose de
  livrer quand même embarque le mécanisme **sans** son garde-fou, et crée un
  faux négatif sur une classe de sites plus fréquente que les slugs traduits.

---

## 6. X5 — tranché

Elle n'est pas technique, elle est éditoriale : **que doit dire goflag quand il
ne sait pas apparier ?**

| Option            | Ce que ça affirme                                    | Ce que ça coûte                                           |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| **Réparer** (B)   | « j'ai apparié avec ce que le site déclare »         | croire une déclaration qui ment parfois (§4)              |
| **Se taire** (C)  | « je ne prétends rien sur la couverture de ce site » | un vrai trou passe inaperçu ; le compte tombe à 0         |
| **Demander** (D)  | « dis-moi la carte, je ne devinerai pas »            | le défaut par défaut reste, et l'opérateur doit le savoir |
| **Ne rien faire** | ce que fait la 0.2.6                                 | 16 faux trous sur 17 routes, documentés comme une limite  |

**Arrêté le 2026-08-13 : B pour l'identité, C comme repli.**

1. **Lire les `xhtml:link` du sitemap** (§3). La donnée existe, un site de
   terrain la produit, on la détruit au parsing.
2. **S'en servir pour l'identité de ligne, et jamais pour remplir une case.**
   C'est la ligne de sûreté de toute la conception, et elle règle §4 du même
   geste : une cible que le sitemap ne liste pas cesse de boucher un trou, donc
   les six faux négatifs de `tancrede` réapparaissent comme les trous qu'ils
   sont. Quiconque la franchit plus tard réintroduit le pire des deux défauts.
3. **Là où aucune déclaration de cluster n'existe et où les chemins divergent,
   retirer la prétention** plutôt que compter faux.

Deux reproches des juges sont retenus comme contraintes d'implémentation, pas
comme détails :

- **Pas d'arête `canonical`.** Le canonical est auto-référentiel par locale sur
  toutes les fixtures et tous les sites de terrain, il est déjà consommé comme
  signal de duplicat (`build.ts`, `dropCanonicalDuplicates`), et c'est la plus
  grosse surface de fusion silencieuse de la conception. Elle n'achète rien de
  mesuré : elle ne part pas.
- **L'étiquette de cluster ne doit pas dépendre de l'appartenance.** Prendre la
  route lexicographiquement la plus petite renomme la ligne quand une locale
  s'ajoute, donc déplace toutes les empreintes et fait crier une baseline sans
  qu'un défaut ait bougé. L'étiquette doit être stable sous ajout d'un membre.

D (`--route-alias`) reste l'issue de secours si l'inférence se révèle
insuffisante sur un vrai site, et le seul recours pour un site sans aucun
hreflang ni `xhtml:link` — cas où B et C sont, de leur propre aveu, des
non-opérations.

**La mesure reste due** : passer la version sur un site à slugs traduits qui
n'est pas une fixture. Les cinq sites maison n'en sont pas — `apps/website`
partage ses slugs entre `en/fr/es/pt`. Ce que l'implémentation ne peut pas
prouver depuis l'intérieur du dépôt doit être dit comme tel.

---

## 7. Ce qui est livré, et ce qui ne l'est pas

**Livré** (`feat/cluster-identity-from-sitemap`) :

- `parseSitemap` lit les `xhtml:link` — 150 déclarations récupérées sur la seule
  fixture qui en porte, contre zéro avant ;
- `buildClusterIndex` (`lib/core/clusters.ts`) forme les clusters, ancrés sur
  `x-default`, sans arête `canonical` ;
- `buildI18nMatrix` prend un `clusterRouteOf` qui **déplace** une case et n'en
  crée jamais ; `diagnostics.declaredClusters` dit combien de clusters, et
  combien de contradictions.

**Mesuré** : sur une paire à slugs traduits, 2 faux trous → 0, le témoin à slugs
partagés inchangé. Sur **les treize fixtures du dépôt, `rowsMoved = 0`** — y
compris `tancrede`, qui déclare neuf clusters mais ne traduit pas ses slugs. Le
mécanisme ne change donc rien à aucun site existant et n'agit que là où le
défaut est. C'est la propriété qu'on voulait, et c'est aussi l'aveu que la preuve
reste synthétique.

**Livré ensuite** (`fix/site-rules-follow-declared-clusters`, 2026-08-13) :

- `SiteContext` porte `clusterRouteOf`, alimenté depuis `report/build.ts` par
  l'index déjà construit pour la matrice. `hreflang.sitemap-mismatch` groupe ses
  **deux** côtés — la table du sitemap et la page explorée — par cluster avant
  de les comparer, au lieu de `splitRoute` seul.
- Fixture `translated-slugs` : deux paires à slugs traduits (`/en/pricing` ⇄
  `/fr/tarifs`, `/en/about-us` ⇄ `/fr/qui-sommes-nous`) plus un témoin à slug
  partagé (`/contact`), clusters déclarés au sitemap. C'est la première fixture
  du dépôt qui traduit ses slugs.

**Mesuré** : sur `translated-slugs`, **4 `hreflang.sitemap-mismatch` → 0**, et
le rapport complet passe au vert (0 trou, 0 réciprocité, 0 finding SEO). Sur les
treize autres fixtures, le digest complet du rapport — `siteIssues`, trous,
réciprocité, `summary`, `declaredClusters` — est **identique octet pour octet**
avant et après, `tancrede` (9 clusters déclarés) compris. Le gain est désormais
prouvé de bout en bout et plus seulement en unitaire ; ce qui reste synthétique,
c'est le site, pas la chaîne.

**Pas livré, et assumé :**

- **§4 n'est pas réglé.** Les alternatives du `<head>` remplissent toujours une
  case, donc les six cibles que `tancrede` annonce sans les servir bouchent
  toujours six vrais trous. Changer ça touche la sémantique de remplissage et
  peut faire apparaître des trous sur des pages qui existent mais n'ont été ni
  explorées ni listées : c'est un changement à mesurer sur un vrai site, pas à
  déduire.
- **L'appariement ne vient toujours que du sitemap.** Un site à slugs traduits
  qui déclare correctement dans son `<head>` et rien au sitemap reste cassé,
  matrice et règle comprises — et c'est le cas fréquent, `hreflang` dans le
  `<head>` étant le mécanisme canonique et suffisant. §2 dit pourquoi ça n'a pas
  été fait d'abord ; ça ne dit pas que ça ne doit pas l'être.
- **La mesure sur un vrai site reste due** (§6). `translated-slugs` est une
  fixture écrite pour ce défaut : elle prouve la chaîne, pas le terrain.

---

## 8. Dette annexe, mesurée en chemin

- **`splitRoute` est asymétrique sur le slash final.** `/fr/about/` → route
  `/about` ; `/about/` → route `/about/` et locale `x-default`. Deux URL de la
  même page tombent donc dans deux lignes. Générateur de faux positifs vivant,
  qu'aucune des quatre conceptions ne corrige. À traiter à part : toucher
  `splitRoute` déplace les empreintes des trous, donc casse les baselines.
- **`route || selfRoute` (`i18n.ts:180`) est du code mort.** `splitRoute` ne
  renvoie jamais `""`. Le commentaire au-dessus décrit une intention — gérer une
  alternative sans préfixe de locale — que le code n'implémente pas.
- ~~**La règle `hreflang.sitemap-mismatch` hérite du défaut** (§1). Toute
  correction de l'identité doit passer par `site-rules.ts`, sinon la moitié des
  faux findings reste.~~ Réglé le 2026-08-13 (§7). La leçon générale tient
  quand même : `SiteContext` est le seul canal par lequel une règle voit
  l'identité, donc tout nouveau modèle d'identité doit y passer, faute de quoi
  la moitié des findings raisonne encore sur les chemins.

---

## 9. X6 — le `<head>` apparie aussi

> **Rédigé** 2026-08-13, après §7. **Branche** `feat/pair-from-head-alternates`.
> **Ce que ça change à X5** : rien sur la primauté du sitemap ; ça ajoute une
> seconde source, subordonnée, là où le sitemap se tait.

### 9.1 Pourquoi X5 ne suffit pas, mesuré

X5 a choisi le sitemap parce qu'une entrée `<url>` nomme son cluster entier même
si aucun membre n'a été tiré (§2). C'est vrai, et ça reste la raison de le garder
en tête de liste. Mais ça couvre la **mauvaise moitié** du parc : `hreflang` dans
le `<head>` est le mécanisme canonique, Google traite les deux formes comme
équivalentes, et un site qui déclare correctement dans son `<head>` sans rien
mettre au sitemap **ne doit rien à personne**.

Nouvelle fixture `translated-slugs-head-only` — mêmes pages que
`translated-slugs`, sitemap complet (les six URL y sont) mais **sans un seul
`xhtml:link`**. Audit en 0.2.7 + §7 :

| Finding                     | Compte | Réalité                                      |
| --------------------------- | ------ | -------------------------------------------- |
| `hreflang.sitemap-mismatch` | **4**  | aucun désaccord : le sitemap liste tout      |
| trous de traduction         | **4**  | les deux paires sont intégralement traduites |

Huit findings faux sur un site sans défaut. C'est le pire mode d'échec de cet
outil (`docs/locale-model-plan.md` §B.2), et c'est la forme la plus fréquente.

### 9.2 Le mécanisme

Une arête entre deux pages **explorées** `P` et `Q` si et seulement si le
`<head>` de `P` déclare une alternative qui résout vers `Q` **et** celui de `Q`
en déclare une qui résout vers `P`. Composantes connexes, puis :

1. **Pas d'arête `canonical`.** Contrainte de §6, inchangée et non rediscutée.
2. **Une déclaration non réciproque ne forme rien.** Une page qui pointe seule
   vers une autre affirme une identité que l'autre ne confirme pas ; c'est
   exactement la surface de fusion silencieuse que §6 refusait.
3. **L'ancre est le `x-default` déclaré, et il doit être membre de la
   composante.** Si les membres ne nomment pas tous le même `x-default`, ou si
   la cible n'est pas elle-même dans la composante, **on ne fusionne pas** — on
   compte le refus.
4. **Le sitemap prime.** L'index du `<head>` ne répond que là où le sitemap
   s'est tu. Un désaccord entre les deux est un conflit, compté comme les autres.

La clause 3 n'est pas un ornement. `x-default` pointant vers la page d'accueil
de tout le site est une erreur de terrain courante ; sans elle, chaque page
tenterait de fusionner sur la ligne `/`, et goflag écraserait un site entier en
une seule route. Avec elle, la page d'accueil n'est pas réciproquement liée à
`/en/pricing`, donc rien ne fusionne. Le garde-fou est structurel, pas une liste
d'exceptions.

L'étiquette reste stable sous ajout d'un membre, comme l'exige §6 : elle est le
`x-default`, une déclaration que le site fait sur lui-même, pas une fonction de
l'appartenance.

### 9.3 Ce que ça ne fait pas, et il faut le dire

- **Sur un site sans aucun `hreflang`, c'est une non-opération**, par
  construction : pas d'alternative, pas d'arête, pas de cluster. Mesuré sur
  `silent-multilingual` — 8 pages, 0 alternative, 0 arête. Le bug fondateur
  (`docs/i18n.mdx`, « The bug that started this ») n'est ni réglé ni masqué :
  `hreflang.missing` lit `alternates.length === 0` et continue de tirer sur les
  huit pages. Comme l'index sitemap, cet index **déplace une case et n'en crée
  jamais**, donc il ne peut pas boucher un trou.
- **Sous couverture structurelle, sur une famille à slugs traduits, c'est aussi
  une non-opération** : les deux membres ne sont pas tirés (§2, 0 paire sur 8).
  Mesuré sur `tancrede`, site de terrain : **0 arête réciproque** parmi les pages
  échantillonnées. C'est la démonstration que cette source ne remplace pas le
  sitemap et ne prétend pas le faire.
- **Une redirection casse l'appariement.** La réciprocité se juge sur
  `fetch.finalUrl` ; un site qui pointe ses alternates vers les URL d'avant
  redirection ne forme pas d'arête. On rate plutôt que d'inventer, dans ce sens
  et pas dans l'autre.

### 9.4 Mesuré

| Site                                           | Avant                | Après               |
| ---------------------------------------------- | -------------------- | ------------------- |
| `translated-slugs-head-only`                   | 4 warnings + 4 trous | **0 + 0**           |
| `translated-slugs` (sitemap déclare déjà)      | 0 + 0                | 0 + 0               |
| les 13 fixtures antérieures, `tancrede` inclus | —                    | **`rowsMoved = 0`** |

L'appariement par le `<head>` ne déplace aucune ligne sur aucune fixture
existante — même propriété que l'index sitemap, et pour la même raison : il
n'agit que là où les chemins divergent.

### 9.5 Reste dû

- La mesure de terrain de §6 reste due, et le devient doublement : aucune des
  deux fixtures à slugs traduits n'est un vrai site.
- `--route-alias` (conception D) reste l'issue de secours pour un site qui ne
  déclare **rien**, ni `<head>` ni sitemap. X6 ne l'entame pas.

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
> **État** — **rien n'est implémenté.** §6 porte une décision ouverte qui n'est
> pas la mienne à prendre.

---

## 0. Ce que ce plan tranche, et ce qu'il laisse ouvert

| #      | Décision                                                                             | État        |
| ------ | ------------------------------------------------------------------------------------ | ----------- |
| **X1** | Le défaut est réel, mesuré, et il produit des faux positifs — pas seulement du bruit | acquis (§1) |
| **X2** | Aucune conception qui exige que **les deux** côtés soient explorés ne peut marcher   | acquis (§2) |
| **X3** | `parseSitemap` jette une déclaration de cluster qu'un site de terrain émet déjà      | acquis (§3) |
| **X4** | Une déclaration de traduction **ment**, et goflag la croit sans réserve aujourd'hui  | acquis (§4) |
| **X5** | Quoi faire : réparer l'appariement, retirer la prétention, ou demander à l'opérateur | **ouvert**  |

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

## 6. La décision ouverte (X5)

Elle n'est pas technique, elle est éditoriale : **que doit dire goflag quand il
ne sait pas apparier ?**

| Option            | Ce que ça affirme                                    | Ce que ça coûte                                           |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| **Réparer** (B)   | « j'ai apparié avec ce que le site déclare »         | croire une déclaration qui ment parfois (§4)              |
| **Se taire** (C)  | « je ne prétends rien sur la couverture de ce site » | un vrai trou passe inaperçu ; le compte tombe à 0         |
| **Demander** (D)  | « dis-moi la carte, je ne devinerai pas »            | le défaut par défaut reste, et l'opérateur doit le savoir |
| **Ne rien faire** | ce que fait la 0.2.6                                 | 16 faux trous sur 17 routes, documentés comme une limite  |

Ma recommandation, à valider : **B pour l'identité, C comme repli.** Lire les
`xhtml:link` du sitemap (§3, consommateur réel, donnée déjà produite et jetée),
s'en servir pour l'identité de ligne **et jamais pour remplir une case** — ce
qui règle §4 du même geste, puisqu'une cible non listée cesse de boucher un
trou — et, là où aucune déclaration de cluster n'existe et où les chemins
divergent, retirer la prétention plutôt que de compter faux. D reste l'issue de
secours si l'inférence se révèle insuffisante sur un vrai site.

**Ce qui manque pour trancher est une mesure, pas un avis** : passer la version
actuelle sur un site à slugs traduits qui n'est pas une fixture. Les cinq sites
maison n'en sont pas — `apps/website` partage ses slugs entre `en/fr/es/pt`.

---

## 7. Dette annexe, mesurée en chemin

- **`splitRoute` est asymétrique sur le slash final.** `/fr/about/` → route
  `/about` ; `/about/` → route `/about/` et locale `x-default`. Deux URL de la
  même page tombent donc dans deux lignes. Générateur de faux positifs vivant,
  qu'aucune des quatre conceptions ne corrige. À traiter à part : toucher
  `splitRoute` déplace les empreintes des trous, donc casse les baselines.
- **`route || selfRoute` (`i18n.ts:180`) est du code mort.** `splitRoute` ne
  renvoie jamais `""`. Le commentaire au-dessus décrit une intention — gérer une
  alternative sans préfixe de locale — que le code n'implémente pas.
- **La règle `hreflang.sitemap-mismatch` hérite du défaut** (§1). Toute
  correction de l'identité doit passer par `site-rules.ts`, sinon la moitié des
  faux findings reste.

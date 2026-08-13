# goflag — Plan : couvrir un site par sa structure, pas par un plafond

> **Rédigé** 2026-08-09
> **Portée** — remplacer `--max-pages`, un plafond aveugle, par une sélection
> qui connaît la forme du site : tout ce qui est unique est audité, ce qui est
> répété est échantillonné.
> **Origine** — `openfinanceguide` sert 4451 pages et son gate en couvre 200.
> En mesurant ce que ces 200 valaient, le crawl s'est révélé **non
> reproductible** au-delà du plafond, ce qui est le vrai défaut.
> **Lié** — `docs/rules-catalog-plan.md` (quelles règles survivent à un
> échantillon), `docs/next-plan.md` §5 (le manifeste `.goflag/routes.json`, hors
> v0, qui devient ici une entrée facultative).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------- |
| **C1** | Le plafond aveugle disparaît comme **défaut**. Il reste, en garde-fou explicite                    |
| **C2** | Racine et premier segment sont **toujours** audités, dans toutes les locales                       |
| **C3** | Une famille de routes est **échantillonnée**, pas ignorée : `k` par famille, `k=3` par défaut      |
| **C4** | La famille est **inférée** de la forme des URLs ; un manifeste la précise mais n'est jamais requis |
| **C5** | La sélection est **déterministe** : même site, même échantillon, sans quoi le gate ne vaut rien    |
| **C6** | Le rapport **déclare sa couverture**. Un audit qui a regardé 3 pages sur 2585 doit le dire         |

---

## 1. Le problème n'est pas la lenteur

C'est ce qu'on croit en arrivant, et c'est faux. `--max-pages 200` sur un site
de 4451 pages couvre 4,5 % du site — mais **quelles** 4,5 % ?

Mesuré contre `develop.openfinanceguide.com`, même commande, trois fois :

```
--max-pages 200   →  200 pages, 129 findings      (reproductible)
--max-pages 600   →   46 pages,   5 findings
--max-pages 600   →  600 pages, 279 findings
```

La cause a été trouvée depuis, et ce n'était pas le crawl : `fetchDoc`
renvoyait la même forme pour un timeout et pour un 404, donc un sitemap de
3,5 Mo qui expirait se lisait « ce site n'a pas de sitemap ». Le crawl perdait
ses 4008 graines et retombait sur le suivi de liens. Corrigé en V-0.

**C'est un gate instable, pas un gate partiel.** Une baseline capturée sur le
run à 46 pages, comparée au run à 600, rapporte des centaines de findings
« nouveaux » qui étaient là depuis toujours. La pipeline devient rouge sans que
rien n'ait changé, ce qui est le seul défaut qui apprend à ignorer un gate.

Le plafond haut est donc _plus_ dangereux que le plafond bas. C'est
contre-intuitif et c'est la raison d'être de ce plan.

---

## 2. Ce qu'un plafond ignore de ce qu'il coupe

Les 600 pages du run le plus complet, regroupées par forme :

```
111  /{locale}/stet/1.6.3/…       une famille, un gabarit
  5  /{locale}
  4  /{locale}/blog
  4  /{locale}/glossary
  4  /{locale}/standards
  4  /{locale}/standards/rfc-6749
  4  /{locale}/standards/rfc-7591
  …
123 familles au total
```

Le site sert **4451 pages pour ~30 gabarits**. Les 2585 pages
`/stet/{v}/resources/{schema}` sortent du même composant, avec le même `<head>`
construit par le même appel. Un `canonical.missing` sur l'une est un
`canonical.missing` sur les 2585 ; les auditer toutes le trouve 2585 fois et
n'apprend rien la 2ᵉ fois.

Un plafond coupe **au milieu d'une famille**, arbitrairement. Une sélection par
structure prend 3 pages de chacune des 30 et couvre le site.

---

## 3. La sélection

### 3.1 Trois classes

| Classe        | Ce que c'est                                           | Traitement           |
| ------------- | ------------------------------------------------------ | -------------------- |
| **Singleton** | Racine, et tout premier segment : `/blog`, `/glossary` | **Toujours audité**  |
| **Famille**   | Un motif partagé par ≥ `threshold` URLs                | `k` représentants    |
| **Reste**     | Ce qui n'entre dans aucune famille                     | Audité, puis plafond |

Dans toutes les locales : une traduction est une page distincte, servie par le
même gabarit mais avec une copy différente, et `title.length` se juge sur la
copy. Trois pages d'une famille veut dire trois par locale.

### 3.2 Pourquoi `k=3` et pas `k=1`

`k=1` est la proposition naturelle et elle est trop optimiste d'un cran. Une
famille n'est homogène que sur ce que le gabarit produit ; elle ne l'est pas sur
ce que le contenu apporte. Trois représentants attrapent la borne haute d'une
distribution que `k=1` rate une fois sur trois :

| Règle                | Ce qu'elle juge | `k=1` suffit ? |
| -------------------- | --------------- | -------------- |
| `canonical.missing`  | le gabarit      | oui            |
| `hreflang.missing`   | le gabarit      | oui            |
| `og.image.missing`   | le gabarit      | oui            |
| `title.length`       | **la copy**     | non            |
| `description.length` | **la copy**     | non            |
| `links.broken`       | **le contenu**  | non            |

Le choix des trois est structuré, pas aléatoire (C5) : la première URL de la
famille en ordre lexicographique, la dernière, et celle du milieu. Stable entre
deux runs, et elle bouge quand le contenu bouge, ce qui est le comportement
voulu.

### 3.3 Ce que l'échantillonnage coûte, dit franchement

Une famille échantillonnée à 3 sur 2585 ne peut plus promettre qu'aucune des
2582 autres n'a une description trop longue. Le rapport doit donc arrêter de
prétendre le contraire : c'est C6, et c'est la moitié de la fonctionnalité.

```
COVERAGE  4451 pages servies · 312 auditées · 30 familles, 3 par famille
          Les règles de gabarit sont concluantes.
          Les règles de copy (title.length, description.length) sont
          échantillonnées : 3 sur 2585 pour /stet/{v}/resources/{schema}.
```

Sans cette ligne, la fonctionnalité transforme un audit partiel en un audit qui
**a l'air** complet, ce qui est pire que le plafond qu'elle remplace.

---

## 4. Inférer la famille (C4)

Sans rien savoir du framework, à partir des URLs collectées :

1. Découper en segments, remplacer le segment de locale par `{locale}` — l'axe
   est déjà calculé par le moteur i18n.
2. Pour chaque profondeur, un segment est **variable** quand plus de
   `threshold` URLs partagent le même préfixe et diffèrent à cette position.
3. Le motif obtenu, `/{locale}/stet/{v}/resources/{schema}`, est la famille.

`threshold: 8` par défaut. En dessous, trois pages sur cinq ne fait pas
économiser assez pour valoir une promesse affaiblie.

**Le manifeste, quand il existe.** `@goflag/next` connaît les familles
exactement — c'est son registre. Un `.goflag/routes.json` émis par la lib les
donne sans inférence, et `docs/next-plan.md` §5 le prévoyait déjà comme trivial
une fois le registre écrit. Il reste **facultatif** : goflag audite des sites
qu'il ne produit pas, et une fonctionnalité qui n'existe que pour nos propres
sites n'aurait pas sa place dans le CLI.

---

## 5. Les liens ne s'échantillonnent pas de la même façon

Un lien cassé est une propriété du **contenu**, pas du gabarit, et c'est le
finding qui coûte à un lecteur plutôt qu'à un classement. Or l'audit de liens
est déjà déduplicaté globalement : un lien de pied de page présent sur 500
pages est sondé une fois.

Donc **la découverte des liens reste sur toutes les pages crawlées, même celles
qui ne sont pas auditées**. Séparer les deux passes est le seul endroit où ce
plan ajoute du travail plutôt qu'il n'en retire : extraire les `href` d'une page
coûte un fetch, l'évaluer contre 14 règles coûte le reste.

Mesuré : les 102 liens cassés de `tancredo` étaient sur des pages de facette,
donc de premier segment, donc toujours auditées. L'échantillonnage ne les aurait
pas manqués.

---

## 6. Combien de temps, vraiment

Mesuré contre `develop.openfinanceguide.com`, réseau réel, `--static
--no-external`. Les deux dernières lignes sont des runs réels de la
fonctionnalité, pas des extrapolations :

| Périmètre                  |   Pages |     Durée |   Par page |      Gabarits |
| -------------------------- | ------: | --------: | ---------: | ------------: |
| Plafond de 50              |      50 |      12 s |     240 ms |             — |
| Plafond de 200 (actuel)    |     200 |      60 s |     300 ms |      4 sur 30 |
| **Sélection structurelle** | **760** | **432 s** | **570 ms** | **30 sur 30** |
| Tout le site (estimé)      |    4451 |   ~42 min |     570 ms |     30 sur 30 |

**L'estimation initiale de ce plan était fausse d'un facteur deux** : elle
tablait sur ~300 pages et 1,5 minute. Les deux chiffres viennent d'être
mesurés. Le nombre de pages est plus élevé parce que les sept versions du
handbook restent des familles distinctes — elles sont sous le seuil, et le
seuil fait son travail. Le coût par page est plus élevé parce que les pages
sélectionnées sont les grosses : une page de schéma OpenAPI n'est pas une page
de blog.

Ce que la sélection achète, en revanche, ne change pas : **428 findings contre
129**, en auditant 19 % du site. Le plafond n'en trouvait pas moins parce qu'il
regardait moins de pages, mais parce qu'il regardait quatre gabarits sur trente.

Le budget CI du groupe est de 400 minutes par mois. Auditer intégralement
`openfinanceguide` à chaque merge request coûterait 22 minutes par MR — une
vingtaine de MR et le mois est consommé, pour ne rien apprendre après les trois
premières pages de chaque famille.

**La sélection structurelle coûte 1,5 minute et couvre 30 gabarits sur 30,
là où le plafond en couvre 4 sur 30 en 1 minute.** C'est l'argument, et il ne
repose pas sur la vitesse.

---

## 7. Phasage

| Étape   | Contenu                                                             | État      |
| ------- | ------------------------------------------------------------------- | --------- |
| **V-0** | Un sitemap injoignable n'est plus lu comme absent — le défaut du §1 | ✅ livrée |
| **V-1** | Inférence des familles + `--coverage structural`                    | ✅ livrée |
| **V-2** | La ligne `COVERAGE` au rapport et au JSON (C6)                      | ✅ livrée |
| **V-3** | `structural` par défaut, `--max-pages` redevient un garde-fou       | ✅ livrée |
| **V-4** | `.goflag/routes.json` lu s'il est là ; émis par `@goflag/next`      | ⬜        |

**V-0 avant tout le reste.** Le plafond instable est un défaut aujourd'hui, sur
des sites qui l'ont configuré ; la sélection structurelle est une amélioration
pour demain. Corriger le premier ne demande pas d'attendre la seconde, et livrer
la seconde sans le premier laisserait un gate qui ment moins souvent sans cesser
de mentir.

### Critères de sortie

| Étape   | Critère                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------- |
| **V-0** | Trois runs consécutifs, même site, même plafond non atteint → même nombre de pages                  |
| **V-1** | ✅ `openfinanceguide` : 18 familles échantillonnées, 760 pages sur 4008, 428 findings contre 129    |
| **V-2** | Le rapport nomme chaque famille échantillonnée et son ratio                                         |
| **V-3** | Les quatre sites passent leur gate avec un `--max-debt` recalculé, et aucun ne perd de finding réel |

---

## 8. Risques

| Risque                                                              | Traitement                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| L'échantillon cache une régression sur une page non tirée           | C6 : le rapport le dit. Un audit qui ment sur sa couverture est pire que pas d'audit |
| L'inférence groupe deux familles distinctes sous un motif           | `threshold` élevé, et le manifeste (C4) tranche quand il est là                      |
| Le tirage bouge quand le contenu bouge, et déplace la dette         | Voulu : une famille dont le contenu change mérite d'être rejugée                     |
| `--max-debt` devient incomparable entre l'ancien et le nouveau mode | V-3 recapture les quatre baselines dans la même MR que le changement de défaut       |

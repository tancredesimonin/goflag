# goflag — Plan `preview` : regarder ce que le catalogue ne peut pas juger

> **Rédigé** 2026-08-16 · **Amendé** 2026-08-16 (PV-1 et PV-2 livrées : §10.1 sur
> le coût réel du patron, §10.2 sur ce que l'écriture a démenti)
> **Portée** — la commande `goflag preview <url>`, la section d'extraction qui
> lui manque dans le rapport, et la frontière avec `@goflag/og`, qui **produit**
> la carte quand celle-ci se contente de la **montrer**.
> **Lié** — `docs/og-plan.md` (le paquet qui produit l'image, les onze règles
> `og.*` et les six `icons.*`), `docs/rules-catalog-plan.md` (le barème de rigueur),
> `apps/website/content/docs/limits.mdx` (le refus de juger le structuré).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** | La preview est une **vue du rapport**, pas un second pipeline : `renderPreview(report, options): string`, pure, comme les trois autres renderers |
| **D2** | Un **fichier HTML autonome** — aucun asset à côté, aucun serveur, aucun rechargement à chaud                                                     |
| **D3** | **On ne dessine que ce qui est sourcé.** Chaque surface porte sa rigueur, au barème du catalogue                                                 |
| **D4** | La preview **montre sans juger** : `jsonLd` et `twitter:*` entrent dans la vue, pas dans le catalogue                                            |
| **D5** | L'extraction entre au rapport en **section optionnelle**, sur le patron de `conformance` et `advisories` — pas par un second passage             |
| **D6** | `preview` est une **commande**, pas un drapeau : une commande ne touche pas `flags.json`, donc pas I6                                            |

---

## 1. Pourquoi ça appartient à goflag

Pas parce que l'aperçu de carte est un sujet — il en existe vingt outils. Parce
que **cinq règles du catalogue posent une question et refusent d'y répondre**, et
que l'une d'elles demande littéralement de regarder :

> `og.image.representative` — « Does the og:image represent what this page is
> about, rather than being a site-wide default, and does its subject survive
> being cropped to the 1.91:1 aspect ratio consumers render? »

Une règle de prose n'a ni sévérité ni verdict : elle attend un œil. Aujourd'hui
l'œil doit déployer, poster le lien quelque part, et regarder ce qui sort. La
preview n'ajoute pas une règle — elle donne à des règles existantes l'organe qui
leur manque. C'est la même mécanique que le §1 du plan OG, prise dans l'autre
sens : là-bas goflag signalait un défaut sans remède, ici il pose une question
sans instrument.

Et l'auditeur détient déjà chaque fait nécessaire. Ce plan n'ajoute aucune
collecte.

---

## 2. La frontière avec `@goflag/og`

| Brique                                                        | Où                        |
| ------------------------------------------------------------- | ------------------------- |
| **Produire** l'image de partage (gabarit, tokens, `fitTitle`) | `@goflag/og` — déjà écrit |
| **Servir** l'image                                            | le site                   |
| **Constater** ce que le site sert, et le montrer              | `preview` — ce plan       |
| **Juger** la déclaration                                      | le catalogue — déjà écrit |

La preview ne rend jamais de carte : elle affiche l'URL que la page déclare,
telle que la sonde l'a trouvée. Un site qui n'utilise pas `@goflag/og` en
bénéficie identiquement — I2 tient.

---

## 3. PV-0 — ce qui est déjà là

Aucune ligne d'extraction à écrire. Le modèle porte tout, et les chemins exacts
sont le contrat :

| Fait                          | Chemin                                                               |
| ----------------------------- | -------------------------------------------------------------------- |
| titre, description, canonical | `document.title`, `meta.description`, `meta.canonical`               |
| la carte                      | `openGraph.{title,description,url,siteName,locale,localeAlternates}` |
| les images                    | `openGraph.images[]` — `url`, `width?`, `height?`, `alt?`, `type?`   |
| X                             | `twitter.{card,site,creator,title,description,image,imageAlt}`       |
| structuré                     | `jsonLd[]` — `index`, `types`, `data`, `parseError?`, `raw`          |
| icônes, manifeste             | `links.icons`, `links.manifest` (`parsed` à trois états)             |
| ce que la sonde a trouvé      | `assets[url]` — `status`, `ok`, `contentType?`, `sizes?`             |
| l'axe des locales             | `document.lang`, `openGraph.locale`, `links.hreflang[]`              |

Trois pièges de lecture, payés d'avance :

- La clé de sonde d'une image est **`image.url.value.trim()`**, pas la valeur
  brute (`rules/index.ts:962`). Un renderer qui indexe autrement rate la sonde
  et affiche « inconnu » sur une image parfaitement sondée.
- `assets` **absent** et `assets` **vide** disent deux choses différentes : aucune
  passe n'a tourné, contre la passe a tourné et n'a rien eu à chercher.
  `sizes` absent veut dire **format non décodé** — seuls PNG et ICO le sont —
  jamais « pas de dimensions ».
- **Personne ne calcule de ratio nulle part.** `og.image.ratio` le mesure pour
  son verdict et ne le publie pas. La vue le dérive elle-même, des dimensions
  déclarées ou des dimensions sondées, et doit dire laquelle des deux.

---

## 4. PV-1 — le trou réel : le rapport ne porte pas la page

C'est la seule décision structurante de ce plan, et elle n'était pas prévue en
l'écrivant. `ReportPage` porte exactement `{ url, status, locale }`
(`report/types.ts:19-24`). Le rapport ne contient **aucune métadonnée de page** :
ni titre, ni description, ni `og:*`. L'extraction est construite dans la boucle
d'audit — `const extraction = extractionFromPage(page)`, `report/build.ts:669` —
et **jetée** : seuls les findings, les lignes de conformance et les advisories en
sortent.

Trois formes ont été pesées :

| Forme                                       | Coût                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| Refaire une extraction dans un chemin dédié | il faut le `Page` interne, donc tout le pipeline de fetch — un second passage |
| Reconstituer depuis `--advisories`          | `evidence` est un fragment par règle, lacunaire par construction              |
| **Une section optionnelle dans le rapport** | **le patron existe déjà** — `conformance` et `advisories` sont exactement ça  |

**Retenu : la troisième.** Elle garde la propriété sur laquelle tout repose — le
JSON est la vérité, les renderers n'en sont que des vues — et elle vaut au-delà
de la preview : le rapport gagne le modèle de `<head>` par page, que rien
n'exposait. **Ce paragraphe promettait `--json` ; aucun drapeau n'a été écrit** —
l'option est programmatique, `preview` la pose, et `--report` la rend lisible.
Pourquoi, au §10.2.

Deux garde-fous. La section est **optionnelle**, parce qu'une extraction par page
sur un site de 456 pages est un rapport qui triple de taille pour un lecteur qui
n'en veut pas. Et elle porte le modèle **documenté**, pas les internes du moteur :
pas de HTML brut, pas de blobs.

---

## 5. D3 — les surfaces, et pourquoi elles ne se valent pas

Le barème du catalogue existe déjà —
`spec-required › spec-recommended › vendor-spec › guideline › heuristic`. Il est
appliqué aux règles ; ce plan l'applique aussi à **la géométrie qu'on dessine**.
Un outil qui rend les sept surfaces à l'identique affirme sept fois la même chose
avec sept degrés de vérité différents.

| Surface    | Rigueur         | Ce que la source dit vraiment                                                                        |
| ---------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Open Graph | **vendor-spec** | 1200 × 630 recommandé, 600 × 315 plancher, 200 × 200 minimum, 8 Mo, 1.91:1                           |
| LinkedIn   | **vendor-spec** | 1200 × 627 minimum, 1.91:1, 5 Mo, et **sous 401 px de large la carte tombe en vignette**             |
| WhatsApp   | **vendor-spec** | < 600 Ko, ≥ 300 px, ratio ≤ 4:1, titre 2 lignes, description « 80 characters will suffice »          |
| Slack      | guideline       | lit OG **et** les cartes X, et qualifie son rendu de « micro-approximation ». Aucune géométrie       |
| Google     | heuristic       | **pas une carte** : ni image, ni ratio. Aucune limite publiée, seulement « to fit the device width » |
| X          | **sans source** | comportement daté, docs inaccessibles (HTTP 402 sur `developer.x.com` et `business.x.com`)           |
| Discord    | **sans source** | aucune documentation d'unfurl, ni balises ni géométrie                                               |

### Les deux pièges, et pourquoi ils justifient D3

**X.** Tous les outils dessinent encore la carte à trois lignes — image, titre,
description. X a retiré titre **et** description le **4 octobre 2023** ; le titre
est revenu en janvier 2024, en petit, **par-dessus** l'image ; la description
n'est jamais revenue. La disposition titre-sous-l'image n'existe que pour les
publicités depuis mai 2025. Un outil qui montre l'ancienne carte ment sur la
surface la plus regardée.

**Discord.** Les limites 256 / 4096 / 6000 caractères sont réelles et documentées
— pour les **embeds envoyés par un bot via l'API**. Les reprendre comme seuils de
troncature d'unfurl serait une erreur de source, exactement celle que le barème
existe pour empêcher.

**Google.** `og:title` est une source documentée du lien de titre ;
`og:description` ne l'est nulle part — le snippet vient du contenu ou de
`meta description`. Et aucune longueur n'est publiée : les 600 px et les
155 caractères qui circulent sont de la mesure tierce, dont les sources se
contredisent (482, 512, 580, 600).

---

## 6. D4 — le JSON-LD, montré et non jugé

`jsonLd` est extrait depuis toujours, avec un parseur déjà tolérant : entités
HTML décodées, tableaux racine et `@graph` aplatis, `@type` collectés en
profondeur, « vide » distingué d'une vraie erreur de parse, contenu verbatim
conservé comme preuve. **Aucune règle ne le lit.** L'union des `reads` des
56 règles ne contient pas `jsonLd`, et le seul consommateur est l'heuristique
d'escalade (« no JSON-LD » comme conjoint du test de `<head>` vide).

Le refus est documenté : « JSON-LD presence is used as a signal that a page's
head is not empty. Its _correctness_ is not judged. » (`limits.mdx`). Ce plan ne
le lève pas. Il affiche les blocs, leurs `@type` et leurs erreurs de parse, sans
verdict et sans sévérité.

C'est l'ordre inverse de D5 du plan OG, et c'est assumé : là-bas la règle
précédait le remède parce que le défaut était connu et compté. Ici on ne sait pas
encore ce qu'on regarde. Montrer d'abord est le seul moyen honnête de découvrir
s'il y a une famille `jsonld.*` à écrire — et le candidat le moins discutable est
déjà identifié : un bloc qui ne parse pas est un défaut sans ambiguïté, et le
parseur le distingue déjà d'un bloc vide.

**`twitter:*` est dans le même cas** : entièrement extrait, entièrement non jugé,
aucune règle `twitter.*` au catalogue. La vue le montre pour la même raison.

**Premier cas d'usage, encore une fois le site lui-même** : `apps/website`
n'émet **aucun** bloc `application/ld+json`, et aucune règle ne peut le lui
reprocher.

---

## 7. PV-4 — statique contre hydraté

Le mode d'échec que rien ne dit : la balise injectée par JS. Le navigateur la
montre, le dépliage de lien ne la verra jamais.

`Fact<T>` ne porte **pas** cette provenance — ses trois champs sont `value`,
`origin`, `raw?`, et `origin` nomme la **balise** qui a produit la valeur, jamais
la passe de rendu. `Extraction` ne connaît le mode qu'à l'échelle de la page
(`rendering.mode`). Un renderer ne peut donc rien dire de plus aujourd'hui.

Mais le delta **est déjà calculé une couche plus bas** : `Page.hydration` porte
`clientInjectedMetas`, `clientRemovedMetas`, `clientInjectedLinks`,
`clientRemovedLinks`, `titleChanged`, `jsonLdBlocksAdded`, et sa propre
documentation vise le cas exact — « this `og:image` is client-injected, Slack's
previewer won't see it ». L'adaptateur le jette explicitement, en toutes lettres :
« leave behind the engine internals (raw HTML blobs, hydration deltas) ».

Le coût est donc **un champ optionnel sur `Extraction` et une ligne de
projection** — ajouter un champ optionnel n'est pas un bump
d'`EXTRACTION_VERSION`. Deux réserves, à écrire dans le champ lui-même :

- le delta n'est peuplé que sur le **chemin d'escalade automatique** ; un
  `--headless` explicite ne garde aucun corps statique, donc aucun diff n'en est
  dérivable sans une seconde requête ;
- sa granularité est la **balise**, pas le `Fact`. Une provenance par valeur
  serait un vrai chantier — `Fact<T>` est le porteur scalaire partagé par toutes
  les surfaces, et le discriminer reshape un champ, donc bump de schéma.

Rien n'appelle `page.hydration` en production aujourd'hui. Ce serait son premier
consommateur : septième occurrence du signal collecté et jamais utilisé.

---

## 8. D6 — la grammaire, et ce qu'elle coûte

L'infrastructure de sous-commandes **existe déjà** : une table `COMMANDS`
déclarative (`lib/flags/registry.ts:547`), deux entrées (`rules`, `flags`), la
détection en position 0 (`cli-args.ts:72`), les branches de dispatch
(`cli.ts:81`, `:89`), et l'aide rendue depuis la même table.

Ce qui manque tient en trois lignes. Les deux commandes existantes ne prennent
aucun positionnel : `cli-args.ts:73-74` avale le mot suivant comme URL puis lève
`unexpected argument`. Il faut élargir l'union `command`, laisser un positionnel
suivre un mot-commande, et brancher `preview` **après** la garde d'URL manquante,
puisque ce serait la première commande qui en exige une.

Deux conséquences de packaging, qui vont dans le même sens :

- Une **commande** ne figure pas dans `flags.json` — pas d'invalidation du
  catalogue byte-à-byte, donc pas de I6. Seule la fixture d'aide est à
  régénérer, délibérément. Un **drapeau** aurait coûté les deux.
- `tsup` ne copie aucun asset et `files` n'expose que `dist`, `rules.json`,
  `flags.json`. Le CSS et le JS doivent donc être **inlinés dans la source
  TypeScript** — ce qui est exactement la sortie voulue par D2. La contrainte de
  packaging et la forme visée disent la même chose : un seul fichier, autonome,
  qui survit à un artefact de CI et à une pièce jointe.

Le fichier sort en `.goflag/preview.html`, à côté de la baseline. C'est un
artefact, jamais committé — la seule sortie committée de tout le projet reste le
`.ico` de D7 du plan OG.

---

## 9. Limites connues

| Limite                                                | Conséquence                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Deux surfaces sur sept publient une géométrie         | la vue affiche une rigueur, pas une promesse de fidélité au pixel                 |
| Les répliques vieillissent avec les éditeurs          | ce sont des captures datées, pas un contrat ; X l'a prouvé deux fois en trois ans |
| `Fact<T>` n'a pas de provenance de passe              | le diff d'hydratation est à la granularité de la balise (§7)                      |
| `--headless` explicite ne garde aucun corps statique  | pas de diff sur ce chemin                                                         |
| Dimensions réelles décodées pour PNG et ICO seulement | un JPEG ou un WebP n'a pas de `sizes` — « non décodé », pas « pas de dimensions » |
| Aucune règle ne juge le structuré ni `twitter:*`      | le panneau les montre sans verdict, et c'est délibéré (D4)                        |
| Le rapport grossit avec la section d'extraction       | elle est optionnelle (D5)                                                         |

---

## 10. Phasage

| Étape    | Contenu                                                                                                                                                                                                                   | Dépend de |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **PV-0** | ✅ **acquis** — rien à écrire. Le modèle porte déjà tout (§3)                                                                                                                                                             | —         |
| **PV-1** | ✅ **livrée** — `extractions?: Extraction[]`, optionnelle, sur le patron de `conformance`. Trois points de contact sur cinq, et le §10.1 dit pourquoi pas cinq                                                            | —         |
| **PV-2** | ✅ **livrée** — `goflag preview <url>` écrit `.goflag/preview.html` : sept surfaces avec leur rigueur, le rail des findings, le panneau JSON-LD. 30 tests unitaires, 2 d'intégration. Ce que l'écriture a démenti : §10.2 | PV-1      |
| **PV-3** | **L'axe des locales** : les traductions d'une route côte à côte, avec le palier de `fitTitle` que chacune atteint. Rendu seul, aucun modèle à toucher                                                                     | PV-2      |
| **PV-4** | **Le delta d'hydratation** : projeter `HydrationDelta` en champ additif, avec ses deux réserves écrites dans le champ                                                                                                     | PV-2      |
| **PV-5** | **Décider pour `jsonld.*`** — ou décider de ne rien écrire. La preview est l'instrument de cette décision, pas son préalable                                                                                              | PV-2      |
| hors     | `--serve` et le rechargement à chaud : premier serveur HTTP et premier observateur de fichiers du paquet. Le jour où rouvrir le fichier devient pénible, pas avant                                                        | —         |
| hors     | Une PWA hébergée qui taperait `localhost` — §11                                                                                                                                                                           | —         |
| hors     | Un éditeur de carte, une galerie de gabarits, un service de rendu à la demande. `og-plan.md` a déjà tranché                                                                                                               | —         |

**Critère de sortie de PV-2**, sur le patron des autres plans : la vue doit faire
tomber au moins une des cinq règles de prose sur un site réel — c'est-à-dire
qu'un défaut qu'aucune règle ne peut nommer doit être trouvé en la regardant. Si
elle ne fait que réafficher joliment des findings que le terminal donnait déjà,
elle ne vaut pas son code. **Non tenu à ce jour** : la commande tourne sur le
site de démonstration, pas encore sur un site réel.

### 10.1 Ce que le patron `conformance` coûte vraiment

Le §4 disait « le patron existe déjà ». Il existe, et il a **cinq** points de
contact, pas un : le drapeau d'`AuditOptions`, l'accumulateur et sa garde dans la
boucle, l'épandage conditionnel sur le rapport, un épandage dans `summarize()`,
et un bloc dans `renderTerminal()`.

L'extraction s'arrête au troisième, et c'est une décision, pas un oubli.
`summarize()` résume des findings ; le résumé d'une observation est l'observation
privée de ce qui la rendait utile. Et le terminal n'a nulle part où mettre un
modèle de `<head>`. La section a **un** lecteur, `renderPreview`, et le
commentaire de l'option le dit pour que le prochain à suivre le patron sache
qu'il a été suivi jusqu'à un point choisi.

### 10.2 Ce que l'écriture a démenti

Quatre choses, dont deux que ce plan affirmait.

**Le parseur n'avait besoin d'aucune ligne.** Le §8 en annonçait trois. La branche
des commandes est gardée par `i === 0`, donc le positionnel suivant tombait déjà
dans la branche URL : `goflag preview <url>` se parse sur la seule entrée de
table. Ce qui a réellement été touché, c'est l'union `command`, et un champ
`usage` sur la table — parce qu'une commande qui montre son argument dans l'aide
ne doit pas voir cet argument entrer dans le mot que le parseur compare.

**`--report` allait être ignoré en silence.** La commande rendait avant le bloc
qui écrit le JSON, donc `goflag preview <url> --report out.json` n'écrivait rien
et ne disait rien. Un fichier n'est pas une vue : `--report` est honoré dans la
branche. `--json` et `--summary`, eux, sont **refusés** — la preview possède
stdout, où elle imprime le chemin écrit, et un drapeau accepté puis ignoré est
pire qu'un drapeau qui refuse. C'est la garde du §`--baseline`, appliquée deux
fois pour la même raison.

**Le fichier ne peut pas être écrit hors de l'espace de travail en test.**
L'intégration voulait un dossier temporaire ; `--import tsx` se résout depuis le
répertoire courant de l'enfant, donc un CLI lancé hors du workspace ne charge pas
le chargeur qui l'exécute. Les deux tests tournent depuis `packages/cli` et
nettoient `.goflag/preview.html`, qui est déjà ignoré par git.

**La frontière de l'échappement est un endroit, pas une règle.** Tout ce que le
site a dit passe par `esc`. Le texte du catalogue, lui, ne doit pas : ses messages
marquent leurs fragments de code avec des accents graves — `render-terminal` les
retire faute d'endroit où les mettre, le HTML les rend en `<code>`. Le titre d'une
page qui contient un accent grave reste un titre.

**Et une décision retirée du plan.** Le §4 promettait qu'`--json` gagnerait le
modèle de `<head>` par page. Aucun drapeau `--extractions` n'a été écrit :
l'option est programmatique et `preview` la pose. Un drapeau aurait coûté deux
fixtures gelées de plus — `flags.json` comparé octet à octet et le bloc d'options
du README — pour un appelant qui n'existe pas. `--report` sur la commande donne
déjà la même donnée à qui la veut.

---

## 11. Pourquoi pas une PWA

C'était la question d'origine. La réponse est non, et elle ne dépend pas de
l'effort qu'on y met.

| Obstacle               | Effet sur `fetch("http://localhost:3000/page")` depuis une page hébergée                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **CORS**               | bloquant, toujours : il faudrait que le dev server envoie `Access-Control-Allow-Origin` — ni Next ni Vite ne le font sur un document |
| **Accès réseau local** | Chrome ferme le tir d'une origine publique vers le réseau privé                                                                      |
| **Contenu mixte**      | Chrome exempte `localhost` ; Safari est plus strict                                                                                  |
| **`mode: "no-cors"`**  | réponse opaque : le HTML est illisible                                                                                               |

Installer une page ne lui donne **aucun droit réseau supplémentaire** : une PWA
est une page web. Seule une extension de navigateur contournerait tout ça, au
prix de trois magasins d'extensions et d'un jeu de permissions — pour une valeur
que le CLI donne déjà, puisqu'il fait la requête côté serveur et n'a donc jamais
rencontré le problème.

---

## 12. Ce que ce plan ne fait pas

- Pas de nouvelle règle. Zéro entrée de catalogue en PV-1 à PV-4.
- Pas de jugement du structuré ni de `twitter:*` — `limits.mdx` tient.
- Pas de rendu d'image : la preview affiche ce que le site sert, elle ne fabrique
  rien. `@goflag/og` garde ce métier entier.
- Pas de serveur, pas de watcher, pas de port à allouer.
- Pas d'assets à côté du binaire : un fichier, ou rien.
- Pas de fidélité au pixel promise sur une surface dont l'éditeur ne publie rien.

# goflag — Plan visuels : montrer la sortie au lieu de la décrire

> **Rédigé** 2026-08-20 (audit de la landing, de `/docs` et du README : aucune image nulle
> part — `apps/website/public/` ne contient que `favicon.ico`, le README n'a que deux badges
> shields.io, les quinze `.mdx` n'ont aucune balise image).
> **Portée** — les assets visuels des trois surfaces publiées (landing, `/docs`, README/npm),
> et la chaîne qui les produit. **Hors portée** : le contenu rédactionnel lui-même, et le job
> CI qui auditerait goflag.tech (§5).
> **Lié** — `docs/preview-plan.md` (D2, le fichier autonome), `docs/og-plan.md` (§6.4, le
> `.ico` et l'empreinte des entrées), `docs/rules-catalog-plan.md` (le catalogue dont les
> figures dérivent), `AGENTS.md` (I1, I3, I4, I6).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V1** | Un asset publié est **dérivé** d'une source committée, ou **dessiné** et épinglé par un test — jamais transcrit à la main                                              |
| **V2** | Une **image** publiée n'est pas un fichier du dépôt mais une route Next prérendue au build                                                                             |
| **V3** | Un **diagramme** est un composant, SVG inline : la source _est_ l'artefact, il n'y a pas d'intermédiaire à périmer                                                     |
| **V4** | `favicon.ico` reste le **seul** artefact binaire committé à empreinte — aucune convention Next n'émet un `.ico`, et cette précondition n'est vraie nulle part ailleurs |
| **V5** | `preview.html` est **servi et lié**, pas photographié : c'est un fichier à déposer, pas un sujet à capturer                                                            |
| **V6** | Sortie **étroite** (verdict, compteurs, en-têtes de gate) → image ; sortie **large** (207 colonnes) → panneau HTML scrollable, jamais une capture                      |
| **V7** | Aucun nouvel outil, aucun binaire, aucune ligne de plus dans le job `check:`                                                                                           |

---

## 1. Le problème, en trois faits vérifiés

1. **Les deux pages dont le sujet _est_ une image n'en contiennent aucune.** `preview.mdx`
   s'ouvre sur « It needs an eye » et décrit sept cartes sociales sur 130 lignes. `og.mdx`
   décrit une mise en page 1200×630 dans un tableau. La section de `i18n.mdx` s'appelle
   « The matrix » et ne dessine rien, pendant que `check-flows.tsx:159-226` dessine cette
   matrice pour la landing.

2. **La cause est structurelle.** `apps/website/src/components/docs/mdx.tsx` enregistre sept
   entrées : `Callout`, `SiteEmail`, `PackageManagerCode`, `a`, `table`, `th`, `td`. Aucune
   page `.mdx` ne _peut_ afficher un visuel.

3. **Le pourrissement est déjà réalisé.** `apps/website/src/lib/terminal-samples.ts` a été
   touché le 2026-08-12 ; `c46fb64` (2026-08-15) a ajouté le tag de rigueur à chaque ligne de
   rollup. Le vrai `--summary` imprime `error title.missing [spec-required] ×1`, le site
   imprime `warn og.image.missing ×9`, et la légende à côté dit « Real output ». Le
   `README.md:177` dénonce nommément ce péché.

Corollaire : le sujet n'est pas « ajouter des images », c'est **construire la chaîne qui les
génère**. Une image transcrite à la main est une dette de plus, à côté d'une dette échue.

---

## 2. Les trois régimes

| Régime                | Ce qui y entre                             | Où il vit                 | Ce qui le garde vrai                                  |
| --------------------- | ------------------------------------------ | ------------------------- | ----------------------------------------------------- |
| **Texte dérivé**      | les sorties des renderers                  | fixtures committées       | comparaison octet pour octet en `test:unit`           |
| **Image prérendue**   | carte de couverture, carte OG, PNG vitrine | route Next `force-static` | rien — elle n'existe pas dans git                     |
| **Composant dessiné** | diagrammes, figures dérivées du catalogue  | `src/components/figures/` | `typecheck` + un test qui lie la figure à `ALL_RULES` |

Le troisième régime n'a pas de garde-fou parce qu'il n'en a pas besoin : il n'y a pas
d'artefact dérivé, donc rien qui puisse se désynchroniser de sa source.

---

## 3. Le chemin

### V-0 — `deploy-develop` ne voit pas le catalogue · 30 min · indépendant

**Pourquoi** : `rules-catalog.ts:109` et `cli-reference.ts:76` lisent `packages/cli/rules.json`
et `flags.json` par chemin relatif au build ; le bloc `changes:` de `deploy-develop`
(`.gitlab-ci.yml:520`) ne nomme que `packages/cli/CHANGELOG.md`. Son commentaire affirme encore
que « `packages/cli` source never reaches the output » — c'est devenu faux.
**Fini quand** : un commit qui ne touche que `rules.json` déclenche `deploy-develop`, et le
paragraphe du commentaire dit pourquoi les deux fichiers sont listés.
**Note** : ce bug ne dépend d'aucune autre étape et vaut plus cher que le reste du plan.

### V-1 — les transcriptions générées · 1 j

**Pourquoi** : payer la dette du fait 3, et donner au site une source qui ne peut plus dériver.
**Quoi** : `packages/cli/scripts/transcripts.ts` (des `GoflagReport` **gelés, écrits à la main
et typés** — pas dérivés d'un audit live : 27 commits sur `src/report/` en 19 jours en feraient
du rouge quotidien), puis `generate-transcripts.ts` sur le modèle de `generate-help-fixture.ts`.
Sortie sous `packages/cli/test/fixtures/transcripts/` : `.ansi` pour le site, `.txt` pour le
README. `transcripts.test.ts` calqué sur `catalog.test.ts`, plus une stanza `pre-commit` sur le
modèle de celle de `rules.json`.
**Pièges** : `renderDiffTerminal` calcule `options.now ?? Date.now()` (`render-diff.ts:92`) et
imprime « N days ago » — injecter `now`, sinon `test:unit` rougit à chaque minuit UTC. Et ne
jamais capturer stderr : `logger.ts:156` écrit `\r\x1b[2K` quand `isTTY`.
**Fini quand** : `terminal-samples.ts` est supprimé (avec son `HERO_REPORT`, mort et documenté
comme tel), la landing rend les `.ansi` par un tokeniseur SGR qui **jette** sur tout code hors
des sept émis, et la légende « Real output » est redevenue vraie.

### V-2 — le plafond de verre MDX · 4 h

**Pourquoi** : sans lui, aucune des quatorze pages de `/docs` ne peut recevoir quoi que ce soit.
**Quoi** : enregistrer `Terminal` et `Figure` dans la map de `mdx.tsx`, en gardant le fence
markdown en `children` comme repli — `src/app/raw/[...path]/route.ts` sert `rawBody` aux agents,
et du JSX brut collé dans le MDX détruit cette surface.
**Fini quand** : les sept blocs `plaintext` déjà collés (`quickstart.mdx`, `ci/baseline.mdx` ×3,
`profiles.mdx` ×2) sont des panneaux colorisés, sans une ligne de contenu réécrite.

### V-3 — `preview.html` servi · 6 à 8 h (estimé 1 h à tort)

**Quoi** : `src/app/assets/example-preview.html/route.ts` (`force-static`, lecture relative,
calqué sur `/raw/[...path]`), lié depuis `/docs/preview` et le README.
**Ce que la ligne « prérequis non négociable » cachait.** C'était tout le chantier, pas une
condition. `renderPreview` dessine depuis `report.extractions`, que `DEMO_REPORT` n'a pas — sans
elles il écrit 11 819 octets disant « nothing to draw », **sans jeter**, et ce fichier se
déploie, se sert et se lie parfaitement. D'où une assertion qui refuse cette phrase par son nom.

**Et une `Extraction` ne s'écrit pas à la main** : un `<head>` réaliste s'y projette en 302
lignes de JSON, chaque `Fact` portant un `TagOrigin` d'une union à sept variantes. La partie
écrite à la main recule donc d'un cran, jusqu'au seul artefact qu'une personne rédige vraiment —
**le `<head>`**. `pageFromHtml` puis `extractionFromPage` sont purs (cheerio, ni serveur ni
navigateur) et c'est le chemin de `build.ts:679`, donc les findings épinglés sur les cartes sont
_dérivés_ par le vrai registre de règles au lieu d'être affirmés.

**Conséquence à assumer** : le corpus audite `openfinanceguide.com`, un site réel, donc chaque
ligne du `<head>` gelé devient une affirmation publiée à son sujet — et doit être vraie. Le
premier jet omettait les cinq `<link rel="icon">` que le site déclare et dérivait
`icons.missing` sur les quatre pages : un finding faux à propos d'un vrai site, attrapé en
vérifiant le markup servi.
**Fini quand** : la page qui promet un regard en offre un, et aucun navigateur n'a été piloté
pour ça.

### V-4 — la route d'images · 1 j

**Quoi** : `src/app/assets/[id]/route.tsx`, `force-static` + `generateStaticParams`, sur le
modèle exact de `og/docs/[...slug]/route.tsx`. Carte de couverture depuis l'objet `og` de
`src/lib/seo/og.tsx`, sans dupliquer un nœud. Deux TTF JetBrains Mono vendorisés — satori
n'accepte ni WOFF2 ni les polices système.
**Gratuit** : les ids portent une extension, donc `/assets/cover.png` tombe déjà dans la
négation `.*\..*` du matcher de `proxy.ts:70`. Rien à y ajouter.
**Repli** : si l'alignement monospace ne tient pas sous satori, abandonner les deux PNG de
terminal et garder la seule carte de couverture. Rien d'autre ne bouge.
**Fini quand** : le README porte une image en URL absolue, et aucun octet binaire n'a été
ajouté au dépôt.

### V-5 — les figures · 2,5 j

**Quoi** : deux figures **dérivées** du catalogue (`rule-grid.tsx`, `rigor-bars.tsx`, lues
depuis `rules-catalog.ts`), puis quatre diagrammes **dessinés** en SVG inline — arbre Chromium,
boucle interdite, matrice route × locale, carte d'identité d'un fingerprint. Classes Tailwind
sur les éléments SVG, pas de table `palette.json` hex → jeton : cette table serait exactement la
copie manuscrite qui dérive en silence.
**Fini quand** : chaque diagramme a remplacé la prose qu'il rend inutile, et un test de quatre
lignes lie chaque dessin au code qu'il décrit (les sept `reasons.push` de `extract/heuristics.ts`
pour l'arbre, `routeKey`/`targetKey` pour la carte, `ALL_RULES.length` pour les barres).

### V-6 — les surfaces · 2 h

**Quoi** : README — la carte de couverture, le bloc de transcription injecté entre marqueurs, le
lien vers `example-preview.html`, et les deux **seuls** liens relatifs du fichier (L686 et L704),
qui cassent déjà sur npm. AGENTS.md — l'invariant de V1/V2 et le pitfall de l'horloge de
`renderDiffTerminal`.
**Fini quand** : `AGENTS.md` porte le paragraphe, et le README montre le produit au premier
écran au lieu de la ligne 281.

---

## 4. Ce que ce plan refuse

- **Filmer le terminal.** Le run complet sur la fixture prend 0,65 s et la barre affiche
  `1/1 → 10/10 → 11/11 → 12/12` — jamais le « 7/12 » qu'on imagine. Une vidéo de six secondes
  exige de brider le serveur ou d'éditer le `.cast` : de la mise en scène, dans un dépôt qui
  dénonce ce travers. Et c'est le seul asset qu'aucun script ne régénère.
- **Photographier une UI tierce** (log GitLab, carte X, résultat LinkedIn). Le remède au
  pipeline non gaté est le job, pas sa photo — et un tableau de bord contredit la deuxième
  phrase du README.
- **Piloter un navigateur pour fabriquer des assets.** Le seul cas qui l'exigeait devient un
  lien (V5 de la table §0). Le couple « one pin in two files » ne grandit pas.
- **Un `assets:check` dans le job `check:`.** C'est la retouche à chaque release, rendue
  obligatoire par la CI. Une empreinte portant sur des composants périme tout d'un coup pour un
  commentaire corrigé.
- **`freeze`, D2, mermaid-cli, Excalidraw comme source committée.** Le PNG de `freeze` ignore
  silencieusement `--font.file` ; D2 pèse 57 Mo pour placer des boîtes que le navigateur place
  gratuitement ; un fichier Excalidraw churne tout seul (`version`, `versionNonce`, `updated`)
  et n'exporte qu'un thème.

---

## 5. Hors de ce plan, mais adjacent

- `messages/en.json:157` affirme « goflag.tech is gated by its own audit in CI ». Aucun job de
  `.gitlab-ci.yml` ne lance l'audit du site. Le remède est un job, pas une correction de
  phrase — et c'est la recette naturelle des images ajoutées : un site qui publie des images
  sans `alt`, sur le domaine d'un auditeur qui détecte `og.image.alt`, est l'auto-goal que ce
  dépôt remarquerait en dernier.
- `ROADMAP.md` §Next liste « Public GitHub mirror … done when the `homepage`, `repository` and
  `bugs` the two npm manifests already publish actually resolve ». Le miroir répond
  (`git ls-remote https://github.com/tancredesimonin/goflag.git` → `31e8015`) et les trois
  manifestes publiés y pointent : vérifier `bugs`, et si tout résout, l'item est à déplacer
  dans §Shipped.

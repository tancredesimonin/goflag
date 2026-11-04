# goflag — Plan : un agent, une CI, un rapport lisible, un très gros sitemap

> **Rédigé** 2026-11-03
> **Portée** — ce qui manque à goflag pour servir là où on le lance :
>
> - dans l'agent qui modifie le site ;
> - dans un pipeline lu par quelqu'un qui ne lance jamais le CLI ;
> - derrière une preview protégée ;
> - sur un sitemap d'un million d'URL.
>
> Quatre livrables produit et quatre manques techniques.
> **Origine** — la relecture du CLI le 2026-11-03, sous deux usages qu'il ne sert
> pas encore : un agent de code qui veut auditer ce qu'il vient de changer, et une
> CI dont la preview est protégée et le sitemap énorme.
> **Lié** — `docs/preview-plan.md` (le patron du rendu HTML ; §11, pourquoi une
> page hébergée ne peut pas auditer), `docs/coverage-plan.md` (l'échantillonnage,
> et la mesure qui manque au-delà de 4 451 pages), `docs/publishing.md` (un
> premier paquet se publie à la main).

---

## 0. Ce que ce plan tranche

| #      | Décision                                                                                               | État           |
| ------ | ------------------------------------------------------------------------------------------------------ | -------------- |
| **D1** | Le serveur MCP est local (stdio), dans un paquet `@goflag/mcp` qui appelle `runAudit`                  | arrêté (§2.1)  |
| **D2** | Le rapport HTML est un rendu pur du JSON, sur le patron de `renderPreview` : un fichier, aucun serveur | arrêté (§2.2)  |
| **D3** | Ni le CLI ni le MCP n'envoient quoi que ce soit : ni télémétrie, ni compte, ni clé                     | arrêté         |
| **D4** | Quatre vérifications hébergées sur goflag.tech, pas une par règle                                      | arrêté (§2.4)  |
| **D5** | Elles tournent dans un service à part qui lance le CLI publié et épinglé, ce qui laisse I3 intact      | proposé (§2.4) |
| **D6** | `--header` envoie un en-tête à l'origine auditée seulement, et sa valeur n'apparaît dans aucune sortie | arrêté (§3)    |
| **D7** | JUnit d'abord ; SARIF et GitLab Code Quality attendent le manifeste `.goflag/routes.json`              | arrêté (§3)    |
| **D8** | Les sitemaps se lisent en flux, et l'échelle se mesure avant de se promettre                           | arrêté (§3)    |

---

## 1. Les quatre trous

| Usage                                                       | Ce qui se passe aujourd'hui                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Un agent modifie les métadonnées d'un site                  | Il doit passer par un shell, lire un JSON de plusieurs centaines de lignes, et ne sait pas expliquer une règle sans aller sur le site |
| Un pipeline garde le résultat                               | Il garde un JSON. Qui ne lance pas le CLI ne lit rien                                                                                 |
| La preview demande une authentification                     | Aucun des 32 drapeaux n'envoie d'en-tête ni de cookie : la preview reste fermée                                                       |
| Le sitemap fait 50 Mo, ou l'index a des centaines d'enfants | `parseSitemap` charge chaque document entier dans cheerio, et rien n'est mesuré au-delà de 4 451 pages                                |

---

## 2. Produit

### 2.1 P-1 — `@goflag/mcp`, un serveur local

Le CLI est déjà taillé pour un agent :

- `--json --summary` est décrit comme « a compact, agent-friendly payload » ;
- `--advisories` attache « the observed facts an agent needs » ;
- `packages/cli/src/index.ts` exporte `runAudit` et `summarize`.

Le serveur MCP est donc une couche fine, pas un second moteur.

**Pourquoi local.** Un serveur distant ne voit ni `localhost:3000`, ni une preview
derrière un VPN. Le serveur local tourne là où tourne l'agent, et voit ce qu'il
voit.

**Pourquoi un paquet.** Le CLI n'a qu'une dépendance (cheerio), et le SDK MCP n'a
rien à y faire. `packages/mcp` dépend de `@goflag/cli` par son nom, comme un
consommateur extérieur. I3 ne vise que `packages/next` et `apps/**`.

| Outil                 | Entrée                                                                             | Sortie                                                                      |
| --------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `audit_site`          | `url`, et au choix `locales`, `maxPages`, `expectIndexing`, `static`, `advisories` | le résumé de `summarize()`, la couverture, le code de sortie                |
| `explain_rule`        | `id`                                                                               | l'entrée de `rules.json` : `summary`, `why`, `rigor`, `sources`, `expected` |
| `compare_to_baseline` | `url`, `baseline` (chemin d'un rapport stocké)                                     | les findings nouveaux, connus et disparus                                   |
| `list_rules`          | au choix `scope`                                                                   | `id`, `scope`, `severity`, `rigor`                                          |

Les quatre outils sont en lecture seule (`readOnlyHint: true`) : aucun n'écrit, ni
sur le disque ni sur le site.

**Pas d'outil `start`.** Laisser un agent passer une commande à lancer ouvrirait
une exécution arbitraire. L'agent démarre lui-même son serveur de dev.

**La ligne d'AGENTS.md.** Depuis Next 16.3, `next dev` gère un bloc AGENTS.md que
lisent les agents de code. Aucune doc pour agents n'y traite des métadonnées, du
hreflang ou du sitemap. L'évaluation publiée par Vercel donne 100 % de réussite à
la doc embarquée, contre 79 % au mieux pour les skills. Une page `/docs/agents`
donne donc le bloc à coller : avant de committer un changement de métadonnées, de
sitemap, de robots ou de hreflang, lancer `audit_site` contre le serveur de dev et
corriger les findings nouveaux.

**Ce qui revient à l'auteur.** Le premier `@goflag/mcp` se publie à la main : npm
n'attache un éditeur de confiance qu'à un paquet qui existe déjà
(`docs/publishing.md`). L'espace de tags `mcp-v*` est protégé avant la première
release (AGENTS.md, Conventions).

**Fait quand** :

- un test d'intégration lance un client MCP contre le serveur de fixtures des tests
  du CLI, et `audit_site` y trouve le trou de traduction que le CLI trouve ;
- le paquet est publié et listé au registre MCP officiel.

### 2.2 P-2 — Le rapport HTML

`--html <file>` écrit un fichier autonome, comme `--report <file>` écrit le JSON.
C'est un drapeau, donc il passe par `flags.json` (I6).

`renderHtmlReport(report, options): string` est pur, comme `renderPreview` (D1 et D2
de `docs/preview-plan.md`) : aucun asset à côté, aucun serveur.

Le rapport contient :

- le verdict et la raison du code de sortie ;
- la ligne de couverture : mode, pages considérées, pages choisies, familles ;
- les findings par règle, avec leur rigueur et un lien vers `/docs/rules/<id>` ;
- la matrice des traductions ;
- sous `--baseline`, les findings nouveaux, connus et corrigés ;
- la commande qui l'a produit, et la version de goflag qui a jugé.

Deux contraintes, déjà tenues par les autres rendus :

- la date vient de l'appelant (`options.now`), comme pour `renderDiffTerminal` : un
  rendu qui lit l'horloge ne se compare pas ;
- une fixture `report.html` rejoint les transcriptions générées et comparées
  octet par octet (I6).

**Pas d'interface locale en direct** (`--serve`, rechargement à chaud) : le plan
preview l'a déjà mise hors champ, et le fichier suffit.

**Fait quand** : le job `seo:mr` d'openfinanceguide joint `report.html` en artefact,
et le fichier se lit sur un téléphone.

### 2.3 P-3 — Les recettes de CI

Trois recettes. Chacune applique la base de dette (`--baseline`, `--max-debt`) et
joint le rapport HTML en artefact.

| Recette                  | Forme                                                                                                        | À vérifier avant d'écrire                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| GitHub Action            | une action composite qui lance le CLI épinglé                                                                | les conditions de listage au Marketplace (dépôt public dédié, `action.yml` à la racine) |
| Gabarit GitLab CI        | un fichier à inclure par `include: remote`, servi depuis le miroir public                                    | un composant CI/CD exige un projet public, or le projet GitLab est privé                |
| Vercel Deployment Checks | une Action sur `deployment_status` qui audite l'URL de preview avec `--expect-indexing no`, déclarée requise | rien : Vercel accepte une GitHub Action comme contrôle                                  |

**Fait quand** : chaque recette est documentée sur goflag.tech et passe au vert sur un
dépôt d'exemple public.

### 2.4 P-4 — Quatre vérifications hébergées

goflag.tech a déjà une page par règle (`/docs/rules/[id]`). Une vérification
hébergée ne s'ajoute que pour un contrôle de site qu'un lecteur ne peut pas
essayer sur sa propre URL depuis une page de règle.

| Vérification                  | Règles retenues dans le rapport                      | Arguments du CLI                                 |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Soft 404                      | `http.not-found`                                     | `--static --max-pages 1 --depth 0 --no-external` |
| Fuite de staging              | `indexing.*`                                         | `--expect-indexing no --static --max-pages 5`    |
| Cluster hreflang, site entier | `hreflang.*`, `og.locale.*`, matrice des traductions | `--static --max-pages 30`                        |
| Index de sitemap              | `sitemap.*`                                          | `--static --max-pages 5`                         |

Aucun drapeau nouveau n'est nécessaire : le service lance un audit borné, puis
filtre le JSON par identifiant de règle. Les autres règles gardent leur page.

**Le service, `apps/checks` (D5).** Une page hébergée ne peut pas auditer un autre
site, à cause de CORS, de l'accès au réseau local et des réponses opaques
(`docs/preview-plan.md` §11). Il faut un serveur.

- Hono, déjà employé par les tests du CLI.
- Le service lance le binaire de `@goflag/cli` installé depuis npm à une version
  épinglée, pas le paquet du workspace. Il n'importe rien de `packages/cli` (I3), et
  il exerce l'artefact publié, comme le font les CI des sites.
- Garde-fous :
  - `http` et `https` seulement, ports 80 et 443 ;
  - le nom est résolu, puis les plages privées, de boucle locale et de lien local
    sont refusées (SSRF) ;
  - un audit en cours par IP, 20 par jour par IP, 2 audits simultanés au total ;
  - 60 s au plus par audit, et un résultat gardé 15 minutes par vérification et par
    origine.
- `--static` partout : jamais de Chromium sur le serveur partagé.
- Rien n'est stocké au-delà du cache. Les journaux gardent la vérification,
  l'origine et le nombre de findings.
- Chaque page finit par la ligne de CI qui fait le même contrôle sur tout le site,
  à chaque release.

**Fait quand** : les quatre pages sont en ligne, chacune reliée aux pages de ses
règles, et dix requêtes simultanées n'affament pas goflag.tech.

---

## 3. Technique

| #       | Manque                                                 | Livraison                                                                                                 | Fait quand                                                                                                                                 |
| ------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **T-1** | une preview protégée reste fermée                      | `--header "<nom>: <valeur>"`, répétable, envoyé à l'origine auditée seulement, jamais aux liens externes  | un test contre un serveur qui exige l'en-tête passe, et la valeur n'apparaît dans aucune sortie (terminal, JSON, HTML)                     |
| **T-2** | Jenkins et GitLab n'affichent rien                     | `--junit <file>` : un cas par règle et par page, rendu pur, fixture générée (I6)                          | le widget de tests d'une MR GitLab affiche les findings d'un audit                                                                         |
| **T-3** | un sitemap de 50 Mo, ou un index à centaines d'enfants | lecture en flux avec le `Parser` de htmlparser2, déjà présent sous cheerio, déclaré en dépendance directe | sur une fixture générée d'un million d'URL en 20 enfants, la mémoire reste bornée, et le rapport ne change pas sur les fixtures existantes |
| **T-4** | rien n'est mesuré au-delà de 4 451 pages               | la couverture structurelle mesurée sur le sitemap public d'un très gros site multilingue                  | durée, mémoire, nombre de familles et échantillon identique sur deux passes, écrits dans `docs/coverage-plan.md`                           |

**T-1 et les secrets.** La valeur arrive par l'environnement du job
(`--header "Authorization: Bearer $PREVIEW_TOKEN"`, développé par le shell). goflag
ne l'écrit nulle part : ni dans le terminal, ni dans le rapport, ni dans
`diagnostics`, où seul le nom de l'en-tête figure. C'est la règle du hook
`betterleaks` : un outil qui recopie un secret l'a déjà fait fuiter.

**T-2, et pourquoi ni SARIF ni GitLab Code Quality maintenant.** Ces deux formats
situent un problème dans un fichier source et à une ligne. Un finding de goflag est
situé sur une URL. Ils attendront que `.goflag/routes.json` relie une route à son
fichier (ROADMAP, Next). D'ici là, ils afficheraient des findings sans emplacement.

---

## 4. Phasage

| Étape   | Contenu                                   | Dépend de |
| ------- | ----------------------------------------- | --------- |
| **P-1** | `@goflag/mcp` et la page `/docs/agents`   | —         |
| **T-1** | `--header`                                | —         |
| **P-2** | `--html`                                  | —         |
| **T-2** | `--junit`                                 | —         |
| **P-3** | les trois recettes de CI                  | P-2       |
| **T-3** | les sitemaps en flux                      | —         |
| **P-4** | `apps/checks` et les quatre vérifications | —         |
| **T-4** | l'échelle mesurée                         | T-3       |

Ce qui revient à l'auteur, et à lui seul :

- protéger `mcp-v*`, puis publier à la main le premier `@goflag/mcp` ;
- créer le dépôt GitHub public de l'Action, si le Marketplace l'exige ;
- valider le premier déploiement d'`apps/checks`, qui passe par le pipeline et
  jamais par un `kamal deploy` lancé du poste.

---

## 5. Ce que ce plan ne fait pas

- Ni télémétrie, ni compte, ni clé d'API, que ce soit dans le CLI ou dans le MCP.
- Pas une vérification hébergée par règle.
- Pas de MCP distant pour l'instant : il ne verrait ni localhost ni une preview
  derrière un VPN. Un MCP distant adossé à `apps/checks`, pour des URL publiques,
  reste possible (ROADMAP, Someday).
- Ni tableau de bord hébergé, ni historique, ni interface locale en direct.
- Pas de SARIF ni de GitLab Code Quality avant le manifeste `.goflag/routes.json`.

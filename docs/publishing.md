# goflag — Publier `@goflag/next`

> **Rédigé** 2026-08-07 · **Suivi** — `@goflag/next` est passée par ce chemin
> le 2026-08-07 : `0.1.0` publiée à la main, trusted publisher configuré,
> manifeste publié vérifié. Le 2026-08-08 la première release automatique a
> échoué — pas sur npm, sur `git push` : la chaîne poussait un commit sur `main`,
> qui n'accepte de push de personne. Elle a été refaite en « la CI ne pousse
> qu'un tag » (§4), et l'étape ②bis ci-dessous en est le corollaire.
> Le document reste écrit au présent parce que `@goflag/og` devra refaire
> exactement les mêmes étapes.
> **Portée** — la première publication de `@goflag/next` sur npm, la
> configuration du trusted publisher OIDC, et l'ordre des opérations autour de
> la fusion. Tout ce qui suit est **manuel** : le reste est déjà automatisé.
> **Lié** — `docs/next-plan.md` (étape N-4), `docs/spec-and-lib-plan.md` §2
> (ce que la première publication du CLI a coûté).

---

## 0. Pourquoi la première version part à la main

npm attache un trusted publisher **à un paquet**. Un paquet qui n'existe pas
n'a rien à quoi l'attacher, et il n'y a pas de moyen de déclarer l'un avant
l'autre. Un granular token ne dépanne pas non plus : ils ne se restreignent
qu'à des paquets **déjà publiés** — c'est le `403` consigné au §2 du plan
principal, et il coûtera exactement le même temps la deuxième fois.

Donc : une publication manuelle, une configuration, et plus jamais.

---

## 1. L'ordre, qui n'est pas négociable

```
①    publier 0.1.0 à la main        ← depuis la branche, avant toute fusion
②    configurer le trusted publisher  (npm)
②bis protéger le namespace de tags   (GitLab)
③    fusionner la MR dans develop
④    fusionner develop dans main    ← déclenche tag + publish:next en OIDC
```

**② et ②bis avant ④.** Si `main` reçoit la lib avant que le trusted publisher
existe, le job `tag` pose le tag et `publish:next` échoue sur un paquet absent
du registre. Le tag reste, la publication non, et il faut démêler. Et sans
②bis, le motif de tag qui déclenche une publication OIDC est créable par
n'importe quel Developer.

**③ peut passer avant ①** sans rien casser : le job `tag` ne tourne que sur
`main`, et `develop` ne promet rien. Mais publier depuis la branche est plus
simple, puisque c'est là que le code est.

**Ne crée pas de tag `next-v0.1.0` à la main.** La pipeline de tag lancerait
`publish:next` sur une version déjà présente, npm refuserait, et la pipeline
serait rouge sur une release réussie.

**La première publication automatique n'est pas `0.1.1`.** C'était la prévision,
tirée du chemin du CLI (`0.1.0` manuel → `0.1.3`), et elle est fausse pour une
raison structurelle : aucun tag `next-v*` n'existe encore, donc la plage de
commits que lit `commit-and-tag-version` remonte au premier commit du dépôt et
contient `feat(next)!: derive every locale form from ICU`. Un `!` en `0.x` force
un bump **mineur**. Ce sera `0.2.0`.

La leçon vaut pour `@goflag/og` : la publication manuelle de `0.1.0` ne pose pas
de tag, donc la première release automatique voit toute l'histoire du paquet,
pas seulement ce qui a suivi. Si elle contient un breaking, le numéro saute.

---

## 2. Étape ① — publier `0.1.0`

### Prérequis

```sh
npm whoami          # doit répondre; sinon `npm login`
```

Le `404` du §2 était une session npm expirée en local, diagnostiquée comme un
problème de nom. Vérifie avant, pas après.

### La commande

Depuis ce dépôt, dans le répertoire du paquet :

```sh
cd packages/next && npm publish --access public
```

C'est tout. Trois choses se passent toutes seules :

| Ce qui se passe                       | Pourquoi                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `prepublishOnly` relance `pnpm build` | le `dist/` publié ne peut pas être périmé ni absent                         |
| npm inclut `README.md` et `LICENSE`   | ils sont committés dans le paquet, pas stagés par un hook comme ceux du CLI |
| npm demande ton code 2FA              | c'est l'`EOTP` du §2, inoffensif en manuel — c'est en CI qu'il bloquait     |

**`--access public` est explicite** même si `publishConfig.access` le dit déjà :
un paquet scopé est privé par défaut, et se tromper là publie quelque chose que
personne ne peut installer.

**Pas de `--provenance`.** npm n'atteste que les dépôts publics et celui-ci est
privé ; le demander ferait échouer la commande au lieu de sauter la signature.

### Vérifier

```sh
npm view @goflag/next version
npm view @goflag/next dist.tarball main types exports files
```

La seconde commande est celle qui compte, et c'est la dette du §2 (« rien ne
vérifie le paquet _publié_ »). **npm réécrit `package.json` à la publication,
pas à l'empaquetage** : c'est comme ça que le CLI a failli sortir sans commande,
`bin: "./dist/cli.js"` ayant été supprimé au lieu d'être normalisé. Le tarball
local était correct ; le paquet publié ne l'était pas.

Ce que tu dois voir :

```
main    = ./dist/index.js
types   = ./dist/index.d.ts
exports = { '.': { types: './dist/index.d.ts', import: './dist/index.js' } }
files   = [ 'dist' ]
```

Et le test qui prouve vraiment quelque chose, dans un répertoire vierge :

```sh
cd "$(mktemp -d)" && npm init -y > /dev/null && npm install @goflag/next
node --input-type=module -e "
  import { defineSite } from '@goflag/next';
  const site = defineSite({ baseUrl:'https://example.com', name:'x',
    locales:['en-US'], defaultLocale:'en-US', indexable:true });
  console.log(site.routes({ home:{ path:'' } }).sitemap());
"
```

---

## 3. Étape ② — le trusted publisher

Sur npmjs.com, page du paquet `@goflag/next` → **Settings** → la section des
publications de confiance (« Trusted Publisher »).

| Champ                | Valeur                         |
| -------------------- | ------------------------------ |
| Provider             | **GitLab** (`gitlab.com`)      |
| Namespace / projet   | `tancredesimonin-indie/goflag` |
| Chemin du fichier CI | `.gitlab-ci.yml`               |
| Environnement        | laisser vide                   |

Ce sont **les mêmes valeurs que pour `@goflag/cli`** : même projet, même
fichier CI. Seul le paquet change. Si l'interface a bougé, le repère est
toujours le même : elle demande _quel dépôt_ et _quel fichier de CI_ a le droit
de publier, parce que c'est ce couple que GitLab signe dans le jeton.

Le chemin est `.gitlab-ci.yml` et pas autre chose parce que c'est là que vit le
job `publish:next` — pas dans un template inclus.

Rien à faire côté GitLab : le job déclare déjà l'audience que npm exige.

```yaml
id_tokens:
  NPM_ID_TOKEN:
    aud: "npm:registry.npmjs.org"
```

**Aucune credential n'est créée nulle part.** Il n'y a pas de token à stocker,
à faire tourner, ni qui survive à une fuite.

---

## 3bis. Étape ②bis — protéger le namespace de tags

Côté GitLab cette fois, et c'est l'étape qu'on a oubliée pour `@goflag/next` :

```sh
glab api --method POST projects/81884394/protected_tags \
  -f name='next-v*' -f create_access_level=40
```

`v*` était protégé depuis le premier jour ; `next-v*` ne l'a jamais été. Le trou
n'a rien coûté parce qu'aucun tag `next-v*` n'est jamais sorti, mais il était
réel : **`publish:next` se déclenche sur le motif du tag et publie via OIDC,
sans credential à voler.** Un tag forgé par n'importe quel compte Developer
publiait sous ton nom.

La règle générale, qui vaut pour `og-v*` le jour venu : **un job `publish:*`
déclenché par un motif de tag exige que ce motif soit protégé.** Le trusted
publisher garantit _quel dépôt_ publie, jamais _qui_ a le droit de le demander.

Les tags protégés sont un système à part des branches protégées : ils ne règlent
que la **création**, et la protection d'une branche n'a aucun effet sur eux.
C'est ce qui permet à la CI de taguer `main` sans jamais pouvoir y pousser.

---

## 4. Étapes ③ et ④ — fusionner

1. **`pnpm release` sur une branche coupée de `develop`.** Le script décide, pour
   chaque paquet, si sa surface publiée a bougé depuis son dernier tag ; si oui
   il bumpe, écrit le changelog et commite. Il ne tague pas.
2. **MR → `develop`.** Le commit de release est relu comme les autres. Rien ne se
   publie.
3. **`develop` → `main`.** C'est la décision de publier, comme pour le CLI.

Ce que la pipeline de `main` fait alors, dans l'ordre :

| Job            | Ce qu'il fait                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `tag`          | Lit la version de chaque manifeste, la compare aux tags du remote, crée celui qui manque. Un push par tag. |
| `publish:npm`  | Sur un tag `v*` seulement.                                                                                 |
| `publish:next` | Sur un tag `next-v*`. Échange OIDC, `npm publish`.                                                         |

Le job `tag` ne décide rien et ne bumpe rien : c'est une réconciliation entre ce
que `main` déclare et ce que le registre de tags contient. Il est donc
idempotent, rejouable, et rattrape tout seul un tag perdu par une pipeline
rouge — au lieu de demander une intervention manuelle sur une branche protégée.

**Pourquoi le bump n'est pas fait par la CI.** `main` et `develop` refusent un
push de tout le monde, runner compris. Une release qui exigerait une exception à
cette règle serait une release que personne n'a relue. Le 2026-08-08, le job
`release` de l'époque a tenté `git push origin HEAD:main --follow-tags` et s'est
fait refuser les trois refs d'un coup : GitLab décline le payload entier dès
qu'une seule de ses refs est interdite. D'où la règle, à ne jamais réintroduire :
**un ref par push, jamais `--tags` ni `--follow-tags`.**

### Vérifier que l'OIDC a marché

Dans le log du job `publish:next`, tu ne dois voir **aucune** demande de token
ni d'OTP. Puis :

```sh
npm view @goflag/next version   # 0.1.1
```

Si le job échoue avec une erreur d'authentification, c'est l'étape ② qui n'est
pas passée — pas le job. Les trois champs du tableau ci-dessus doivent
correspondre **exactement**, chemin du fichier CI compris.

---

## 5. Après

- **stereo-house.** La branche `feat/goflag-next-migration` porte la migration,
  commitée en `--no-verify` parce que sa dépendance n'existait pas. Une fois
  `@goflag/next` publiée, elle est réécrite proprement : dépendance, lockfile,
  et ses propres gardes qui repassent. C'est la vérification qui compte — le
  paquet installé depuis npm, pas depuis un tarball local.
- **Les trois autres sites** (`tancrede`, `tancredo`, `openfinanceguide`) :
  phase 5.1 du plan principal.
- **Renovate** proposera la montée de version sur les sites consommateurs sous
  trois jours (plancher `minimumReleaseAge`).

---

## 6. Les cinq pièges, tous déjà payés une fois

Consignés au §2 du plan principal. Ils ne se reproduiront pas à l'identique,
mais ils indiquent où regarder quand quelque chose ne va pas.

| Symptôme                                                                | Cause réelle                                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `403` à la publication                                                  | granular token sur un paquet jamais publié — n'en utilise pas pour ①                                        |
| `EOTP`                                                                  | 2FA sur les écritures, depuis une CI. C'est ce que l'OIDC supprime.                                         |
| `404` en local                                                          | session npm expirée — `npm whoami` d'abord                                                                  |
| Le paquet publié diffère du tarball                                     | npm réécrit `package.json` à la publication. D'où la vérification du §2.                                    |
| `not allowed to push to protected branches`, et **trois** refs refusées | Une seule l'était : GitLab décline le payload entier. La CI ne pousse plus qu'un tag, un ref par push (§4). |

**La leçon commune** : une pipeline verte ne dit pas qu'une chaîne fonctionne,
seulement qu'elle n'a pas été exercée. Quatre des cinq défauts vivaient depuis
des jours dans une CI verte — le dernier depuis que la chaîne à deux paquets
avait été écrite, sans qu'un seul tag `next-v*` ne soit jamais passé dedans.

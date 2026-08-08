# goflag — Publier `@goflag/next`

> **Rédigé** 2026-08-07 · **Suivi** — `@goflag/next` est passée par ce chemin
> le 2026-08-07 : `0.1.0` publiée à la main, trusted publisher configuré,
> manifeste publié vérifié. Le document reste écrit au présent parce que
> `@goflag/og` devra refaire exactement les mêmes étapes.
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
①  publier 0.1.0 à la main        ← depuis la branche, avant toute fusion
②  configurer le trusted publisher
③  fusionner la MR dans develop
④  fusionner develop dans main    ← déclenche release + publish:next en OIDC
```

**② avant ④.** Si `main` reçoit la lib avant que le trusted publisher existe,
le job `release` constate qu'aucun tag `next-v*` n'est présent, tague
`next-v0.1.1`, et `publish:next` échoue sur un paquet absent du registre. Le
tag reste, la publication non, et il faut démêler.

**③ peut passer avant ①** sans rien casser : le job `release` ne tourne que sur
`main`, et `develop` ne promet rien. Mais publier depuis la branche est plus
simple, puisque c'est là que le code est.

**Ne crée pas de tag `next-v0.1.0` à la main.** La pipeline de tag lancerait
`publish:next` sur une version déjà présente, npm refuserait, et la pipeline
serait rouge sur une release réussie. La première publication automatique sera
`0.1.1` — c'est exactement le chemin qu'a pris le CLI, qui est passé de `0.1.0`
manuel à `0.1.3`.

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

## 4. Étapes ③ et ④ — fusionner

1. **MR !83 → `develop`.** Rien ne se publie ; le job `release` ne s'exécute que
   sur `main`.
2. **`develop` → `main`.** C'est la décision de publier, comme pour le CLI.

Ce que la pipeline de `main` fait alors, dans l'ordre :

| Job            | Ce qu'il fait                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `release`      | Pour chaque paquet : la surface publiée a-t-elle bougé depuis son dernier tag ? Si oui, bump + changelog + tag. Un seul push à la fin. |
| `publish:npm`  | Sur un tag `v*` seulement. Ici : rien, la surface du CLI n'a pas bougé.                                                                |
| `publish:next` | Sur un tag `next-v*`. Échange OIDC, `npm publish`.                                                                                     |

Attendu ce coup-ci : `@goflag/next@0.1.1` publiée, `@goflag/cli` intouchée.

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

## 6. Les quatre pièges, tous déjà payés une fois

Consignés au §2 du plan principal. Ils ne se reproduiront pas à l'identique,
mais ils indiquent où regarder quand quelque chose ne va pas.

| Symptôme                            | Cause réelle                                                             |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `403` à la publication              | granular token sur un paquet jamais publié — n'en utilise pas pour ①     |
| `EOTP`                              | 2FA sur les écritures, depuis une CI. C'est ce que l'OIDC supprime.      |
| `404` en local                      | session npm expirée — `npm whoami` d'abord                               |
| Le paquet publié diffère du tarball | npm réécrit `package.json` à la publication. D'où la vérification du §2. |

**La leçon commune** : une pipeline verte ne dit pas qu'une chaîne fonctionne,
seulement qu'elle n'a pas été exercée. Trois des quatre défauts vivaient depuis
des jours dans une CI verte.

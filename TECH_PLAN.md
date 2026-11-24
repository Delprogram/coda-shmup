# Tech plan — Ennemi sinusoïdal à spread shot

## Objectif
Ajouter un nouvel ennemi qui :
- se déplace en sinusoïde en descendant l'écran ;
- tire en *spread shot* (plusieurs balles en éventail en même temps) ;
- a son spawn rate, son mouvement et son spread shot configurables via JSON ;
- est visuellement différent de l'ennemi existant.

## Données (JSON + type TS)
- `public/assets/Data/sineEnemy.json` : toute la config de l'ennemi.
  - `spawn` : `delay` (ms entre deux spawns), `maxActive` (nombre max à l'écran).
  - `movement` : `speed` (px/ms vers le bas), `amplitude` (px), `frequency` (oscillations par seconde).
  - `spreadShot` : `count` (nombre de balles), `angle` (ouverture de l'éventail en degrés, 360 = cercle), `delay` (ms entre deux tirs), `bullet` (`BulletData` existant).
  - `visual` : `tint` (couleur), `scale`.
  - `health`.
- `src/gameData/SineEnemyData.ts` : type TS qui décrit ce JSON (réutilise `BulletData`).
- Chargé dans `HomeScene.preload` avec `this.load.json`, lu via `cache.json.get`, comme `playerShips.json`.

## Composants
- `Weapon.shootSpread(source, count, angleDeg)` : nouvelle méthode qui réutilise le pool de balles du `Weapon`.
  Les balles sont réparties autour du vecteur forward de l'entité. Pour 360°, on divise par `count`
  (sinon la première et la dernière balle se superposeraient), sinon par `count - 1` pour avoir les deux bords.
- `SineMovement` (nouveau composant) : descend à vitesse constante et calcule
  `x = baseX + amplitude * sin(2π * frequency * t)`. Méthode `reset(baseX)` appelée à chaque `enable` pour le pooling.

## Entité
- `SineEnemy extends Entity` : ajoute `Health`, `SineMovement`, `Weapon` depuis la config JSON.
  - `enable` : position, vie restaurée sans événement (`heal(max, false)`), `SineMovement.reset`, timer de tir relancé.
  - `disable` : body désactivé, timer en pause.
  - Visuel : sprite `ufoRed` + `setTint` et `setScale` venant du JSON (aucune modification de l'atlas).
  - Flash blanc quand il est touché, comme `Enemy`.

## Manager
- `EntityManager.initEnemies` crée un 2ᵉ pool `_sineEnemies` et un timer de spawn piloté par `spawn.delay` / `spawn.maxActive`.
- Les balles ennemies partagent le pool `_enemyBullets` existant (256 balles).
- Les collisions existantes prennent maintenant `[_enemies, _sineEnemies]` : pas de duplication des callbacks.

## Hors scope
- Pas de modification de l'UI : la logique ne dépend pas de l'UI.
- Pas de nouvel asset.

## Playtest manuel
1. `npm run dev-nolog`, puis appuyer sur ESPACE.
2. Vérifier que des UFO teintés (plus gros) apparaissent, oscillent de gauche à droite en descendant, et tirent en éventail.
3. Les tuer avec les balles du joueur : flash blanc, explosion, +1 au score, puis réapparition depuis le pool avec la vie pleine.
4. Se faire toucher par l'éventail : la vie du joueur baisse et l'écran tremble.
5. Changer `sineEnemy.json` (par ex. `count: 60`, `angle: 360`, `amplitude: 300`, `delay: 500`) et recharger : le comportement change sans toucher au code.
6. `npm run build-nolog` passe.

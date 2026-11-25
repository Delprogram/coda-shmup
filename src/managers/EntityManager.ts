import {GameObjects, Plugins, Physics, Scene} from "phaser";
import Health from "../components/Health.ts";
import Bullet from "../entities/Bullet.ts";
import Enemy from "../entities/Enemy.ts";
import Entity from "../entities/Entity.ts";
import SineEnemy from "../entities/SineEnemy.ts";
import {SineEnemyData} from "../gameData/SineEnemyData.ts";
import Player from "../entities/Player.ts";
import GroupUtils from "../utils/GroupUtils.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class EntityManager extends Plugins.ScenePlugin {
    public static readonly PLUGIN_KEY: string = 'EntityManager';
    public static readonly MAPPING_NAME: string = 'entityManager';

    // noinspection JSUnusedGlobalSymbols
    private readonly bulletGroupConfig = {
        classType: Bullet,
        maxSize: 256,
        runChildUpdate: true,
        createCallback: (bullet: GameObjects.GameObject) => {
            (bullet as Bullet).init();
        }
    }

    private _player: Player;
    private _playerBullets: Physics.Arcade.Group;
    private _enemies: Physics.Arcade.Group;
    private _enemyBullets: Physics.Arcade.Group;
    private _sineEnemies: Physics.Arcade.Group;
    private _spawnTimers: Phaser.Time.TimerEvent[] = [];

    // Difficulty ramp: spawns speed up with the score, capped so the game stays playable
    private static readonly SPAWN_SPEEDUP_PER_POINT: number = 0.02;
    private static readonly MAX_SPAWN_SPEEDUP: number = 3;

    constructor(scene: Scene, pluginManager: Plugins.PluginManager) {
        super(scene, pluginManager, EntityManager.PLUGIN_KEY);

        console.log("[EntityManager] Initialized");
    }

    destroy() {
        super.destroy();

        console.log("[EntityManager] Destroyed");
    }

    public initAndSpawnPlayer(): Player {
        this._playerBullets = this.scene!.physics.add.group(this.bulletGroupConfig);
        GroupUtils.populate(64, this._playerBullets);

        this._player = new Player(this.scene!, this.scene!.cameras.main.centerX, this.scene!.cameras.main.height - 128);
        this._player.init(this._playerBullets);

        console.log("[EntityManager] Player spawned");

        this.game!.events.emit(GameConstants.Events.PLAYER_SPAWNED_EVENT, this._player);

        return this._player;
    }

    public initEnemies(): Physics.Arcade.Group {
        this._enemyBullets = this.scene!.physics.add.group(this.bulletGroupConfig);
        GroupUtils.populate(256, this._enemyBullets);

        this._enemies = this.scene!.physics.add.group({
            classType: Enemy,
            defaultKey: 'sprites',
            defaultFrame: 'ufoRed',
            createCallback: (enemy) => {
                (enemy as Enemy).init(this._enemyBullets);
            }
        });

        this._spawnTimers = [];

        // Spawn enemies indefinitely
        this._spawnTimers.push(this.scene!.time.addEvent({
            delay: 1500,
            callback: this.spawnEnemy,
            callbackScope: this,
            loop: true
        }));

        this._sineEnemies = this.scene!.physics.add.group({
            classType: SineEnemy,
            defaultKey: 'sprites',
            defaultFrame: 'ufoRed',
            createCallback: (enemy) => {
                (enemy as SineEnemy).init(this._enemyBullets);
            }
        });

        const sineEnemyData = this.scene!.cache.json.get(SineEnemy.DATA_KEY) as SineEnemyData;
        this._spawnTimers.push(this.scene!.time.addEvent({
            delay: sineEnemyData.spawn.delay,
            callback: () => this.spawnSineEnemy(sineEnemyData),
            loop: true
        }));

        console.log("[EntityManager] Enemies initialized");

        return this._enemies;
    }

    public initGroupCollisions() {
        const allEnemies: Physics.Arcade.Group[] = [this._enemies, this._sineEnemies];

        this.scene!.physics.add.overlap(this._playerBullets, allEnemies, (bullet, enemy) => {
            this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE);

            (bullet as Bullet).disable();
            (enemy as Entity).getComponent(Health)?.damage((bullet as Bullet).damage);
        });

        this.scene!.physics.add.overlap(this._player, this._enemyBullets, (player, bullet) => {
            (bullet as Bullet).disable();
            (player as Player).getComponent(Health)?.damage((bullet as Bullet).damage);

            this.scene?.cameras.main.shake(100, 0.01);
        });

        this.scene!.physics.add.overlap(this._player, allEnemies, (player, enemy) => {
            this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE);

            const enemyHealth = (enemy as Entity).getComponent(Health);
            enemyHealth?.damage(enemyHealth?.max);

            const playerHealth = (player as Player).getComponent(Health);
            playerHealth?.damage(1);

            this.scene?.cameras.main.shake(100, 0.03);
        });

        console.log("[EntityManager] Group collisions initialized");
    }

    private updateDifficulty() {
        const score: number = Number(this.scene!.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
        const speedup: number = Math.min(1 + score * EntityManager.SPAWN_SPEEDUP_PER_POINT, EntityManager.MAX_SPAWN_SPEEDUP);
        this._spawnTimers.forEach(timer => timer.timeScale = speedup);
    }

    private spawnEnemy() {
        this.updateDifficulty();

        if (this._enemies.countActive(true) >= 5) {
            return;
        }

        const enemy = this._enemies.get() as Enemy;
        if (!enemy) {
            return;
        }

        enemy.enable(Phaser.Math.Between(64, this.scene!.cameras.main.width - 64), 0);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);

        console.log("[EntityManager] Enemy spawned");
    }

    private spawnSineEnemy(data: SineEnemyData) {
        this.updateDifficulty();

        if (this._sineEnemies.countActive(true) >= data.spawn.maxActive) {
            return;
        }

        const enemy = this._sineEnemies.get() as SineEnemy;
        if (!enemy) {
            return;
        }

        // Keep the whole wave on screen; fall back to the center if the amplitude is wider than the screen
        const width: number = this.scene!.cameras.main.width;
        const margin: number = data.movement.amplitude + enemy.displayWidth / 2;
        const minX: number = Math.min(margin, width / 2);
        const maxX: number = Math.max(width - margin, width / 2);
        enemy.enable(Phaser.Math.Between(minX, maxX), 0);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);
    }
}

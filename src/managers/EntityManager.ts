import {GameObjects, Plugins, Physics, Scene} from "phaser";
import Health from "../components/Health.ts";
import Bullet from "../entities/Bullet.ts";
import Enemy from "../entities/Enemy.ts";
import Entity from "../entities/Entity.ts";
import HealthPickup from "../entities/HealthPickup.ts";
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
    private _healthPickups: Physics.Arcade.Group;

    // Chance for a destroyed enemy to drop a health pickup: tougher enemies drop more often
    private static readonly ENEMY_DROP_CHANCE: number = 0.08;
    private static readonly SINE_ENEMY_DROP_CHANCE: number = 0.35;

    // Combo: each kill within COMBO_WINDOW_MS of the previous one raises the bonus, up to MAX_COMBO
    private static readonly COMBO_WINDOW_MS: number = 2000;
    private static readonly MAX_COMBO: number = 8;
    private static readonly SCORE_POPUP_RISE: number = 80;
    private static readonly SCORE_POPUP_MS: number = 600;

    private _combo: number = 0;
    private _comboResetTimer: Phaser.Time.TimerEvent | null = null;

    // Difficulty ramp: spawns speed up with the score, capped so the game stays playable
    private static readonly SPAWN_SPEEDUP_PER_POINT: number = 0.008;
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
                this.listenEnemyDeath(enemy as Entity, EntityManager.ENEMY_DROP_CHANCE);
            }
        });

        this._spawnTimers = [];
        this._combo = 0;
        this._comboResetTimer = null;

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
                this.listenEnemyDeath(enemy as Entity, EntityManager.SINE_ENEMY_DROP_CHANCE);
            }
        });

        this._healthPickups = this.scene!.physics.add.group({
            classType: HealthPickup,
            defaultKey: 'sprites',
            defaultFrame: 'playerLife1_blue',
            createCallback: (pickup) => {
                (pickup as HealthPickup).init();
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

        this.scene!.physics.add.overlap(this._player, this._healthPickups, (player, pickup) => {
            (pickup as HealthPickup).disable();
            (player as Player).getComponent(Health)?.heal(HealthPickup.HEAL_AMOUNT);
        });

        console.log("[EntityManager] Group collisions initialized");
    }

    private listenEnemyDeath(enemy: Entity, dropChance: number) {
        enemy.getComponent(Health)?.on(Health.DEATH_EVENT, () => {
            this.addComboKill(enemy.x, enemy.y);

            if (Math.random() < dropChance)
                (this._healthPickups.get() as HealthPickup | null)?.enable(enemy.x, enemy.y);
        });
    }

    private addComboKill(x: number, y: number) {
        const scene = this.scene!;
        this._combo = Math.min(this._combo + 1, EntityManager.MAX_COMBO);
        scene.registry.inc(RegistryConstants.Keys.PLAYER_SCORE, this._combo);
        scene.registry.set(RegistryConstants.Keys.PLAYER_COMBO, this._combo);

        this._comboResetTimer?.remove();
        this._comboResetTimer = scene.time.delayedCall(EntityManager.COMBO_WINDOW_MS, () => {
            this._combo = 0;
            scene.registry.set(RegistryConstants.Keys.PLAYER_COMBO, 0);
        });

        const popup = scene.add.text(x, y, "+" + this._combo,
            {fontSize: '48px', color: '#ffe066', fontFamily: 'future', stroke: '#000', strokeThickness: 6})
            .setOrigin(0.5);
        scene.tweens.add({
            targets: popup,
            y: y - EntityManager.SCORE_POPUP_RISE,
            alpha: 0,
            duration: EntityManager.SCORE_POPUP_MS,
            ease: 'Quad.easeOut',
            onComplete: () => popup.destroy()
        });
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

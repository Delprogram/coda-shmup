import {GameObjects, Plugins, Physics, Scene, Scenes} from "phaser";
import Health from "../components/Health.ts";
import Skills, {SkillId} from "../components/Skills.ts";
import SineMovement from "../components/SineMovement.ts";
import Boss from "../entities/Boss.ts";
import Bullet from "../entities/Bullet.ts";
import Enemy from "../entities/Enemy.ts";
import Entity from "../entities/Entity.ts";
import Pickup, {PickupKind} from "../entities/Pickup.ts";
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
    private _pickups: Physics.Arcade.Group;
    private _bosses: Physics.Arcade.Group;

    // Levels: kill enough enemies to make the boss appear; beating it starts the next, harder level
    private static readonly KILLS_FIRST_BOSS: number = 15;
    private static readonly KILLS_PER_LEVEL: number = 10;
    private static readonly BOSS_WARNING_MS: number = 2500;
    private static readonly BOSS_SCORE_PER_LEVEL: number = 50;
    private static readonly BOSS_DROPS: number = 3;
    private static readonly BOSS_DROP_SPREAD: number = 120;
    private static readonly BOSS_CONTACT_DAMAGE: number = 2;
    private static readonly PLAYER_SPAWN_BOTTOM_OFFSET: number = 400;
    // More enemies at the same time on higher levels
    private static readonly MAX_ACTIVE_ENEMIES: number = 8;
    private static readonly EXTRA_ENEMIES_PER_LEVEL: number = 2;
    private static readonly MAX_ACTIVE_ENEMIES_CAP: number = 16;
    private static readonly LEVELS_PER_EXTRA_SINE_ENEMY: number = 2;

    // Laser shield and (rarely) laser gun pickups appear at random places, only while a laser boss is alive
    private static readonly SHIELD_PICKUP_INTERVAL_MS: number = 4000;
    private static readonly MAX_SHIELD_PICKUPS: number = 2;
    private static readonly LASER_GUN_PICKUP_INTERVAL_MS: number = 15000;
    private static readonly MAX_LASER_GUN_PICKUPS: number = 1;
    private static readonly BOSS_PICKUP_MARGIN: number = 250;
    private static readonly BOSS_ULTIMATE_KILLS: number = 15;
    private static readonly SPAWN_SPEEDUP_PER_LEVEL: number = 0.3;

    // Shockwave skill: clears enemy bullets and damages enemies around the player
    private static readonly SHOCKWAVE_RADIUS: number = 520;
    private static readonly SHOCKWAVE_DAMAGE: number = 3;
    private static readonly SHOCKWAVE_MS: number = 350;
    private static readonly SHOCKWAVE_COLOR: number = 0x66ccff;

    private _levelKills: number = 0;
    private _bossFight: boolean = false;
    private _bossPickupTimers: Phaser.Time.TimerEvent[] = [];

    // Chance for a destroyed enemy to drop a health pickup: tougher enemies drop more often
    private static readonly ENEMY_DROP_CHANCE: number = 0.08;
    private static readonly SINE_ENEMY_DROP_CHANCE: number = 0.35;
    // Rarer power-up drops (drones or nuke)
    private static readonly ENEMY_POWER_UP_CHANCE: number = 0.04;
    private static readonly SINE_ENEMY_POWER_UP_CHANCE: number = 0.12;
    private static readonly POWER_UPS: PickupKind[] = ['drones', 'nuke'];

    // Black hole skill: pulls nearby enemies to its center, swallows enemy bullets and grinds what reaches the core
    private static readonly BLACK_HOLE_MS: number = 4000;
    private static readonly BLACK_HOLE_PULL_RADIUS: number = 650;
    private static readonly BLACK_HOLE_CORE_RADIUS: number = 90;
    private static readonly BLACK_HOLE_PULL_SPEED: number = 0.6;
    private static readonly BLACK_HOLE_DAMAGE_MS: number = 250;
    private static readonly BLACK_HOLE_DAMAGE: number = 1;
    private static readonly BLACK_HOLE_COLOR: number = 0xb44cff;
    private static readonly BLACK_HOLE_SUCTION_RING_MS: number = 280;
    private static readonly BLACK_HOLE_SPIN_MS: number = 700;

    // Nuke pickup: destroys every regular enemy and bullet on screen, hurts the boss
    private static readonly NUKE_BOSS_DAMAGE: number = 25;
    private static readonly NUKE_RING_RADIUS: number = 1800;
    private static readonly NUKE_RING_MS: number = 600;

    // Combo: each kill within COMBO_WINDOW_MS of the previous one raises the bonus, up to MAX_COMBO
    private static readonly COMBO_WINDOW_MS: number = 2000;
    private static readonly MAX_COMBO: number = 8;
    private static readonly SCORE_POPUP_RISE: number = 80;
    private static readonly SCORE_POPUP_MS: number = 600;

    private _combo: number = 0;
    private _comboResetTimer: Phaser.Time.TimerEvent | null = null;

    // Spawns speed up with the level, capped so the game stays playable
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

        // Spawn above the skill bar
        this._player = new Player(this.scene!, this.scene!.cameras.main.centerX, this.scene!.cameras.main.height - EntityManager.PLAYER_SPAWN_BOTTOM_OFFSET);
        this._player.init(this._playerBullets);
        this._player.getComponent(Skills)?.on(Skills.USED_EVENT, (id: SkillId) => {
            if (id === 'shockwave')
                this.shockwave(this._player.x, this._player.y);
            else if (id === 'blackHole') {
                const pointer = this.scene!.input.activePointer;
                this.blackHole(pointer.worldX, pointer.worldY);
            }
        });

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
                this.listenEnemyDeath(enemy as Entity, EntityManager.ENEMY_DROP_CHANCE, EntityManager.ENEMY_POWER_UP_CHANCE);
            }
        });

        this._spawnTimers = [];
        this._combo = 0;
        this._comboResetTimer = null;
        this._levelKills = 0;
        this._bossFight = false;
        this._bossPickupTimers = [];

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
                this.listenEnemyDeath(enemy as Entity, EntityManager.SINE_ENEMY_DROP_CHANCE, EntityManager.SINE_ENEMY_POWER_UP_CHANCE);
            }
        });

        this._pickups = this.scene!.physics.add.group({
            classType: Pickup,
            defaultKey: 'sprites',
            defaultFrame: 'playerLife1_blue',
            createCallback: (pickup) => {
                (pickup as Pickup).init();
            }
        });

        this._bosses = this.scene!.physics.add.group({
            classType: Boss,
            defaultKey: 'sprites',
            defaultFrame: 'ufoRed',
            maxSize: 1,
            createCallback: (boss) => {
                (boss as Boss).init(this._enemyBullets);
                (boss as Boss).getComponent(Health)?.on(Health.DEATH_EVENT, () => this.onBossKilled(boss as Boss));
            }
        });

        const sineEnemyData = this.scene!.cache.json.get(SineEnemy.DATA_KEY) as SineEnemyData;
        this._spawnTimers.push(this.scene!.time.addEvent({
            delay: sineEnemyData.spawn.delay,
            callback: () => this.spawnSineEnemy(sineEnemyData),
            loop: true
        }));

        this._player.setLaserTargets(() => [this._enemies, this._sineEnemies, this._bosses]
            .flatMap(group => group.getMatching('active', true) as Entity[]));
        this._player.setEnemyBullets(() => this._enemyBullets.getMatching('active', true) as Bullet[]);

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

        this.scene!.physics.add.overlap(this._playerBullets, this._bosses, (bullet, boss) => {
            this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE);

            (bullet as Bullet).disable();
            (boss as Boss).getComponent(Health)?.damage((bullet as Bullet).damage);
        });

        // Touching the boss hurts the player but does not destroy the boss
        this.scene!.physics.add.overlap(this._player, this._bosses, (player) => {
            (player as Player).getComponent(Health)?.damage(EntityManager.BOSS_CONTACT_DAMAGE);
            this.scene?.cameras.main.shake(150, 0.03);
        });

        this.scene!.physics.add.overlap(this._player, this._pickups, (player, pickup) => {
            (pickup as Pickup).disable();
            switch ((pickup as Pickup).kind) {
                case 'health': (player as Player).getComponent(Health)?.heal(Pickup.HEAL_AMOUNT); break;
                case 'laserShield': (player as Player).activateDeflector(); break;
                case 'laserGun': (player as Player).activateLaserGun(); break;
                case 'drones': (player as Player).activateDrones(); break;
                case 'nuke': this.nuke(); break;
            }
        });

        console.log("[EntityManager] Group collisions initialized");
    }

    private listenEnemyDeath(enemy: Entity, dropChance: number, powerUpChance: number) {
        enemy.getComponent(Health)?.on(Health.DEATH_EVENT, () => {
            this.addComboKill(enemy.x, enemy.y);

            if (Math.random() < dropChance)
                this.dropHealthPickup(enemy.x, enemy.y);
            else if (Math.random() < powerUpChance)
                this.dropPickup(enemy.x, enemy.y, Phaser.Utils.Array.GetRandom(EntityManager.POWER_UPS));

            this._player.getComponent(Skills)?.addKill();
            this._levelKills++;
            if (!this._bossFight && this._levelKills >= this.killsToBoss())
                this.startBossFight();
        });
    }

    private shockwave(x: number, y: number) {
        const scene = this.scene!;
        const radius: number = EntityManager.SHOCKWAVE_RADIUS;
        const isInRange = (object: GameObjects.Components.Transform, extra: number) =>
            Phaser.Math.Distance.Between(x, y, object.x, object.y) <= radius + extra;

        (this._enemyBullets.getMatching('active', true) as Bullet[])
            .filter(bullet => isInRange(bullet, 0))
            .forEach(bullet => bullet.disable());

        [this._enemies, this._sineEnemies, this._bosses].forEach(group => {
            (group.getMatching('active', true) as Entity[])
                .filter(enemy => isInRange(enemy, enemy.displayWidth / 2))
                .forEach(enemy => enemy.getComponent(Health)?.damage(EntityManager.SHOCKWAVE_DAMAGE));
        });

        const ring = scene.add.circle(x, y, radius, EntityManager.SHOCKWAVE_COLOR, 0.15)
            .setStrokeStyle(10, EntityManager.SHOCKWAVE_COLOR, 0.9).setScale(0);
        scene.tweens.add({
            targets: ring,
            scale: 1,
            alpha: 0,
            duration: EntityManager.SHOCKWAVE_MS,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy()
        });
        scene.cameras.main.shake(150, 0.01);
    }

    private spawnBossPickup(kind: PickupKind, maxActive: number) {
        const activeOfKind: number = (this._pickups.getMatching('active', true) as Pickup[])
            .filter(pickup => pickup.kind === kind).length;
        if (activeOfKind >= maxActive)
            return;

        const camera = this.scene!.cameras.main;
        const margin: number = EntityManager.BOSS_PICKUP_MARGIN;
        // Lower part of the screen: the boss hovers at the top
        const x: number = Phaser.Math.Between(margin, camera.width - margin);
        const y: number = Phaser.Math.Between(camera.height / 2, camera.height - margin);
        (this._pickups.get() as Pickup | null)?.enable(x, y, kind);
    }

    private dropHealthPickup(x: number, y: number) {
        this.dropPickup(x, y, 'health');
    }

    private dropPickup(x: number, y: number, kind: PickupKind) {
        (this._pickups.get() as Pickup | null)?.enable(x, y, kind);
    }

    private activeEnemies(): Entity[] {
        return [this._enemies, this._sineEnemies].flatMap(group => group.getMatching('active', true) as Entity[]);
    }

    private blackHole(x: number, y: number) {
        const scene = this.scene!;
        const color: number = EntityManager.BLACK_HOLE_COLOR;

        // Look: black core, two spinning arcs and rings shrinking toward the center (suction)
        const core = scene.add.circle(x, y, EntityManager.BLACK_HOLE_CORE_RADIUS, 0x000000)
            .setStrokeStyle(10, color).setScale(0);
        scene.tweens.add({targets: core, scale: 1, duration: 200, ease: 'Back.easeOut'});
        const arcs = [1.4, 2].map((radiusFactor, i) => {
            const arc = scene.add.arc(x, y, EntityManager.BLACK_HOLE_CORE_RADIUS * radiusFactor, 0, 250)
                .setClosePath(false).setStrokeStyle(8, i === 0 ? 0xffffff : color, 0.8);
            scene.tweens.add({targets: arc, angle: 360, duration: EntityManager.BLACK_HOLE_SPIN_MS * (i + 1), repeat: -1});
            return arc;
        });
        const suction = scene.time.addEvent({
            delay: EntityManager.BLACK_HOLE_SUCTION_RING_MS,
            loop: true,
            callback: () => {
                const ring = scene.add.circle(x, y, EntityManager.BLACK_HOLE_PULL_RADIUS).setStrokeStyle(4, color, 0).setScale(1);
                scene.tweens.add({
                    targets: ring, scale: 0.15, duration: 600, ease: 'Quad.easeIn',
                    onUpdate: (tween) => ring.setStrokeStyle(4, color, 0.6 * tween.progress),
                    onComplete: () => ring.destroy()
                });
            }
        });

        let elapsedMs: number = 0;
        let damageMs: number = 0;
        const update = (_time: number, deltaTime: number) => {
            elapsedMs += deltaTime;
            damageMs += deltaTime;
            const dealDamage: boolean = damageMs >= EntityManager.BLACK_HOLE_DAMAGE_MS;
            if (dealDamage)
                damageMs = 0;

            for (const enemy of this.activeEnemies()) {
                const distance: number = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
                if (distance > EntityManager.BLACK_HOLE_PULL_RADIUS)
                    continue;

                const step: number = Math.min(EntityManager.BLACK_HOLE_PULL_SPEED * deltaTime, distance);
                const pull = new Phaser.Math.Vector2(x - enemy.x, y - enemy.y).normalize().scale(step);
                // A sine enemy recomputes its position from its wave center every frame: pull the center instead
                const sineMovement = enemy.getComponent(SineMovement);
                if (sineMovement)
                    sineMovement.offsetCenter(pull.x, pull.y);
                else
                    enemy.setPosition(enemy.x + pull.x, enemy.y + pull.y);

                if (dealDamage && distance <= EntityManager.BLACK_HOLE_CORE_RADIUS + enemy.displayWidth / 2)
                    enemy.getComponent(Health)?.damage(EntityManager.BLACK_HOLE_DAMAGE);
            }

            // The boss is too heavy to be pulled, but the core still hurts it
            for (const boss of this._bosses.getMatching('active', true) as Boss[]) {
                if (dealDamage && Phaser.Math.Distance.Between(x, y, boss.x, boss.y) <= EntityManager.BLACK_HOLE_CORE_RADIUS + boss.displayWidth / 2)
                    boss.getComponent(Health)?.damage(EntityManager.BLACK_HOLE_DAMAGE);
            }

            (this._enemyBullets.getMatching('active', true) as Bullet[])
                .filter(bullet => Phaser.Math.Distance.Between(x, y, bullet.x, bullet.y) <= EntityManager.BLACK_HOLE_PULL_RADIUS)
                .forEach(bullet => bullet.disable());

            if (elapsedMs >= EntityManager.BLACK_HOLE_MS)
                stop();
        };

        const stop = () => {
            scene.events.off(Scenes.Events.UPDATE, update);
            scene.events.off(Scenes.Events.SHUTDOWN, stop);
            suction.remove();
            scene.tweens.add({
                targets: [core, ...arcs], scale: 0, alpha: 0, duration: 250,
                onComplete: () => [core, ...arcs].forEach(object => object.destroy())
            });
        };
        // Scene events outlive a restart of the scene: always remove the listener
        scene.events.on(Scenes.Events.UPDATE, update);
        scene.events.once(Scenes.Events.SHUTDOWN, stop);
    }

    private nuke() {
        const scene = this.scene!;
        scene.cameras.main.flash(350, 255, 255, 255);
        scene.cameras.main.shake(400, 0.03);

        (this._enemyBullets.getMatching('active', true) as Bullet[]).forEach(bullet => bullet.disable());
        this.activeEnemies().forEach(enemy => {
            const health = enemy.getComponent(Health);
            health?.damage(health.current);
        });
        (this._bosses.getMatching('active', true) as Boss[])
            .forEach(boss => boss.getComponent(Health)?.damage(EntityManager.NUKE_BOSS_DAMAGE));

        const ring = scene.add.circle(this._player.x, this._player.y, EntityManager.NUKE_RING_RADIUS)
            .setStrokeStyle(30, 0xff3355, 0.9).setScale(0);
        scene.tweens.add({
            targets: ring, scale: 1, alpha: 0, duration: EntityManager.NUKE_RING_MS, ease: 'Quad.easeOut',
            onComplete: () => ring.destroy()
        });
    }

    private currentLevel(): number {
        return Number(this.scene!.registry.get(RegistryConstants.Keys.LEVEL) ?? 1);
    }

    private killsToBoss(): number {
        return EntityManager.KILLS_FIRST_BOSS + EntityManager.KILLS_PER_LEVEL * (this.currentLevel() - 1);
    }

    private startBossFight() {
        this._bossFight = true;
        this._spawnTimers.forEach(timer => timer.paused = true);
        this.game!.events.emit(GameConstants.Events.BOSS_INCOMING_EVENT, this.currentLevel());

        this.scene!.time.delayedCall(EntityManager.BOSS_WARNING_MS, () => {
            const boss = this._bosses.get() as Boss | null;
            if (!boss)
                return;

            boss.enable(this.currentLevel(), this._player);
            this.game!.events.emit(GameConstants.Events.BOSS_SPAWNED_EVENT, boss);

            if (boss.hasLasers) {
                this.spawnBossPickup('laserShield', EntityManager.MAX_SHIELD_PICKUPS);
                // The laser gun is rare: the first one only shows up after a full interval
                this._bossPickupTimers = [
                    this.scene!.time.addEvent({
                        delay: EntityManager.SHIELD_PICKUP_INTERVAL_MS,
                        callback: () => this.spawnBossPickup('laserShield', EntityManager.MAX_SHIELD_PICKUPS),
                        loop: true
                    }),
                    this.scene!.time.addEvent({
                        delay: EntityManager.LASER_GUN_PICKUP_INTERVAL_MS,
                        callback: () => this.spawnBossPickup('laserGun', EntityManager.MAX_LASER_GUN_PICKUPS),
                        loop: true
                    }),
                ];
            }
        });
    }

    private onBossKilled(boss: Boss) {
        const scene = this.scene!;
        const level: number = this.currentLevel();

        scene.registry.inc(RegistryConstants.Keys.PLAYER_SCORE, EntityManager.BOSS_SCORE_PER_LEVEL * level);
        // Beating a boss fully charges the ultimate
        for (let i: number = 0; i < EntityManager.BOSS_ULTIMATE_KILLS; i++)
            this._player.getComponent(Skills)?.addKill();
        this.addComboKill(boss.x, boss.y);
        scene.cameras.main.shake(400, 0.03);
        for (let i: number = 0; i < EntityManager.BOSS_DROPS; i++) {
            const spread: number = EntityManager.BOSS_DROP_SPREAD;
            this.dropHealthPickup(boss.x + Phaser.Math.Between(-spread, spread), boss.y + Phaser.Math.Between(-spread, spread));
        }
        // A beaten boss always drops every power-up
        EntityManager.POWER_UPS.forEach(kind => {
            const spread: number = EntityManager.BOSS_DROP_SPREAD;
            this.dropPickup(boss.x + Phaser.Math.Between(-spread, spread), boss.y + Phaser.Math.Between(-spread, spread), kind);
        });

        this._bossPickupTimers.forEach(timer => timer.remove());
        this._bossPickupTimers = [];
        this._levelKills = 0;
        this._bossFight = false;
        scene.registry.set(RegistryConstants.Keys.LEVEL, level + 1);
        this.updateDifficulty();
        this._spawnTimers.forEach(timer => timer.paused = false);
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
        const speedup: number = Math.min(1 + (this.currentLevel() - 1) * EntityManager.SPAWN_SPEEDUP_PER_LEVEL,
            EntityManager.MAX_SPAWN_SPEEDUP);
        this._spawnTimers.forEach(timer => timer.timeScale = speedup);
    }

    // Random point just outside one of the 4 screen edges, facing the player (or the center once it is dead)
    private randomEdgeSpawn(margin: number): {x: number, y: number, rotation: number} {
        const camera = this.scene!.cameras.main;
        let x: number;
        let y: number;
        switch (Phaser.Math.Between(0, 3)) {
            case 0: x = Phaser.Math.Between(0, camera.width); y = -margin; break;
            case 1: x = Phaser.Math.Between(0, camera.width); y = camera.height + margin; break;
            case 2: x = -margin; y = Phaser.Math.Between(0, camera.height); break;
            default: x = camera.width + margin; y = Phaser.Math.Between(0, camera.height); break;
        }

        const targetX: number = this._player.active ? this._player.x : camera.centerX;
        const targetY: number = this._player.active ? this._player.y : camera.centerY;
        return {x, y, rotation: Phaser.Math.Angle.Between(x, y, targetX, targetY)};
    }

    private spawnEnemy() {
        const maxActive: number = Math.min(EntityManager.MAX_ACTIVE_ENEMIES
            + EntityManager.EXTRA_ENEMIES_PER_LEVEL * (this.currentLevel() - 1), EntityManager.MAX_ACTIVE_ENEMIES_CAP);
        if (this._enemies.countActive(true) >= maxActive) {
            return;
        }

        const enemy = this._enemies.get() as Enemy;
        if (!enemy) {
            return;
        }

        const spawn = this.randomEdgeSpawn(enemy.displayWidth);
        enemy.enable(spawn.x, spawn.y, spawn.rotation, this._player, this.currentLevel());

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);

        console.log("[EntityManager] Enemy spawned");
    }

    private spawnSineEnemy(data: SineEnemyData) {
        const maxActive: number = data.spawn.maxActive
            + Math.floor((this.currentLevel() - 1) / EntityManager.LEVELS_PER_EXTRA_SINE_ENEMY);
        if (this._sineEnemies.countActive(true) >= maxActive) {
            return;
        }

        const enemy = this._sineEnemies.get() as SineEnemy;
        if (!enemy) {
            return;
        }

        const spawn = this.randomEdgeSpawn(enemy.displayWidth);
        enemy.enable(spawn.x, spawn.y, spawn.rotation, this.currentLevel(), this._player);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);
    }
}

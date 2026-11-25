import {Input, Scene} from "phaser";
import {PlayerShipData, PlayerShipsData} from "../gameData/PlayerShipsData.ts";
import type {BulletData} from "../gameData/BulletData.ts";
import Entity from './Entity.ts';
import type Bullet from "./Bullet.ts";
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Skills, {SkillId} from "../components/Skills.ts";
import LaserWeapon, {LaserBlocker, LaserStyle} from "../components/LaserWeapon.ts";
import Weapon from "../components/Weapon.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class Player extends Entity implements LaserBlocker {
    private readonly _bulletData: BulletData = {
        width: 12,
        height: 4,
        color: 0xffe066,
        speed: 1024,
        damage: 1
    };

    // Weapon upgrade: one more bullet every SCORE_PER_UPGRADE points, up to MAX_BULLETS
    private static readonly SCORE_PER_UPGRADE: number = 30;
    private static readonly MAX_BULLETS: number = 5;
    private static readonly SPREAD_DEG_PER_BULLET: number = 8;

    private static readonly MAX_HEALTH: number = 10;
    private static readonly RATE_OF_FIRE_S: number = 0.22;
    // Time (ms) to reach ~63% of full speed when starting or stopping: small inertia, still responsive
    private static readonly MOVE_SMOOTHING_MS: number = 60;
    // Max aim turn speed, in radians per ms
    private static readonly AIM_TURN_SPEED: number = 0.015;
    private static readonly INVINCIBILITY_MS: number = 900;
    private static readonly BLINK_MS: number = 90;

    // Skills
    private static readonly SHIELD_MS: number = 3000;
    private static readonly SHIELD_RADIUS: number = 90;
    private static readonly SHIELD_COLOR: number = 0x66ccff;
    private static readonly OVERDRIVE_MS: number = 5000;
    private static readonly OVERDRIVE_RATE_OF_FIRE_S: number = 0.07;
    private static readonly OVERDRIVE_BULLETS: number = 7;
    private static readonly OVERDRIVE_SPREAD_DEG: number = 40;
    private static readonly OVERDRIVE_TINT: number = 0xffb000;
    // Barrier: field around the ship that destroys every enemy bullet entering it
    private static readonly BARRIER_MS: number = 5000;
    private static readonly BARRIER_RADIUS: number = 320;
    private static readonly BARRIER_COLOR: number = 0x66ffcc;
    private static readonly BARRIER_PULSE_MS: number = 300;

    // Nitro: hold SHIFT while moving to go faster, as long as the gauge lasts. It recharges when not used, and
    // once empty it must refill a bit before it can be used again (no on/off flicker)
    private static readonly NITRO_MAX_MS: number = 3000;
    private static readonly NITRO_RECHARGE_PER_MS: number = 0.5;
    private static readonly NITRO_MIN_RATIO_TO_START: number = 0.25;
    private static readonly NITRO_SPEED_FACTOR: number = 2.2;
    // Speed ramps up and down instead of jumping
    private static readonly NITRO_RAMP_MS: number = 120;
    private static readonly MIN_MOVE_FOR_NITRO: number = 0.1;
    private static readonly NITRO_FLAME_OFFSET: number = 50;
    private static readonly NITRO_FLAME_SPREAD_DEG: number = 15;

    // Laser gun: rare pickup during laser boss fights, right click fires piercing beams
    private static readonly LASER_GUN_MS: number = 6000;
    private static readonly LASER_GUN_RATE_OF_FIRE_S: number = 0.08;
    // Slightly longer than the rate of fire so consecutive beams look like one continuous ray
    private static readonly LASER_GUN_BEAM_MS: number = 110;
    private static readonly LASER_GUN_TINT: number = 0xff66ff;
    private static readonly LASER_GUN_SOUND_VOLUME: number = 0.25;
    private static readonly LASER_GUN_STYLE: LaserStyle = {color: 0xff66ff, beamWidth: 30, coreWidth: 10, damage: 1};

    // Deflector: plate in front of the ship (toward the aim) that blocks laser beams, given by a laser shield pickup
    private static readonly DEFLECTOR_MS: number = 8000;
    private static readonly DEFLECTOR_DISTANCE: number = 95;
    private static readonly DEFLECTOR_LENGTH: number = 240;
    private static readonly DEFLECTOR_THICKNESS: number = 18;
    private static readonly DEFLECTOR_COLOR: number = 0x66ccff;
    private static readonly DEFLECTOR_WARNING_MS: number = 1500;
    private static readonly DEFLECTOR_BLINK_MS: number = 100;

    private readonly _cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
    // ZQSD (AZERTY), W/S/D (QWERTY) and arrows. A is not a move key: it triggers the barrier
    private readonly _moveKeys: Record<'up' | 'down' | 'left' | 'right', Input.Keyboard.Key[]>;
    private _playerShipData: PlayerShipData;
    private _rateOfFire: number;
    private _lastShotTime: number;
    private _lastHealth: number;
    private readonly _smoothedDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private _invincibleUntil: number = 0;
    private _overdriveUntil: number = 0;
    private _shieldBubble: Phaser.GameObjects.Arc | null = null;
    private _deflector: Phaser.GameObjects.Rectangle;
    private _deflectorUntil: number = 0;
    private _laserGunUntil: number = 0;
    private _laserTargets: () => Entity[] = () => [];
    private _lastLaserTime: number = 0;
    private _barrier: Phaser.GameObjects.Arc;
    private _barrierUntil: number = 0;
    private _enemyBullets: () => Bullet[] = () => [];
    private _nitroKey: Input.Keyboard.Key | null = null;
    private _nitroMs: number = Player.NITRO_MAX_MS;
    private _isNitroActive: boolean = false;
    private _speedFactor: number = 1;
    private _nitroFlames: Phaser.GameObjects.Particles.ParticleEmitter;
    private _flameAngleDeg: number = 90;

    // 0 = empty, 1 = full: read by the UI gauge
    public get nitroRatio(): number {
        return this._nitroMs / Player.NITRO_MAX_MS;
    }

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'sprites');

        if (this.scene.input.keyboard) {
            this._cursorKeys = this.scene.input.keyboard.createCursorKeys();

            const keyboard = this.scene.input.keyboard;
            const keys = (...codes: number[]) => codes.map(code => keyboard.addKey(code));
            const KeyCodes = Input.Keyboard.KeyCodes;
            this._moveKeys = {
                up: [...keys(KeyCodes.W, KeyCodes.Z), this._cursorKeys.up],
                down: [...keys(KeyCodes.S), this._cursorKeys.down],
                left: [...keys(KeyCodes.Q), this._cursorKeys.left],
                right: [...keys(KeyCodes.D), this._cursorKeys.right],
            };

            const useSkill = (id: SkillId) => this.getComponent(Skills)?.tryUse(id, this.scene.time.now);
            this.scene.input.keyboard.addKey(KeyCodes.F).on('down', () => useSkill('shockwave'));
            this.scene.input.keyboard.addKey(KeyCodes.C).on('down', () => useSkill('shield'));
            this.scene.input.keyboard.addKey(KeyCodes.A).on('down', () => useSkill('barrier'));
            this._nitroKey = this.scene.input.keyboard.addKey(KeyCodes.SHIFT);
            this.scene.input.keyboard.addKey(KeyCodes.X).on('down', () => useSkill('overdrive'));

            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.ONE).on('down', () => this.selectPlayerShip(1));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.TWO).on('down', () => this.selectPlayerShip(2));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.THREE).on('down', () => this.selectPlayerShip(3));
        }

        // Right click fires the laser gun, so the browser menu must not open
        this.scene.input.mouse?.disableContextMenu();
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this.addComponent(new Health(Player.MAX_HEALTH, this));
        this.addComponent(new Movement());
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));
        this.addComponent(new Skills(this.scene.time.now));
        this.addComponent(new LaserWeapon(this, () => this._laserTargets(), Player.LASER_GUN_STYLE));

        this._deflector = this.scene.add.rectangle(this.x, this.y, Player.DEFLECTOR_THICKNESS, Player.DEFLECTOR_LENGTH,
            Player.DEFLECTOR_COLOR, 0.85).setStrokeStyle(4, 0xffffff, 0.9).setVisible(false);
        this._nitroFlames = this.scene.add.particles(0, 0, 'sprites', {
            frame: ['star1', 'star2'],
            // Read at each emission, so the flames always point behind the ship
            angle: {onEmit: () => this._flameAngleDeg + Phaser.Math.Between(-Player.NITRO_FLAME_SPREAD_DEG, Player.NITRO_FLAME_SPREAD_DEG)},
            speed: {min: 150, max: 300},
            scale: {start: 0.7, end: 0},
            alpha: {start: 0.9, end: 0},
            tint: [0xffe066, 0xff9f1c, 0xf25f5c],
            lifespan: 250,
            frequency: 15,
            emitting: false
        });
        this._barrier = this.scene.add.circle(this.x, this.y, Player.BARRIER_RADIUS, Player.BARRIER_COLOR, 0.08)
            .setStrokeStyle(8, Player.BARRIER_COLOR, 0.8).setVisible(false);
        this.scene.tweens.add({
            targets: this._barrier,
            alpha: {from: 1, to: 0.5},
            duration: Player.BARRIER_PULSE_MS,
            yoyo: true,
            repeat: -1
        });

        this.angle = -90;

        this.selectPlayerShip(1);

        this._rateOfFire = Player.RATE_OF_FIRE_S;
        this._lastShotTime = 0;
        this._lastHealth = Player.MAX_HEALTH;

        this.getComponent(Health)?.on(Health.CHANGE_EVENT, (current: number) => {
            // CHANGE_EVENT also fires on heal: only a loss of health makes the player invincible
            const wasHit: boolean = current < this._lastHealth;
            this._lastHealth = current;
            if (wasHit && current > 0)
                this.startInvincibility();
        });

        // preUpdate stops once the player is dead: hide what follows the ship
        this.getComponent(Health)?.once(Health.DEATH_EVENT, () => {
            this._deflectorUntil = 0;
            this._deflector.setVisible(false);
            this._shieldBubble?.setVisible(false);
            this._barrierUntil = 0;
            this._barrier.setVisible(false);
            this._nitroFlames.stop();
            this._laserGunUntil = 0;
            this.getComponent(LaserWeapon)?.clear();
        });

        this.getComponent(Skills)?.on(Skills.USED_EVENT, (id: SkillId) => {
            if (id === 'shield')
                this.activateShield();
            else if (id === 'barrier')
                this._barrierUntil = this.scene.time.now + Player.BARRIER_MS;
            else if (id === 'overdrive')
                this.activateOverdrive();
        });
    }

    private startInvincibility() {
        this.extendInvincibility(Player.INVINCIBILITY_MS);

        const blink = this.scene.tweens.add({
            targets: this,
            alpha: 0.2,
            duration: Player.BLINK_MS,
            yoyo: true,
            repeat: -1
        });

        this.scene.time.delayedCall(Player.INVINCIBILITY_MS, () => {
            blink.stop();
            this.setAlpha(1);
        });
    }

    private activateShield() {
        this.extendInvincibility(Player.SHIELD_MS);

        this._shieldBubble?.destroy();
        const bubble = this.scene.add.circle(this.x, this.y, Player.SHIELD_RADIUS, Player.SHIELD_COLOR, 0.2)
            .setStrokeStyle(6, Player.SHIELD_COLOR, 0.9);
        this._shieldBubble = bubble;
        this.scene.time.delayedCall(Player.SHIELD_MS, () => {
            bubble.destroy();
            if (this._shieldBubble === bubble)
                this._shieldBubble = null;
        });
    }

    public activateDeflector() {
        this._deflectorUntil = this.scene.time.now + Player.DEFLECTOR_MS;
    }

    public laserBlocker(): Phaser.Geom.Line | null {
        if (!this.active || this.scene.time.now >= this._deflectorUntil)
            return null;

        // Segment perpendicular to the aim, centered in front of the ship
        const forward = new Phaser.Math.Vector2().setToPolar(this.rotation, Player.DEFLECTOR_DISTANCE);
        const half = new Phaser.Math.Vector2().setToPolar(this.rotation + Math.PI / 2, Player.DEFLECTOR_LENGTH / 2);
        const centerX: number = this.x + forward.x;
        const centerY: number = this.y + forward.y;
        return new Phaser.Geom.Line(centerX - half.x, centerY - half.y, centerX + half.x, centerY + half.y);
    }

    private updateDeflector(now: number) {
        const remainingMs: number = this._deflectorUntil - now;
        this._deflector.setVisible(remainingMs > 0);
        if (remainingMs <= 0)
            return;

        const forward = new Phaser.Math.Vector2().setToPolar(this.rotation, Player.DEFLECTOR_DISTANCE);
        this._deflector.setPosition(this.x + forward.x, this.y + forward.y).setRotation(this.rotation);
        // Blink at the end to warn that it is about to run out
        const blinkOff: boolean = remainingMs < Player.DEFLECTOR_WARNING_MS
            && Math.floor(remainingMs / Player.DEFLECTOR_BLINK_MS) % 2 === 1;
        this._deflector.setAlpha(blinkOff ? 0.3 : 1);
    }

    // What the laser gun can hit and what the barrier destroys, given by the EntityManager which owns the groups
    public setLaserTargets(targets: () => Entity[]) {
        this._laserTargets = targets;
    }

    public setEnemyBullets(bullets: () => Bullet[]) {
        this._enemyBullets = bullets;
    }

    private updateBarrier(now: number) {
        const isActive: boolean = now < this._barrierUntil;
        this._barrier.setVisible(isActive).setPosition(this.x, this.y);
        if (!isActive)
            return;

        this._enemyBullets()
            .filter(bullet => Phaser.Math.Distance.Between(this.x, this.y, bullet.x, bullet.y) <= Player.BARRIER_RADIUS)
            .forEach(bullet => bullet.disable());
    }

    public activateLaserGun() {
        this._laserGunUntil = this.scene.time.now + Player.LASER_GUN_MS;
        this.setTint(Player.LASER_GUN_TINT);
        this.scene.time.delayedCall(Player.LASER_GUN_MS, () => {
            if (this.scene.time.now >= this._laserGunUntil)
                this.clearTint();
        });
    }

    private activateOverdrive() {
        this._overdriveUntil = this.scene.time.now + Player.OVERDRIVE_MS;
        this.setTint(Player.OVERDRIVE_TINT);
        this.scene.time.delayedCall(Player.OVERDRIVE_MS, () => this.clearTint());
    }

    private extendInvincibility(durationMs: number) {
        this._invincibleUntil = Math.max(this._invincibleUntil, this.scene.time.now + durationMs);
    }

    private updateNitro(isMoving: boolean, deltaTime: number) {
        const wantsNitro: boolean = isMoving && (this._nitroKey?.isDown ?? false);
        if (!wantsNitro || this._nitroMs <= 0)
            this._isNitroActive = false;
        else if (!this._isNitroActive && this.nitroRatio >= Player.NITRO_MIN_RATIO_TO_START)
            this._isNitroActive = true;

        if (this._isNitroActive)
            this._nitroMs = Math.max(this._nitroMs - deltaTime, 0);
        else
            this._nitroMs = Math.min(this._nitroMs + Player.NITRO_RECHARGE_PER_MS * deltaTime, Player.NITRO_MAX_MS);

        const targetFactor: number = this._isNitroActive ? Player.NITRO_SPEED_FACTOR : 1;
        this._speedFactor += (targetFactor - this._speedFactor) * (1 - Math.exp(-deltaTime / Player.NITRO_RAMP_MS));

        // Flames come out behind the ship, opposite to where it is going
        const backAngle: number = this._smoothedDirection.angle() + Math.PI;
        const back = new Phaser.Math.Vector2().setToPolar(backAngle, Player.NITRO_FLAME_OFFSET);
        this._nitroFlames.setPosition(this.x + back.x, this.y + back.y);
        this._flameAngleDeg = Phaser.Math.RadToDeg(backAngle);
        if (this._isNitroActive !== this._nitroFlames.emitting) {
            if (this._isNitroActive)
                this._nitroFlames.start();
            else
                this._nitroFlames.stop();
        }
    }

    public selectPlayerShip(playerShipDataId: number) {
        const playerShipsData = this.scene.cache.json.get('playerShips') as PlayerShipsData;
        this._playerShipData = playerShipsData[playerShipDataId];

        this.setTexture('sprites', this._playerShipData.texture);
        const bodyData = this._playerShipData.body;
        this.arcadeBody.setCircle(bodyData.radius, bodyData.offsetX, bodyData.offsetY);

        this.getComponent(Movement)?.setSpeed(this._playerShipData.movementSpeed);
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        const now: number = this.scene.time.now;
        this.arcadeBody.setEnable(now >= this._invincibleUntil);

        // Move in 8 directions, normalized so diagonals are not faster
        const isDown = (keys: Input.Keyboard.Key[]) => keys.some(key => key.isDown);
        const direction = new Phaser.Math.Vector2(
            Number(isDown(this._moveKeys.right)) - Number(isDown(this._moveKeys.left)),
            Number(isDown(this._moveKeys.down)) - Number(isDown(this._moveKeys.up))
        ).normalize();
        // Frame-rate independent smoothing toward the wanted direction
        this._smoothedDirection.lerp(direction, 1 - Math.exp(-deltaTime / Player.MOVE_SMOOTHING_MS));
        this.updateNitro(direction.length() > Player.MIN_MOVE_FOR_NITRO, deltaTime);
        const movement = this.getComponent(Movement);
        movement?.moveHorizontally(this, this._smoothedDirection.x * this._speedFactor * deltaTime);
        movement?.moveVertically(this, this._smoothedDirection.y * this._speedFactor * deltaTime);

        // Stop player from going offscreen
        const camera = this.scene.cameras.main;
        this.x = Phaser.Math.Clamp(this.x, this.displayWidth / 2, camera.width - this.displayWidth / 2);
        this.y = Phaser.Math.Clamp(this.y, this.displayHeight / 2, camera.height - this.displayHeight / 2);

        // Aim at the mouse, once it has moved over the game (before that, keep facing up)
        const pointer = this.scene.input.activePointer;
        if (pointer.moveTime > 0) {
            const aimRotation: number = Phaser.Math.Angle.Between(this.x, this.y, pointer.worldX, pointer.worldY);
            this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, aimRotation, Player.AIM_TURN_SPEED * deltaTime);
        }

        this._shieldBubble?.setPosition(this.x, this.y);
        this.updateDeflector(now);
        this.updateBarrier(now);
        this.getComponent(LaserWeapon)?.update(deltaTime);

        // Hold the right mouse button to fire the laser gun (only while the pickup is active)
        const hasLaserGun: boolean = now < this._laserGunUntil;
        if (hasLaserGun && pointer.rightButtonDown()
            && timeSinceLaunch - this._lastLaserTime > Player.LASER_GUN_RATE_OF_FIRE_S * 1000) {
            this.getComponent(LaserWeapon)?.fire(this.rotation,
                {angleOffset: 0, sweepSpeed: 0, telegraphMs: 0, activeMs: Player.LASER_GUN_BEAM_MS});
            this.scene.sound.play('sfx_laser1', {volume: Player.LASER_GUN_SOUND_VOLUME});
            this._lastLaserTime = timeSinceLaunch;
        }

        // Press space or hold the left mouse button (or a finger) to shoot bullets toward the mouse
        const isShooting: boolean = pointer.isDown && !pointer.rightButtonDown();
        const isOverdrive: boolean = now < this._overdriveUntil;
        const rateOfFire: number = isOverdrive ? Player.OVERDRIVE_RATE_OF_FIRE_S : this._rateOfFire;
        if (this._cursorKeys.space.isDown || isShooting) {
            if (timeSinceLaunch - this._lastShotTime > rateOfFire * 1000) {
                const score: number = Number(this.scene.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
                const bulletCount: number = isOverdrive ? Player.OVERDRIVE_BULLETS
                    : Math.min(1 + Math.floor(score / Player.SCORE_PER_UPGRADE), Player.MAX_BULLETS);
                const spread: number = isOverdrive ? Player.OVERDRIVE_SPREAD_DEG : (bulletCount - 1) * Player.SPREAD_DEG_PER_BULLET;
                this.getComponent(Weapon)?.shootSpread(this, bulletCount, spread);
                this.scene.sound.play('sfx_laser1');

                this._lastShotTime = timeSinceLaunch;
            }
        }
    }
}
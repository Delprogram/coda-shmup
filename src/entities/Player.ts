import {Input, Scene} from "phaser";
import {PlayerShipData, PlayerShipsData} from "../gameData/PlayerShipsData.ts";
import type {BulletData} from "../gameData/BulletData.ts";
import Entity from './Entity.ts';
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

    // Dash: short invincible burst in the move direction (or toward the aim when standing still)
    private static readonly DASH_MS: number = 160;
    private static readonly DASH_SPEED_FACTOR: number = 4;
    private static readonly DASH_COOLDOWN_MS: number = 900;
    private static readonly DASH_GHOST_ALPHA: number = 0.5;
    private static readonly DASH_GHOST_FADE_MS: number = 220;
    private static readonly DASH_GHOST_TINT: number = 0x66ccff;
    private static readonly MIN_MOVE_FOR_DASH: number = 0.1;

    // Skills
    private static readonly SHIELD_MS: number = 3000;
    private static readonly SHIELD_RADIUS: number = 90;
    private static readonly SHIELD_COLOR: number = 0x66ccff;
    private static readonly OVERDRIVE_MS: number = 5000;
    private static readonly OVERDRIVE_RATE_OF_FIRE_S: number = 0.07;
    private static readonly OVERDRIVE_BULLETS: number = 7;
    private static readonly OVERDRIVE_SPREAD_DEG: number = 40;
    private static readonly OVERDRIVE_TINT: number = 0xffb000;

    // Laser gun: rare pickup during laser boss fights, the ship fires piercing beams instead of bullets
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
    // WASD (QWERTY) and ZQSD (AZERTY) both work, like in most FPS games
    private readonly _moveKeys: Record<'up' | 'down' | 'left' | 'right', Input.Keyboard.Key[]>;
    private _playerShipData: PlayerShipData;
    private _rateOfFire: number;
    private _lastShotTime: number;
    private _lastHealth: number;
    private readonly _smoothedDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private readonly _dashDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private _dashEndTime: number = 0;
    private _nextDashTime: number = 0;
    private _invincibleUntil: number = 0;
    private _overdriveUntil: number = 0;
    private _shieldBubble: Phaser.GameObjects.Arc | null = null;
    private _deflector: Phaser.GameObjects.Rectangle;
    private _deflectorUntil: number = 0;
    private _laserGunUntil: number = 0;
    private _laserTargets: () => Entity[] = () => [];

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
                left: [...keys(KeyCodes.A, KeyCodes.Q), this._cursorKeys.left],
                right: [...keys(KeyCodes.D), this._cursorKeys.right],
            };

            this.scene.input.keyboard.addKey(KeyCodes.SHIFT).on('down', () => this.tryDash());
            this.scene.input.keyboard.addKey(KeyCodes.E).on('down', () => this.tryDash());
            const useSkill = (id: SkillId) => this.getComponent(Skills)?.tryUse(id, this.scene.time.now);
            this.scene.input.keyboard.addKey(KeyCodes.F).on('down', () => useSkill('shockwave'));
            this.scene.input.keyboard.addKey(KeyCodes.C).on('down', () => useSkill('shield'));
            this.scene.input.keyboard.addKey(KeyCodes.X).on('down', () => useSkill('overdrive'));

            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.ONE).on('down', () => this.selectPlayerShip(1));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.TWO).on('down', () => this.selectPlayerShip(2));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.THREE).on('down', () => this.selectPlayerShip(3));
        }

        // Right click dashes, so the browser menu must not open
        this.scene.input.mouse?.disableContextMenu();
        this.scene.input.on(Input.Events.POINTER_DOWN, (pointer: Input.Pointer) => {
            if (pointer.rightButtonDown())
                this.tryDash();
        });
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this.addComponent(new Health(Player.MAX_HEALTH, this));
        this.addComponent(new Movement());
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));
        this.addComponent(new Skills());
        this.addComponent(new LaserWeapon(this, () => this._laserTargets(), Player.LASER_GUN_STYLE));

        this._deflector = this.scene.add.rectangle(this.x, this.y, Player.DEFLECTOR_THICKNESS, Player.DEFLECTOR_LENGTH,
            Player.DEFLECTOR_COLOR, 0.85).setStrokeStyle(4, 0xffffff, 0.9).setVisible(false);

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
            this._laserGunUntil = 0;
            this.getComponent(LaserWeapon)?.clear();
        });

        this.getComponent(Skills)?.on(Skills.USED_EVENT, (id: SkillId) => {
            if (id === 'shield')
                this.activateShield();
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

    // What the laser gun can hit, given by the EntityManager which owns the enemy groups
    public setLaserTargets(targets: () => Entity[]) {
        this._laserTargets = targets;
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

    private tryDash() {
        const now: number = this.scene.time.now;
        if (!this.active || now < this._nextDashTime)
            return;

        if (this._smoothedDirection.length() > Player.MIN_MOVE_FOR_DASH)
            this._dashDirection.copy(this._smoothedDirection).normalize();
        else
            this._dashDirection.setToPolar(this.rotation);

        this._dashEndTime = now + Player.DASH_MS;
        this._nextDashTime = now + Player.DASH_COOLDOWN_MS;
        this.extendInvincibility(Player.DASH_MS);
    }

    private spawnDashGhost() {
        const ghost = this.scene.add.image(this.x, this.y, this.texture.key, this.frame.name)
            .setRotation(this.rotation).setAlpha(Player.DASH_GHOST_ALPHA).setTint(Player.DASH_GHOST_TINT);
        this.scene.tweens.add({
            targets: ghost,
            alpha: 0,
            duration: Player.DASH_GHOST_FADE_MS,
            onComplete: () => ghost.destroy()
        });
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
        const movement = this.getComponent(Movement);
        movement?.moveHorizontally(this, this._smoothedDirection.x * deltaTime);
        movement?.moveVertically(this, this._smoothedDirection.y * deltaTime);

        if (now < this._dashEndTime) {
            movement?.moveHorizontally(this, this._dashDirection.x * Player.DASH_SPEED_FACTOR * deltaTime);
            movement?.moveVertically(this, this._dashDirection.y * Player.DASH_SPEED_FACTOR * deltaTime);
            this.spawnDashGhost();
        }

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
        this.getComponent(LaserWeapon)?.update(deltaTime);

        // Press space or hold the left mouse button (or a finger) to shoot toward the mouse
        const isShooting: boolean = pointer.isDown && !pointer.rightButtonDown();
        const isOverdrive: boolean = now < this._overdriveUntil;
        const hasLaserGun: boolean = now < this._laserGunUntil;
        const rateOfFire: number = hasLaserGun ? Player.LASER_GUN_RATE_OF_FIRE_S
            : isOverdrive ? Player.OVERDRIVE_RATE_OF_FIRE_S : this._rateOfFire;
        if (this._cursorKeys.space.isDown || isShooting) {
            if (hasLaserGun && timeSinceLaunch - this._lastShotTime > rateOfFire * 1000) {
                this.getComponent(LaserWeapon)?.fire(this.rotation,
                    {angleOffset: 0, sweepSpeed: 0, telegraphMs: 0, activeMs: Player.LASER_GUN_BEAM_MS});
                this.scene.sound.play('sfx_laser1', {volume: Player.LASER_GUN_SOUND_VOLUME});
                this._lastShotTime = timeSinceLaunch;
            } else if (timeSinceLaunch - this._lastShotTime > rateOfFire * 1000) {
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
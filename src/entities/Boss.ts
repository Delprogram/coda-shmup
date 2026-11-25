import type {BulletData} from '../gameData/BulletData.ts';
import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import LaserWeapon from "../components/LaserWeapon.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";

// End-of-level boss: enters from the top, sways left and right and cycles through attack patterns.
// Level 1 is a bullet boss, level 2 a laser boss, then every boss mixes both. Health, attack speed and
// bullet/laser count grow with the level.

type BossPattern = 'aimedFan' | 'ring' | 'spiral' | 'aimedLaser' | 'laserFan' | 'laserSweep';
type BossType = {title: string, tint: number, patterns: BossPattern[]};
export default class Boss extends Entity {
    private static readonly BASE_HEALTH: number = 80;
    private static readonly HEALTH_PER_LEVEL: number = 50;
    private static readonly SCALE: number = 3;
    private static readonly HIT_FLASH_COLOR: number = 0xffffff;
    private static readonly HIT_FLASH_DURATION_MS: number = 50;

    private static readonly ENTRY_SPEED: number = 0.2;
    private static readonly HOVER_Y_RATIO: number = 0.28;
    private static readonly SWAY_AMPLITUDE_RATIO: number = 0.3;
    private static readonly SWAY_FREQUENCY_HZ: number = 0.12;
    private static readonly MS_PER_SECOND: number = 1000;

    private static readonly BASE_ATTACK_DELAY_MS: number = 1700;
    private static readonly ATTACK_DELAY_REDUCTION_PER_LEVEL_MS: number = 200;
    private static readonly MIN_ATTACK_DELAY_MS: number = 700;

    // Pattern 1: aimed fan toward the player
    private static readonly AIMED_BASE_COUNT: number = 5;
    private static readonly AIMED_ANGLE_DEG: number = 50;
    // Pattern 2: full ring
    private static readonly RING_BASE_COUNT: number = 16;
    private static readonly RING_COUNT_PER_LEVEL: number = 4;
    // Pattern 3: rotating spiral made of small rings
    private static readonly SPIRAL_BURSTS: number = 6;
    private static readonly SPIRAL_RING_COUNT: number = 6;
    private static readonly SPIRAL_STEP_DEG: number = 12;
    private static readonly SPIRAL_INTERVAL_MS: number = 130;
    private static readonly FULL_CIRCLE_DEG: number = 360;

    // Laser patterns
    private static readonly LASER_TELEGRAPH_MS: number = 750;
    private static readonly LASER_ACTIVE_MS: number = 500;
    private static readonly LASER_FAN_BASE_COUNT: number = 3;
    private static readonly LASER_FAN_ANGLE_DEG: number = 50;
    private static readonly LASER_SWEEP_TELEGRAPH_MS: number = 900;
    private static readonly LASER_SWEEP_ACTIVE_MS: number = 1600;
    private static readonly LASER_SWEEP_SPEED: number = 0.0013;

    private static readonly CLASSIC: BossType = {
        title: "DESTROYER", tint: 0xb44cff, patterns: ['aimedFan', 'ring', 'spiral']
    };
    private static readonly LASER: BossType = {
        title: "LASER CORE", tint: 0xff3355, patterns: ['aimedLaser', 'laserFan', 'laserSweep']
    };
    private static readonly OVERLORD: BossType = {
        title: "OVERLORD", tint: 0xffb000,
        patterns: ['aimedFan', 'aimedLaser', 'ring', 'laserSweep', 'spiral', 'laserFan']
    };

    private readonly _bulletData: BulletData = {
        width: 22,
        height: 22,
        color: 0xff9f1c,
        speed: 420,
        damage: 1,
    };

    private _target: Entity;
    private _level: number = 1;
    private _attackTimer: Phaser.Time.TimerEvent | null = null;
    private _attackIndex: number = 0;
    private _swayElapsedMs: number = 0;
    private _hoverY: number = 0;
    private _type: BossType = Boss.CLASSIC;

    public get title(): string {
        return this._type.title;
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this.addComponent(new Health(Boss.BASE_HEALTH, this));
        this.addComponent(new Movement(Boss.ENTRY_SPEED));
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));
        this.addComponent(new LaserWeapon(this, () => this._target));

        this.setScale(Boss.SCALE);
        // Radius is in unscaled frame pixels, the arcade body follows the sprite scale
        this.arcadeBody.setCircle(this.width / 2);

        // Listen once per boss, not on every enable(): the boss is pooled and reused every level
        const health = this.getComponent(Health)!;
        health.on(Health.CHANGE_EVENT, () => {
            this.setTintFill(Boss.HIT_FLASH_COLOR);
            if (health.current == 0)
                this.disableBody();

            this.scene.time.delayedCall(Boss.HIT_FLASH_DURATION_MS, () => {
                this.setTint(this._type.tint);
                if (health.current == 0)
                    this.disable();
            });
        });
    }

    public enable(level: number, target: Entity) {
        this._level = level;
        this._target = target;
        this._attackIndex = 0;
        this._swayElapsedMs = 0;
        this._type = level === 1 ? Boss.CLASSIC : level === 2 ? Boss.LASER : Boss.OVERLORD;

        const camera = this.scene.cameras.main;
        this._hoverY = camera.height * Boss.HOVER_Y_RATIO;
        this.enableBody(true, camera.centerX, -this.displayHeight, true, true);
        this.setTint(this._type.tint);

        this.getComponent(Health)?.resetMax(Boss.BASE_HEALTH + Boss.HEALTH_PER_LEVEL * (level - 1));

        const attackDelay: number = Math.max(Boss.MIN_ATTACK_DELAY_MS,
            Boss.BASE_ATTACK_DELAY_MS - Boss.ATTACK_DELAY_REDUCTION_PER_LEVEL_MS * (level - 1));
        this._attackTimer?.remove();
        this._attackTimer = this.scene.time.addEvent({
            delay: attackDelay,
            callback: this.attack,
            callbackScope: this,
            loop: true
        });
    }

    public disable() {
        this.disableBody(true, true);
        this._attackTimer?.remove();
        this._attackTimer = null;
        this.getComponent(LaserWeapon)?.clear();
    }

    private attack() {
        if (!this.active || this.y < this._hoverY)
            return;

        const patterns = this._type.patterns;
        switch (patterns[this._attackIndex % patterns.length]) {
            case 'aimedFan': this.fireAimedFan(); break;
            case 'ring': this.fireRing(); break;
            case 'spiral': this.fireSpiral(); break;
            case 'aimedLaser': this.fireAimedLaser(); break;
            case 'laserFan': this.fireLaserFan(); break;
            case 'laserSweep': this.fireLaserSweep(); break;
        }
        this._attackIndex++;
        this.scene.sound.play('sfx_laser2');
    }

    private angleToTarget(): number {
        return Phaser.Math.Angle.Between(this.x, this.y, this._target.x, this._target.y);
    }

    private fireAimedLaser() {
        this.getComponent(LaserWeapon)?.fire(this.angleToTarget(), {
            angleOffset: 0, sweepSpeed: 0, telegraphMs: Boss.LASER_TELEGRAPH_MS, activeMs: Boss.LASER_ACTIVE_MS
        });
    }

    private fireLaserFan() {
        const count: number = Boss.LASER_FAN_BASE_COUNT + this._level - 1;
        const spread: number = Phaser.Math.DegToRad(Boss.LASER_FAN_ANGLE_DEG);
        const baseAngle: number = this.angleToTarget();
        for (let i: number = 0; i < count; i++) {
            this.getComponent(LaserWeapon)?.fire(baseAngle, {
                angleOffset: -spread / 2 + spread * i / (count - 1), sweepSpeed: 0,
                telegraphMs: Boss.LASER_TELEGRAPH_MS, activeMs: Boss.LASER_ACTIVE_MS
            });
        }
    }

    // Two opposite beams that rotate, the player has to circle around the boss
    private fireLaserSweep() {
        const direction: number = Math.random() < 0.5 ? 1 : -1;
        const baseAngle: number = this.angleToTarget() + Math.PI / 2;
        for (const offset of [0, Math.PI]) {
            this.getComponent(LaserWeapon)?.fire(baseAngle, {
                angleOffset: offset, sweepSpeed: direction * Boss.LASER_SWEEP_SPEED,
                telegraphMs: Boss.LASER_SWEEP_TELEGRAPH_MS, activeMs: Boss.LASER_SWEEP_ACTIVE_MS
            });
        }
    }

    private fireAimedFan() {
        this.rotation = this.angleToTarget();
        this.getComponent(Weapon)?.shootSpread(this, Boss.AIMED_BASE_COUNT + this._level - 1, Boss.AIMED_ANGLE_DEG);
    }

    private fireRing() {
        const count: number = Boss.RING_BASE_COUNT + Boss.RING_COUNT_PER_LEVEL * (this._level - 1);
        this.getComponent(Weapon)?.shootSpread(this, count, Boss.FULL_CIRCLE_DEG);
    }

    private fireSpiral() {
        this.scene.time.addEvent({
            delay: Boss.SPIRAL_INTERVAL_MS,
            repeat: Boss.SPIRAL_BURSTS - 1,
            callback: () => {
                // The boss may die in the middle of the spiral
                if (!this.active)
                    return;

                this.angle += Boss.SPIRAL_STEP_DEG;
                this.getComponent(Weapon)?.shootSpread(this, Boss.SPIRAL_RING_COUNT, Boss.FULL_CIRCLE_DEG);
            }
        });
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);
        this.getComponent(LaserWeapon)?.update(deltaTime);

        // Enter from the top, then sway left and right around the center
        if (this.y < this._hoverY) {
            this.getComponent(Movement)?.moveVertically(this, deltaTime);
            return;
        }

        this._swayElapsedMs += deltaTime;
        const camera = this.scene.cameras.main;
        const phase: number = Phaser.Math.PI2 * Boss.SWAY_FREQUENCY_HZ * this._swayElapsedMs / Boss.MS_PER_SECOND;
        this.x = camera.centerX + camera.width * Boss.SWAY_AMPLITUDE_RATIO * Math.sin(phase);
    }
}

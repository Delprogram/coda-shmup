import type {BulletData} from '../gameData/BulletData.ts';
import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";

// End-of-level boss: enters from the top, sways left and right and cycles through 3 attack patterns.
// Health, attack speed and bullet count grow with the level.
export default class Boss extends Entity {
    private static readonly BASE_HEALTH: number = 80;
    private static readonly HEALTH_PER_LEVEL: number = 50;
    private static readonly SCALE: number = 3;
    private static readonly TINT: number = 0xb44cff;
    private static readonly HIT_FLASH_COLOR: number = 0xffffff;
    private static readonly HIT_FLASH_DURATION_MS: number = 50;

    private static readonly ENTRY_SPEED: number = 0.2;
    private static readonly HOVER_Y_RATIO: number = 0.18;
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
    private static readonly PATTERN_COUNT: number = 3;

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

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this.addComponent(new Health(Boss.BASE_HEALTH, this));
        this.addComponent(new Movement(Boss.ENTRY_SPEED));
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));

        this.setScale(Boss.SCALE);
        this.setTint(Boss.TINT);
        // Radius is in unscaled frame pixels, the arcade body follows the sprite scale
        this.arcadeBody.setCircle(this.width / 2);

        // Listen once per boss, not on every enable(): the boss is pooled and reused every level
        const health = this.getComponent(Health)!;
        health.on(Health.CHANGE_EVENT, () => {
            this.setTintFill(Boss.HIT_FLASH_COLOR);
            if (health.current == 0)
                this.disableBody();

            this.scene.time.delayedCall(Boss.HIT_FLASH_DURATION_MS, () => {
                this.setTint(Boss.TINT);
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

        const camera = this.scene.cameras.main;
        this._hoverY = camera.height * Boss.HOVER_Y_RATIO;
        this.enableBody(true, camera.centerX, -this.displayHeight, true, true);
        this.setTint(Boss.TINT);

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
    }

    private attack() {
        if (!this.active || this.y < this._hoverY)
            return;

        switch (this._attackIndex % Boss.PATTERN_COUNT) {
            case 0:
                this.fireAimedFan();
                break;
            case 1:
                this.fireRing();
                break;
            default:
                this.fireSpiral();
                break;
        }
        this._attackIndex++;
        this.scene.sound.play('sfx_laser2');
    }

    private fireAimedFan() {
        this.rotation = Phaser.Math.Angle.Between(this.x, this.y, this._target.x, this._target.y);
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

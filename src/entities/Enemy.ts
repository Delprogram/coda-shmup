import type {BulletData} from '../gameData/BulletData.ts';
import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import HealthBar from "../components/HealthBar.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";

// Kamikaze UFO: chases the player wherever it goes and speeds up the longer it lives.
// Every level makes it tougher: more health, faster, turns quicker, shoots more often with faster bullets.
export default class Enemy extends Entity {
    private static readonly SPEED: number = 0.32;
    // Max turn speed toward the target, in radians per ms: low enough to be dodged with a side step
    private static readonly HOMING_TURN_SPEED: number = 0.0018;
    // Acceleration while alive: +ACCELERATION_PER_S of its speed every second, up to MAX_ACCELERATION.
    // Turning speeds up as much, so a faster enemy can still follow the player.
    private static readonly ACCELERATION_PER_S: number = 0.25;
    private static readonly MAX_ACCELERATION: number = 2.5;
    private static readonly MS_PER_SECOND: number = 1000;
    private static readonly BULLET_SPEED: number = 512;
    private static readonly MIN_SHOOT_DELAY_MS: number = 2000;
    private static readonly MAX_SHOOT_DELAY_MS: number = 3000;

    // Per level scaling (level 1 = base values)
    private static readonly LEVELS_PER_EXTRA_HEALTH: number = 2;
    private static readonly SPEED_BONUS_PER_LEVEL: number = 0.12;
    private static readonly MAX_SPEED_MULTIPLIER: number = 2;
    private static readonly TURN_BONUS_PER_LEVEL: number = 0.15;
    private static readonly SHOOT_DELAY_REDUCTION_PER_LEVEL: number = 0.12;
    private static readonly MIN_SHOOT_DELAY_MULTIPLIER: number = 0.4;
    private static readonly BULLET_SPEED_BONUS_PER_LEVEL: number = 0.1;

    private readonly _bulletData: BulletData = {
        width: 12,
        height: 12,
        color: 0xf25f5c,
        speed: Enemy.BULLET_SPEED,
        damage: 1,
    };
    private _shootTimerConfig: Phaser.Types.Time.TimerEventConfig;
    private _shootTimer: Phaser.Time.TimerEvent;
    private _target: Entity | null = null;
    private _aliveMs: number = 0;
    private _turnSpeed: number = Enemy.HOMING_TURN_SPEED;

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this.addComponent(new Health(1, this));
        this.addComponent(new Movement(Enemy.SPEED));
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));

        // Listen once per enemy, not on every enable(): pooled enemies are reused many times
        const health = this.getComponent(Health)!;
        this.addComponent(new HealthBar(this, health));
        health.on(Health.CHANGE_EVENT, () => {
            this.setTintFill(0xffffff);

            if (health?.current == 0)
            {
                this.disableBody();
            }

            this.scene.time.delayedCall(50, () => {
                this.clearTint();

                if (health?.current == 0)
                {
                    this.disable();
                }
            });
        });

        this.angle = 90;

        this._shootTimerConfig = {
            delay: Phaser.Math.Between(Enemy.MIN_SHOOT_DELAY_MS, Enemy.MAX_SHOOT_DELAY_MS),
            callback: this.shoot,
            callbackScope: this,
            loop: true
        };
        this._shootTimer = this.scene.time.addEvent(this._shootTimerConfig);

        // Create animation when enemy is about to shoot in the global animation manager
        if (!this.scene.anims.exists('ufoShoot')) {
            this.scene.anims.create({
                key: 'ufoShoot',
                frames: [
                    {key: 'sprites', frame: 'ufoRed'},
                    {key: 'sprites', frame: 'ufoRed-shoot0'},
                    {key: 'sprites', frame: 'ufoRed-shoot1'}
                ],
                frameRate: 4,
            });
        }

        this.arcadeBody.setCircle(this.displayWidth / 2);
    }

    public enable(x: number, y: number, rotation: number, target: Entity, level: number) {
        this.enableBody(true, x, y, true, true);
        this.setRotation(rotation);
        this._target = target;
        this._aliveMs = 0;

        // Pooled enemy: every stat is set again from the current level, nothing is kept from its previous life
        const bonus: number = level - 1;
        this.getComponent(Health)?.resetMax(1 + Math.floor(bonus / Enemy.LEVELS_PER_EXTRA_HEALTH));
        this.getComponent(HealthBar)?.refresh();
        this.getComponent(Movement)?.setSpeed(
            Enemy.SPEED * Math.min(1 + bonus * Enemy.SPEED_BONUS_PER_LEVEL, Enemy.MAX_SPEED_MULTIPLIER));
        this._turnSpeed = Enemy.HOMING_TURN_SPEED * (1 + bonus * Enemy.TURN_BONUS_PER_LEVEL);
        // The Weapon keeps a reference to this object, so changing it here changes the fired bullets
        this._bulletData.speed = Enemy.BULLET_SPEED * (1 + bonus * Enemy.BULLET_SPEED_BONUS_PER_LEVEL);

        const delayMultiplier: number = Math.max(1 - bonus * Enemy.SHOOT_DELAY_REDUCTION_PER_LEVEL, Enemy.MIN_SHOOT_DELAY_MULTIPLIER);
        this._shootTimerConfig.delay = Phaser.Math.Between(Enemy.MIN_SHOOT_DELAY_MS, Enemy.MAX_SHOOT_DELAY_MS) * delayMultiplier;
        this._shootTimer.reset(this._shootTimerConfig);
    }

    public disable() {
        this.stop();
        this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);

        this.disableBody(true, true);
        this._shootTimer.paused = true;
        this.getComponent(HealthBar)?.hide();
    }

    private shoot() {
        this.play('ufoShoot');
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            this.setTexture('sprites', 'ufoRed');

            this.getComponent(Weapon)?.shoot(this);
            this.scene.sound.play('sfx_laser2');
        });
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime)

        // Recycle once it has crossed the screen (it spawns just outside, so the margin must be larger)
        if (this.isOutOfScreen(this.displayWidth * 2)) {
            this.disable();
        }

        this._aliveMs += deltaTime;
        const acceleration: number = Math.min(1 + Enemy.ACCELERATION_PER_S * this._aliveMs / Enemy.MS_PER_SECOND,
            Enemy.MAX_ACCELERATION);

        if (this._target?.active) {
            const toTarget: number = Phaser.Math.Angle.Between(this.x, this.y, this._target.x, this._target.y);
            this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, toTarget, this._turnSpeed * acceleration * deltaTime);
        }

        // Slowed down while flashing from a hit
        const hitSlowdown: number = this.isTinted ? 0.5 : 1;
        this.getComponent(Movement)?.moveForward(this, deltaTime * acceleration * hitSlowdown);
        this.getComponent(HealthBar)?.followEntity();
    }
}
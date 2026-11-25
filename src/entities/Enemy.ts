import type {BulletData} from '../gameData/BulletData.ts';
import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";

// Kamikaze UFO: charges at the player, turning toward it for a while, then keeps going straight so it can be dodged
export default class Enemy extends Entity {
    private static readonly SPEED: number = 0.32;
    // Max turn speed toward the target, in radians per ms: low enough to be dodged with a side step
    private static readonly HOMING_TURN_SPEED: number = 0.0018;
    private static readonly HOMING_MS: number = 4500;

    private readonly _bulletData: BulletData = {
        width: 12,
        height: 12,
        color: 0xf25f5c,
        speed: 512,
        damage: 1,
    };
    private _shootTimerConfig: Phaser.Types.Time.TimerEventConfig;
    private _shootTimer: Phaser.Time.TimerEvent;
    private _target: Entity | null = null;
    private _homingUntil: number = 0;

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this.addComponent(new Health(1, this));
        this.addComponent(new Movement(Enemy.SPEED));
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));

        // Listen once per enemy, not on every enable(): pooled enemies are reused many times
        const health = this.getComponent(Health);
        health?.on(Health.CHANGE_EVENT, () => {
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
            delay: Phaser.Math.Between(2000, 3000),
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

    public enable(x: number, y: number, rotation: number, target: Entity) {
        this.enableBody(true, x, y, true, true);
        this.setRotation(rotation);
        this._target = target;
        this._homingUntil = this.scene.time.now + Enemy.HOMING_MS;
        this._shootTimer.reset(this._shootTimerConfig);

        // Restore health, in case the enemy is reused from the pool, without emitting events
        const health = this.getComponent(Health);
        health?.heal(health!.max, false);
    }

    public disable() {
        this.stop();
        this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);

        this.disableBody(true, true);
        this._shootTimer.paused = true;
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

        if (this._target?.active && this.scene.time.now < this._homingUntil) {
            const toTarget: number = Phaser.Math.Angle.Between(this.x, this.y, this._target.x, this._target.y);
            this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, toTarget, Enemy.HOMING_TURN_SPEED * deltaTime);
        }

        if (!this.isTinted)
            this.getComponent(Movement)?.moveForward(this, deltaTime);
        else
            this.getComponent(Movement)?.moveForward(this, deltaTime * 0.5);
    }
}
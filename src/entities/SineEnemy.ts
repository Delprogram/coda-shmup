import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import HealthBar from "../components/HealthBar.ts";
import SineMovement from "../components/SineMovement.ts";
import Weapon from "../components/Weapon.ts";
import {SineEnemyData} from "../gameData/SineEnemyData.ts";

export default class SineEnemy extends Entity {
    public static readonly DATA_KEY: string = 'sineEnemy';
    private static readonly HIT_FLASH_COLOR: number = 0xffffff;
    private static readonly HIT_FLASH_DURATION_MS: number = 50;
    private static readonly FACING_DOWN_ANGLE: number = 90;

    private _data: SineEnemyData;
    private _shootTimerConfig: Phaser.Types.Time.TimerEventConfig;
    private _shootTimer: Phaser.Time.TimerEvent;
    // Every level adds health and one bullet to the spread shot, on top of the JSON values
    private static readonly HEALTH_PER_LEVEL: number = 1;
    private static readonly BULLETS_PER_LEVEL: number = 1;
    private _level: number = 1;
    // Chases the player and speeds up the longer it lives, like the red UFO
    private static readonly TURN_SPEED: number = 0.0012;
    private static readonly ACCELERATION_PER_S: number = 0.2;
    private static readonly MAX_ACCELERATION: number = 2.5;
    private static readonly MS_PER_SECOND: number = 1000;
    private _target: Entity | null = null;
    private _aliveMs: number = 0;

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this._data = this.scene.cache.json.get(SineEnemy.DATA_KEY) as SineEnemyData;

        this.addComponent(new Health(this._data.health, this));
        this.addComponent(new SineMovement(this._data.movement));
        this.addComponent(new Weapon(bulletsGroup, this._data.spreadShot.bullet));

        // Listen once per enemy, not on every enable(): pooled enemies are reused many times
        const health = this.getComponent(Health)!;
        this.addComponent(new HealthBar(this, health));
        health.on(Health.CHANGE_EVENT, () => {
            this.setTintFill(SineEnemy.HIT_FLASH_COLOR);

            if (health.current == 0) {
                this.disableBody();
            }

            this.scene.time.delayedCall(SineEnemy.HIT_FLASH_DURATION_MS, () => {
                this.setTint(this._data.visual.tint);

                if (health.current == 0) {
                    this.disable();
                }
            });
        });

        this.angle = SineEnemy.FACING_DOWN_ANGLE;
        this.setScale(this._data.visual.scale);
        this.setTint(this._data.visual.tint);
        // Radius is in unscaled frame pixels, the arcade body follows the sprite scale
        this.arcadeBody.setCircle(this.width / 2);

        this._shootTimerConfig = {
            delay: this._data.spreadShot.delay,
            callback: this.shoot,
            callbackScope: this,
            loop: true
        };
        this._shootTimer = this.scene.time.addEvent(this._shootTimerConfig);
    }

    public enable(x: number, y: number, rotation: number, level: number, target: Entity) {
        this._level = level;
        this._target = target;
        this._aliveMs = 0;
        this.enableBody(true, x, y, true, true);
        this.setRotation(rotation);
        this.setTint(this._data.visual.tint);
        this._shootTimer.reset(this._shootTimerConfig);
        this.getComponent(SineMovement)?.reset(x, y, rotation);

        // Pooled enemy: health is set again from the JSON value and the current level, without emitting events
        this.getComponent(Health)?.resetMax(this._data.health + SineEnemy.HEALTH_PER_LEVEL * (level - 1));
        this.getComponent(HealthBar)?.refresh();
    }

    public disable() {
        this.disableBody(true, true);
        this._shootTimer.paused = true;
        this.getComponent(HealthBar)?.hide();
    }

    private shoot() {
        const spreadShot = this._data.spreadShot;
        const count: number = spreadShot.count + SineEnemy.BULLETS_PER_LEVEL * (this._level - 1);
        this.getComponent(Weapon)?.shootSpread(this, count, spreadShot.angle);
        this.scene.sound.play('sfx_laser2');
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        // Recycle once it has crossed the screen; the wave amplitude can push it further out
        if (this.isOutOfScreen(this._data.movement.amplitude + this.displayWidth * 2)) {
            this.disable();
        }

        this._aliveMs += deltaTime;
        const acceleration: number = Math.min(1 + SineEnemy.ACCELERATION_PER_S * this._aliveMs / SineEnemy.MS_PER_SECOND,
            SineEnemy.MAX_ACCELERATION);
        const movement = this.getComponent(SineMovement);
        movement?.move(this, deltaTime, acceleration, this._target, SineEnemy.TURN_SPEED * acceleration);
        if (movement)
            this.rotation = movement.rotation;
        this.getComponent(HealthBar)?.followEntity();
    }
}

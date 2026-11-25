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

    public enable(x: number, y: number) {
        this.enableBody(true, x, y - this.displayHeight, true, true);
        this.setTint(this._data.visual.tint);
        this._shootTimer.reset(this._shootTimerConfig);
        this.getComponent(SineMovement)?.reset(x);

        // Restore health, in case the enemy is reused from the pool, without emitting events
        const health = this.getComponent(Health);
        health?.heal(health.max, false);
        this.getComponent(HealthBar)?.refresh();
    }

    public disable() {
        this.disableBody(true, true);
        this._shootTimer.paused = true;
        this.getComponent(HealthBar)?.hide();
    }

    private shoot() {
        const spreadShot = this._data.spreadShot;
        this.getComponent(Weapon)?.shootSpread(this, spreadShot.count, spreadShot.angle);
        this.scene.sound.play('sfx_laser2');
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        // Recycle when out of screen
        if (this.y > this.scene.cameras.main.height + this.displayHeight) {
            this.disable();
        }

        this.getComponent(SineMovement)?.move(this, deltaTime);
        this.getComponent(HealthBar)?.followEntity();
    }
}

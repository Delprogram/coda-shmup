import Entity from './Entity.ts';
import Movement from "../components/Movement.ts";

// Dropped by destroyed enemies: falls down and heals the player on contact
export default class HealthPickup extends Entity {
    public static readonly HEAL_AMOUNT: number = 2;
    private static readonly FALL_SPEED: number = 0.25;
    private static readonly TINT: number = 0x5bd75b;
    private static readonly BASE_SCALE: number = 2;
    private static readonly PULSE_SCALE: number = 2.5;
    private static readonly PULSE_MS: number = 350;

    private _pulse: Phaser.Tweens.Tween;

    public init() {
        this.addComponent(new Movement(HealthPickup.FALL_SPEED));
        this.setTint(HealthPickup.TINT);
        this.arcadeBody.setCircle(this.width / 2);

        this._pulse = this.scene.tweens.add({
            targets: this,
            scale: {from: HealthPickup.BASE_SCALE, to: HealthPickup.PULSE_SCALE},
            duration: HealthPickup.PULSE_MS,
            yoyo: true,
            repeat: -1,
            paused: true
        });
    }

    public enable(x: number, y: number) {
        this.enableBody(true, x, y, true, true);
        this.setScale(HealthPickup.BASE_SCALE);
        this._pulse.restart();
    }

    public disable() {
        this._pulse.pause();
        this.disableBody(true, true);
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        this.getComponent(Movement)?.moveVertically(this, deltaTime);
        if (this.y > this.scene.cameras.main.height + this.displayHeight) {
            this.disable();
        }
    }
}

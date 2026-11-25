import Entity from './Entity.ts';
import Movement from "../components/Movement.ts";

export type PickupKind = 'health' | 'laserShield';

type PickupStyle = {
    frame: string;
    tint: number;
    fallSpeed: number;
    // 0 = stays until it leaves the screen or is picked up
    lifetimeMs: number;
};

// Item the player picks up on contact: health (dropped by enemies) or a laser shield (appears during laser boss fights)
export default class Pickup extends Entity {
    public static readonly HEAL_AMOUNT: number = 2;
    private static readonly BASE_SCALE: number = 2;
    private static readonly PULSE_SCALE: number = 2.5;
    private static readonly PULSE_MS: number = 350;
    // Blink during the last part of its life to warn that it is about to vanish
    private static readonly EXPIRE_WARNING_MS: number = 2000;
    private static readonly BLINK_MS: number = 120;

    private static readonly STYLES: Record<PickupKind, PickupStyle> = {
        health: {frame: 'playerLife1_blue', tint: 0x5bd75b, fallSpeed: 0.25, lifetimeMs: 0},
        laserShield: {frame: 'star2', tint: 0x66ccff, fallSpeed: 0, lifetimeMs: 9000},
    };

    private _pulse: Phaser.Tweens.Tween;
    private _kind: PickupKind = 'health';
    private _expireTime: number = 0;

    public get kind(): PickupKind {
        return this._kind;
    }

    public init() {
        this.addComponent(new Movement());

        this._pulse = this.scene.tweens.add({
            targets: this,
            scale: {from: Pickup.BASE_SCALE, to: Pickup.PULSE_SCALE},
            duration: Pickup.PULSE_MS,
            yoyo: true,
            repeat: -1,
            paused: true
        });
    }

    public enable(x: number, y: number, kind: PickupKind) {
        const style = Pickup.STYLES[kind];
        this._kind = kind;
        this._expireTime = style.lifetimeMs > 0 ? this.scene.time.now + style.lifetimeMs : 0;

        this.setTexture('sprites', style.frame).setTint(style.tint).setAlpha(1);
        this.arcadeBody.setCircle(this.width / 2);
        this.getComponent(Movement)?.setSpeed(style.fallSpeed);

        this.enableBody(true, x, y, true, true);
        this.setScale(Pickup.BASE_SCALE);
        this._pulse.restart();
    }

    public disable() {
        this._pulse.pause();
        this.disableBody(true, true);
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        this.getComponent(Movement)?.moveVertically(this, deltaTime);
        if (this.isOutOfScreen(this.displayHeight)) {
            this.disable();
            return;
        }

        if (this._expireTime === 0)
            return;

        const remainingMs: number = this._expireTime - this.scene.time.now;
        if (remainingMs <= 0)
            this.disable();
        else if (remainingMs < Pickup.EXPIRE_WARNING_MS)
            this.setAlpha(Math.floor(remainingMs / Pickup.BLINK_MS) % 2 === 0 ? 1 : 0.3);
    }
}

import Entity from "../entities/Entity.ts";
import IComponent from "./IComponent.ts";

export default class Movement implements IComponent {
    public enabled: boolean = true;

    private _speed: number = 0;

    public constructor(speed?: number) {
        if (speed) {
            this._speed = speed;
        }
    }

    public setSpeed(speed: number) {
        this._speed = speed;
    }

    public moveHorizontally(entity: Entity, deltaTime: number) {
        if (!this.enabled)
            return;

        entity.x += this._speed * deltaTime;
    }

    // Move straight toward a target without overshooting it
    public moveTowards(entity: Entity, targetX: number, targetY: number, deltaTime: number) {
        if (!this.enabled)
            return;

        const distance: number = Phaser.Math.Distance.Between(entity.x, entity.y, targetX, targetY);
        const step: number = Math.min(distance, this._speed * deltaTime);
        if (step <= 0)
            return;

        const angle: number = Phaser.Math.Angle.Between(entity.x, entity.y, targetX, targetY);
        entity.x += Math.cos(angle) * step;
        entity.y += Math.sin(angle) * step;
    }

    public moveVertically(entity: Entity, deltaTime: number) {
        if (!this.enabled)
            return;

        entity.y += this._speed * deltaTime;
    }
}
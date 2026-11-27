import Entity from "../entities/Entity.ts";
import IComponent from "./IComponent.ts";
import {SineMovementData} from "../gameData/SineEnemyData.ts";

export default class SineMovement implements IComponent {
    private static readonly MS_PER_SECOND: number = 1000;

    public enabled: boolean = true;

    private readonly _data: SineMovementData;
    // Center line of the wave: it moves forward and can steer toward a target, the entity oscillates around it
    private readonly _center: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private _rotation: number = 0;
    private _elapsedMs: number = 0;

    // Travel direction, the entity faces it so its weapon shoots forward
    public get rotation(): number {
        return this._rotation;
    }

    public constructor(data: SineMovementData) {
        this._data = data;
    }

    // Must be called when a pooled entity is reused, so the wave restarts from its new spawn position and direction
    public reset(x: number, y: number, rotation: number) {
        this._center.set(x, y);
        this._rotation = rotation;
        this._elapsedMs = 0;
    }

    // Push the wave center (e.g. pulled by a black hole): the entity follows on the next move()
    public offsetCenter(dx: number, dy: number) {
        this._center.x += dx;
        this._center.y += dy;
    }

    // speedMultiplier scales the JSON speed; with a target, the wave turns toward it by at most turnSpeed rad/ms
    public move(entity: Entity, deltaTime: number, speedMultiplier: number = 1,
                target: Entity | null = null, turnSpeed: number = 0) {
        if (!this.enabled)
            return;

        this._elapsedMs += deltaTime;
        const phase: number = Phaser.Math.PI2 * this._data.frequency * this._elapsedMs / SineMovement.MS_PER_SECOND;

        if (target?.active) {
            const toTarget: number = Phaser.Math.Angle.Between(this._center.x, this._center.y, target.x, target.y);
            this._rotation = Phaser.Math.Angle.RotateTo(this._rotation, toTarget, turnSpeed * deltaTime);
        }

        // Move the center forward, then oscillate perpendicular to the travel direction
        const forwardX: number = Math.cos(this._rotation);
        const forwardY: number = Math.sin(this._rotation);
        const distance: number = this._data.speed * speedMultiplier * deltaTime;
        this._center.x += forwardX * distance;
        this._center.y += forwardY * distance;

        const offset: number = this._data.amplitude * Math.sin(phase);
        entity.x = this._center.x - forwardY * offset;
        entity.y = this._center.y + forwardX * offset;
    }
}

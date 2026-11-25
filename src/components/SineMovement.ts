import Entity from "../entities/Entity.ts";
import IComponent from "./IComponent.ts";
import {SineMovementData} from "../gameData/SineEnemyData.ts";

export default class SineMovement implements IComponent {
    private static readonly MS_PER_SECOND: number = 1000;

    public enabled: boolean = true;

    private readonly _data: SineMovementData;
    private readonly _origin: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private _rotation: number = 0;
    private _elapsedMs: number = 0;

    public constructor(data: SineMovementData) {
        this._data = data;
    }

    // Must be called when a pooled entity is reused, so the wave restarts from its new spawn position and direction
    public reset(x: number, y: number, rotation: number) {
        this._origin.set(x, y);
        this._rotation = rotation;
        this._elapsedMs = 0;
    }

    public move(entity: Entity, deltaTime: number) {
        if (!this.enabled)
            return;

        this._elapsedMs += deltaTime;
        const phase: number = Phaser.Math.PI2 * this._data.frequency * this._elapsedMs / SineMovement.MS_PER_SECOND;

        // Travel along the spawn direction, oscillating perpendicular to it
        const distance: number = this._data.speed * this._elapsedMs;
        const offset: number = this._data.amplitude * Math.sin(phase);
        const forwardX: number = Math.cos(this._rotation);
        const forwardY: number = Math.sin(this._rotation);
        entity.x = this._origin.x + forwardX * distance - forwardY * offset;
        entity.y = this._origin.y + forwardY * distance + forwardX * offset;
    }
}

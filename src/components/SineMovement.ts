import Entity from "../entities/Entity.ts";
import IComponent from "./IComponent.ts";
import {SineMovementData} from "../gameData/SineEnemyData.ts";

export default class SineMovement implements IComponent {
    private static readonly MS_PER_SECOND: number = 1000;

    public enabled: boolean = true;

    private readonly _data: SineMovementData;
    private _baseX: number = 0;
    private _elapsedMs: number = 0;

    public constructor(data: SineMovementData) {
        this._data = data;
    }

    // Must be called when a pooled entity is reused, so the wave restarts from its new spawn position
    public reset(baseX: number) {
        this._baseX = baseX;
        this._elapsedMs = 0;
    }

    public move(entity: Entity, deltaTime: number) {
        if (!this.enabled)
            return;

        this._elapsedMs += deltaTime;
        const phase: number = Phaser.Math.PI2 * this._data.frequency * this._elapsedMs / SineMovement.MS_PER_SECOND;

        entity.y += this._data.speed * deltaTime;
        entity.x = this._baseX + this._data.amplitude * Math.sin(phase);
    }
}

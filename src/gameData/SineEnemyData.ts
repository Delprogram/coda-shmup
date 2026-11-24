import {BulletData} from "./BulletData.ts";

export type SineEnemyData = {
    health: number;
    spawn: SpawnData;
    movement: SineMovementData;
    spreadShot: SpreadShotData;
    visual: EnemyVisualData;
}

export type SpawnData = {
    delay: number;
    maxActive: number;
}

export type SineMovementData = {
    speed: number;
    amplitude: number;
    frequency: number;
}

export type SpreadShotData = {
    count: number;
    angle: number;
    delay: number;
    bullet: BulletData;
}

export type EnemyVisualData = {
    tint: number;
    scale: number;
}

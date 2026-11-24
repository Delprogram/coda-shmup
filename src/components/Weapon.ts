import {Physics} from 'phaser';
import {BulletData} from "../gameData/BulletData.ts";
import Bullet from "../entities/Bullet.ts";
import Entity from "../entities/Entity.ts";
import IComponent from "./IComponent.ts";

export default class Weapon implements IComponent {
    public enabled: boolean = true;

    private static readonly FULL_CIRCLE_DEG: number = 360;

    private readonly _bullets: Physics.Arcade.Group;
    private readonly _bulletData: BulletData;

    constructor(bullets: Physics.Arcade.Group, bulletData: BulletData) {
        if (!bullets) {
            console.error("Weapon 'bullets' group cannot be null or undefined");
        }

        this._bullets = bullets;
        this._bulletData = bulletData;
    }

    public shoot(source: Entity) {
        if (!this.enabled)
            return;

        this.shootAt(source, source.rotation);
    }

    // Fire `count` bullets fanned over `angleDeg` degrees, centered on the source forward direction
    public shootSpread(source: Entity, count: number, angleDeg: number) {
        if (!this.enabled || count <= 0)
            return;

        if (count === 1) {
            this.shootAt(source, source.rotation);
            return;
        }

        const spread: number = Phaser.Math.DegToRad(Math.min(angleDeg, Weapon.FULL_CIRCLE_DEG));
        // On a full circle, first and last bullets would overlap: split into `count` gaps instead of `count - 1`
        const gaps: number = angleDeg >= Weapon.FULL_CIRCLE_DEG ? count : count - 1;
        const step: number = spread / gaps;
        const startRotation: number = source.rotation - spread / 2;

        for (let i: number = 0; i < count; i++) {
            this.shootAt(source, startRotation + step * i);
        }
    }

    private shootAt(source: Entity, rotation: number) {
        if (!this._bullets)
            return;

        const bullet: Bullet = this._bullets.get() as Bullet;
        if (bullet) {
            // Get forward vector of the source entity
            const sourceForward: Phaser.Math.Vector2 = new Phaser.Math.Vector2(1, 0).rotate(rotation);
            const bulletVelocity: Phaser.Math.Vector2 = sourceForward.clone().scale(this._bulletData.speed);
            bullet.enable(source.x + sourceForward.x * source.arcadeBody.radius, source.y + sourceForward.y * source.arcadeBody.radius,
                bulletVelocity.x, bulletVelocity.y, this._bulletData);

            // Maths way
            // const forwardVectorX: number = Math.cos(source.rotation);
            // const forwardVectorY: number = Math.sin(source.rotation);
            // const bulletVelocityX: number = forwardVectorX * this._bulletData.speed;
            // const bulletVelocityY: number = forwardVectorY * this._bulletData.speed;
            // bullet.enable(source.x + forwardVectorX * source.arcadeBody.radius, source.y + forwardVectorY * source.arcadeBody.radius,
            //     bulletVelocityX, bulletVelocityY, this._bulletData);
        }
    }
}
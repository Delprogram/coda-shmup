import {GameObjects} from "phaser";
import Entity from "../entities/Entity.ts";
import Health from "./Health.ts";
import IComponent from "./IComponent.ts";

export type LaserConfig = {
    // Angle offset from the aimed direction, in radians
    angleOffset: number;
    // Rotation speed while the beam is active, in radians per ms (0 = fixed beam)
    sweepSpeed: number;
    telegraphMs: number;
    activeMs: number;
};

type Laser = LaserConfig & {
    angle: number;
    elapsedMs: number;
    graphics: GameObjects.Graphics;
};

// Telegraphed laser beams: a thin warning line first, then a wide beam that hurts the target while it touches it.
// Beams start from the owner and follow it while it moves.
export default class LaserWeapon implements IComponent {
    private static readonly LENGTH: number = 3000;
    private static readonly TELEGRAPH_WIDTH: number = 4;
    private static readonly BEAM_WIDTH: number = 46;
    private static readonly CORE_WIDTH: number = 16;
    private static readonly TELEGRAPH_COLOR: number = 0xff3355;
    private static readonly BEAM_COLOR: number = 0xff3355;
    private static readonly CORE_COLOR: number = 0xffffff;
    private static readonly TELEGRAPH_BLINK_MS: number = 80;
    private static readonly DEPTH: number = 5;
    private static readonly DAMAGE: number = 2;

    public enabled: boolean = true;

    private readonly _owner: Entity;
    private readonly _target: () => Entity;
    private _lasers: Laser[] = [];

    public constructor(owner: Entity, target: () => Entity) {
        this._owner = owner;
        this._target = target;
    }

    public fire(baseAngle: number, config: LaserConfig) {
        if (!this.enabled)
            return;

        this._lasers.push({
            ...config,
            angle: baseAngle + config.angleOffset,
            elapsedMs: 0,
            graphics: this._owner.scene.add.graphics().setDepth(LaserWeapon.DEPTH),
        });
    }

    public clear() {
        this._lasers.forEach(laser => laser.graphics.destroy());
        this._lasers = [];
    }

    public update(deltaTime: number) {
        for (const laser of this._lasers) {
            laser.elapsedMs += deltaTime;
            const isActive: boolean = laser.elapsedMs >= laser.telegraphMs;
            if (isActive)
                laser.angle += laser.sweepSpeed * deltaTime;

            this.draw(laser, isActive);
            if (isActive)
                this.hitTarget(laser);
        }

        const finished = this._lasers.filter(laser => laser.elapsedMs >= laser.telegraphMs + laser.activeMs);
        finished.forEach(laser => laser.graphics.destroy());
        this._lasers = this._lasers.filter(laser => !finished.includes(laser));
    }

    private endPoint(laser: Laser): Phaser.Math.Vector2 {
        return new Phaser.Math.Vector2().setToPolar(laser.angle, LaserWeapon.LENGTH).add(this._owner);
    }

    private draw(laser: Laser, isActive: boolean) {
        const end = this.endPoint(laser);
        const g = laser.graphics.clear();

        if (!isActive) {
            // Blink to warn the player before the beam fires
            const visible: boolean = Math.floor(laser.elapsedMs / LaserWeapon.TELEGRAPH_BLINK_MS) % 2 === 0;
            g.lineStyle(LaserWeapon.TELEGRAPH_WIDTH, LaserWeapon.TELEGRAPH_COLOR, visible ? 0.9 : 0.3);
            g.lineBetween(this._owner.x, this._owner.y, end.x, end.y);
            return;
        }

        g.lineStyle(LaserWeapon.BEAM_WIDTH, LaserWeapon.BEAM_COLOR, 0.6);
        g.lineBetween(this._owner.x, this._owner.y, end.x, end.y);
        g.lineStyle(LaserWeapon.CORE_WIDTH, LaserWeapon.CORE_COLOR, 0.95);
        g.lineBetween(this._owner.x, this._owner.y, end.x, end.y);
    }

    private hitTarget(laser: Laser) {
        const target = this._target();
        // A disabled body means the target is invincible (hit, dash or shield) or dead
        if (!target.active || !target.arcadeBody.enable)
            return;

        // Distance from the target to the beam segment (projection clamped to the segment, so nothing behind the owner)
        const start = new Phaser.Math.Vector2(this._owner.x, this._owner.y);
        const direction = this.endPoint(laser).subtract(start);
        const t: number = Phaser.Math.Clamp(
            new Phaser.Math.Vector2(target.x, target.y).subtract(start).dot(direction) / direction.lengthSq(), 0, 1);
        const distance: number = start.add(direction.scale(t)).distance(target);
        if (distance <= LaserWeapon.BEAM_WIDTH / 2 + target.arcadeBody.halfWidth)
            target.getComponent(Health)?.damage(LaserWeapon.DAMAGE);
    }
}

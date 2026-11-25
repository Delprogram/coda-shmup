import {GameObjects} from "phaser";
import Entity from "../entities/Entity.ts";
import Health from "./Health.ts";
import IComponent from "./IComponent.ts";

export type LaserConfig = {
    // Angle offset from the aimed direction, in radians
    angleOffset: number;
    // Rotation speed while the beam is active, in radians per ms (0 = fixed beam)
    sweepSpeed: number;
    // 0 = no warning line, the beam fires at once
    telegraphMs: number;
    activeMs: number;
};

// Look and damage of every beam fired by one LaserWeapon
export type LaserStyle = {
    color: number;
    beamWidth: number;
    coreWidth: number;
    damage: number;
};

// A target can hold something that stops beams (e.g. the player's deflector shield)
export interface LaserBlocker {
    laserBlocker(): Phaser.Geom.Line | null;
}

type LaserTarget = Entity & Partial<LaserBlocker>;

type Laser = LaserConfig & {
    angle: number;
    elapsedMs: number;
    graphics: GameObjects.Graphics;
    // Each beam damages a given target only once
    hitTargets: Set<Entity>;
};

// Laser beams, optionally telegraphed by a blinking warning line. A beam starts from the owner, follows it while it
// moves and damages every target it crosses, unless a target's blocker stops it first.
export default class LaserWeapon implements IComponent {
    private static readonly LENGTH: number = 3500;
    private static readonly TELEGRAPH_WIDTH: number = 4;
    private static readonly CORE_COLOR: number = 0xffffff;
    private static readonly TELEGRAPH_BLINK_MS: number = 80;
    private static readonly DEPTH: number = 5;
    private static readonly SPARK_RADIUS: number = 34;
    private static readonly SPARK_COLOR: number = 0x66ccff;

    public enabled: boolean = true;

    private readonly _owner: Entity;
    private readonly _targets: () => LaserTarget[];
    private readonly _style: LaserStyle;
    private _lasers: Laser[] = [];

    public constructor(owner: Entity, targets: () => LaserTarget[], style: LaserStyle) {
        this._owner = owner;
        this._targets = targets;
        this._style = style;
    }

    public fire(baseAngle: number, config: LaserConfig) {
        if (!this.enabled)
            return;

        this._lasers.push({
            ...config,
            angle: baseAngle + config.angleOffset,
            elapsedMs: 0,
            graphics: this._owner.scene.add.graphics().setDepth(LaserWeapon.DEPTH),
            hitTargets: new Set(),
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

            const end = this.beamEnd(laser, isActive);
            this.draw(laser, isActive, end);
            if (isActive)
                this.hitTargets(laser, end.point);
        }

        const finished = this._lasers.filter(laser => laser.elapsedMs >= laser.telegraphMs + laser.activeMs);
        finished.forEach(laser => laser.graphics.destroy());
        this._lasers = this._lasers.filter(laser => !finished.includes(laser));
    }

    // Where the beam stops: its full length, or the closest point where it hits a target's blocker
    private beamEnd(laser: Laser, isActive: boolean): {point: Phaser.Math.Vector2, blocked: boolean} {
        const start = new Phaser.Math.Vector2(this._owner.x, this._owner.y);
        const fullEnd = new Phaser.Math.Vector2().setToPolar(laser.angle, LaserWeapon.LENGTH).add(start);
        if (!isActive)
            return {point: fullEnd, blocked: false};

        let closest: Phaser.Math.Vector2 | null = null;
        for (const target of this._targets()) {
            const blocker = target.laserBlocker?.();
            const hit = blocker && LaserWeapon.segmentIntersection(start, fullEnd, blocker.getPointA(), blocker.getPointB());
            if (hit && (!closest || hit.distance(start) < closest.distance(start)))
                closest = hit;
        }
        return closest ? {point: closest, blocked: true} : {point: fullEnd, blocked: false};
    }

    public static segmentIntersection(p1: Phaser.Math.Vector2, p2: Phaser.Math.Vector2,
                                      q1: Phaser.Math.Vector2, q2: Phaser.Math.Vector2): Phaser.Math.Vector2 | null {
        const r = p2.clone().subtract(p1);
        const s = q2.clone().subtract(q1);
        const denominator: number = r.cross(s);
        if (Math.abs(denominator) < Number.EPSILON)
            return null;

        const qp = q1.clone().subtract(p1);
        const t: number = qp.cross(s) / denominator;
        const u: number = qp.cross(r) / denominator;
        if (t < 0 || t > 1 || u < 0 || u > 1)
            return null;

        return p1.clone().add(r.scale(t));
    }

    private draw(laser: Laser, isActive: boolean, beamEnd: {point: Phaser.Math.Vector2, blocked: boolean}) {
        const end = beamEnd.point;
        const g = laser.graphics.clear();

        if (!isActive) {
            // Blink to warn before the beam fires
            const visible: boolean = Math.floor(laser.elapsedMs / LaserWeapon.TELEGRAPH_BLINK_MS) % 2 === 0;
            g.lineStyle(LaserWeapon.TELEGRAPH_WIDTH, this._style.color, visible ? 0.9 : 0.3);
            g.lineBetween(this._owner.x, this._owner.y, end.x, end.y);
            return;
        }

        g.lineStyle(this._style.beamWidth, this._style.color, 0.6);
        g.lineBetween(this._owner.x, this._owner.y, end.x, end.y);
        g.lineStyle(this._style.coreWidth, LaserWeapon.CORE_COLOR, 0.95);
        g.lineBetween(this._owner.x, this._owner.y, end.x, end.y);

        if (beamEnd.blocked) {
            g.fillStyle(LaserWeapon.SPARK_COLOR, 0.8);
            g.fillCircle(end.x, end.y, LaserWeapon.SPARK_RADIUS * Phaser.Math.FloatBetween(0.7, 1.2));
        }
    }

    private hitTargets(laser: Laser, end: Phaser.Math.Vector2) {
        const start = new Phaser.Math.Vector2(this._owner.x, this._owner.y);
        const direction = end.clone().subtract(start);

        for (const target of this._targets()) {
            // A disabled body means the target is invincible (hit or shield) or dead
            if (!target.active || !target.arcadeBody.enable || laser.hitTargets.has(target))
                continue;

            // Distance from the target to the beam segment (projection clamped to the segment, so nothing behind the owner)
            const t: number = Phaser.Math.Clamp(
                new Phaser.Math.Vector2(target.x, target.y).subtract(start).dot(direction) / direction.lengthSq(), 0, 1);
            const distance: number = start.clone().add(direction.clone().scale(t)).distance(target);
            if (distance <= this._style.beamWidth / 2 + target.arcadeBody.halfWidth) {
                laser.hitTargets.add(target);
                target.getComponent(Health)?.damage(this._style.damage);
            }
        }
    }
}

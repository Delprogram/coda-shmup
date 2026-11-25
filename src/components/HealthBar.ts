import {GameObjects} from "phaser";
import Entity from "../entities/Entity.ts";
import Health from "./Health.ts";
import IComponent from "./IComponent.ts";

// Small bar drawn above an entity, only visible once it has been damaged
export default class HealthBar implements IComponent {
    private static readonly WIDTH: number = 90;
    private static readonly HEIGHT: number = 12;
    private static readonly MARGIN_Y: number = 14;
    private static readonly DEPTH: number = 10;
    private static readonly HIGH_HEALTH_RATIO: number = 0.6;
    private static readonly LOW_HEALTH_RATIO: number = 0.3;

    public enabled: boolean = true;

    private readonly _entity: Entity;
    private readonly _health: Health;
    private readonly _background: GameObjects.Rectangle;
    private readonly _fill: GameObjects.Rectangle;

    public static colorFor(ratio: number): number {
        if (ratio > HealthBar.HIGH_HEALTH_RATIO)
            return 0x5bd75b;
        if (ratio > HealthBar.LOW_HEALTH_RATIO)
            return 0xf2c14e;
        return 0xf25f5c;
    }

    public constructor(entity: Entity, health: Health) {
        this._entity = entity;
        this._health = health;

        const scene = entity.scene;
        this._background = scene.add.rectangle(0, 0, HealthBar.WIDTH, HealthBar.HEIGHT, 0x000000, 0.6)
            .setOrigin(0, 0.5).setDepth(HealthBar.DEPTH);
        this._fill = scene.add.rectangle(0, 0, HealthBar.WIDTH, HealthBar.HEIGHT, HealthBar.colorFor(1))
            .setOrigin(0, 0.5).setDepth(HealthBar.DEPTH);

        health.on(Health.CHANGE_EVENT, this.refresh, this);
        this.refresh();
    }

    // Call after the health was changed without events (e.g. when a pooled entity is reused)
    public refresh() {
        const ratio: number = this._health.current / this._health.max;
        this._fill.setScale(ratio, 1).setFillStyle(HealthBar.colorFor(ratio));

        const visible: boolean = this.enabled && this._entity.active && ratio > 0 && ratio < 1;
        this._background.setVisible(visible);
        this._fill.setVisible(visible);
    }

    public followEntity() {
        const x: number = this._entity.x - HealthBar.WIDTH / 2;
        const y: number = this._entity.y - this._entity.displayHeight / 2 - HealthBar.MARGIN_Y;
        this._background.setPosition(x, y);
        this._fill.setPosition(x, y);
    }

    public hide() {
        this._background.setVisible(false);
        this._fill.setVisible(false);
    }
}

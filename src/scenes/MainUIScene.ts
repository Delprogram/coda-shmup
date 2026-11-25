import {GameObjects, Scenes, Scene} from "phaser";
import Health from "../components/Health.ts";
import HealthBar from "../components/HealthBar.ts";
import Player from "../entities/Player.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class MainUIScene extends Scene {
    private static readonly HEALTH_BAR_WIDTH: number = 360;
    private static readonly HEALTH_BAR_HEIGHT: number = 40;
    private static readonly HEALTH_BAR_TWEEN_MS: number = 200;

    private _healthBarFill: GameObjects.Rectangle;
    private _healthBarText: GameObjects.Text;
    private _scoreText: GameObjects.BitmapText;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_UI);
    }

    // noinspection JSUnusedGlobalSymbols
    init() {
        this.game.events.on(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
            this.registry.events.off(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);
        }, this);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        const playerHealthIcon = this.add.image(64, 64, "sprites", "playerLife1_blue")
            .setOrigin(0, 0).setScale(1.5);
        const barX: number = playerHealthIcon.x + playerHealthIcon.displayWidth + 24;
        const barY: number = playerHealthIcon.y + playerHealthIcon.displayHeight / 2;
        this.add.rectangle(barX, barY, MainUIScene.HEALTH_BAR_WIDTH, MainUIScene.HEALTH_BAR_HEIGHT, 0x000000, 0.6)
            .setOrigin(0, 0.5).setStrokeStyle(4, 0xffffff, 0.8);
        this._healthBarFill = this.add.rectangle(barX, barY, MainUIScene.HEALTH_BAR_WIDTH, MainUIScene.HEALTH_BAR_HEIGHT,
            HealthBar.colorFor(1)).setOrigin(0, 0.5);
        this._healthBarText = this.add.text(barX + MainUIScene.HEALTH_BAR_WIDTH / 2, barY, "",
            {fontSize: '28px', color: '#fff', fontFamily: 'future'}).setOrigin(0.5);

        let scoreStr: string = "".padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        if (this.registry.has(RegistryConstants.Keys.PLAYER_SCORE))
            scoreStr = this.registry.get(RegistryConstants.Keys.PLAYER_SCORE).toString()
                .padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText = this.add.bitmapText(this.scale.width - 64, 64, "future-bmp", scoreStr, 128)
            .setOrigin(1, 0);

        this.scene.bringToTop();

        console.log("MainUIScene created");
    }

    private onPlayerScoreChanged(_: any, value: number) {
        const scoreStr: string = value.toString().padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText.setText(scoreStr);
    }

    private onPlayerSpawned(player: Player) {
        const health = player.getComponent(Health);
        if (!health)
            return;

        this.updateHealthBar(health.current, health.max, false);
        health.on(Health.CHANGE_EVENT, (current: number) => this.updateHealthBar(current, health.max, true), this);
    }

    private updateHealthBar(current: number, max: number, animate: boolean) {
        const ratio: number = current / max;

        this._healthBarText.setText(current + " / " + max);
        this._healthBarFill.setFillStyle(HealthBar.colorFor(ratio));

        this.tweens.killTweensOf(this._healthBarFill);
        if (animate) {
            this.tweens.add({
                targets: this._healthBarFill,
                // Scale instead of width: changing a Rectangle width does not rebuild its geometry
                scaleX: ratio,
                duration: MainUIScene.HEALTH_BAR_TWEEN_MS,
                ease: 'Quad.easeOut'
            });
        } else {
            this._healthBarFill.scaleX = ratio;
        }
    }
}
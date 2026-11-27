import {Scene, GameObjects} from 'phaser';
import Health from "../components/Health.ts";
import RegistryConstants from "../RegistryConstants.ts";
import SaveManager from "../managers/SaveManager.ts";
import SaveConstants from "../SaveConstants.ts";
import EntityManager from "../managers/EntityManager.ts";
import GameConstants from "../GameConstants.ts";
import {GameOverData} from "./GameOverScene.ts";

export default class MainGameScene extends Scene {
    private bg: GameObjects.TileSprite;
    private planet: GameObjects.Image;
    private saveManager: SaveManager;
    private entityManager: EntityManager;
    // No pause during the explosion before the game over screen
    private _isGameOver: boolean = false;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_GAME);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        if (!this.saveManager) {
            console.error('SaveManager plugin not found');
        }
        this.saveManager?.load();
        this._isGameOver = false;

        const bgMargin = 512;
        this.bg = this.add.tileSprite(this.cameras.main.centerX, this.cameras.main.centerY,
            this.cameras.main.width + bgMargin, this.cameras.main.height + bgMargin, 'bg').setTileScale(2);
        this.planet = this.add.image(0, -512, 'planet').setOrigin(0);

        if (!this.entityManager) {
            console.error('EntityManager plugin not found');
        }

        const player = this.entityManager.initAndSpawnPlayer();
        player.getComponent(Health)?.once(Health.DEATH_EVENT, () => {
            // Hide the player and let its explosion play before showing the game over screen
            this._isGameOver = true;
            player.disableBody(true, true);
            this.time.delayedCall(1000, this.endGame, [], this);
        }, this);
        this.entityManager.initEnemies();
        this.entityManager.initGroupCollisions();

        if (this.input.keyboard) {
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R).on('down', () => this.scene.restart());
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => this.pauseGame());
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P).on('down', () => this.pauseGame());
        } else {
            console.error('No keyboard input');
        }

        this.registry.set(RegistryConstants.Keys.PLAYER_SCORE, 0);
        this.registry.set(RegistryConstants.Keys.PLAYER_COMBO, 0);
        this.registry.set(RegistryConstants.Keys.LEVEL, 1);

        console.log("MainGameScene created");
    }

    // Freezes the game and its UI (physics, timers, tweens) under the pause menu
    private pauseGame() {
        if (this._isGameOver)
            return;

        this.scene.pause();
        this.scene.pause(GameConstants.SceneKeys.MAIN_UI);
        this.scene.launch(GameConstants.SceneKeys.PAUSE);
    }

    private endGame() {
        const previousBest: number = Number(this.saveManager.getData(SaveConstants.Keys.PLAYER_BEST_SCORE) ?? 0);
        const score: number = Number(this.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
        const isNewRecord: boolean = score > previousBest;
        if (isNewRecord)
            this.saveManager.setData(SaveConstants.Keys.PLAYER_BEST_SCORE, score);

        const data: GameOverData = {
            score,
            bestScore: Math.max(score, previousBest),
            level: Number(this.registry.get(RegistryConstants.Keys.LEVEL) ?? 1),
            isNewRecord,
        };
        this.scene.start(GameConstants.SceneKeys.GAME_OVER, data);
    }

    update(_timeSinceLaunch: number, deltaTime: number) {
        this.bg.tilePositionY -= 0.1 * deltaTime;
        this.planet.y += 0.40 * deltaTime;
    }
}

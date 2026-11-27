import GameConstants from "../GameConstants.ts";
import Menu from "../ui/Menu.ts";
import GameFlow from "../utils/GameFlow.ts";

// Overlay launched on top of the paused game and UI scenes
export default class PauseScene extends Phaser.Scene {
    private static readonly OVERLAY_ALPHA: number = 0.6;
    private static readonly TITLE_Y_RATIO: number = 0.3;
    private static readonly MENU_Y_RATIO: number = 0.45;

    constructor() {
        super(GameConstants.SceneKeys.PAUSE);
    }

    create() {
        // The UI scene brings itself to the top when it starts: the pause overlay must cover it
        this.scene.bringToTop();
        this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, PauseScene.OVERLAY_ALPHA).setOrigin(0);

        const centerX: number = this.scale.width / 2;
        this.add.text(centerX, this.scale.height * PauseScene.TITLE_Y_RATIO, 'PAUSE',
            {fontSize: '130px', color: '#fff', fontFamily: 'future', stroke: '#2d2257', strokeThickness: 14}).setOrigin(0.5);

        new Menu(this, centerX, this.scale.height * PauseScene.MENU_Y_RATIO, [
            {label: 'RESUME', onSelect: () => this.resumeGame()},
            {label: 'RESTART', onSelect: () => GameFlow.startNewGame(this)},
            {label: 'MAIN MENU', onSelect: () => GameFlow.goToMainMenu(this)},
        ]);

        // Keyboard listeners outlive a scene restart, so they are removed on shutdown
        const keyboard = this.input.keyboard;
        keyboard?.on('keydown-ESC', this.resumeGame, this);
        keyboard?.on('keydown-P', this.resumeGame, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            keyboard?.off('keydown-ESC', this.resumeGame, this);
            keyboard?.off('keydown-P', this.resumeGame, this);
        });
    }

    private resumeGame() {
        this.scene.resume(GameConstants.SceneKeys.MAIN_GAME);
        this.scene.resume(GameConstants.SceneKeys.MAIN_UI);
        this.scene.stop();
    }
}

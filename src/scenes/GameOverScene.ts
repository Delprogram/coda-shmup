import GameConstants from "../GameConstants.ts";
import Backdrop from "../ui/Backdrop.ts";
import Menu from "../ui/Menu.ts";
import GameFlow from "../utils/GameFlow.ts";

export type GameOverData = {
    score: number;
    bestScore: number;
    level: number;
    isNewRecord: boolean;
};

export default class GameOverScene extends Phaser.Scene {
    private static readonly TITLE_Y_RATIO: number = 0.18;
    private static readonly STATS_Y_RATIO: number = 0.33;
    private static readonly STATS_ROW_HEIGHT: number = 90;
    private static readonly MENU_Y_RATIO: number = 0.62;
    // Ignore the menu for a moment: the player is often still shooting when the ship explodes
    private static readonly INPUT_DELAY_MS: number = 600;
    private static readonly RECORD_PULSE_MS: number = 400;
    private static readonly PANEL_WIDTH: number = 1100;
    private static readonly PANEL_PADDING: number = 50;

    constructor() {
        super(GameConstants.SceneKeys.GAME_OVER);
    }

    create(data: GameOverData) {
        this.scene.stop(GameConstants.SceneKeys.MAIN_UI);
        Backdrop.add(this);

        const centerX: number = this.scale.width / 2;
        this.add.text(centerX, this.scale.height * GameOverScene.TITLE_Y_RATIO, 'GAME OVER',
            {fontSize: '150px', color: '#f25f5c', fontFamily: 'future', stroke: '#000', strokeThickness: 14}).setOrigin(0.5);

        const statsY: number = this.scale.height * GameOverScene.STATS_Y_RATIO;
        const rows: [string, string][] = [
            ['SCORE', String(data.score)],
            ['BEST', String(data.bestScore)],
            ['LEVEL REACHED', String(data.level)],
        ];
        // Dark panel so the stats stay readable over the planet
        this.add.rectangle(centerX, statsY - GameOverScene.STATS_ROW_HEIGHT / 2 - GameOverScene.PANEL_PADDING / 2,
            GameOverScene.PANEL_WIDTH, rows.length * GameOverScene.STATS_ROW_HEIGHT + GameOverScene.PANEL_PADDING,
            0x000000, 0.65).setOrigin(0.5, 0).setStrokeStyle(4, 0x8877bb, 0.8);
        rows.forEach(([label, value], i) => {
            const y: number = statsY + i * GameOverScene.STATS_ROW_HEIGHT;
            this.add.text(centerX - 30, y, label, {fontSize: '56px', color: '#aaaaaa', fontFamily: 'future'}).setOrigin(1, 0.5);
            this.add.text(centerX + 30, y, value, {fontSize: '56px', color: '#ffffff', fontFamily: 'future'}).setOrigin(0, 0.5);
        });

        if (data.isNewRecord) {
            const record = this.add.text(centerX, statsY + rows.length * GameOverScene.STATS_ROW_HEIGHT + 20, 'NEW RECORD!',
                {fontSize: '64px', color: '#ffe066', fontFamily: 'future'}).setOrigin(0.5);
            this.tweens.add({
                targets: record,
                scale: 1.15,
                duration: GameOverScene.RECORD_PULSE_MS,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        new Menu(this, centerX, this.scale.height * GameOverScene.MENU_Y_RATIO, [
            {label: 'PLAY AGAIN', onSelect: () => GameFlow.startNewGame(this)},
            {label: 'MAIN MENU', onSelect: () => this.scene.start(GameConstants.SceneKeys.HOME)},
        ], GameOverScene.INPUT_DELAY_MS);
    }
}

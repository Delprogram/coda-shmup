import GameConstants from "../GameConstants.ts";
import Backdrop from "../ui/Backdrop.ts";
import Menu from "../ui/Menu.ts";

// Every control of the game, reachable from the main menu
export default class ControlsScene extends Phaser.Scene {
    private static readonly CONTROLS: [string, string][] = [
        ['ZQSD / ARROWS', 'Move'],
        ['SHIFT (hold)', 'Nitro'],
        ['MOUSE', 'Aim'],
        ['LEFT CLICK / SPACE', 'Shoot'],
        ['RIGHT CLICK', 'Laser gun (laser boss pickup)'],
        ['F', 'Shockwave'],
        ['C', 'Shield'],
        ['A', 'Barrier (when charged)'],
        ['X', 'Overdrive (charged by kills)'],
        ['ESC / P', 'Pause'],
    ];
    private static readonly TITLE_Y: number = 200;
    private static readonly FIRST_ROW_Y: number = 380;
    private static readonly ROW_HEIGHT: number = 92;
    private static readonly COLUMN_GAP: number = 40;
    private static readonly PANEL_WIDTH: number = 1800;
    private static readonly PANEL_PADDING: number = 60;

    constructor() {
        super(GameConstants.SceneKeys.CONTROLS);
    }

    create() {
        Backdrop.add(this);

        const centerX: number = this.scale.width / 2;
        this.add.text(centerX, ControlsScene.TITLE_Y, 'CONTROLS',
            {fontSize: '110px', color: '#fff', fontFamily: 'future', stroke: '#2d2257', strokeThickness: 12}).setOrigin(0.5);

        // Dark panel so the list stays readable over the planet
        const panelHeight: number = ControlsScene.CONTROLS.length * ControlsScene.ROW_HEIGHT + ControlsScene.PANEL_PADDING;
        this.add.rectangle(centerX, ControlsScene.FIRST_ROW_Y - ControlsScene.ROW_HEIGHT / 2 - ControlsScene.PANEL_PADDING / 2,
            ControlsScene.PANEL_WIDTH, panelHeight, 0x000000, 0.65).setOrigin(0.5, 0).setStrokeStyle(4, 0x8877bb, 0.8);

        ControlsScene.CONTROLS.forEach(([keys, action], i) => {
            const y: number = ControlsScene.FIRST_ROW_Y + i * ControlsScene.ROW_HEIGHT;
            this.add.text(centerX - ControlsScene.COLUMN_GAP, y, keys,
                {fontSize: '46px', color: '#66ccff', fontFamily: 'future'}).setOrigin(1, 0.5);
            this.add.text(centerX + ControlsScene.COLUMN_GAP, y, action,
                {fontSize: '46px', color: '#ffffff', fontFamily: 'future'}).setOrigin(0, 0.5);
        });

        const backY: number = ControlsScene.FIRST_ROW_Y + ControlsScene.CONTROLS.length * ControlsScene.ROW_HEIGHT + 80;
        new Menu(this, centerX, backY, [
            {label: 'BACK', onSelect: () => this.goBack()},
        ]);
        // Keyboard listeners outlive a scene restart, so it is removed on shutdown
        const keyboard = this.input.keyboard;
        keyboard?.on('keydown-ESC', this.goBack, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard?.off('keydown-ESC', this.goBack, this));
    }

    private goBack() {
        this.scene.start(GameConstants.SceneKeys.HOME);
    }
}

import {Loader} from "phaser";
import GameConstants from "../GameConstants.ts";
import SaveConstants from "../SaveConstants.ts";
import SaveManager from "../managers/SaveManager.ts";
import Backdrop from "../ui/Backdrop.ts";
import Menu from "../ui/Menu.ts";
import GameFlow from "../utils/GameFlow.ts";

// Loads every asset once, then shows the main menu: play, controls and sound setting
export default class HomeScene extends Phaser.Scene {
    private static readonly TITLE_Y_RATIO: number = 0.2;
    private static readonly MENU_Y_RATIO: number = 0.5;
    private static readonly SHIP_FLOAT_DISTANCE: number = 24;
    private static readonly SHIP_FLOAT_MS: number = 1200;
    private static readonly SHIP_SCALE: number = 2;

    private saveManager: SaveManager;

    constructor() {
        super(GameConstants.SceneKeys.HOME);
    }

    preload() {
        // Back from a game: everything is already loaded
        if (this.textures.exists('sprites'))
            return;

        const width: number = this.scale.width;
        const y: number = this.scale.height / 2;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(0, y, width, 64);
        this.load.on(Loader.Events.PROGRESS, function (value: number) { // 0-1
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(0, y, width * value, 64);
        });
        this.load.on(Loader.Events.COMPLETE, function () {
            progressBar.destroy();
            progressBox.destroy();
        });

        this.load.setPath('assets');

        this.load.image('bg', 'Backgrounds/darkPurple.png');
        this.load.image('planet', 'Planets/planet00.png');
        this.load.atlas('sprites', 'Spritesheet/gameSprites.png', 'Spritesheet/gameSprites.json');
        this.load.bitmapFont('future-bmp', 'Fonts/kenvector_future.png', 'Fonts/kenvector_future.xml');
        this.load.font('future', 'Fonts/kenvector_future.ttf');
        this.load.json('playerShips', 'Data/playerShips.json');
        this.load.json('sineEnemy', 'Data/sineEnemy.json');
        this.load.audio('sfx_laser1', 'Sounds/sfx_laser1.ogg');
        this.load.audio('sfx_laser2', 'Sounds/sfx_laser2.ogg');
    }

    create() {
        this.saveManager.load();
        this.sound.mute = Boolean(this.saveManager.getData(SaveConstants.Keys.SOUND_MUTED));

        Backdrop.add(this);

        const centerX: number = this.scale.width / 2;
        const titleY: number = this.scale.height * HomeScene.TITLE_Y_RATIO;
        this.add.text(centerX, titleY, 'CODA SHMUP',
            {fontSize: '150px', color: '#fff', fontFamily: 'future', stroke: '#2d2257', strokeThickness: 16}).setOrigin(0.5);

        const bestScore: number = Number(this.saveManager.getData(SaveConstants.Keys.PLAYER_BEST_SCORE) ?? 0);
        this.add.text(centerX, titleY + 130, 'BEST SCORE  ' + bestScore,
            {fontSize: '44px', color: '#ffe066', fontFamily: 'future'}).setOrigin(0.5);

        const ship = this.add.image(centerX, titleY + 260, 'sprites', 'playerShip1_blue')
            .setScale(HomeScene.SHIP_SCALE).setAngle(-90);
        this.tweens.add({
            targets: ship,
            y: ship.y - HomeScene.SHIP_FLOAT_DISTANCE,
            duration: HomeScene.SHIP_FLOAT_MS,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        const menu: Menu = new Menu(this, centerX, this.scale.height * HomeScene.MENU_Y_RATIO, [
            {label: 'PLAY', onSelect: () => GameFlow.startNewGame(this)},
            {label: 'CONTROLS', onSelect: () => this.scene.start(GameConstants.SceneKeys.CONTROLS)},
            {label: HomeScene.soundLabel(this.sound.mute), onSelect: () => {
                // Reading sound.mute right after setting it still returns the old value (Web Audio updates later)
                const muted: boolean = !this.sound.mute;
                this.sound.setMute(muted);
                this.saveManager.setData(SaveConstants.Keys.SOUND_MUTED, muted);
                menu.setLabel(2, HomeScene.soundLabel(muted));
            }},
        ]);

        this.add.text(centerX, this.scale.height - 80, 'ARROWS / MOUSE to choose  -  ENTER / CLICK to confirm',
            {fontSize: '28px', color: '#aaaaaa', fontFamily: 'future'}).setOrigin(0.5);
    }

    private static soundLabel(muted: boolean): string {
        return muted ? 'SOUND: OFF' : 'SOUND: ON';
    }
}

import {Loader} from "phaser";
import GameConstants from "../GameConstants.ts";

export default class HomeScene extends Phaser.Scene {
    private static readonly TITLE_Y_RATIO: number = 0.3;

    constructor() {
        super(GameConstants.SceneKeys.HOME);
    }

    preload() {
        const width: number = this.scale.width;
        const y: number = this.scale.height / 2;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(0, y, width, 64);
        this.load.on(Loader.Events.PROGRESS, function (value: number) { // 0-1
            console.log("Loading : " + value);

            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(0, y, width * value, 64);
        });
        this.load.on(Loader.Events.COMPLETE, function () {
            console.log("Loading complete");

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
        const titleY: number = this.scale.height * HomeScene.TITLE_Y_RATIO;
        this.add.text(this.scale.width / 2, titleY, 'CODA SHMUP',
            {fontSize: '72px', color: '#fff', fontFamily: 'future'}).setOrigin(0.5);
        this.add.text(this.scale.width / 2, titleY + 72, 'Press SPACE or CLICK to start',
            {fontSize: '32px', color: '#fff'}).setOrigin(0.5);
        this.add.text(this.scale.width / 2, titleY + 128, 'ZQSD or arrows to move - hold SHIFT for nitro - aim with the mouse, LEFT CLICK to shoot\nRIGHT CLICK fires the laser gun (laser boss pickup)\nF shockwave - C shield - A barrier (when charged) - X overdrive (charged by kills)',
            {fontSize: '28px', color: '#aaa', align: 'center', lineSpacing: 12,
                wordWrap: {width: this.scale.width - 80}}).setOrigin(0.5, 0);

        // Ignore the OS key repeat: SPACE may still be held from the previous game
        this.input.keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
            if (event.repeat)
                return;

            this.startGame();
        });
        this.input.once(Phaser.Input.Events.POINTER_DOWN, this.startGame, this);

        console.log("HomeScene created");
    }

    private startGame() {
        this.scene.launch(GameConstants.SceneKeys.MAIN_UI);
        this.scene.start(GameConstants.SceneKeys.MAIN_GAME);
    }
}
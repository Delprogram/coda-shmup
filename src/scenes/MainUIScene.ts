import {GameObjects, Scenes, Scene} from "phaser";
import Health from "../components/Health.ts";
import HealthBar from "../components/HealthBar.ts";
import Skills from "../components/Skills.ts";
import Boss from "../entities/Boss.ts";
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
    // The bitmap font only has digits: words use the TTF font
    private _comboText: GameObjects.Text;
    private static readonly COMBO_POP_SCALE: number = 1.4;
    private static readonly COMBO_POP_MS: number = 120;

    private static readonly LEVEL_TEXT_Y: number = 190;
    private static readonly BOSS_BAR_Y: number = 320;
    private static readonly BOSS_BAR_WIDTH: number = 800;
    private static readonly BOSS_BAR_HEIGHT: number = 28;
    private static readonly BOSS_BAR_COLOR: number = 0xb44cff;
    private static readonly BANNER_Y_RATIO: number = 0.4;
    private static readonly BANNER_IN_MS: number = 250;
    private static readonly BANNER_HOLD_MS: number = 1500;
    private static readonly BANNER_OUT_MS: number = 400;
    private static readonly WARNING_COLOR: string = '#f25f5c';

    private _levelText: GameObjects.Text;
    private _bannerText: GameObjects.Text;
    private _bossBar: GameObjects.Container;
    private _bossBarFill: GameObjects.Rectangle;
    private _bossHealth: Health | null = null;
    private _bossLabel: GameObjects.Text;

    private static readonly SKILL_SLOT_SIZE: number = 120;
    private static readonly SKILL_SLOT_GAP: number = 20;
    private static readonly SKILL_BAR_MARGIN: number = 40;
    private static readonly SKILL_READY_COLOR: number = 0x66ccff;
    private static readonly SKILL_ULTIMATE_COLOR: number = 0xffb000;

    private _player: Player | null = null;
    private _skillSlots: {border: GameObjects.Rectangle, cooldown: GameObjects.Rectangle}[] = [];

    constructor() {
        super(GameConstants.SceneKeys.MAIN_UI);
    }

    // noinspection JSUnusedGlobalSymbols
    init() {
        this.game.events.on(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_COMBO_CHANGE, this.onPlayerComboChanged, this);
        this.registry.events.on(RegistryConstants.Events.LEVEL_CHANGE, this.onLevelChanged, this);
        this.game.events.on(GameConstants.Events.BOSS_INCOMING_EVENT, this.onBossIncoming, this);
        this.game.events.on(GameConstants.Events.BOSS_SPAWNED_EVENT, this.onBossSpawned, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
            this.registry.events.off(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);
            this.registry.events.off(RegistryConstants.Events.PLAYER_COMBO_CHANGE, this.onPlayerComboChanged, this);
            this.registry.events.off(RegistryConstants.Events.LEVEL_CHANGE, this.onLevelChanged, this);
            this.game.events.off(GameConstants.Events.BOSS_INCOMING_EVENT, this.onBossIncoming, this);
            this.game.events.off(GameConstants.Events.BOSS_SPAWNED_EVENT, this.onBossSpawned, this);
            this._bossHealth?.off(Health.CHANGE_EVENT, this.onBossHealthChanged, this);
            this._player?.getComponent(Health)?.off(Health.CHANGE_EVENT, this.onPlayerHealthChanged, this);
            this._player = null;
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

        this._comboText = this.add.text(this.scale.width - 64, this._scoreText.y + this._scoreText.height + 16, "",
            {fontSize: '56px', color: '#ffe066', fontFamily: 'future'}).setOrigin(1, 0);

        const centerX: number = this.scale.width / 2;
        this._levelText = this.add.text(centerX, MainUIScene.LEVEL_TEXT_Y,
            "LEVEL " + (this.registry.get(RegistryConstants.Keys.LEVEL) ?? 1),
            {fontSize: '44px', color: '#fff', fontFamily: 'future'}).setOrigin(0.5, 0);
        this._bannerText = this.add.text(centerX, this.scale.height * MainUIScene.BANNER_Y_RATIO, "",
            {fontSize: '110px', color: '#fff', fontFamily: 'future', align: 'center', stroke: '#000', strokeThickness: 10})
            .setOrigin(0.5).setAlpha(0);

        const bossLabel = this._bossLabel = this.add.text(0, -MainUIScene.BOSS_BAR_HEIGHT, "BOSS",
            {fontSize: '36px', color: '#fff', fontFamily: 'future'}).setOrigin(0.5, 1);
        const bossBarBackground = this.add.rectangle(0, 0, MainUIScene.BOSS_BAR_WIDTH, MainUIScene.BOSS_BAR_HEIGHT, 0x000000, 0.6)
            .setStrokeStyle(4, 0xffffff, 0.8);
        this._bossBarFill = this.add.rectangle(-MainUIScene.BOSS_BAR_WIDTH / 2, 0, MainUIScene.BOSS_BAR_WIDTH,
            MainUIScene.BOSS_BAR_HEIGHT, MainUIScene.BOSS_BAR_COLOR).setOrigin(0, 0.5);
        this._bossBar = this.add.container(centerX, MainUIScene.BOSS_BAR_Y + MainUIScene.BOSS_BAR_HEIGHT,
            [bossLabel, bossBarBackground, this._bossBarFill]).setVisible(false);

        this.createSkillBar();

        this.scene.bringToTop();

        console.log("MainUIScene created");
    }

    private onPlayerScoreChanged(_: any, value: number) {
        const scoreStr: string = value.toString().padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText.setText(scoreStr);
    }

    private onPlayerComboChanged(_: any, combo: number) {
        // A single kill is not a combo
        this._comboText.setText(combo > 1 ? "COMBO x" + combo : "");
        if (combo > 1) {
            this.tweens.add({
                targets: this._comboText,
                scale: {from: MainUIScene.COMBO_POP_SCALE, to: 1},
                duration: MainUIScene.COMBO_POP_MS,
                ease: 'Back.easeOut'
            });
        }
    }

    private onLevelChanged(_: any, level: number) {
        this._levelText.setText("LEVEL " + level);
        this.showBanner("LEVEL " + level, '#ffffff');
    }

    private onBossIncoming() {
        this.showBanner("WARNING\nBOSS", MainUIScene.WARNING_COLOR);
    }

    private onBossSpawned(boss: Boss) {
        // The boss is pooled: drop the listener on the previous health before adding a new one
        this._bossHealth?.off(Health.CHANGE_EVENT, this.onBossHealthChanged, this);
        this._bossHealth = boss.getComponent(Health) ?? null;
        this._bossHealth?.on(Health.CHANGE_EVENT, this.onBossHealthChanged, this);

        this._bossBarFill.scaleX = 1;
        this._bossLabel.setText(boss.title);
        this._bossBar.setVisible(true);
    }

    private onBossHealthChanged(current: number) {
        if (!this._bossHealth)
            return;

        this._bossBarFill.scaleX = current / this._bossHealth.max;
        if (current <= 0)
            this._bossBar.setVisible(false);
    }

    private showBanner(text: string, color: string) {
        this.tweens.killTweensOf(this._bannerText);
        this._bannerText.setText(text).setColor(color).setAlpha(0).setScale(1.5);
        this.tweens.chain({
            targets: this._bannerText,
            tweens: [
                {alpha: 1, scale: 1, duration: MainUIScene.BANNER_IN_MS, ease: 'Back.easeOut'},
                {alpha: 0, duration: MainUIScene.BANNER_OUT_MS, delay: MainUIScene.BANNER_HOLD_MS}
            ]
        });
    }

    private createSkillBar() {
        const size: number = MainUIScene.SKILL_SLOT_SIZE;
        // Bottom-left corner, so it hides as little of the play area as possible
        const y: number = this.scale.height - MainUIScene.SKILL_BAR_MARGIN - size / 2;

        // Same order as Skills.states(), which update() relies on
        this._skillSlots = Skills.SKILLS.map(({key, name}, i) => {
            const x: number = MainUIScene.SKILL_BAR_MARGIN + size / 2 + i * (size + MainUIScene.SKILL_SLOT_GAP);
            const border = this.add.rectangle(x, y, size, size, 0x000000, 0.5).setStrokeStyle(6, 0xffffff, 0.4);
            // Dark overlay that shrinks from the top while the skill recharges
            const cooldown = this.add.rectangle(x, y + size / 2, size, size, 0x000000, 0.6).setOrigin(0.5, 1);
            this.add.text(x, y - 10, key, {fontSize: '52px', color: '#fff', fontFamily: 'future'}).setOrigin(0.5);
            this.add.text(x, y + size / 2 - 10, name, {fontSize: '14px', color: '#ddd', fontFamily: 'future'})
                .setOrigin(0.5, 1);
            return {border, cooldown};
        });
    }

    update() {
        const player = this._player;
        if (!player?.scene)
            return;

        const states = player.getComponent(Skills)?.states(player.scene.time.now) ?? [];
        states.forEach((state, i) => {
            const slot = this._skillSlots[i];
            const ready: boolean = state.readiness >= 1;
            const readyColor: number = state.id === 'overdrive' ? MainUIScene.SKILL_ULTIMATE_COLOR : MainUIScene.SKILL_READY_COLOR;
            slot.cooldown.scaleY = 1 - state.readiness;
            slot.border.setStrokeStyle(6, ready ? readyColor : 0xffffff, ready ? 1 : 0.4);
        });
    }

    private onPlayerSpawned(player: Player) {
        // The previous player (before a restart) must not update this UI anymore
        this._player?.getComponent(Health)?.off(Health.CHANGE_EVENT, this.onPlayerHealthChanged, this);
        this._player = player;

        // A restart (R key) can happen in the middle of a boss fight
        this._bossBar.setVisible(false);

        const health = player.getComponent(Health);
        if (!health)
            return;

        this.updateHealthBar(health.current, health.max, false);
        health.on(Health.CHANGE_EVENT, this.onPlayerHealthChanged, this);
    }

    private onPlayerHealthChanged(current: number) {
        const health = this._player?.getComponent(Health);
        if (health)
            this.updateHealthBar(current, health.max, true);
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
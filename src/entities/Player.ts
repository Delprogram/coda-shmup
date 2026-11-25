import {Input, Scene} from "phaser";
import {PlayerShipData, PlayerShipsData} from "../gameData/PlayerShipsData.ts";
import type {BulletData} from "../gameData/BulletData.ts";
import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class Player extends Entity {
    private readonly _bulletData: BulletData = {
        width: 12,
        height: 4,
        color: 0xffe066,
        speed: 1024,
        damage: 1
    };

    private static readonly MOUSE_SPEED_FACTOR: number = 2.5;
    // Weapon upgrade: one more bullet every SCORE_PER_UPGRADE points, up to MAX_BULLETS
    private static readonly SCORE_PER_UPGRADE: number = 15;
    private static readonly MAX_BULLETS: number = 5;
    private static readonly SPREAD_DEG_PER_BULLET: number = 8;

    private readonly _cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
    // Last pointer position, null once the keyboard takes over so the ship does not snap back
    private _pointerTarget: Phaser.Math.Vector2 | null = null;
    private _playerShipData: PlayerShipData;
    private _rateOfFire: number;
    private _lastShotTime: number;

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'sprites');

        if (this.scene.input.keyboard) {
            this._cursorKeys = this.scene.input.keyboard.createCursorKeys();

            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.ONE).on('down', () => this.selectPlayerShip(1));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.TWO).on('down', () => this.selectPlayerShip(2));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.THREE).on('down', () => this.selectPlayerShip(3));
        }

        this.scene.input.on(Input.Events.POINTER_MOVE, (pointer: Input.Pointer) => {
            this._pointerTarget = new Phaser.Math.Vector2(pointer.x, pointer.y);
        });
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this.addComponent(new Health(3, this));
        this.addComponent(new Movement());
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));

        this.angle = -90;

        this.selectPlayerShip(1);

        this._rateOfFire = 0.5;
        this._lastShotTime = 0;

        this.getComponent(Health)?.on(Health.CHANGE_EVENT, () => {
            this.arcadeBody.setEnable(false);

            this.scene.time.delayedCall(50, () => {
                // A dead player stays disabled
                if (this.active)
                    this.arcadeBody.setEnable(true);
            });
        });
    }

    public selectPlayerShip(playerShipDataId: number) {
        const playerShipsData = this.scene.cache.json.get('playerShips') as PlayerShipsData;
        this._playerShipData = playerShipsData[playerShipDataId];

        this.setTexture('sprites', this._playerShipData.texture);
        const bodyData = this._playerShipData.body;
        this.arcadeBody.setCircle(bodyData.radius, bodyData.offsetX, bodyData.offsetY);

        this.getComponent(Movement)?.setSpeed(this._playerShipData.movementSpeed);
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        // Press left or right arrow keys to move the player smoothly horizontally using deltaTime
        if (this._cursorKeys.left.isDown || this._cursorKeys.right.isDown) {
            this._pointerTarget = null;
        }

        if (this._pointerTarget) {
            const movement = this.getComponent(Movement);
            movement?.setSpeed(this._playerShipData.movementSpeed * Player.MOUSE_SPEED_FACTOR);
            movement?.moveTowards(this, this._pointerTarget.x, this._pointerTarget.y, deltaTime);
            movement?.setSpeed(this._playerShipData.movementSpeed);
        } else if (this._cursorKeys.left.isDown) {
            if (this._cursorKeys.shift.isDown) {
                this.angle -= this._playerShipData.movementSpeed * deltaTime;
            } else {
                this.getComponent(Movement)?.moveHorizontally(this, -deltaTime);
            }
        } else if (this._cursorKeys.right.isDown) {
            if (this._cursorKeys.shift.isDown) {
                this.angle += this._playerShipData.movementSpeed * deltaTime;
            } else {
                this.getComponent(Movement)?.moveHorizontally(this, deltaTime);
            }
        }
        // Stop player from going offscreen, and keep it in the bottom half of the screen
        const camera = this.scene.cameras.main;
        this.x = Phaser.Math.Clamp(this.x, this.displayWidth / 2, camera.width - this.displayWidth / 2);
        this.y = Phaser.Math.Clamp(this.y, camera.height / 2, camera.height - this.displayHeight / 2);

        // Press space or hold the mouse button / finger to shoot
        if (this._cursorKeys.space.isDown || this.scene.input.activePointer.isDown) {
            if (timeSinceLaunch - this._lastShotTime > this._rateOfFire * 1000) {
                const score: number = Number(this.scene.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
                const bulletCount: number = Math.min(1 + Math.floor(score / Player.SCORE_PER_UPGRADE), Player.MAX_BULLETS);
                this.getComponent(Weapon)?.shootSpread(this, bulletCount, (bulletCount - 1) * Player.SPREAD_DEG_PER_BULLET);
                this.scene.sound.play('sfx_laser1');

                this._lastShotTime = timeSinceLaunch;
            }
        }
    }
}
import {GameObjects, Input, Scene, Scenes} from "phaser";

export type MenuItem = {
    label: string;
    onSelect: () => void;
};

type MenuButton = {
    container: GameObjects.Container;
    background: GameObjects.Rectangle;
    text: GameObjects.Text;
};

// Vertical list of buttons usable with the mouse (hover + click) and the keyboard (UP/DOWN or Z/S, ENTER or SPACE).
// Its keyboard listener is removed when the scene shuts down.
export default class Menu {
    private static readonly WIDTH: number = 640;
    private static readonly HEIGHT: number = 110;
    private static readonly GAP: number = 36;
    private static readonly FONT_SIZE: string = '52px';
    private static readonly IDLE_COLOR: number = 0x1b1530;
    private static readonly SELECTED_COLOR: number = 0x2d2257;
    private static readonly IDLE_BORDER: number = 0x8877bb;
    private static readonly SELECTED_BORDER: number = 0x66ccff;
    private static readonly SELECTED_SCALE: number = 1.06;
    private static readonly TWEEN_MS: number = 100;

    private readonly _scene: Scene;
    private readonly _items: MenuItem[];
    private readonly _buttons: MenuButton[];
    private _selectedIndex: number = 0;
    // Inputs are ignored until this time, so a key or button still held from the game does not trigger the menu
    private readonly _acceptInputAt: number;

    public constructor(scene: Scene, x: number, y: number, items: MenuItem[], inputDelayMs: number = 0) {
        this._scene = scene;
        this._items = items;
        this._acceptInputAt = scene.time.now + inputDelayMs;

        this._buttons = items.map((item, i) => {
            const buttonY: number = y + i * (Menu.HEIGHT + Menu.GAP);
            const background = scene.add.rectangle(0, 0, Menu.WIDTH, Menu.HEIGHT, Menu.IDLE_COLOR, 0.85)
                .setStrokeStyle(5, Menu.IDLE_BORDER, 0.9);
            const text = scene.add.text(0, 0, item.label,
                {fontSize: Menu.FONT_SIZE, color: '#ffffff', fontFamily: 'future'}).setOrigin(0.5);
            const container = scene.add.container(x, buttonY, [background, text])
                .setSize(Menu.WIDTH, Menu.HEIGHT)
                .setInteractive({useHandCursor: true});

            container.on(Input.Events.POINTER_OVER, () => this.select(i));
            // A new press is needed: a button still held from shooting does not count
            container.on(Input.Events.POINTER_DOWN, (pointer: Input.Pointer) => {
                if (pointer.leftButtonDown())
                    this.activate(i);
            });
            return {container, background, text};
        });

        // Keyboard listeners outlive a scene restart: without this, an old menu would still react to keys
        const keyboard = scene.input.keyboard;
        keyboard?.on(Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyDown, this);
        scene.events.once(Scenes.Events.SHUTDOWN, () => keyboard?.off(Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyDown, this));
        this.select(0);
    }

    public setLabel(index: number, label: string) {
        this._items[index].label = label;
        this._buttons[index].text.setText(label);
    }

    private onKeyDown(event: KeyboardEvent) {
        if (event.repeat)
            return;

        const KeyCodes = Input.Keyboard.KeyCodes;
        switch (event.keyCode) {
            case KeyCodes.UP:
            case KeyCodes.Z:
            case KeyCodes.W:
                this.select((this._selectedIndex - 1 + this._buttons.length) % this._buttons.length);
                break;
            case KeyCodes.DOWN:
            case KeyCodes.S:
                this.select((this._selectedIndex + 1) % this._buttons.length);
                break;
            case KeyCodes.ENTER:
            case KeyCodes.SPACE:
                this.activate(this._selectedIndex);
                break;
        }
    }

    private select(index: number) {
        this._selectedIndex = index;
        this._buttons.forEach((button, i) => {
            const isSelected: boolean = i === index;
            button.background.setFillStyle(isSelected ? Menu.SELECTED_COLOR : Menu.IDLE_COLOR, 0.85)
                .setStrokeStyle(5, isSelected ? Menu.SELECTED_BORDER : Menu.IDLE_BORDER, 0.9);
            this._scene.tweens.add({
                targets: button.container,
                scale: isSelected ? Menu.SELECTED_SCALE : 1,
                duration: Menu.TWEEN_MS,
                ease: 'Quad.easeOut'
            });
        });
    }

    private activate(index: number) {
        if (this._scene.time.now < this._acceptInputAt)
            return;

        this.select(index);
        this._items[index].onSelect();
    }
}

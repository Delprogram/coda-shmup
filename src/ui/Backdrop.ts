import {Scene, Scenes} from "phaser";

// Same scrolling background and planet as the game, used behind the menus
export default class Backdrop {
    private static readonly MARGIN: number = 512;
    private static readonly BG_SCROLL_SPEED: number = 0.1;
    private static readonly PLANET_SPEED: number = 0.05;
    private static readonly PLANET_START_Y: number = -200;

    public static add(scene: Scene) {
        const camera = scene.cameras.main;
        const bg = scene.add.tileSprite(camera.centerX, camera.centerY,
            camera.width + Backdrop.MARGIN, camera.height + Backdrop.MARGIN, 'bg').setTileScale(2);
        const planet = scene.add.image(0, Backdrop.PLANET_START_Y, 'planet').setOrigin(0);

        const scroll = (_time: number, deltaTime: number) => {
            bg.tilePositionY -= Backdrop.BG_SCROLL_SPEED * deltaTime;
            planet.y += Backdrop.PLANET_SPEED * deltaTime;
            // Loop the planet back to the top once it has left the screen
            if (planet.y > camera.height)
                planet.y = -planet.displayHeight;
        };
        // Scene events outlive a restart of the scene: the listener must be removed on shutdown
        scene.events.on(Scenes.Events.UPDATE, scroll);
        scene.events.once(Scenes.Events.SHUTDOWN, () => scene.events.off(Scenes.Events.UPDATE, scroll));
    }
}

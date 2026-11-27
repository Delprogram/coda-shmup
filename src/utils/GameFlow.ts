import {Scene} from "phaser";
import GameConstants from "../GameConstants.ts";

// Scene transitions shared by the menus
export default class GameFlow {
    // Works from any scene: launch restarts the UI if it is already running, start restarts the game scene
    public static startNewGame(scene: Scene) {
        scene.scene.launch(GameConstants.SceneKeys.MAIN_UI);
        scene.scene.start(GameConstants.SceneKeys.MAIN_GAME);
    }

    public static goToMainMenu(scene: Scene) {
        scene.scene.stop(GameConstants.SceneKeys.MAIN_UI);
        scene.scene.stop(GameConstants.SceneKeys.MAIN_GAME);
        scene.scene.start(GameConstants.SceneKeys.HOME);
    }
}

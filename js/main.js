import DebugGui from './base/debug_gui.js';
import TestLabScene from './scenes/new_testlab.js';

let currentScene = null;

function initScene(SceneClass) {
    const container = document.getElementById('container');
    if (currentScene) {
        currentScene.destroy();
        container.innerHTML = '';
    }
    currentScene = new SceneClass(new DebugGui());
    currentScene.init(container);
}

function onWindowResize() {
    if (currentScene && typeof currentScene.resize === 'function') {
        currentScene.resize();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initScene(TestLabScene);

    // Add resize event listener
    window.addEventListener('resize', onWindowResize);
});
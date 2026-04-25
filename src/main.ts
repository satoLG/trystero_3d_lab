import './style/main.css'
import DebugGui from './base/debug_gui.ts'
import TestLabScene from './scenes/new_testlab.ts'

let currentScene = null;

function getRandomGoblinName(): string {
    const adjectives = [
        'Travesso', 'Astuto', 'Fedorento', 'Saltitante', 'Ranzinza',
        'Veloz', 'Barulhento', 'Zangado', 'Misterioso', 'Sorrateiro',
        'Bagunceiro', 'Engraçado', 'Fanfarrão', 'Desastrado', 'Esperto'
    ];
    return `Goblin ${adjectives[Math.floor(Math.random() * adjectives.length)]}`;
}

function showEntryModal(onSubmit: (cfg: { name: string; color: string }) => void) {
    const modal   = document.getElementById('entry-modal') as HTMLDivElement;
    const input   = document.getElementById('player-name-input') as HTMLInputElement;
    const btn     = document.getElementById('enter-btn') as HTMLButtonElement;
    const picker  = document.getElementById('color-picker') as HTMLDivElement;

    const colors = [
        { hex: '#e74c3c', label: 'Vermelho' },
        { hex: '#27ae60', label: 'Verde'    },
        { hex: '#f39c12', label: 'Amarelo'  },
        { hex: '#2980b9', label: 'Azul'     },
        { hex: '#222222', label: 'Preto'    },
        { hex: '#ecf0f1', label: 'Branco'   },
    ];
    let selectedColor = colors[3].hex; // default: blue

    colors.forEach(({ hex, label }) => {
        const sw = document.createElement('div');
        sw.className = 'color-swatch' + (hex === selectedColor ? ' selected' : '');
        sw.style.background = hex;
        sw.title = label;
        sw.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            sw.classList.add('selected');
            selectedColor = hex;
        });
        picker.appendChild(sw);
    });

    input.value = getRandomGoblinName();
    input.select();

    const submit = () => {
        const name = input.value.trim() || getRandomGoblinName();
        modal.style.display = 'none';
        onSubmit({ name, color: selectedColor });
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function initScene(SceneClass, playerConfig: { name?: string; color?: string } = {}) {
    const container = document.getElementById('container');
    if (currentScene) {
        currentScene.destroy();
        container.innerHTML = '';
    }
    currentScene = new SceneClass(new DebugGui(), playerConfig);
    currentScene.init(container);
}

function onWindowResize() {
    if (currentScene && typeof currentScene.resize === 'function') {
        currentScene.resize();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    showEntryModal(({ name, color }) => {
        initScene(TestLabScene, { name, color });
        window.addEventListener('resize', onWindowResize);
    });
});

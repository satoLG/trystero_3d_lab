import './style/main.css'
import DebugGui from './base/debug_gui.ts'
import ProtectCrystalScene from './scenes/protect_crystal.ts'

let currentScene = null;

function getRandomGoblinName(): string {
    const adjectives = [
        'Travesso', 'Astuto', 'Fedorento', 'Saltitante', 'Ranzinza',
        'Veloz', 'Barulhento', 'Zangado', 'Misterioso', 'Sorrateiro',
        'Bagunceiro', 'Engraçado', 'Fanfarrão', 'Desastrado', 'Esperto'
    ];
    return `Goblin ${adjectives[Math.floor(Math.random() * adjectives.length)]}`;
}

const CHARACTER_OPTIONS = [
    { key: 'male-a',   label: 'M-A' },
    { key: 'male-b',   label: 'M-B' },
    { key: 'male-c',   label: 'M-C' },
    { key: 'male-d',   label: 'M-D' },
    { key: 'male-e',   label: 'M-E' },
    { key: 'male-f',   label: 'M-F' },
    { key: 'female-a', label: 'F-A' },
    { key: 'female-b', label: 'F-B' },
    { key: 'female-c', label: 'F-C' },
    { key: 'female-d', label: 'F-D' },
    { key: 'female-e', label: 'F-E' },
    { key: 'female-f', label: 'F-F' },
];

const PROJECTILE_OPTIONS = [
    { key: 'donut',    label: 'Donut' },
    { key: 'donutS',   label: 'Sprinkle' },
    { key: 'icecream', label: 'Sorvete' },
    { key: 'apple',    label: 'Maca' },
    { key: 'burger',   label: 'Burger' },
];

function makeSelector(container: HTMLDivElement, options: { key: string; label: string }[], defaultKey: string): () => string {
    let selected = defaultKey;

    options.forEach(({ key, label }) => {
        const btn = document.createElement('button');
        btn.className = 'selector-btn' + (key === selected ? ' selected' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
            container.querySelectorAll('.selector-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selected = key;
        });
        container.appendChild(btn);
    });

    return () => selected;
}

function showEntryModal(onSubmit: (cfg: { name: string; characterModel: string; projectileModel: string }) => void) {
    const modal   = document.getElementById('entry-modal') as HTMLDivElement;
    const input   = document.getElementById('player-name-input') as HTMLInputElement;
    const btn     = document.getElementById('enter-btn') as HTMLButtonElement;
    const charDiv = document.getElementById('char-selector') as HTMLDivElement;
    const projDiv = document.getElementById('proj-selector') as HTMLDivElement;

    const getCharModel  = makeSelector(charDiv, CHARACTER_OPTIONS,  CHARACTER_OPTIONS[0].key);
    const getProjModel  = makeSelector(projDiv, PROJECTILE_OPTIONS, PROJECTILE_OPTIONS[0].key);

    input.value = getRandomGoblinName();
    input.select();

    const submit = () => {
        const name = input.value.trim() || getRandomGoblinName();
        modal.style.display = 'none';
        onSubmit({ name, characterModel: getCharModel(), projectileModel: getProjModel() });
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function initScene(SceneClass, playerConfig: { name?: string; characterModel?: string; projectileModel?: string } = {}) {
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
    showEntryModal(({ name, characterModel, projectileModel }) => {
        initScene(ProtectCrystalScene, { name, characterModel, projectileModel });
        window.addEventListener('resize', onWindowResize);
    });
});

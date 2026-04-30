import './style/main.css';
import DebugGui from './base/debug_gui.ts';
import ProtectCrystalScene from './scenes/protect_crystal.ts';
import BackgroundPreviewScene from './scenes/background_preview.ts';
import { CHARACTER_MODELS, PROJECTILE_MODELS } from './config/characters.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';

let currentScene: any = null;

function getRandomPlayerName(): string {
    const adj  = ['Crystal','Gem','Stone','Arcane','Sacred','Radiant','Ancient','Mystic','Prismatic','Noble','Eternal','Bright'];
    const noun = ['Guardian','Warden','Keeper','Sentinel','Knight','Mage','Ranger','Warrior','Champion','Defender','Sage','Protector'];
    return `${adj[Math.floor(Math.random() * adj.length)]} ${noun[Math.floor(Math.random() * noun.length)]}`;
}

// ── Model preview renderer ────────────────────────────────────────────────────

class ModelPreview {
    canvas: HTMLCanvasElement;
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private mixer: THREE.AnimationMixer | null = null;
    private clock: THREE.Clock;
    private animFrameId: number = 0;
    private autoRotate: boolean = false;
    private currentModel: THREE.Object3D | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.clock  = new THREE.Clock();

        const w = canvas.clientWidth  || 204;
        const h = canvas.clientHeight || 224;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(w, h, false);

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
        this.camera.position.set(0, 1.5, 3.5);
        this.camera.lookAt(0, 1, 0);

        this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const dir = new THREE.DirectionalLight(0xffffff, 1.5);
        dir.position.set(2, 4, 3);
        this.scene.add(dir);
        const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
        fill.position.set(-2, 1, -2);
        this.scene.add(fill);

        this.animate();
    }

    async load(path: string, isDraco: boolean, autoRotate: boolean): Promise<void> {
        this.autoRotate = autoRotate;
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            this.currentModel = null;
        }
        if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }

        const loader = new GLTFLoader();
        if (isDraco) {
            const draco = new DRACOLoader();
            draco.setDecoderPath('/draco/');
            loader.setDRACOLoader(draco);
        }

        return new Promise((resolve) => {
            loader.load(path, (gltf) => {
                const model = gltf.scene;
                const bbox = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3(); bbox.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                const targetSize = isDraco ? 2.5 : 1.2;
                const s = targetSize / maxDim;
                model.scale.setScalar(s);

                const bbox2 = new THREE.Box3().setFromObject(model);
                model.position.y = -bbox2.min.y;

                this.scene.add(model);
                this.currentModel = model;

                if (gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(model);
                    const idle = gltf.animations.find(a => a.name === 'idle') ?? gltf.animations[0];
                    this.mixer.clipAction(idle).play();
                }
                resolve();
            });
        });
    }

    private animate() {
        this.animFrameId = requestAnimationFrame(() => this.animate());
        const dt = this.clock.getDelta();
        if (this.mixer) this.mixer.update(dt);
        if (this.autoRotate && this.currentModel) this.currentModel.rotation.y += 0.02;
        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        cancelAnimationFrame(this.animFrameId);
        this.renderer.dispose();
    }
}

// ── Landing screen ────────────────────────────────────────────────────────────

function showLandingScreen(): Promise<{ isCreator: boolean; roomId?: string }> {
    return new Promise((resolve) => {
        const screen = document.createElement('div');
        screen.id = 'landing-screen';
        screen.innerHTML = `
            <img id="game-logo" src="/img/protect_crystal.png" alt="Protect the Crystal">
            <div id="landing-buttons">
                <button class="rpg-btn" id="create-btn">Criar Sala</button>
                <button class="rpg-btn" id="join-btn">Entrar na Sala</button>
            </div>
            <div id="join-section">
                <input id="room-code-input" class="rpg-input" type="text" maxlength="8"
                    placeholder="Código da sala" autocomplete="off">
                <button class="rpg-btn" id="room-enter-btn">Entrar</button>
            </div>
        `;
        document.body.appendChild(screen);

        setTimeout(() => document.getElementById('game-logo')!.classList.add('visible'), 100);

        document.getElementById('create-btn')!.addEventListener('click', () => {
            screen.remove();
            resolve({ isCreator: true });
        });

        document.getElementById('join-btn')!.addEventListener('click', () => {
            document.getElementById('landing-buttons')!.style.display = 'none';
            const js = document.getElementById('join-section')!;
            js.style.display = 'flex';
            document.getElementById('room-code-input')!.focus();
        });

        const doEnter = () => {
            const code = (document.getElementById('room-code-input') as HTMLInputElement).value.trim();
            if (!code) return;
            screen.remove();
            resolve({ isCreator: false, roomId: code });
        };

        document.getElementById('room-enter-btn')!.addEventListener('click', doEnter);
        (document.getElementById('room-code-input') as HTMLInputElement)
            .addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') doEnter(); });
    });
}

// ── Character selection menu ──────────────────────────────────────────────────

const CHARACTER_OPTIONS = [
    { key: 'male-a',   label: 'M-A' }, { key: 'male-b',   label: 'M-B' },
    { key: 'male-c',   label: 'M-C' }, { key: 'male-d',   label: 'M-D' },
    { key: 'male-e',   label: 'M-E' }, { key: 'male-f',   label: 'M-F' },
    { key: 'female-a', label: 'F-A' }, { key: 'female-b', label: 'F-B' },
    { key: 'female-c', label: 'F-C' }, { key: 'female-d', label: 'F-D' },
    { key: 'female-e', label: 'F-E' }, { key: 'female-f', label: 'F-F' },
];
const PROJECTILE_OPTIONS = [
    { key: 'donut',    label: 'Donut'    },
    { key: 'donutS',   label: 'Sprinkle' },
    { key: 'icecream', label: 'Sorvete'  },
    { key: 'apple',    label: 'Maçã'     },
    { key: 'burger',   label: 'Burger'   },
];

function showCharacterMenu(): Promise<{ name: string; characterModel: string; projectileModel: string }> {
    return new Promise((resolve) => {
        let selectedChar = CHARACTER_OPTIONS[0].key;
        let selectedProj = PROJECTILE_OPTIONS[0].key;

        const charBtns = CHARACTER_OPTIONS.map(o =>
            `<button class="rpg-btn-sq char-opt${o.key === selectedChar ? ' selected' : ''}" data-key="${o.key}">${o.label}</button>`
        ).join('');
        const projBtns = PROJECTILE_OPTIONS.map(o =>
            `<button class="rpg-btn-sq proj-opt${o.key === selectedProj ? ' selected' : ''}" data-key="${o.key}">${o.label}</button>`
        ).join('');

        const menu = document.createElement('div');
        menu.id = 'char-menu';
        menu.innerHTML = `
            <div id="char-menu-left" class="rpg-panel">
                <div class="rpg-menu-title">Guardião do Cristal</div>
                <label class="rpg-label">Nome do Guardião</label>
                <input id="char-name-input" class="rpg-input" type="text" maxlength="24" autocomplete="off">
                <label class="rpg-label">♂ Personagem</label>
                <div class="char-grid male-grid">${CHARACTER_OPTIONS.slice(0,6).map(o =>
                    `<button class="rpg-btn-sq char-opt${o.key === selectedChar ? ' selected' : ''}" data-key="${o.key}">${o.label}</button>`
                ).join('')}</div>
                <label class="rpg-label">♀ Personagem</label>
                <div class="char-grid female-grid">${CHARACTER_OPTIONS.slice(6).map(o =>
                    `<button class="rpg-btn-sq char-opt${o.key === selectedChar ? ' selected' : ''}" data-key="${o.key}">${o.label}</button>`
                ).join('')}</div>
                <label class="rpg-label">Projétil</label>
                <div class="proj-grid">${projBtns}</div>
                <button class="rpg-btn" id="play-btn">⚔ Jogar</button>
            </div>
            <div id="char-menu-right">
                <div class="rpg-label-sm">Personagem</div>
                <div id="char-preview-panel" class="rpg-panel-inset">
                    <canvas id="char-preview-canvas"></canvas>
                    <div class="preview-loading" id="char-loading">Carregando...</div>
                </div>
                <div class="rpg-label-sm">Projétil</div>
                <div id="proj-preview-panel" class="rpg-panel-inset">
                    <canvas id="proj-preview-canvas"></canvas>
                    <div class="preview-loading" id="proj-loading">Carregando...</div>
                </div>
            </div>
        `;
        document.body.appendChild(menu);

        (document.getElementById('char-name-input') as HTMLInputElement).value = getRandomPlayerName();

        let charPreview: ModelPreview | null = null;
        let projPreview: ModelPreview | null = null;

        const initPreviews = () => {
            const cc = document.getElementById('char-preview-canvas') as HTMLCanvasElement;
            const pc = document.getElementById('proj-preview-canvas') as HTMLCanvasElement;
            charPreview = new ModelPreview(cc);
            projPreview = new ModelPreview(pc);

            const charLoading = document.getElementById('char-loading')!;
            const projLoading = document.getElementById('proj-loading')!;

            charPreview.load(CHARACTER_MODELS[selectedChar], true, false)
                .then(() => { charLoading.style.display = 'none'; });
            projPreview.load(PROJECTILE_MODELS[selectedProj], false, true)
                .then(() => { projLoading.style.display = 'none'; });
        };
        setTimeout(initPreviews, 60);

        menu.querySelectorAll<HTMLButtonElement>('.char-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                menu.querySelectorAll('.char-opt').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedChar = btn.dataset.key!;
                const charLoading = document.getElementById('char-loading')!;
                charLoading.style.display = 'flex';
                charPreview?.load(CHARACTER_MODELS[selectedChar], true, false)
                    .then(() => { charLoading.style.display = 'none'; });
            });
        });

        menu.querySelectorAll<HTMLButtonElement>('.proj-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                menu.querySelectorAll('.proj-opt').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedProj = btn.dataset.key!;
                const projLoading = document.getElementById('proj-loading')!;
                projLoading.style.display = 'flex';
                projPreview?.load(PROJECTILE_MODELS[selectedProj], false, true)
                    .then(() => { projLoading.style.display = 'none'; });
            });
        });

        document.getElementById('play-btn')!.addEventListener('click', () => {
            const name = (document.getElementById('char-name-input') as HTMLInputElement).value.trim()
                || getRandomPlayerName();
            charPreview?.destroy();
            projPreview?.destroy();
            menu.remove();
            resolve({ name, characterModel: selectedChar, projectileModel: selectedProj });
        });
    });
}

// ── Scene management ──────────────────────────────────────────────────────────

function startBlurFade() {
    const overlay = document.getElementById('blur-overlay');
    if (!overlay) return;
    overlay.classList.add('clearing');
    setTimeout(() => { overlay.style.display = 'none'; }, 1600);
}

function initScene(SceneClass: any, playerConfig: { name?: string; characterModel?: string; projectileModel?: string } = {}) {
    const container = document.getElementById('container')!;
    if (currentScene) {
        currentScene.destroy();
        container.innerHTML = '';
    }
    currentScene = new SceneClass(new DebugGui(), playerConfig);
    currentScene.init(container);
}

function onWindowResize() {
    if (currentScene && typeof currentScene.resize === 'function') currentScene.resize();
}

// ── Entry point ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('container')!;

    const bgScene = new BackgroundPreviewScene();
    bgScene.init(container);
    window.addEventListener('resize', () => bgScene.resize());

    const { isCreator, roomId } = await showLandingScreen();
    if (isCreator) {
        history.pushState({}, '', window.location.pathname);
    } else if (roomId) {
        history.pushState({}, '', `${window.location.pathname}?room=${roomId}`);
    }

    const { name, characterModel, projectileModel } = await showCharacterMenu();

    bgScene.destroy();
    container.innerHTML = '';

    startBlurFade();
    initScene(ProtectCrystalScene, { name, characterModel, projectileModel });
    window.addEventListener('resize', onWindowResize);
});

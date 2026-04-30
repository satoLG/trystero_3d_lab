import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import ThreejsScene from '../base/scene.ts';
import { joinRoom, selfId } from '@trystero-p2p/firebase';
import { initializeApp } from 'firebase/app';
import { CAMERA_CONFIG } from '../config/camera.ts';
import { PHYSICS_CONFIG } from '../config/physics.ts';
import { SCENE_CONFIG } from '../config/scene.ts';
import { CASTLE_CONFIG } from '../config/castle.ts';
import { AUDIO_CONFIG } from '../config/audio.ts';
import { PROJECTILE_MODELS } from '../config/characters.ts';
import { seededRandom } from '../utils/seededRandom.ts';
import { buildCastle, destroyCastle } from '../modules/castle.ts';
import { initSounds, enableMusicOnUserGesture } from '../modules/audio.ts';
import { loadLocalCharacter, spawnPeer, removePeer, createNameLabel, updatePeerNameLabel } from '../modules/characters.ts';
import { setupGround, setupLighting, placeStaticObjects, plantTrees, removeTrees, addForestFog, removeForestFog } from '../modules/environment.ts';

const firebaseApp = initializeApp({
    apiKey:            "AIzaSyCiEcodGwYY39kZSYVmPEToXd9mwUmPHmI",
    authDomain:        "trystero-3d-app-signal.firebaseapp.com",
    databaseURL:       "https://trystero-3d-app-signal-default-rtdb.firebaseio.com",
    projectId:         "trystero-3d-app-signal",
    storageBucket:     "trystero-3d-app-signal.firebasestorage.app",
    messagingSenderId: "286456019492",
    appId:             "1:286456019492:web:76e69f94ec1e298fb436b1",
});

const ISO_OFFSET = new THREE.Vector3(
    CAMERA_CONFIG.isoOffset.x,
    CAMERA_CONFIG.isoOffset.y,
    CAMERA_CONFIG.isoOffset.z,
);

function getOrCreateRoomId(): { id: string; isCreator: boolean } {
    const params = new URLSearchParams(window.location.search);
    const existing = params.get('room');
    if (existing) return { id: existing, isCreator: false };
    const id = Math.random().toString(36).substr(2, 8);
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    window.history.replaceState({}, '', url.toString());
    return { id, isCreator: true };
}

class ProtectCrystalScene extends ThreejsScene {
    plane: any
    directionalLight: THREE.DirectionalLight | null
    ambientLight: THREE.AmbientLight | null
    character: any
    characterBody: any
    characterSpeed: number
    jumpVelocity: number
    isJumping: boolean
    keys: Record<string, boolean>
    geometries: any[]
    objectModels: any[]
    animationMixers: THREE.AnimationMixer[]
    cameraTransitioning: boolean
    backgroundMusic: HTMLAudioElement | null
    physicsWorld: CANNON.World | null
    mobileMove: { x: number; y: number }
    mobileJump: boolean
    isMobile: boolean
    room: any
    peers: Record<string, any>
    peerModels: Record<string, any>
    peerBodies: Record<string, any>
    lastSent: number
    peerLoading: Record<string, boolean>
    currentAnim: string | null
    lastSentAnim: string | null
    peerAnims: Record<string, string>
    projectiles: any[]
    breakableTargets: any[]
    lastShot: number
    shootCooldown: number
    debris: any[]
    damageThreshold: number
    projectileSpeed: number
    projectileMass: number
    breakForce: number
    GROUPS: Record<string, number>
    targetSyncTimeout: any
    initialTargetsSent: boolean
    lastTargetSync: number
    targetSyncInterval: number
    sendMove: any
    sendAnim: any
    sendProjectile: any
    sendTarget: any
    sendInitialTargets: any
    sendHit: any
    sendTargetPhysics: any
    targetLastMoved: Record<string, number>
    peerTargets: Record<string, { position: THREE.Vector3; rotY: number }>
    groundMaterial: any
    characterMaterial: any
    peerNames: Record<string, string>
    peerNameLabels: Record<string, any>
    peerMixers: Record<string, THREE.AnimationMixer>
    roomId: string
    isRoomCreator: boolean
    myName: string
    characterModel: string
    projectileModel: string
    peerCharacterModels: Record<string, string>
    peerProjectileModels: Record<string, string>
    sendMyInfo: any
    sendRequestSync: any
    sendSyncAck: any
    animNames: Record<string, string>
    isPlayingSpell: boolean
    spellAnimTimeout: any
    pendingRemovals: any[]
    sendCubeImpact: any
    peerLastSeen: Record<string, number>
    lastInfoSent: Record<string, number>
    timedOutPeers: Set<string>
    pingInterval: any
    synced: boolean
    syncTimeout: any
    currentHostId: string
    peersSynced: Set<string>
    knownPeers: Set<string>
    creatorPeerId: string
    hostBroadcastInterval: any
    hostWorker: Worker | null
    aimTarget: THREE.Vector3
    mouseNDC: THREE.Vector2
    projectileCache: Map<string, THREE.Group>
    roundedCubeModel: THREE.Group | null
    isoZoomScale: number
    fountainModel: any
    crystalModel: any
    treeCrookedModel: any
    treeHighCrookedModel: any
    castleWallModel: any
    castleCornerModel: any
    castleGateModel: any
    castleTowerModel: any
    hedgeModel: any
    hedgeCurvedModel: any
    hedgeLargeModel: any
    lanternModel: any
    castleWallScale: number
    nsRotOffset: number
    ewRotOffset: number
    cornerScale: number
    cornerRotOffset: number
    towerScale: number
    towerRotOffset: number
    hedgeCurvedScale: number
    hedgeCurvedRotOffset: number
    hedgeCurvedDistFromCenter: number
    hedgeCountPerSide: number
    hedgeNsScale: number
    hedgeNsRotOffset: number
    hedgeNsInset: number
    hedgeEwScale: number
    hedgeEwRotOffset: number
    hedgeEwInset: number
    lanternScale: number
    lanternDistFromCenter: number
    lanternLightY: number
    lanternLightIntensity: number
    lanternLightDistance: number
    roundedCubeScale: number
    treeCount: number
    treeForestInnerRadius: number
    treeForestOuterRadius: number
    treeScale: number
    forestFogRadius: number
    forestFogOpacity: number
    forestFogHeight: number
    forestFogMesh: THREE.Object3D | null
    crystalYOffset: number
    crystalLightIntensity: number
    crystalLightDistance: number
    castleMeshes: THREE.Object3D[]
    castleBodies: CANNON.Body[]
    castleLanternLights: THREE.PointLight[]
    fountainMesh: THREE.Object3D | null
    crystalMesh: THREE.Object3D | null
    crystalBaseY: number
    crystalLight: THREE.PointLight | null
    crystalBody: CANNON.Body | null
    treeMeshes: THREE.Object3D[]
    treeBodies: CANNON.Body[]
    isMovingLocal: boolean
    isOnGround: boolean
    wasOnGround: boolean
    footstepGrassSounds: HTMLAudioElement[]
    footstepConcreteSounds: HTMLAudioElement[]
    footstepSounds: HTMLAudioElement[]
    impactWoodSounds: HTMLAudioElement[]
    jumpSound: HTMLAudioElement | null
    concreteRadius: number
    lastFootstepTime: number
    footstepIndex: number
    lastImpactTime: number

    constructor(debugGui = null, playerConfig: { name?: string; characterModel?: string; projectileModel?: string } = {}) {
        super(debugGui);
        this.plane = null;
        this.directionalLight = null;
        this.ambientLight = null;
        this.character = null;
        this.characterBody = null;
        this.characterSpeed = PHYSICS_CONFIG.characterSpeed;
        this.jumpVelocity   = PHYSICS_CONFIG.jumpVelocity;
        this.isJumping = false;
        this.keys = {};
        this.geometries = [];
        this.objectModels = [];
        this.animationMixers = [];
        this.cameraTransitioning = false;
        this.backgroundMusic = null;
        this.physicsWorld = null;
        this.mobileMove = { x: 0, y: 0 };
        this.mobileJump = false;
        this.isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

        const room = getOrCreateRoomId();
        this.roomId        = room.id;
        this.isRoomCreator = room.isCreator;
        this.myName          = playerConfig.name  || this.getRandomPlayerName();
        this.characterModel  = playerConfig.characterModel  || 'male-a';
        this.projectileModel = playerConfig.projectileModel || 'donut';
        this.room = null;
        this.peers = {};
        this.peerModels = {};
        this.peerBodies = {};
        this.peerTargets = {};
        this.peerCharacterModels = {};
        this.peerProjectileModels = {};
        this.peerNames = {};
        this.peerNameLabels = {};
        this.peerMixers = {};
        this.lastSent = 0;
        this.peerLoading = {};
        this.currentAnim = null;
        this.lastSentAnim = null;
        this.peerAnims = {};
        this.animNames = {};
        this.isPlayingSpell = false;
        this.spellAnimTimeout = null;
        this.projectiles = [];
        this.breakableTargets = [];
        this.lastShot = 0;
        this.shootCooldown    = PHYSICS_CONFIG.shootCooldown;
        this.debris = [];
        this.damageThreshold  = PHYSICS_CONFIG.damageThreshold;
        this.projectileSpeed  = PHYSICS_CONFIG.projectileSpeed;
        this.projectileMass   = PHYSICS_CONFIG.projectileMass;
        this.breakForce       = PHYSICS_CONFIG.breakForce;
        this.GROUPS = {
            GROUND: 1, BREAKABLE: 2, PROJECTILE: 4,
            CHARACTER: 8, DEBRIS: 16, PEER_CHARACTER: 32, STATIC: 64,
        };
        this.targetSyncTimeout  = null;
        this.initialTargetsSent = false;
        this.lastTargetSync     = 0;
        this.targetSyncInterval = 5000;
        this.sendMove = null; this.sendAnim = null; this.sendProjectile = null;
        this.sendTarget = null; this.sendInitialTargets = null; this.sendHit = null;
        this.sendTargetPhysics = null;
        this.targetLastMoved = {};
        this.pendingRemovals = [];
        this.sendCubeImpact = null;
        this.sendMyInfo = null; this.sendRequestSync = null; this.sendSyncAck = null;
        this.peerLastSeen = {};
        this.lastInfoSent = {};
        this.timedOutPeers = new Set();
        this.pingInterval = null;
        this.synced = false;
        this.syncTimeout = null;
        this.currentHostId = '';
        this.peersSynced = new Set();
        this.knownPeers = new Set();
        this.creatorPeerId = '';
        this.hostBroadcastInterval = null;
        this.hostWorker = null;
        this.aimTarget = new THREE.Vector3();
        this.mouseNDC  = new THREE.Vector2();
        this.projectileCache   = new Map();
        this.roundedCubeModel  = null;
        this.isoZoomScale = 1.0;
        this.fountainModel = null; this.crystalModel = null;
        this.treeCrookedModel = null; this.treeHighCrookedModel = null;
        this.castleWallModel = null; this.castleCornerModel = null;
        this.castleGateModel = null; this.castleTowerModel  = null;
        this.hedgeModel = null; this.hedgeCurvedModel = null;
        this.hedgeLargeModel = null; this.lanternModel = null;
        this.castleWallScale          = CASTLE_CONFIG.wallScale;
        this.nsRotOffset              = CASTLE_CONFIG.nsRotOffset;
        this.ewRotOffset              = CASTLE_CONFIG.ewRotOffset;
        this.cornerScale              = CASTLE_CONFIG.cornerScale;
        this.cornerRotOffset          = CASTLE_CONFIG.cornerRotOffset;
        this.towerScale               = CASTLE_CONFIG.towerScale;
        this.towerRotOffset           = CASTLE_CONFIG.towerRotOffset;
        this.hedgeCurvedScale         = CASTLE_CONFIG.hedgeCurvedScale;
        this.hedgeCurvedRotOffset     = CASTLE_CONFIG.hedgeCurvedRotOffset;
        this.hedgeCurvedDistFromCenter = CASTLE_CONFIG.hedgeCurvedDistFromCenter;
        this.hedgeCountPerSide        = CASTLE_CONFIG.hedgeCountPerSide;
        this.hedgeNsScale             = CASTLE_CONFIG.hedgeNsScale;
        this.hedgeNsRotOffset         = CASTLE_CONFIG.hedgeNsRotOffset;
        this.hedgeNsInset             = CASTLE_CONFIG.hedgeNsInset;
        this.hedgeEwScale             = CASTLE_CONFIG.hedgeEwScale;
        this.hedgeEwRotOffset         = CASTLE_CONFIG.hedgeEwRotOffset;
        this.hedgeEwInset             = CASTLE_CONFIG.hedgeEwInset;
        this.lanternScale             = CASTLE_CONFIG.lanternScale;
        this.lanternDistFromCenter    = CASTLE_CONFIG.lanternDistFromCenter;
        this.lanternLightY            = CASTLE_CONFIG.lanternLightY;
        this.lanternLightIntensity    = CASTLE_CONFIG.lanternLightIntensity;
        this.lanternLightDistance     = CASTLE_CONFIG.lanternLightDistance;
        this.roundedCubeScale         = SCENE_CONFIG.roundedCubeScale;
        this.treeCount                = SCENE_CONFIG.treeCount;
        this.treeForestInnerRadius    = SCENE_CONFIG.treeForestInnerRadius;
        this.treeForestOuterRadius    = SCENE_CONFIG.treeForestOuterRadius;
        this.treeScale                = SCENE_CONFIG.treeScale;
        this.forestFogRadius          = SCENE_CONFIG.forestFogRadius;
        this.forestFogOpacity         = SCENE_CONFIG.forestFogOpacity;
        this.forestFogHeight          = SCENE_CONFIG.forestFogHeight;
        this.forestFogMesh            = null;
        this.crystalYOffset           = SCENE_CONFIG.crystalYOffset;
        this.crystalLightIntensity    = SCENE_CONFIG.crystalLightIntensity;
        this.crystalLightDistance     = SCENE_CONFIG.crystalLightDistance;
        this.castleMeshes = []; this.castleBodies = []; this.castleLanternLights = [];
        this.fountainMesh = null; this.crystalMesh = null;
        this.crystalBaseY = 0; this.crystalLight = null; this.crystalBody = null;
        this.treeMeshes = []; this.treeBodies = [];
        this.isMovingLocal = false; this.isOnGround = false; this.wasOnGround = false;
        this.footstepGrassSounds = []; this.footstepConcreteSounds = [];
        this.footstepSounds = []; this.impactWoodSounds = [];
        this.jumpSound = null;
        this.concreteRadius    = SCENE_CONFIG.concreteRadius;
        this.lastFootstepTime  = 0;
        this.footstepIndex     = 0;
        this.lastImpactTime    = 0;
    }

    // ── Module delegation ────────────────────────────────────────────────────
    buildCastle()  { buildCastle(this); }
    destroyCastle() { destroyCastle(this); }
    initSounds()   { initSounds(this); }
    enableMusicOnUserGesture() { enableMusicOnUserGesture(this); }
    loadLocalCharacter()       { loadLocalCharacter(this); }
    spawnPeer(peerId: string)  { spawnPeer(this, peerId); }
    removePeer(peerId: string) { removePeer(this, peerId); }
    createNameLabel(name: string) { return createNameLabel(name); }
    updatePeerNameLabel(peerId: string, name: string) { updatePeerNameLabel(this, peerId, name); }
    placeStaticObjects() { placeStaticObjects(this); }

    // ── Host management ──────────────────────────────────────────────────────
    get isPhysicsHost(): boolean {
        if (!this.synced) return false;
        if (this.isRoomCreator) return true;
        return this.creatorPeerId === '' && this.currentHostId === selfId;
    }

    electNewHost(excludePeerId?: string) {
        const peerIds = [...this.knownPeers].filter(id => !this.timedOutPeers.has(id) && id !== excludePeerId);
        this.currentHostId = [selfId, ...peerIds].sort()[0];
    }

    finishSync() {
        if (this.synced) return;
        this.synced = true;
        clearTimeout(this.syncTimeout);
        this.electNewHost();
        console.log('[SYNC] finishSync | isRoomCreator:', this.isRoomCreator, '| isPhysicsHost:', this.isPhysicsHost, '| targets:', this.breakableTargets.length);
        if (this.isPhysicsHost && this.breakableTargets.length === 0) {
            const doCreate = () => { this.createInitialTargets(); this.syncTargetPhysicsType(); };
            if (this.roundedCubeModel) doCreate();
            else { const w = setInterval(() => { if (this.roundedCubeModel) { clearInterval(w); doCreate(); } }, 50); }
        } else {
            this.syncTargetPhysicsType();
        }
        this.loadLocalCharacter();
        if (this.isPhysicsHost && this.sendInitialTargets) {
            this.startHostBroadcast();
        }
    }

    startHostBroadcast() {
        if (this.hostBroadcastInterval || this.hostWorker) return;
        console.log('[SYNC] startHostBroadcast (Web Worker)');
        const workerSrc = `setInterval(() => postMessage('tick'), 5000);`;
        try {
            const blob = new Blob([workerSrc], { type: 'application/javascript' });
            this.hostWorker = new Worker(URL.createObjectURL(blob));
            this.hostWorker.onmessage = () => this._doHostBroadcast();
        } catch (_) {
            this.hostBroadcastInterval = setInterval(() => this._doHostBroadcast(), 5000);
        }
    }

    _doHostBroadcast() {
        if (!this.isPhysicsHost || !this.sendInitialTargets) { this._stopHostBroadcast(); return; }
        const activePeers = [...this.knownPeers].filter(id => !this.timedOutPeers.has(id));
        if (activePeers.length === 0) return;
        const unconfirmed = activePeers.filter(id => !this.peersSynced.has(id));
        if (unconfirmed.length === 0) { this._stopHostBroadcast(); return; }
        const states = this.breakableTargets.map(t => ({
            id: t.id,
            px: t.body.position.x, py: t.body.position.y, pz: t.body.position.z,
            qx: t.body.quaternion.x, qy: t.body.quaternion.y,
            qz: t.body.quaternion.z, qw: t.body.quaternion.w,
            health: t.health,
        }));
        this.sendInitialTargets(states);
        this.sendMyInfo?.({ name: this.myName, characterModel: this.characterModel, projectileModel: this.projectileModel });
    }

    _stopHostBroadcast() {
        if (this.hostWorker)           { this.hostWorker.terminate(); this.hostWorker = null; }
        if (this.hostBroadcastInterval){ clearInterval(this.hostBroadcastInterval); this.hostBroadcastInterval = null; }
    }

    // ── Sync helpers ─────────────────────────────────────────────────────────
    syncTargetPhysicsType(becameHost = false) {
        const host = this.isPhysicsHost;
        this.breakableTargets.forEach(target => {
            if (host) { target.body.type = CANNON.Body.DYNAMIC; target.body.mass = 10; }
            else      { target.body.type = CANNON.Body.KINEMATIC; target.body.mass = 0; }
            target.body.velocity.set(0, 0, 0);
            target.body.angularVelocity.set(0, 0, 0);
            target.body.updateMassProperties();
        });
        if (becameHost) this.showHostToast('Você agora é o host da física');
        this.updatePlayerList();
    }

    showRoomError() {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.style.display = '';
            screen.innerHTML = `
                <div style="text-align:center;padding:20px;">
                    <div style="font-size:1.2em;margin-bottom:16px;">Sala não encontrada ou host desconectado.</div>
                    <div style="font-size:0.85em;color:#aaa;margin-bottom:24px;">Verifique se o link está correto e tente novamente.</div>
                    <button onclick="location.reload()" style="padding:10px 28px;font-family:courier;font-size:1em;cursor:pointer;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);border-radius:6px;color:#fff;">Atualizar página</button>
                </div>`;
        }
    }

    showHostToast(msg: string) {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 18px;border-radius:8px;font-size:14px;z-index:9999;pointer-events:none;';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    findAnim(clips: THREE.AnimationClip[], candidates: string[]): string {
        for (const name of candidates) {
            if (clips.find(c => c.name === name)) return name;
        }
        return clips[0]?.name ?? '';
    }

    triggerSpellAnimation() {
        if (!this.animNames?.spell || !this.character?.animations) return;
        this.isPlayingSpell = true;
        const action = this.character.animations[this.animNames.spell];
        if (action) { action.loop = THREE.LoopOnce; action.clampWhenFinished = true; action.reset(); }
        this.playAnimation(this.animNames.spell);
        clearTimeout(this.spellAnimTimeout);
        this.spellAnimTimeout = setTimeout(() => { this.isPlayingSpell = false; }, 900);
    }

    // ── Debug GUI ────────────────────────────────────────────────────────────
    initDebugGui() {
        const copyConfig = (label: string, obj: Record<string, any>) => {
            const entries = Object.entries(obj).map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`).join('\n');
            const code = `export const ${label.toUpperCase()}_CONFIG = {\n${entries}\n};\n`;
            navigator.clipboard.writeText(code).then(() => {
                const toast = document.createElement('div');
                toast.style.cssText = 'position:fixed;top:50px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#4f4;padding:8px 18px;border-radius:8px;font-size:13px;z-index:9999;pointer-events:none;';
                toast.textContent = `✓ ${label} config copiado!`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2000);
            });
        };

        // ── Camera ─────────────────────────────────────────────────────────────
        const cameraFolder = this.debugGui.gui.addFolder('Camera');
        cameraFolder.add(this.camera.position, 'x', -50, 50).name('Position X').listen();
        cameraFolder.add(this.camera.position, 'y', -50, 50).name('Position Y').listen();
        cameraFolder.add(this.camera.position, 'z', -50, 50).name('Position Z').listen();

        // ── Castle super-folder ────────────────────────────────────────────────
        const rebuild = () => { this.destroyCastle(); this.buildCastle(); };
        const castleFolder = this.debugGui.gui.addFolder('Castle');
        castleFolder.add({ copy: () => copyConfig('CASTLE', {
            wallScale: this.castleWallScale,
            nsRotOffset: this.nsRotOffset,
            ewRotOffset: this.ewRotOffset,
            cornerScale: this.cornerScale,
            cornerRotOffset: this.cornerRotOffset,
            towerScale: this.towerScale,
            towerRotOffset: this.towerRotOffset,
            hedgeCurvedScale: this.hedgeCurvedScale,
            hedgeCurvedRotOffset: this.hedgeCurvedRotOffset,
            hedgeCurvedDistFromCenter: this.hedgeCurvedDistFromCenter,
            hedgeCountPerSide: this.hedgeCountPerSide,
            hedgeNsScale: this.hedgeNsScale,
            hedgeNsRotOffset: this.hedgeNsRotOffset,
            hedgeNsInset: this.hedgeNsInset,
            hedgeEwScale: this.hedgeEwScale,
            hedgeEwRotOffset: this.hedgeEwRotOffset,
            hedgeEwInset: this.hedgeEwInset,
            lanternScale: this.lanternScale,
            lanternDistFromCenter: this.lanternDistFromCenter,
            lanternLightY: this.lanternLightY,
            lanternLightIntensity: this.lanternLightIntensity,
            lanternLightDistance: this.lanternLightDistance,
        }) }, 'copy').name('📋 Copy Castle Config');

        const wallsFolder = castleFolder.addFolder('Walls');
        wallsFolder.add(this, 'castleWallScale', 0.5, 8).name('Scale').onFinishChange(rebuild);
        wallsFolder.add(this, 'nsRotOffset', -Math.PI, Math.PI).name('N/S Rot Offset').onFinishChange(rebuild);
        wallsFolder.add(this, 'ewRotOffset', -Math.PI, Math.PI).name('E/W Rot Offset').onFinishChange(rebuild);

        const cornersFolder = castleFolder.addFolder('Corners');
        cornersFolder.add(this, 'cornerScale', 0.5, 8).name('Corner Scale').onFinishChange(rebuild);
        cornersFolder.add(this, 'cornerRotOffset', -Math.PI, Math.PI).name('Corner Rot').onFinishChange(rebuild);
        cornersFolder.add(this, 'towerScale', 0.5, 8).name('Tower Scale').onFinishChange(rebuild);
        cornersFolder.add(this, 'towerRotOffset', -Math.PI, Math.PI).name('Tower Rot').onFinishChange(rebuild);

        const hedgesCurvedFolder = castleFolder.addFolder('Hedges (Curved)');
        hedgesCurvedFolder.add(this, 'hedgeCurvedScale', 0.5, 5).name('Scale').onFinishChange(rebuild);
        hedgesCurvedFolder.add(this, 'hedgeCurvedRotOffset', -Math.PI, Math.PI).name('Rot (inward)').onFinishChange(rebuild);
        hedgesCurvedFolder.add(this, 'hedgeCurvedDistFromCenter', 0, 20).name('Dist from Center').onFinishChange(rebuild);

        const hedgesNsFolder = castleFolder.addFolder('Hedges (N/S)');
        hedgesNsFolder.add(this, 'hedgeCountPerSide', 1, 6, 1).name('Count per Side').onFinishChange(rebuild);
        hedgesNsFolder.add(this, 'hedgeNsScale', 0.5, 5).name('Scale').onFinishChange(rebuild);
        hedgesNsFolder.add(this, 'hedgeNsRotOffset', -Math.PI, Math.PI).name('Rot Offset').onFinishChange(rebuild);
        hedgesNsFolder.add(this, 'hedgeNsInset', 0, 5).name('Wall Inset').onFinishChange(rebuild);

        const hedgesEwFolder = castleFolder.addFolder('Hedges (E/W)');
        hedgesEwFolder.add(this, 'hedgeEwScale', 0.5, 5).name('Scale').onFinishChange(rebuild);
        hedgesEwFolder.add(this, 'hedgeEwRotOffset', -Math.PI, Math.PI).name('Rot Offset').onFinishChange(rebuild);
        hedgesEwFolder.add(this, 'hedgeEwInset', 0, 5).name('Wall Inset').onFinishChange(rebuild);

        const lanternsFolder = castleFolder.addFolder('Lanterns');
        lanternsFolder.add(this, 'lanternScale', 0.5, 8).name('Scale').onFinishChange(rebuild);
        lanternsFolder.add(this, 'lanternDistFromCenter', 0, 20).name('Dist from Center').onFinishChange(rebuild);
        lanternsFolder.add(this, 'lanternLightY', 0, 10).name('Light Y (×scale)').onFinishChange(rebuild);
        lanternsFolder.add(this, 'lanternLightIntensity', 0, 200).name('Intensity').onChange(() => {
            this.castleLanternLights.forEach(l => { l.intensity = this.lanternLightIntensity; });
        });
        lanternsFolder.add(this, 'lanternLightDistance', 1, 200).name('Distance').onChange(() => {
            this.castleLanternLights.forEach(l => { l.distance = this.lanternLightDistance; });
        });

        // ── Scene super-folder ─────────────────────────────────────────────────
        const sceneFolder = this.debugGui.gui.addFolder('Scene');
        sceneFolder.add({ copy: () => copyConfig('SCENE', {
            roundedCubeScale: this.roundedCubeScale,
            targetCount: this.breakableTargets.length || SCENE_CONFIG.targetCount,
            directionalLightIntensity: this.directionalLight.intensity,
            directionalLightPos: { x: this.directionalLight.position.x, y: this.directionalLight.position.y, z: this.directionalLight.position.z },
            ambientLightIntensity: this.ambientLight.intensity,
            treeCount: this.treeCount,
            treeForestInnerRadius: this.treeForestInnerRadius,
            treeForestOuterRadius: this.treeForestOuterRadius,
            treeScale: this.treeScale,
            forestFogRadius: this.forestFogRadius,
            forestFogOpacity: this.forestFogOpacity,
            forestFogHeight: this.forestFogHeight,
            crystalYOffset: this.crystalYOffset,
            crystalLightIntensity: this.crystalLightIntensity,
            crystalLightDistance: this.crystalLightDistance,
        }) }, 'copy').name('📋 Copy Scene Config');

        const respawnCubes = () => {
            this.breakableTargets.forEach(t => { this.scene.remove(t.mesh); this.physicsWorld.removeBody(t.body); });
            this.breakableTargets = [];
            this.createInitialTargets();
            this.syncTargetPhysicsType();
        };
        const cubeFolder = sceneFolder.addFolder('Cubes');
        cubeFolder.add(this, 'roundedCubeScale', 0.5, 8).name('Scale').onFinishChange(respawnCubes);
        cubeFolder.add({ respawn: respawnCubes }, 'respawn').name('Respawn Targets');

        const lightingFolder = sceneFolder.addFolder('Lighting');
        lightingFolder.add(this.directionalLight.position, 'x', -100, 100).name('Dir X').listen();
        lightingFolder.add(this.directionalLight.position, 'y', -100, 100).name('Dir Y').listen();
        lightingFolder.add(this.directionalLight.position, 'z', -100, 100).name('Dir Z').listen();
        lightingFolder.add(this.directionalLight, 'intensity', 0, 10).name('Dir Intensity').listen();
        lightingFolder.add(this.ambientLight, 'intensity', 0, 6).name('Ambient Intensity').listen();

        const rebuildTrees = () => { removeTrees(this); plantTrees(this); };
        const treesFolder = sceneFolder.addFolder('Trees');
        treesFolder.add(this, 'treeCount', 10, 2000, 1).name('Count');
        treesFolder.add(this, 'treeForestInnerRadius', 10, 120).name('Inner Radius');
        treesFolder.add(this, 'treeForestOuterRadius', 20, 150).name('Outer Radius');
        treesFolder.add({ rebuild: rebuildTrees }, 'rebuild').name('Rebuild Forest');

        const rebuildFog = () => { removeForestFog(this); addForestFog(this); };
        const fogFolder = sceneFolder.addFolder('Forest Fog');
        fogFolder.add(this, 'forestFogRadius', 20, 200).name('Radius').onFinishChange(rebuildFog);
        fogFolder.add(this, 'forestFogOpacity', 0, 1).name('Opacity').onFinishChange(rebuildFog);
        fogFolder.add(this, 'forestFogHeight', 5, 100).name('Height').onFinishChange(rebuildFog);

        const crystalFolder = sceneFolder.addFolder('Crystal & Fountain');
        crystalFolder.add(this, 'crystalYOffset', 0, 10).name('Crystal Y Offset').onFinishChange(() => {
            if (!this.crystalMesh || !this.crystalLight || !this.crystalBody) return;
            if (this.fountainMesh) {
                const fbbox = new THREE.Box3().setFromObject(this.fountainMesh);
                this.crystalBaseY = fbbox.max.y + this.crystalYOffset;
            } else {
                this.crystalBaseY += this.crystalYOffset;
            }
            this.crystalMesh.position.y = this.crystalBaseY;
            this.crystalLight.position.y = this.crystalBaseY;
            this.crystalBody.position.y = this.crystalBaseY;
        });
        crystalFolder.add(this, 'crystalLightIntensity', 0, 30).name('Light Intensity').onChange(() => {
            if (this.crystalLight) this.crystalLight.intensity = this.crystalLightIntensity;
        });
        crystalFolder.add(this, 'crystalLightDistance', 0, 100).name('Light Distance').onChange(() => {
            if (this.crystalLight) this.crystalLight.distance = this.crystalLightDistance;
        });

        // ── Physics ────────────────────────────────────────────────────────────
        const physFolder = this.debugGui.gui.addFolder('Physics');
        physFolder.add({ copy: () => copyConfig('PHYSICS', {
            characterSpeed: this.characterSpeed,
            jumpVelocity: this.jumpVelocity,
            projectileSpeed: this.projectileSpeed,
            projectileMass: this.projectileMass,
            shootCooldown: this.shootCooldown,
        }) }, 'copy').name('📋 Copy Physics Config');
        physFolder.add(this, 'characterSpeed', 1, 20).name('Speed').listen();
        physFolder.add(this, 'jumpVelocity', 2, 20).name('Jump').listen();
        physFolder.add(this, 'projectileSpeed', 5, 50).name('Proj Speed').listen();
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    init(container: HTMLElement) {
        const earlyLoader = new GLTFLoader();
        earlyLoader.load('/models/testlab/objects/rounded_cube_doodle.glb', (gltf) => {
            this.roundedCubeModel = gltf.scene;
        });
        const staticLoader = new GLTFLoader();
        staticLoader.load('/models/testlab/structures/fountain-round.glb',               g => { this.fountainModel        = g.scene; });
        staticLoader.load('/models/testlab/objects/cristal.glb',                         g => { this.crystalModel         = g.scene; });
        staticLoader.load('/models/testlab/objects/tree-crooked.glb',                    g => { this.treeCrookedModel     = g.scene; });
        staticLoader.load('/models/testlab/objects/tree-high-crooked.glb',               g => { this.treeHighCrookedModel = g.scene; });
        staticLoader.load('/models/testlab/structures/castle/wall.glb',                  g => { this.castleWallModel      = g.scene; });
        staticLoader.load('/models/testlab/structures/castle/wall-narrow-corner.glb',    g => { this.castleCornerModel    = g.scene; });
        staticLoader.load('/models/testlab/structures/castle/wall-narrow-gate.glb',      g => { this.castleGateModel      = g.scene; });
        staticLoader.load('/models/testlab/structures/castle/tower-square-roof.glb',     g => { this.castleTowerModel     = g.scene; });
        staticLoader.load('/models/testlab/structures/hedge.glb',                        g => { this.hedgeModel           = g.scene; });
        staticLoader.load('/models/testlab/structures/hedge-curved.glb',                 g => { this.hedgeCurvedModel     = g.scene; });
        staticLoader.load('/models/testlab/structures/hedge-large.glb',                  g => { this.hedgeLargeModel      = g.scene; });
        staticLoader.load('/models/testlab/structures/lantern.glb',                      g => { this.lanternModel         = g.scene; });

        this.physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, PHYSICS_CONFIG.gravity, 0) });
        super.init(container);

        const groundMaterial    = new CANNON.Material('ground');
        const characterMaterial = new CANNON.Material('character');
        this.physicsWorld.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, characterMaterial, { friction: 0.8, restitution: 0 }));
        this.groundMaterial    = groundMaterial;
        this.characterMaterial = characterMaterial;

        this.physicsWorld.addEventListener('beginContact', (event) => {
            if (!event?.bodyA || !event?.bodyB) return;
            const { bodyA, bodyB } = event;
            const projectile = this.projectiles.find(p => p.body === bodyA || p.body === bodyB);
            if (projectile) {
                const otherBody = bodyA === projectile.body ? bodyB : bodyA;
                const target = this.breakableTargets.find(t => t.body === otherBody);
                let breakTarget = null, impactPos = null;
                if (target) {
                    if (this.isPhysicsHost) {
                        target.health -= 1;
                        const shouldBreak = target.health <= 0;
                        this.sendTarget?.({ id: target.id, broken: shouldBreak, health: target.health, impactPoint: { x: projectile.mesh.position.x, y: projectile.mesh.position.y, z: projectile.mesh.position.z } });
                        if (shouldBreak) { breakTarget = target; impactPos = projectile.mesh.position.clone(); }
                        else this.updateTargetAppearance(target);
                    } else if (projectile.isLocal) {
                        const vel = projectile.body.velocity;
                        this.sendCubeImpact?.({ id: target.id, vx: vel.x * this.projectileMass, vy: vel.y * this.projectileMass, vz: vel.z * this.projectileMass, mass: this.projectileMass });
                    }
                }
                const hitPeerId = Object.keys(this.peerBodies).find(id => id !== selfId && this.peerBodies[id] === otherBody);
                if (hitPeerId && this.sendHit) this.sendHit({}, hitPeerId);
                if (otherBody === this.characterBody) this.applyHitKnockback();
                if (breakTarget) this.pendingRemovals.push({ projectile: null, breakTarget, impactPos });
                const now2 = Date.now();
                if (now2 - this.lastImpactTime > 150 && this.impactWoodSounds.length) {
                    const snd = this.impactWoodSounds[Math.floor(Math.random() * this.impactWoodSounds.length)];
                    snd.currentTime = 0; snd.play().catch(() => {});
                    this.lastImpactTime = now2;
                }
                return;
            }
            if (!this.isPhysicsHost && this.characterBody) {
                const isCharA = bodyA === this.characterBody, isCharB = bodyB === this.characterBody;
                if (isCharA || isCharB) {
                    const cubeBody = isCharA ? bodyB : bodyA;
                    const hitTarget = this.breakableTargets.find(t => t.body === cubeBody);
                    if (hitTarget) {
                        const vel = this.characterBody.velocity;
                        this.sendCubeImpact?.({ id: hitTarget.id, vx: vel.x, vy: vel.y, vz: vel.z, mass: 1 });
                    }
                }
            }
        });

        const groundPlane = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: this.groundMaterial, collisionFilterGroup: this.GROUPS.GROUND, collisionFilterMask: this.GROUPS.CHARACTER | this.GROUPS.BREAKABLE | this.GROUPS.PROJECTILE | this.GROUPS.DEBRIS });
        groundPlane.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.physicsWorld.addBody(groundPlane);

        this.enableMusicOnUserGesture();
        if (this.isMobile) this.initMobileControls();

        window.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                const el = event.target as Element;
                if (el.closest?.('#room-panel') || el.closest?.('#entry-modal')) return;
                this.throwProjectile();
            }
        });

        this.room = joinRoom({ appId: 'trystero-3d-lab', firebaseApp }, this.roomId);
        console.log('[SYNC] joinRoom | selfId:', selfId, '| isRoomCreator:', this.isRoomCreator);

        this.room.onPeerJoin = (peerId) => {
            if (peerId === selfId) return;
            this.timedOutPeers.delete(peerId);
            this.knownPeers.add(peerId);
            this.spawnPeer(peerId);
            const wasHost = this.isPhysicsHost;
            if (this.synced) { this.electNewHost(); this.syncTargetPhysicsType(!wasHost && this.isPhysicsHost); }
            const sendInfo = (attempt: number) => {
                this.sendMyInfo?.({ name: this.myName, characterModel: this.characterModel, projectileModel: this.projectileModel, isCreator: this.isRoomCreator }, [peerId]);
                if (attempt < 5) setTimeout(() => sendInfo(attempt + 1), 800);
            };
            setTimeout(() => sendInfo(0), 200);
            if (wasHost && this.sendInitialTargets) {
                this.peersSynced.delete(peerId);
                const states = this.breakableTargets.map(t => ({ id: t.id, px: t.body.position.x, py: t.body.position.y, pz: t.body.position.z, qx: t.body.quaternion.x, qy: t.body.quaternion.y, qz: t.body.quaternion.z, qw: t.body.quaternion.w, health: t.health }));
                setTimeout(() => { this.sendInitialTargets(states); this.sendMyInfo?.({ name: this.myName, characterModel: this.characterModel, projectileModel: this.projectileModel }); }, 300);
                this.startHostBroadcast();
            }
            if (!this.synced) {
                const pullSync = (attempt: number) => { if (this.synced) return; this.sendRequestSync?.({}, [peerId]); if (attempt < 20) setTimeout(() => pullSync(attempt + 1), 600); };
                pullSync(0);
            }
        };

        this.room.onPeerLeave = (peerId) => {
            const wasHostBefore = this.isPhysicsHost;
            const name = this.peerNames?.[peerId];
            this.knownPeers.delete(peerId); this.timedOutPeers.delete(peerId);
            this.electNewHost(peerId); this.removePeer(peerId);
            delete (this.peerLastSeen as any)[peerId]; delete (this.peerNames as any)[peerId];
            delete (this.peerCharacterModels as any)[peerId]; delete (this.peerProjectileModels as any)[peerId];
            if (peerId === this.creatorPeerId) this.creatorPeerId = '';
            if (this.synced) {
                this.syncTargetPhysicsType(!wasHostBefore && this.isPhysicsHost);
                if (!wasHostBefore && this.isPhysicsHost) { this.peersSynced.clear(); this.startHostBroadcast(); }
            }
            if (name) this.showHostToast(`${name} saiu da sala`);
            this.updatePlayerList();
        };

        const [sendMove, getMove] = this.room.makeAction('move');
        this.sendMove = sendMove;
        getMove((data, peerId) => {
            if (peerId === selfId) return;
            this.peerLastSeen[peerId] = Date.now();
            if (!this.peerNames[peerId]) {
                const now = Date.now();
                if (!this.lastInfoSent[peerId] || now - this.lastInfoSent[peerId] > 1500) {
                    this.lastInfoSent[peerId] = now;
                    this.sendMyInfo?.({ name: this.myName, characterModel: this.characterModel, projectileModel: this.projectileModel }, [peerId]);
                }
            }
            if (!this.peerModels[peerId]) this.spawnPeer(peerId);
            const { x, y, z, rotY } = data;
            if (!this.peerTargets[peerId]) this.peerTargets[peerId] = { position: new THREE.Vector3(x, y, z), rotY };
            else { this.peerTargets[peerId].position.set(x, y, z); this.peerTargets[peerId].rotY = rotY; }
        });

        const [sendAnim, getAnim] = this.room.makeAction('anim');
        this.sendAnim = sendAnim;
        getAnim((animName, peerId) => {
            this.peerAnims[peerId] = animName;
            const mesh = this.peerModels[peerId];
            if (mesh?.animations?.[animName]) { Object.values(mesh.animations).forEach((a: any) => a.stop()); mesh.animations[animName].play(); }
        });

        const [sendProjectile, getProjectile] = this.room.makeAction('projectile');
        this.sendProjectile = sendProjectile;
        getProjectile((data, peerId) => { if (peerId !== selfId) this.createProjectile(data.position, data.direction, data.velocity, false, data.model || ''); });

        const [sendTarget, getTarget] = this.room.makeAction('trg');
        this.sendTarget = sendTarget;
        getTarget((data, peerId) => {
            if (peerId === selfId) return;
            const { broken, impactPoint, id, health } = data;
            const target = this.breakableTargets.find(t => t.id === id);
            if (!target) return;
            if (broken) {
                this.createDebris(target, new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z));
                this.scene.remove(target.mesh); this.physicsWorld.removeBody(target.body);
                this.breakableTargets = this.breakableTargets.filter(t => t !== target);
            } else if (health !== undefined) { target.health = health; this.updateTargetAppearance(target); }
        });

        const [sendInitialTargets, getInitialTargets] = this.room.makeAction('sync');
        this.sendInitialTargets = sendInitialTargets;
        const applyTargetSync = (states: any[]) => {
            const alive = new Map(states.map((s: any) => [s.id, s]));
            for (let i = this.breakableTargets.length - 1; i >= 0; i--) {
                const t = this.breakableTargets[i];
                if (!alive.has(t.id)) { this.scene.remove(t.mesh); this.physicsWorld.removeBody(t.body); this.breakableTargets.splice(i, 1); }
            }
            states.forEach((s: any) => {
                let target = this.breakableTargets.find(t => t.id === s.id);
                if (!target) { target = this.createBreakableTarget(new THREE.Vector3(s.px, s.py, s.pz), s.id, true); this.breakableTargets.push(target); }
                target.body.position.set(s.px, s.py, s.pz); target.body.quaternion.set(s.qx, s.qy, s.qz, s.qw);
                target.body.velocity.set(0, 0, 0); target.body.angularVelocity.set(0, 0, 0);
                target.mesh.position.set(s.px, s.py, s.pz);
                if (s.health !== undefined && s.health < target.maxHealth) { target.health = s.health; this.updateTargetAppearance(target); }
            });
            if (!this.synced) this.finishSync();
            else { const wasHost = this.isPhysicsHost; this.electNewHost(); if (wasHost !== this.isPhysicsHost) this.syncTargetPhysicsType(!wasHost && this.isPhysicsHost); this.updatePlayerList(); }
            this.sendSyncAck?.({});
        };
        getInitialTargets((states: any[], peerId: string) => {
            if (peerId === selfId) return;
            if (this.roundedCubeModel) applyTargetSync(states);
            else { const wait = setInterval(() => { if (this.roundedCubeModel) { clearInterval(wait); applyTargetSync(states); } }, 50); }
        });

        const [sendHit, getHit] = this.room.makeAction('hit');
        this.sendHit = sendHit;
        getHit(() => this.applyHitKnockback());

        const [sendCubeImpact, getCubeImpact] = this.room.makeAction('cimpa');
        this.sendCubeImpact = sendCubeImpact;
        getCubeImpact((data: any, peerId: string) => {
            if (peerId === selfId || !this.isPhysicsHost) return;
            const target = this.breakableTargets.find(t => t.id === data.id);
            if (target) target.body.applyImpulse(new CANNON.Vec3(data.vx, data.vy, data.vz), target.body.position);
        });

        const [sendMyInfo, getMyInfo] = this.room.makeAction('myinfo');
        this.sendMyInfo = sendMyInfo;
        getMyInfo((data: any, peerId: string) => {
            if (peerId === selfId) return;
            this.peerNames[peerId] = data.name;
            this.peerCharacterModels[peerId]  = data.characterModel  || 'male-a';
            this.peerProjectileModels[peerId] = data.projectileModel || 'donut';
            if (this.peerModels[peerId]) {
                const loadedPath  = (this.peerModels[peerId] as any)._modelPath;
                const correctPath = `/models/testlab/characters/character-${data.characterModel || 'male-a'}.glb`;
                if (loadedPath !== correctPath) { this.removePeer(peerId); this.spawnPeer(peerId); }
            }
            this.updatePeerNameLabel(peerId, data.name);
            this.updatePlayerList();
            if (data.isCreator && !this.isRoomCreator) this.creatorPeerId = peerId;
            const now = Date.now();
            if (!this.lastInfoSent[peerId] || now - this.lastInfoSent[peerId] > 2000) {
                this.lastInfoSent[peerId] = now;
                this.sendMyInfo?.({ name: this.myName, characterModel: this.characterModel, projectileModel: this.projectileModel, isCreator: this.isRoomCreator }, [peerId]);
            }
            if (this.isPhysicsHost && this.sendInitialTargets && !this.peersSynced.has(peerId)) {
                this.peersSynced.add(peerId);
                const states = this.breakableTargets.map(t => ({ id: t.id, px: t.body.position.x, py: t.body.position.y, pz: t.body.position.z, qx: t.body.quaternion.x, qy: t.body.quaternion.y, qz: t.body.quaternion.z, qw: t.body.quaternion.w, health: t.health }));
                this.sendInitialTargets(states);
                this.startHostBroadcast();
            }
        });

        const [sendRequestSync, getRequestSync] = this.room.makeAction('rsync');
        this.sendRequestSync = sendRequestSync;
        getRequestSync((_data: any, peerId: string) => {
            if (peerId === selfId || !this.synced || !this.isPhysicsHost) return;
            const states = this.breakableTargets.map(t => ({ id: t.id, px: t.body.position.x, py: t.body.position.y, pz: t.body.position.z, qx: t.body.quaternion.x, qy: t.body.quaternion.y, qz: t.body.quaternion.z, qw: t.body.quaternion.w, health: t.health }));
            this.sendInitialTargets?.(states);
            this.sendMyInfo?.({ name: this.myName, characterModel: this.characterModel, projectileModel: this.projectileModel });
        });

        const [sendSyncAck, getSyncAck] = this.room.makeAction('sack');
        this.sendSyncAck = sendSyncAck;
        getSyncAck((_data: any, peerId: string) => {
            if (peerId === selfId || !this.isPhysicsHost) return;
            this.peersSynced.add(peerId);
            const active = [...this.knownPeers].filter(id => !this.timedOutPeers.has(id));
            if (active.length > 0 && active.every(id => this.peersSynced.has(id))) this._stopHostBroadcast();
        });

        const [sendTargetPhysics, getTargetPhysics] = this.room.makeAction('tgphy');
        this.sendTargetPhysics = sendTargetPhysics;
        getTargetPhysics((data: any, peerId: string) => {
            if (peerId === selfId || this.isPhysicsHost) return;
            const updates: any[] = Array.isArray(data) ? data : [data];
            updates.forEach((d: any) => {
                const target = this.breakableTargets.find(t => t.id === d.id);
                if (!target) return;
                target.body.velocity.set(d.vx, d.vy, d.vz);
                target.body.angularVelocity.set(d.avx ?? 0, d.avy ?? 0, d.avz ?? 0);
                const f = 0.4;
                target.body.position.x += (d.px - target.body.position.x) * f;
                target.body.position.y += (d.py - target.body.position.y) * f;
                target.body.position.z += (d.pz - target.body.position.z) * f;
                target.body.quaternion.set(d.qx, d.qy, d.qz, d.qw);
                const p = target.body.position;
                if ((target as any)._lastPhysPos) { (target as any)._lastPhysPos.x = p.x; (target as any)._lastPhysPos.y = p.y; (target as any)._lastPhysPos.z = p.z; }
            });
        });

        this.pingInterval = setInterval(() => {
            const now = Date.now();
            Object.keys(this.peerModels).forEach(peerId => {
                if (peerId === selfId) return;
                const last = this.peerLastSeen[peerId] ?? 0;
                if (last === 0 || now - last <= 300000) return;
                const name = this.peerNames?.[peerId];
                const wasHost = this.isPhysicsHost;
                this.timedOutPeers.add(peerId);
                if (this.currentHostId === peerId) this.electNewHost(peerId);
                this.removePeer(peerId);
                delete (this.peerLastSeen as any)[peerId]; delete (this.peerNames as any)[peerId];
                delete (this.peerCharacterModels as any)[peerId]; delete (this.peerProjectileModels as any)[peerId];
                if (this.synced) this.syncTargetPhysicsType(!wasHost && this.isPhysicsHost);
                this.showHostToast(`${name ?? 'Jogador'} saiu da sala`);
                this.updatePlayerList();
            });
        }, 3000);

        const loadDesc = document.getElementById('loading-desc');
        if (this.isRoomCreator) {
            if (loadDesc) loadDesc.textContent = 'Criando sala...';
            document.getElementById('loading-screen').style.display = '';
            this.syncTimeout = setTimeout(() => { if (!this.synced) this.finishSync(); }, 500);
        } else {
            if (loadDesc) loadDesc.textContent = 'Aguardando host...';
            document.getElementById('loading-screen').style.display = '';
            this.syncTimeout = setTimeout(() => { if (!this.synced) this.showRoomError(); }, 300000);
        }

        setInterval(() => {
            if (this.synced && this.sendMyInfo) {
                this.sendMyInfo({ name: this.myName, characterModel: this.characterModel, projectileModel: this.projectileModel, isCreator: this.isRoomCreator });
            }
        }, 15000);
    }

    destroy() {
        Object.keys(this.peerModels).forEach(peerId => { if (peerId !== selfId) this.removePeer(peerId); });
        if (this.backgroundMusic) { this.backgroundMusic.pause(); this.backgroundMusic.currentTime = 0; this.backgroundMusic = null; }
        if (this.targetSyncTimeout) clearTimeout(this.targetSyncTimeout);
        if (this.syncTimeout) clearTimeout(this.syncTimeout);
        if (this.pingInterval) clearInterval(this.pingInterval);
        this._stopHostBroadcast();
        document.getElementById('room-panel')?.remove();
        super.destroy();
    }

    createRoomUI() {
        const panel = document.createElement('div');
        panel.id = 'room-panel';
        const roomIdEl = document.createElement('div');
        roomIdEl.className = 'room-id'; roomIdEl.textContent = `Sala: ${this.roomId}`;
        const copyBtn = document.createElement('button');
        copyBtn.id = 'copy-link-btn'; copyBtn.textContent = 'Copiar link';
        copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(window.location.href).then(() => { copyBtn.textContent = '✓ Copiado!'; setTimeout(() => { copyBtn.textContent = 'Copiar link'; }, 2000); }); });
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'room-section-title'; sectionTitle.textContent = 'Online';
        const playerList = document.createElement('div'); playerList.id = 'player-list';
        panel.appendChild(roomIdEl); panel.appendChild(copyBtn); panel.appendChild(sectionTitle); panel.appendChild(playerList);
        document.body.appendChild(panel);
        this.updatePlayerList();
    }

    updatePlayerList() {
        const list = document.getElementById('player-list');
        if (!list) return;
        list.innerHTML = '';
        const hostDisplayId = this.isRoomCreator ? selfId : (this.creatorPeerId || this.currentHostId);
        const selfEl = document.createElement('div');
        selfEl.className = 'player-item player-self';
        selfEl.textContent = `${this.myName}${hostDisplayId === selfId ? ' (host)' : ''}`;
        list.appendChild(selfEl);
        [...this.knownPeers].forEach(peerId => {
            const el = document.createElement('div'); el.className = 'player-item';
            el.textContent = `${this.peerNames?.[peerId] ?? '...'}${hostDisplayId === peerId ? ' (host)' : ''}`;
            list.appendChild(el);
        });
    }

    playAnimation(animName: string) {
        if (!this.character?.animations) return;
        if (this.currentAnim === animName) return;
        Object.values(this.character.animations).forEach((action: any) => action.stop());
        if (this.character.animations[animName]) { this.character.animations[animName].play(); this.currentAnim = animName; }
    }

    getRandomPlayerName() {
        const adj  = ['Crystal','Gem','Stone','Arcane','Sacred','Radiant','Ancient','Mystic','Prismatic','Noble','Eternal','Bright'];
        const noun = ['Guardian','Warden','Keeper','Sentinel','Knight','Mage','Ranger','Warrior','Champion','Defender','Sage','Protector'];
        return `${adj[Math.floor(Math.random() * adj.length)]} ${noun[Math.floor(Math.random() * noun.length)]}`;
    }

    createInitialTargets() {
        for (let i = 0; i < SCENE_CONFIG.targetCount; i++) {
            const angle  = seededRandom(this.roomId, i * 2) * Math.PI * 2;
            const radius = SCENE_CONFIG.targetMinRadius + seededRandom(this.roomId, i * 2 + 1) * (SCENE_CONFIG.targetMaxRadius - SCENE_CONFIG.targetMinRadius);
            const position = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
            const id = `${this.roomId}-t${i}`;
            this.breakableTargets.push(this.createBreakableTarget(position, id, true));
        }
    }

    applyHitKnockback() {
        if (!this.characterBody) return;
        this.characterBody.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 14, 7, (Math.random() - 0.5) * 14), this.characterBody.position);
    }

    updateTargetAppearance(target: any) {
        if (!target.mesh) return;
        const damageFrac = 1 - Math.max(0, target.health) / (target.maxHealth ?? 3);
        target.mesh.traverse((child: any) => {
            if (!child.isMesh || !child.material?.isMeshStandardMaterial) return;
            if (!child.userData.origColor) child.userData.origColor = child.material.color.clone();
            child.material.color.copy(child.userData.origColor).lerp(new THREE.Color(0xff4400), damageFrac * 0.7);
            child.material.emissive.set(0x550000);
            child.material.emissiveIntensity = damageFrac * 0.5;
            child.material.roughness = 0.8 + damageFrac * 0.2;
        });
        target.mesh.rotation.x += (Math.random() - 0.5) * 0.08 * damageFrac;
        target.mesh.rotation.z += (Math.random() - 0.5) * 0.08 * damageFrac;
    }

    throwProjectile() {
        if (!this.character || !this.characterBody) return;
        const now = Date.now();
        if (now - this.lastShot < this.shootCooldown) return;
        this.lastShot = now;
        const spawnPos = new THREE.Vector3(this.characterBody.position.x, this.characterBody.position.y + 1.0, this.characterBody.position.z);
        const dir = new THREE.Vector3().subVectors(this.aimTarget, spawnPos).normalize();
        if (dir.lengthSq() < 0.01) this.camera.getWorldDirection(dir);
        spawnPos.addScaledVector(dir, 1.2);
        this.createProjectile(spawnPos, dir, this.projectileSpeed, true, this.projectileModel);
        if (this.sendProjectile) this.sendProjectile({ position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z }, direction: { x: dir.x, y: dir.y, z: dir.z }, velocity: this.projectileSpeed, model: this.projectileModel });
        this.triggerSpellAnimation();
    }

    createProjectile(position: any, direction: any, speed: number, isLocal = false, modelKey = '') {
        const posVector = position instanceof THREE.Vector3 ? position : new THREE.Vector3(position.x, position.y, position.z);
        const dirVector = direction instanceof THREE.Vector3 ? direction : new THREE.Vector3(direction.x, direction.y, direction.z);
        const container = new THREE.Object3D();
        container.position.copy(posVector);
        const cachedModel = modelKey ? this.projectileCache.get(modelKey) : null;
        if (cachedModel) {
            const model = cachedModel.clone(); model.scale.setScalar(1.5);
            model.traverse((c: any) => { if (c.isMesh) c.castShadow = true; });
            container.add(model);
        } else {
            const fallback = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 'brown', metalness: 0.3, roughness: 0.8 }));
            fallback.castShadow = true; container.add(fallback);
        }
        this.scene.add(container);
        const shape = new CANNON.Sphere(0.5);
        const body = new CANNON.Body({ mass: this.projectileMass, shape, material: this.characterMaterial, collisionResponse: true, linearDamping: 0.1, angularDamping: 0.1, collisionFilterGroup: this.GROUPS.PROJECTILE, collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.BREAKABLE | this.GROUPS.CHARACTER | this.GROUPS.PEER_CHARACTER | this.GROUPS.STATIC });
        body.position.copy(posVector as any);
        const velocity = dirVector.normalize().multiplyScalar(speed);
        body.velocity.set(velocity.x, velocity.y, velocity.z);
        this.physicsWorld.addBody(body);
        this.projectiles.push({ mesh: container, body, createTime: Date.now(), isLocal });
    }

    createBreakableTarget(position: THREE.Vector3, id: string = null, skipOverlapCheck = false) {
        if (!skipOverlapCheck) {
            // Push away from other cubes
            const minCubeDist = 3.5;
            for (const target of this.breakableTargets) {
                const dx = position.x - target.mesh.position.x, dz = position.z - target.mesh.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < minCubeDist) {
                    const scale = minCubeDist / (dist || 0.01);
                    position.x = target.mesh.position.x + dx * scale;
                    position.z = target.mesh.position.z + dz * scale;
                }
            }
            // Push away from trees
            const minTreeDist = 4;
            for (const treeMesh of this.treeMeshes) {
                const dx = position.x - treeMesh.position.x, dz = position.z - treeMesh.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < minTreeDist) {
                    const scale = minTreeDist / (dist || 0.01);
                    position.x = treeMesh.position.x + dx * scale;
                    position.z = treeMesh.position.z + dz * scale;
                }
            }
            // Push outside castle square bounds
            const castleHalf = this.concreteRadius + 3;
            if (Math.abs(position.x) < castleHalf && Math.abs(position.z) < castleHalf) {
                const pushX = castleHalf - Math.abs(position.x) + 0.1;
                const pushZ = castleHalf - Math.abs(position.z) + 0.1;
                if (pushX < pushZ) {
                    position.x += position.x >= 0 ? pushX : -pushX;
                } else {
                    position.z += position.z >= 0 ? pushZ : -pushZ;
                }
            }
        }
        const cubeScale = this.roundedCubeScale ?? 2.5;
        let physHalfX = 0.75, physHalfY = 0.75, physHalfZ = 0.75;
        const wrapper = new THREE.Group();
        if (this.roundedCubeModel) {
            const modelClone = this.roundedCubeModel.clone();
            modelClone.scale.setScalar(cubeScale);
            modelClone.traverse((child: any) => {
                if (child.isMesh) {
                    if (child.material) {
                        if (!child.material.isMeshStandardMaterial) {
                            const orig = child.material;
                            child.material = new THREE.MeshStandardMaterial({ color: orig.color ?? 0xffffff, map: orig.map ?? null, roughness: 0.8, metalness: 0.1 });
                        } else {
                            child.material = child.material.clone();
                        }
                    }
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            modelClone.updateWorldMatrix(false, true);
            const bbox = new THREE.Box3().setFromObject(modelClone);
            const bboxCenter = new THREE.Vector3(); bbox.getCenter(bboxCenter);
            const bSize = new THREE.Vector3(); bbox.getSize(bSize);
            physHalfX = bSize.x / 2; physHalfY = bSize.y / 2; physHalfZ = bSize.z / 2;
            modelClone.position.sub(bboxCenter);
            wrapper.add(modelClone);
        } else {
            const s = 1.5;
            const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ color: '#a0a0a0', roughness: 0.8 }));
            boxMesh.castShadow = true; boxMesh.receiveShadow = true;
            physHalfX = physHalfY = physHalfZ = s / 2; wrapper.add(boxMesh);
        }
        const mesh: THREE.Object3D = wrapper;
        position.y = physHalfY + 0.01;
        mesh.position.copy(position);
        this.scene.add(mesh);
        const shape = new CANNON.Box(new CANNON.Vec3(physHalfX, physHalfY, physHalfZ));
        // STATIC added so cubes collide with castle walls; BREAKABLE so cubes collide with each other
        const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape, material: this.groundMaterial, collisionResponse: true, linearDamping: 0.4, angularDamping: 0.4, collisionFilterGroup: this.GROUPS.BREAKABLE, collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.CHARACTER | this.GROUPS.PROJECTILE | this.GROUPS.DEBRIS | this.GROUPS.BREAKABLE | this.GROUPS.STATIC });
        body.position.copy(position as any);
        this.physicsWorld.addBody(body);
        const physSize = physHalfX * 2;
        const target = { mesh, body, broken: false, size: { width: physSize, height: physHalfY * 2, depth: physSize }, position: position.clone(), id: id || Math.random().toString(36).substr(2, 9), health: 3, maxHealth: 3 };
        mesh.userData.targetId = target.id; (body as any).targetId = target.id;
        return target;
    }

    createDebris(target: any, impactPoint: THREE.Vector3) {
        const pieces = PHYSICS_CONFIG.debrisCount;
        const size = target.size.width / 6;
        for (let i = 0; i < pieces; i++) {
            const offset = new THREE.Vector3((Math.random() - 0.5) * size * 4, (Math.random() - 0.5) * size * 4, (Math.random() - 0.5) * size * 4);
            const geometryType = Math.random() > 0.5 ? new THREE.TetrahedronGeometry(size) : new THREE.BoxGeometry(size, size, size);
            const mesh = new THREE.Mesh(geometryType, new THREE.MeshStandardMaterial({ color: 0x8b6914, metalness: 0.2, roughness: 0.9 }));
            const debrisPos = target.mesh.position.clone().add(offset);
            mesh.position.copy(debrisPos);
            this.scene.add(mesh);
            const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
            const body = new CANNON.Body({ mass: 0.1, shape, material: this.groundMaterial, linearDamping: 0.1, angularDamping: 0.1 });
            body.position.copy(debrisPos as any);
            const direction = debrisPos.clone().sub(impactPoint).normalize();
            direction.y = Math.max(0, direction.y * 0.2); direction.normalize();
            const force = direction.multiplyScalar(5);
            body.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
            body.applyImpulse(new CANNON.Vec3(force.x, force.y, force.z), new CANNON.Vec3(0, 0, 0));
            this.physicsWorld.addBody(body);
            this.debris.push({ mesh, body, createTime: Date.now() });
        }
    }

    populateScene() {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.camera = new THREE.PerspectiveCamera(CAMERA_CONFIG.fov, window.innerWidth / window.innerHeight, CAMERA_CONFIG.near, CAMERA_CONFIG.far);
        this.camera.position.copy(ISO_OFFSET);
        const canvas = this.renderer.domElement;
        canvas.style.pointerEvents = 'auto';

        document.addEventListener('mousemove', (e: MouseEvent) => {
            this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });
        canvas.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            this.isoZoomScale = Math.max(CAMERA_CONFIG.zoomMin, Math.min(CAMERA_CONFIG.zoomMax, this.isoZoomScale + e.deltaY * CAMERA_CONFIG.zoomSensitivity));
        }, { passive: false });

        const skyColor = SCENE_CONFIG.skyColor;
        this.scene.background = new THREE.Color(skyColor);
        this.scene.fog = new THREE.FogExp2(skyColor, SCENE_CONFIG.fogDensity);

        setupGround(this);

        const waitForModels = setInterval(() => {
            if (this.fountainModel && this.crystalModel && this.treeCrookedModel && this.treeHighCrookedModel
                && this.castleWallModel && this.castleCornerModel && this.castleGateModel && this.castleTowerModel
                && this.hedgeModel && this.hedgeCurvedModel && this.lanternModel) {
                clearInterval(waitForModels);
                this.placeStaticObjects();
            }
        }, 50);

        setupLighting(this);
        this.createRoomUI();

        const projLoader = new GLTFLoader();
        Object.entries(PROJECTILE_MODELS).forEach(([key, path]) => {
            projLoader.load(path, (gltf) => { this.projectileCache.set(key, gltf.scene); });
        });

        window.addEventListener('keydown', (event) => {
            this.keys[event.key.toLowerCase()] = true;
            if (event.key === ' ' && !this.isJumping) this.mobileJump = true;
        });
        window.addEventListener('keyup', (event) => { this.keys[event.key.toLowerCase()] = false; });

        setTimeout(() => { if (this.debugGui.gui) this.initDebugGui(); }, 3000);
        this.initSounds();
    }

    initMobileControls() {
        const SZ = 120, KZ = 46, KO = (SZ - KZ) / 2, MAX = SZ / 2 - KZ / 2;
        const baseStyle = (extra: string) => `position:fixed;width:${SZ}px;height:${SZ}px;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.22);border-radius:50%;touch-action:none;z-index:1000;${extra}`;
        const knobStyle = () => `width:${KZ}px;height:${KZ}px;background:rgba(255,255,255,0.4);border-radius:50%;position:absolute;left:${KO}px;top:${KO}px;`;
        const makeStick = (extra: string) => { const base = document.createElement('div'); base.style.cssText = baseStyle(extra); const knob = document.createElement('div'); knob.style.cssText = knobStyle(); base.appendChild(knob); document.body.appendChild(base); return { base, knob }; };
        const left = makeStick('left:20px;bottom:30px;');
        let lDrag = false, lX = 0, lY = 0;
        left.base.addEventListener('touchstart', (e) => { e.preventDefault(); lDrag = true; lX = e.touches[0].clientX; lY = e.touches[0].clientY; }, { passive: false });
        left.base.addEventListener('touchmove', (e) => { e.preventDefault(); if (!lDrag) return; const dx = e.touches[0].clientX - lX, dy = e.touches[0].clientY - lY; const dist = Math.min(Math.sqrt(dx*dx + dy*dy), MAX), a = Math.atan2(dy, dx); left.knob.style.left = `${KO + dist * Math.cos(a)}px`; left.knob.style.top = `${KO + dist * Math.sin(a)}px`; this.mobileMove.x = -Math.cos(a) * (dist / MAX); this.mobileMove.y = Math.sin(a) * (dist / MAX); }, { passive: false });
        left.base.addEventListener('touchend', () => { lDrag = false; left.knob.style.left = `${KO}px`; left.knob.style.top = `${KO}px`; this.mobileMove.x = 0; this.mobileMove.y = 0; });
        const jump = document.createElement('div');
        jump.textContent = '↑';
        jump.style.cssText = `position:fixed;left:50%;transform:translateX(-50%);bottom:42px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.28);color:#fff;font-size:1.6em;line-height:60px;text-align:center;touch-action:none;z-index:1000;user-select:none;`;
        jump.addEventListener('touchstart', (e) => { e.preventDefault(); this.mobileJump = true; }, { passive: false });
        document.body.appendChild(jump);
        const right = makeStick('right:20px;bottom:30px;');
        let rDrag = false, rX = 0, rY = 0;
        const applyAim = (normX: number, normY: number) => {
            if (!this.camera || !this.characterBody) return;
            const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
            const rgt = new THREE.Vector3().crossVectors(this.camera.up, fwd).negate();
            const dir = new THREE.Vector3().addScaledVector(rgt, normX).addScaledVector(fwd, -normY);
            if (dir.lengthSq() > 0.001) { dir.normalize(); this.aimTarget.set(this.characterBody.position.x + dir.x * 10, this.characterBody.position.y, this.characterBody.position.z + dir.z * 10); }
        };
        right.base.addEventListener('touchstart', (e) => { e.preventDefault(); rDrag = true; rX = e.touches[0].clientX; rY = e.touches[0].clientY; }, { passive: false });
        right.base.addEventListener('touchmove', (e) => { e.preventDefault(); if (!rDrag) return; const dx = e.touches[0].clientX - rX, dy = e.touches[0].clientY - rY; const dist = Math.min(Math.sqrt(dx*dx + dy*dy), MAX), a = Math.atan2(dy, dx); right.knob.style.left = `${KO + dist * Math.cos(a)}px`; right.knob.style.top = `${KO + dist * Math.sin(a)}px`; applyAim(Math.cos(a) * (dist / MAX), Math.sin(a) * (dist / MAX)); }, { passive: false });
        right.base.addEventListener('touchend', () => { rDrag = false; right.knob.style.left = `${KO}px`; right.knob.style.top = `${KO}px`; this.throwProjectile(); });
    }

    updateCharacterPhysics(delta: number) {
        if (!this.characterBody) return;
        let moveX = 0, moveZ = 0;
        if (this.keys['w'] || this.keys['arrowup'])    moveZ -= 1;
        if (this.keys['s'] || this.keys['arrowdown'])  moveZ += 1;
        if (this.keys['a'] || this.keys['arrowleft'])  moveX += 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX -= 1;
        if (this.isMobile) { moveX += this.mobileMove.x; moveZ += this.mobileMove.y; }
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) {
            moveX /= len; moveZ /= len;
            const cameraForward = new THREE.Vector3(); const cameraRight = new THREE.Vector3();
            this.camera.getWorldDirection(cameraForward); cameraRight.crossVectors(this.camera.up, cameraForward);
            cameraForward.y = 0; cameraRight.y = 0; cameraForward.normalize(); cameraRight.normalize();
            const moveDir = new THREE.Vector3();
            moveDir.addScaledVector(cameraForward, -moveZ); moveDir.addScaledVector(cameraRight, moveX); moveDir.normalize();
            this.characterBody.velocity.x = moveDir.x * this.characterSpeed;
            this.characterBody.velocity.z = moveDir.z * this.characterSpeed;
        } else { this.characterBody.velocity.x = 0; this.characterBody.velocity.z = 0; }
        let onGround = false;
        const threshold = 0.5;
        if (this.characterBody.world?.contacts) {
            for (const contact of this.characterBody.world.contacts) {
                if (contact.bi === this.characterBody || contact.bj === this.characterBody) {
                    let contactNormal = new CANNON.Vec3();
                    if (contact.bi === this.characterBody) contact.ni.negate(contactNormal); else contactNormal.copy(contact.ni);
                    if (contactNormal.y > threshold) { onGround = true; break; }
                }
            }
        }
        if ((this.keys[' '] || this.mobileJump) && onGround && !this.isJumping) {
            this.characterBody.velocity.y = this.jumpVelocity; this.isJumping = true; this.mobileJump = false;
            if (this.jumpSound) { this.jumpSound.currentTime = 0; this.jumpSound.play().catch(() => {}); }
        }
        this.wasOnGround = onGround;
        if (onGround) this.isJumping = false;
        this.isMovingLocal = len > 0.01; this.isOnGround = onGround;
        if (this.character) this.character.position.copy(this.characterBody.position);
        const isMoving = len > 0.01;
        if (!this.isPlayingSpell) {
            let desiredAnim: string;
            if (!onGround && this.animNames.jump) desiredAnim = this.animNames.jump;
            else desiredAnim = isMoving ? (this.animNames.walk || '') : (this.animNames.idle || '');
            if (desiredAnim) this.playAnimation(desiredAnim);
        }
        if (this.sendAnim && this.currentAnim !== this.lastSentAnim) { this.sendAnim(this.currentAnim); this.lastSentAnim = this.currentAnim; }
    }

    customAnimate(delta = 1 / 60) {
        if (this.crystalMesh) {
            const t = performance.now() / 1000;
            const y = this.crystalBaseY + Math.sin(t * 0.9) * 0.35;
            this.crystalMesh.position.y = y; this.crystalMesh.rotation.y = t * 0.25;
            if (this.crystalLight) this.crystalLight.position.y = y;
            if (this.crystalBody)  this.crystalBody.position.y  = y;
        }
        if (this.physicsWorld) {
            this.physicsWorld.step(delta);
            for (const item of this.pendingRemovals) {
                const { breakTarget, impactPos } = item;
                if (breakTarget && this.breakableTargets.includes(breakTarget)) {
                    this.createDebris(breakTarget, impactPos ?? breakTarget.mesh.position);
                    this.scene.remove(breakTarget.mesh); this.physicsWorld.removeBody(breakTarget.body);
                    this.breakableTargets = this.breakableTargets.filter(t => t !== breakTarget);
                }
            }
            this.pendingRemovals = [];
            this.updateCharacterPhysics(delta);
        }
        if (this.characterBody) {
            const bx = this.characterBody.position.x, bz = this.characterBody.position.z;
            this.footstepSounds = Math.sqrt(bx*bx + bz*bz) <= this.concreteRadius ? this.footstepConcreteSounds : this.footstepGrassSounds;
        }
        const nowFs = Date.now();
        if (this.isMovingLocal && this.isOnGround && nowFs - this.lastFootstepTime > AUDIO_CONFIG.footstepInterval && this.footstepSounds.length) {
            const snd = this.footstepSounds[this.footstepIndex % this.footstepSounds.length];
            snd.currentTime = 0; snd.play().catch(() => {});
            this.footstepIndex = (this.footstepIndex + 1 + Math.floor(Math.random() * 3)) % this.footstepSounds.length;
            this.lastFootstepTime = nowFs;
        }
        const lerpFactor = 0.2;
        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId === selfId) return;
            const mesh = this.peerModels[peerId]; const body = this.peerBodies[peerId]; const target = this.peerTargets[peerId];
            if (mesh && target) { mesh.position.x += (target.position.x - mesh.position.x) * lerpFactor; mesh.position.y += (target.position.y - 0.5 - mesh.position.y) * lerpFactor; mesh.position.z += (target.position.z - mesh.position.z) * lerpFactor; mesh.rotation.y += (target.rotY - mesh.rotation.y) * lerpFactor; }
            if (body && target) { body.position.x += (target.position.x - body.position.x) * lerpFactor; body.position.y += (target.position.y - body.position.y) * lerpFactor; body.position.z += (target.position.z - body.position.z) * lerpFactor; }
        });
        if (this.character && this.characterBody) { this.character.position.copy(this.characterBody.position); this.character.position.y -= 0.5; }
        if (this.peerMixers) Object.values(this.peerMixers).forEach(mixer => mixer.update(delta * 1.5));
        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId === selfId) return;
            const mesh = this.peerModels[peerId]; const animName = this.peerAnims[peerId];
            if (mesh?.animations && animName && mesh.animations[animName] && !mesh.animations[animName].isRunning()) {
                Object.values(mesh.animations).forEach((action: any) => action.stop()); mesh.animations[animName].play();
            }
        });
        if (this.animationMixers.length > 0) this.animationMixers.forEach(mixer => mixer.update(delta * 1.5));
        if (this.character && this.characterBody) {
            const charPos = new THREE.Vector3(this.characterBody.position.x, this.characterBody.position.y, this.characterBody.position.z);
            this.camera.position.copy(charPos).add(ISO_OFFSET.clone().multiplyScalar(this.isoZoomScale));
            this.camera.lookAt(charPos);
            if (!this.isMobile) {
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(this.mouseNDC, this.camera);
                const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(charPos.y - 0.5));
                raycaster.ray.intersectPlane(floorPlane, this.aimTarget);
            }
            const dx = this.aimTarget.x - this.character.position.x, dz = this.aimTarget.z - this.character.position.z;
            if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) this.character.rotation.y = Math.atan2(dx, dz);
        }
        if (this.sendMove && this.character && this.characterBody) {
            const now = performance.now();
            if (now - this.lastSent > PHYSICS_CONFIG.networkPositionRate) {
                this.sendMove({ x: this.characterBody.position.x, y: this.characterBody.position.y, z: this.characterBody.position.z, rotY: this.character.rotation.y });
                this.lastSent = now;
            }
        }
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.mesh.position.copy(proj.body.position); proj.mesh.quaternion.copy(proj.body.quaternion);
            if (Date.now() - proj.createTime > PHYSICS_CONFIG.projectileLifetime) { this.scene.remove(proj.mesh); this.physicsWorld.removeBody(proj.body); this.projectiles.splice(i, 1); }
        }
        this.breakableTargets.forEach(target => { if (target.mesh && target.body) { target.mesh.position.copy(target.body.position); target.mesh.quaternion.copy(target.body.quaternion); } });
        if (this.sendTargetPhysics && this.isPhysicsHost) {
            const now = performance.now(); const lastBatch = (this as any)._lastPhysBatch || 0;
            if (now - lastBatch >= PHYSICS_CONFIG.physicsBroadcastRate) {
                (this as any)._lastPhysBatch = now;
                const batch: any[] = [];
                this.breakableTargets.forEach(target => {
                    const p = target.body.position;
                    let lastPos = (target as any)._lastPhysPos;
                    if (!lastPos) { (target as any)._lastPhysPos = { x: p.x, y: p.y, z: p.z }; return; }
                    const dx = p.x - lastPos.x, dy = p.y - lastPos.y, dz = p.z - lastPos.z;
                    if (dx*dx + dy*dy + dz*dz < 0.0001) return;
                    lastPos.x = p.x; lastPos.y = p.y; lastPos.z = p.z;
                    const vel = target.body.velocity, av = target.body.angularVelocity, q = target.body.quaternion;
                    batch.push({ id: target.id, px: p.x, py: p.y, pz: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, vx: vel.x, vy: vel.y, vz: vel.z, avx: av.x, avy: av.y, avz: av.z });
                });
                if (batch.length > 0) this.sendTargetPhysics(batch);
            }
        }
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const piece = this.debris[i];
            piece.mesh.position.copy(piece.body.position); piece.mesh.quaternion.copy(piece.body.quaternion);
            if (Date.now() - piece.createTime > PHYSICS_CONFIG.debrisLifetime) { this.scene.remove(piece.mesh); this.physicsWorld.removeBody(piece.body); this.debris.splice(i, 1); }
        }
    }
}

export default ProtectCrystalScene;

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as CANNON from 'cannon-es';
import ThreejsScene from '../base/scene.ts';
import { joinRoom, selfId } from '@trystero-p2p/torrent';

// ── ANIMATION NAMES ──────────────────────────────────────────────────────────
// Run once with the console open to see available clip names:
//   [character.glb] animations: ['...', ...]
// Fill in the exact names from the loaded GLB, or leave as '' to auto-detect.
const ANIM_NAMES = {
    idle:  'idle',
    walk:  'walk',
    spell: 'attack-melee-right',
    run:   'sprint',
    jump:  'jump',
};
// ─────────────────────────────────────────────────────────────────────────────

const CHARACTER_MODELS: Record<string, string> = {
    'male-a':   '/models/testlab/characters/character-male-a.glb',
    'male-b':   '/models/testlab/characters/character-male-b.glb',
    'male-c':   '/models/testlab/characters/character-male-c.glb',
    'male-d':   '/models/testlab/characters/character-male-d.glb',
    'male-e':   '/models/testlab/characters/character-male-e.glb',
    'male-f':   '/models/testlab/characters/character-male-f.glb',
    'female-a': '/models/testlab/characters/character-female-a.glb',
    'female-b': '/models/testlab/characters/character-female-b.glb',
    'female-c': '/models/testlab/characters/character-female-c.glb',
    'female-d': '/models/testlab/characters/character-female-d.glb',
    'female-e': '/models/testlab/characters/character-female-e.glb',
    'female-f': '/models/testlab/characters/character-female-f.glb',
};

const PROJECTILE_MODELS: Record<string, string> = {
    donut:    '/models/testlab/projectiles/foods/donut-chocolate.glb',
    donutS:   '/models/testlab/projectiles/foods/donut-sprinkles.glb',
    icecream: '/models/testlab/projectiles/foods/ice-cream.glb',
    apple:    '/models/testlab/projectiles/foods/apple.glb',
    burger:   '/models/testlab/projectiles/foods/burger.glb',
};

const ISO_OFFSET = new THREE.Vector3(0, 18, 14);

function seededRandom(roomId: string, index: number): number {
    let h = index * 2654435761;
    for (let i = 0; i < roomId.length; i++) {
        h = Math.imul(h ^ roomId.charCodeAt(i), 0x9e3779b1);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff;
}

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

class TestLabScene extends ThreejsScene {
    plane: any
    directionalLight: THREE.DirectionalLight | null
    ambientLight: THREE.AmbientLight | null
    character: any
    characterBody: any
    characterSpeed: number
    jumpVelocity: number
    isJumping: boolean
    keys: Record<string, boolean>
    noKeysPressed: boolean
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
    cubeBodies: any[]
    roomId: string
    isRoomCreator: boolean
    myName: string
    characterModel: string
    projectileModel: string
    peerCharacterModels: Record<string, string>
    peerProjectileModels: Record<string, string>
    sendMyInfo: any
    sendRequestSync: any
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
    // Isometric aim
    aimTarget: THREE.Vector3
    mouseNDC: THREE.Vector2
    // Model caches
    projectileCache: Map<string, THREE.Group>
    roundedCubeModel: THREE.Group | null
    // Terrain
    terrainHeights: number[][]
    terrainN: number
    terrainES: number
    // Zoom
    isoZoomScale: number
    // Static scene objects
    fountainModel: any
    crystalModel: any
    treeCrookedModel: any
    treeHighCrookedModel: any
    fountainMesh: THREE.Object3D | null
    crystalMesh: THREE.Object3D | null
    crystalBaseY: number
    crystalLight: THREE.PointLight | null
    crystalBody: CANNON.Body | null
    treeMeshes: THREE.Object3D[]
    treeBodies: CANNON.Body[]
    // Movement / sound state
    isMovingLocal: boolean
    isOnGround: boolean
    wasOnGround: boolean
    footstepGrassSounds: HTMLAudioElement[]
    footstepConcreteSounds: HTMLAudioElement[]
    footstepSounds: HTMLAudioElement[]   // alias — points to whichever set is active
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
        this.characterSpeed = 5;
        this.jumpVelocity = 8;
        this.isJumping = false;
        this.keys = {};
        this.noKeysPressed = true;
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
        this.roomId = room.id;
        this.isRoomCreator = room.isCreator;
        this.myName = playerConfig.name || this.getRandomGoblinName();
        this.characterModel = playerConfig.characterModel || 'male-a';
        this.projectileModel = playerConfig.projectileModel || 'donut';
        this.room = joinRoom({
            appId: 'trystero-3d-lab',
            relayUrls: [
                'wss://tracker.openwebtorrent.com',
                'wss://tracker.files.fm:7073/announce',
            ],
        }, this.roomId);
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
        this.shootCooldown = 400;

        this.debris = [];

        this.damageThreshold = 2;

        this.projectileSpeed = 18;
        this.projectileMass = 5;
        this.breakForce = 40;

        this.GROUPS = {
            GROUND: 1,
            BREAKABLE: 2,
            PROJECTILE: 4,
            CHARACTER: 8,
            DEBRIS: 16,
            PEER_CHARACTER: 32,
            STATIC: 64
        };

        this.targetSyncTimeout = null;
        this.initialTargetsSent = false;
        this.lastTargetSync = 0;
        this.targetSyncInterval = 5000;

        this.sendTargetPhysics = null;
        this.targetLastMoved = {};
        this.pendingRemovals = [];
        this.sendCubeImpact = null;
        this.sendMyInfo = null;
        this.sendRequestSync = null;
        this.peerLastSeen = {};
        this.lastInfoSent = {};
        this.timedOutPeers = new Set();
        this.pingInterval = null;
        this.synced = false;
        this.syncTimeout = null;
        this.currentHostId = '';

        this.aimTarget = new THREE.Vector3();
        this.mouseNDC = new THREE.Vector2();
        this.projectileCache = new Map();
        this.roundedCubeModel = null;
        this.terrainHeights = [];
        this.terrainN = 24;
        this.terrainES = 4;
        this.isoZoomScale = 1.0;
        // Static scene objects
        this.fountainModel = null;
        this.crystalModel = null;
        this.treeCrookedModel = null;
        this.treeHighCrookedModel = null;
        this.fountainMesh = null;
        this.crystalMesh = null;
        this.crystalBaseY = 0;
        this.crystalLight = null;
        this.crystalBody = null;
        this.treeMeshes = [];
        this.treeBodies = [];
        // Movement / sound state
        this.isMovingLocal = false;
        this.isOnGround = false;
        this.wasOnGround = false;
        this.footstepGrassSounds = [];
        this.footstepConcreteSounds = [];
        this.footstepSounds = [];
        this.impactWoodSounds = [];
        this.jumpSound = null;
        this.concreteRadius = 12;
        this.lastFootstepTime = 0;
        this.footstepIndex = 0;
        this.lastImpactTime = 0;
    }

    get isPhysicsHost(): boolean {
        // Only the room creator ever acts as physics host.
        // Joiners (opened URL with ?room=) never self-elect as host.
        return this.synced && this.isRoomCreator;
    }

    electNewHost(excludePeerId?: string) {
        const peerIds = this.room.getPeers
            ? Object.keys(this.room.getPeers()).filter(id => !this.timedOutPeers.has(id) && id !== excludePeerId)
            : [];
        this.currentHostId = [selfId, ...peerIds].sort()[0];
    }

    finishSync() {
        if (this.synced) return;
        this.synced = true;
        clearTimeout(this.syncTimeout);
        this.electNewHost();
        if (this.isPhysicsHost && this.breakableTargets.length === 0) {
            this.createInitialTargets();
        }
        this.syncTargetPhysicsType();
        this.loadLocalCharacter();

        // If we're the host and peers were already connected before our syncTimeout
        // fired, they never got sendInitialTargets via onPeerJoin — send it now.
        if (this.isPhysicsHost && this.sendInitialTargets) {
            const peerObj = this.room.getPeers ? this.room.getPeers() : {};
            const peerIds = Object.keys(peerObj).filter(id => id !== selfId && !this.timedOutPeers.has(id));
            if (peerIds.length > 0) {
                setTimeout(() => {
                    const states = this.breakableTargets.map(t => ({
                        id: t.id,
                        px: t.body.position.x, py: t.body.position.y, pz: t.body.position.z,
                        qx: t.body.quaternion.x, qy: t.body.quaternion.y,
                        qz: t.body.quaternion.z, qw: t.body.quaternion.w,
                        health: t.health,
                    }));
                    this.sendInitialTargets(states, peerIds);
                    peerIds.forEach(pid => this.sendMyInfo?.({ name: this.myName, characterModel: this.characterModel, projectileModel: this.projectileModel }, [pid]));
                }, 300);
            }
        }
    }

    loadLocalCharacter() {
        const loadDesc = document.getElementById('loading-desc');
        if (loadDesc) loadDesc.textContent = 'Carregando personagem...';
        document.getElementById('loading-screen').style.display = '';

        const loadingManager = new THREE.LoadingManager(
            () => {
                setTimeout(() => {
                    document.getElementById('loading-screen').style.display = 'none';
                    document.getElementById('progress-bar').style.width = '0%';
                }, 500);
            },
            (_url, itemsLoaded, itemsTotal) => {
                const progress = (itemsLoaded / itemsTotal) * 100;
                document.getElementById('progress-bar').style.width = `${progress}%`;
            },
            () => {
                document.getElementById('loading-screen').style.display = '';
            }
        );

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        const loader = new GLTFLoader(loadingManager);
        loader.setDRACOLoader(dracoLoader);

        const modelPath = CHARACTER_MODELS[this.characterModel] || CHARACTER_MODELS['male-a'];
        loader.load(modelPath, (gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    (child as THREE.Mesh).castShadow = true;
                    (child as THREE.Mesh).receiveShadow = true;
                }
            });

            const clipNames = gltf.animations.map(a => a.name);
            console.log('[character.glb] animations:', clipNames);
            this.animNames = {
                idle:  this.findAnim(gltf.animations, [ANIM_NAMES.idle,  'Idle', 'idle', 'Breathing Idle', 'Stand', 'Idle 1', 'Survey', 'T-Pose']),
                walk:  this.findAnim(gltf.animations, [ANIM_NAMES.walk,  'Walk', 'walk', 'Walking', 'Walk Forward', 'Walk In Place', 'Run', 'run']),
                run:   this.findAnim(gltf.animations, [ANIM_NAMES.run,   'Run', 'run', 'Running', 'Walk', 'walk']),
                jump:  this.findAnim(gltf.animations, [ANIM_NAMES.jump,  'Jump', 'jump', 'Jumping', 'Jump In Place']),
                spell: this.findAnim(gltf.animations, [ANIM_NAMES.spell, 'Spell', 'spell', 'Cast Spell', 'Casting', 'Attack', 'attack', 'Throw', 'throw', 'Punch', 'Kick']),
            };
            console.log('[animNames resolved]:', this.animNames);

            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnDist  = 6 + Math.random() * 4;
            const spawnX = Math.cos(spawnAngle) * spawnDist;
            const spawnZ = Math.sin(spawnAngle) * spawnDist;

            model.position.set(spawnX, 2, spawnZ);
            model.scale.set(1.5, 1.5, 1.5);
            model.rotation.set(0, 0, 0);
            this.scene.add(model);
            this.objectModels.push(model);
            this.character = model;

            const radius = 0.5;
            const shape = new CANNON.Sphere(radius);
            this.characterBody = new CANNON.Body({
                mass: 1,
                position: new CANNON.Vec3(spawnX, 2, spawnZ),
                shape: shape,
                linearDamping: 0.3,
                angularDamping: 0.5,
                collisionFilterGroup: this.GROUPS.CHARACTER,
                collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.BREAKABLE | this.GROUPS.PROJECTILE | this.GROUPS.CHARACTER | this.GROUPS.PEER_CHARACTER | this.GROUPS.STATIC
            });
            this.physicsWorld.addBody(this.characterBody);
            this.characterBody.material = this.characterMaterial;

            this.peerModels[selfId] = this.character;
            this.peerBodies[selfId] = this.characterBody;

            const peerObj = this.room.getPeers ? this.room.getPeers() : {};
            Object.keys(peerObj).forEach(peerId => {
                if (peerId !== selfId) this.spawnPeer(peerId);
            });

            if (gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);
                this.animationMixers.push(mixer);
                (model as any).animations = {};
                gltf.animations.forEach((clip) => {
                    (model as any).animations[clip.name] = mixer.clipAction(clip);
                });
            }
        });
    }

    syncTargetPhysicsType(becameHost = false) {
        const host = this.isPhysicsHost;
        this.breakableTargets.forEach(target => {
            if (host) {
                target.body.type = CANNON.Body.DYNAMIC;
                target.body.mass = 10;
            } else {
                target.body.type = CANNON.Body.KINEMATIC;
                target.body.mass = 0;
            }
            target.body.velocity.set(0, 0, 0);
            target.body.angularVelocity.set(0, 0, 0);
            target.body.updateMassProperties();
        });
        if (becameHost) {
            this.showHostToast('Você agora é o host da física');
        }
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

    updatePeerNameLabel(peerId: string, name: string) {
        if (!this.peerNameLabels?.[peerId]) return;
        const oldLabel = this.peerNameLabels[peerId];
        const parent = oldLabel.parent;
        if (!parent) return;
        parent.remove(oldLabel);
        const newLabel = this.createNameLabel(name);
        newLabel.position.set(0, 2, 0);
        parent.add(newLabel);
        this.peerNameLabels[peerId] = newLabel;
    }

    triggerSpellAnimation() {
        if (!this.animNames?.spell || !this.character?.animations) return;
        this.isPlayingSpell = true;
        const action = this.character.animations[this.animNames.spell];
        if (action) {
            action.loop = THREE.LoopOnce;
            action.clampWhenFinished = true;
            action.reset();
        }
        this.playAnimation(this.animNames.spell);
        clearTimeout(this.spellAnimTimeout);
        this.spellAnimTimeout = setTimeout(() => { this.isPlayingSpell = false; }, 900);
    }

    initDebugGui() {
        const cubeFolder = this.debugGui.gui.addFolder('Cubes');
        cubeFolder.add({ respawn: () => this.createInitialTargets() }, 'respawn').name('Respawn Targets');

        const cameraFolder = this.debugGui.gui.addFolder('Camera');
        cameraFolder.add(this.camera.position, 'x', -50, 50).name('Position X').listen();
        cameraFolder.add(this.camera.position, 'y', -50, 50).name('Position Y').listen();
        cameraFolder.add(this.camera.position, 'z', -50, 50).name('Position Z').listen();

        const lightFolder = this.debugGui.gui.addFolder('Directional Light');
        lightFolder.add(this.directionalLight.position, 'x', -100, 100).name('Position X').listen();
        lightFolder.add(this.directionalLight.position, 'y', -100, 100).name('Position Y').listen();
        lightFolder.add(this.directionalLight.position, 'z', -100, 100).name('Position Z').listen();
        lightFolder.add(this.directionalLight, 'intensity', 0, 6).name('Intensity').listen();

        const ambientLightFolder = this.debugGui.gui.addFolder('Ambient Light');
        ambientLightFolder.add(this.ambientLight, 'intensity', 0, 4).name('Intensity').listen();
    }

    init(container: HTMLElement) {
        // Load the rounded cube model as early as possible so it is ready before
        // any sync data arrives from the host.
        const earlyLoader = new GLTFLoader();
        earlyLoader.load('/models/testlab/objects/rounded_cube_doodle.glb', (gltf) => {
            this.roundedCubeModel = gltf.scene;
        });
        const staticLoader = new GLTFLoader();
        staticLoader.load('/models/testlab/structures/fountain-round.glb',    g => { this.fountainModel        = g.scene; });
        staticLoader.load('/models/testlab/objects/cristal.glb',              g => { this.crystalModel         = g.scene; });
        staticLoader.load('/models/testlab/objects/tree-crooked.glb',         g => { this.treeCrookedModel     = g.scene; });
        staticLoader.load('/models/testlab/objects/tree-high-crooked.glb',    g => { this.treeHighCrookedModel = g.scene; });

        this.physicsWorld = new CANNON.World({
            gravity: new CANNON.Vec3(0, -12.82, 0)
        });

        super.init(container);

        const groundMaterial = new CANNON.Material('ground');
        const characterMaterial = new CANNON.Material('character');

        const contactMaterial = new CANNON.ContactMaterial(
            groundMaterial,
            characterMaterial,
            { friction: 0.8, restitution: 0 }
        );
        this.physicsWorld.addContactMaterial(contactMaterial);

        this.groundMaterial = groundMaterial;
        this.characterMaterial = characterMaterial;

        this.physicsWorld.addEventListener('beginContact', (event) => {
            if (!event || !event.bodyA || !event.bodyB) return;

            const bodyA = event.bodyA;
            const bodyB = event.bodyB;

            const projectile = this.projectiles.find(p => p.body === bodyA || p.body === bodyB);
            if (projectile) {
                const otherBody = bodyA === projectile.body ? bodyB : bodyA;
                const target = this.breakableTargets.find(t => t.body === otherBody);

                let breakTarget = null;
                let impactPos = null;

                if (target) {
                    if (this.isPhysicsHost) {
                        target.health -= 1;
                        const shouldBreak = target.health <= 0;
                        this.sendTarget?.({
                            id: target.id,
                            broken: shouldBreak,
                            health: target.health,
                            impactPoint: {
                                x: projectile.mesh.position.x,
                                y: projectile.mesh.position.y,
                                z: projectile.mesh.position.z
                            }
                        });
                        if (shouldBreak) {
                            breakTarget = target;
                            impactPos = projectile.mesh.position.clone();
                        } else {
                            this.updateTargetAppearance(target);
                        }
                    } else if (projectile.isLocal) {
                        const vel = projectile.body.velocity;
                        this.sendCubeImpact?.({
                            id: target.id,
                            vx: vel.x * this.projectileMass,
                            vy: vel.y * this.projectileMass,
                            vz: vel.z * this.projectileMass,
                            mass: this.projectileMass
                        });
                    }
                }

                // Knockback
                const hitPeerId = Object.keys(this.peerBodies).find(
                    id => id !== selfId && this.peerBodies[id] === otherBody
                );
                if (hitPeerId && this.sendHit) {
                    this.sendHit({}, hitPeerId);
                }
                if (otherBody === this.characterBody) {
                    this.applyHitKnockback();
                }

                // Queue break only — projectile is NOT removed on hit
                if (breakTarget) {
                    this.pendingRemovals.push({ projectile: null, breakTarget, impactPos });
                }

                // Impact wood sound (throttled 150ms)
                const now2 = Date.now();
                if (now2 - this.lastImpactTime > 150 && this.impactWoodSounds.length) {
                    const snd = this.impactWoodSounds[Math.floor(Math.random() * this.impactWoodSounds.length)];
                    snd.currentTime = 0; snd.play().catch(() => {});
                    this.lastImpactTime = now2;
                }
                return;
            }

            // Character push on non-host
            if (!this.isPhysicsHost && this.characterBody) {
                const isCharA = bodyA === this.characterBody;
                const isCharB = bodyB === this.characterBody;
                if (isCharA || isCharB) {
                    const cubeBody = isCharA ? bodyB : bodyA;
                    const hitTarget = this.breakableTargets.find(t => t.body === cubeBody);
                    if (hitTarget) {
                        const vel = this.characterBody.velocity;
                        this.sendCubeImpact?.({
                            id: hitTarget.id,
                            vx: vel.x,
                            vy: vel.y,
                            vz: vel.z,
                            mass: 1
                        });
                    }
                }
            }
        });

        // Flat physics ground — CANNON.Plane is infinite and reliable for sphere contacts.
        // The visual terrain mesh carries the hill geometry; physics stays flat at y=0.
        const groundPlane = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane(),
            material: this.groundMaterial,
            collisionFilterGroup: this.GROUPS.GROUND,
            collisionFilterMask: this.GROUPS.CHARACTER | this.GROUPS.BREAKABLE | this.GROUPS.PROJECTILE | this.GROUPS.DEBRIS
        });
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


        const peerObj = this.room.getPeers ? this.room.getPeers() : {};
        Object.keys(peerObj).forEach(peerId => {
            if (peerId !== selfId) this.spawnPeer(peerId);
        });

        this.room.onPeerJoin = (peerId) => {
            if (peerId === selfId) return;
            this.timedOutPeers.delete(peerId);
            this.spawnPeer(peerId);

            const wasHost = this.isPhysicsHost;
            if (this.synced) {
                this.electNewHost();
                this.syncTargetPhysicsType(!wasHost && this.isPhysicsHost);
            }

            // Send our info to the new peer (with retries)
            const sendInfo = (attempt: number) => {
                this.sendMyInfo?.({
                    name: this.myName,
                    characterModel: this.characterModel,
                    projectileModel: this.projectileModel
                }, [peerId]);
                if (attempt < 5) setTimeout(() => sendInfo(attempt + 1), 800);
            };
            setTimeout(() => sendInfo(0), 200);

            // Host sends the authoritative scene state as fast as possible
            if (wasHost && this.sendInitialTargets) {
                setTimeout(() => {
                    const states = this.breakableTargets.map(t => ({
                        id: t.id,
                        px: t.body.position.x, py: t.body.position.y, pz: t.body.position.z,
                        qx: t.body.quaternion.x, qy: t.body.quaternion.y,
                        qz: t.body.quaternion.z, qw: t.body.quaternion.w,
                        health: t.health,
                    }));
                    this.sendInitialTargets(states, [peerId]);
                }, 200);
            }

            // If WE are not yet synced, actively pull the scene state from this peer
            if (!this.synced) {
                const pullSync = (attempt: number) => {
                    if (this.synced) return;
                    this.sendRequestSync?.({}, [peerId]);
                    if (attempt < 8) setTimeout(() => pullSync(attempt + 1), 1200);
                };
                setTimeout(() => pullSync(0), 300);
            }
        };

        this.room.onPeerLeave = (peerId) => {
            const wasHostBefore = this.isPhysicsHost;
            const name = this.peerNames?.[peerId];
            if (this.currentHostId === peerId) this.electNewHost(peerId);
            this.removePeer(peerId);
            this.timedOutPeers.delete(peerId);
            delete (this.peerLastSeen as any)[peerId];
            delete (this.peerNames as any)[peerId];
            delete (this.peerCharacterModels as any)[peerId];
            delete (this.peerProjectileModels as any)[peerId];
            if (this.synced) this.syncTargetPhysicsType(!wasHostBefore && this.isPhysicsHost);
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
                    this.sendMyInfo?.({
                        name: this.myName,
                        characterModel: this.characterModel,
                        projectileModel: this.projectileModel
                    }, [peerId]);
                }
            }
            if (!this.peerModels[peerId]) {
                this.spawnPeer(peerId);
            }
            const { x, y, z, rotY } = data;
            if (!this.peerTargets[peerId]) {
                this.peerTargets[peerId] = { position: new THREE.Vector3(x, y, z), rotY };
            } else {
                this.peerTargets[peerId].position.set(x, y, z);
                this.peerTargets[peerId].rotY = rotY;
            }
        });

        const [sendAnim, getAnim] = this.room.makeAction('anim');
        this.sendAnim = sendAnim;

        getAnim((animName, peerId) => {
            this.peerAnims[peerId] = animName;
            const mesh = this.peerModels[peerId];
            if (mesh && mesh.animations && mesh.animations[animName]) {
                Object.values(mesh.animations).forEach((action: any) => action.stop());
                mesh.animations[animName].play();
            }
        });

        const [sendProjectile, getProjectile] = this.room.makeAction('projectile');
        this.sendProjectile = sendProjectile;
        getProjectile((data, peerId) => {
            if (peerId === selfId) return;
            const { position, direction, velocity, model } = data;
            this.createProjectile(position, direction, velocity, false, model || '');
        });

        const [sendTarget, getTarget] = this.room.makeAction('trg');
        this.sendTarget = sendTarget;
        getTarget((data, peerId) => {
            if (peerId === selfId) return;
            const { broken, impactPoint, id, health } = data;
            const target = this.breakableTargets.find(t => t.id === id);
            if (!target) return;
            if (broken) {
                this.createDebris(target, new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z));
                this.scene.remove(target.mesh);
                this.physicsWorld.removeBody(target.body);
                this.breakableTargets = this.breakableTargets.filter(t => t !== target);
            } else if (health !== undefined) {
                target.health = health;
                this.updateTargetAppearance(target);
            }
        });

        const [sendInitialTargets, getInitialTargets] = this.room.makeAction('sync');
        this.sendInitialTargets = sendInitialTargets;

        const applyTargetSync = (states: any[]) => {
            const alive = new Map(states.map((s: any) => [s.id, s]));

            for (let i = this.breakableTargets.length - 1; i >= 0; i--) {
                const target = this.breakableTargets[i];
                if (!alive.has(target.id)) {
                    this.scene.remove(target.mesh);
                    this.physicsWorld.removeBody(target.body);
                    this.breakableTargets.splice(i, 1);
                }
            }

            states.forEach((s: any) => {
                let target = this.breakableTargets.find(t => t.id === s.id);
                if (!target) {
                    target = this.createBreakableTarget(
                        new THREE.Vector3(s.px, s.py, s.pz), s.id, true
                    );
                    this.breakableTargets.push(target);
                }
                target.body.position.set(s.px, s.py, s.pz);
                target.body.quaternion.set(s.qx, s.qy, s.qz, s.qw);
                target.body.velocity.set(0, 0, 0);
                target.body.angularVelocity.set(0, 0, 0);
                target.mesh.position.set(s.px, s.py, s.pz);
                if (s.health !== undefined && s.health < target.maxHealth) {
                    target.health = s.health;
                    this.updateTargetAppearance(target);
                }
            });

            if (!this.synced) {
                this.finishSync();
            } else {
                const wasHost = this.isPhysicsHost;
                this.electNewHost();
                if (wasHost !== this.isPhysicsHost) {
                    this.syncTargetPhysicsType(!wasHost && this.isPhysicsHost);
                }
                this.updatePlayerList();
            }
        };

        getInitialTargets((states: any[], peerId: string) => {
            if (peerId === selfId) return;
            if (this.roundedCubeModel) {
                applyTargetSync(states);
            } else {
                // Model still loading — poll until ready then apply
                const wait = setInterval(() => {
                    if (this.roundedCubeModel) {
                        clearInterval(wait);
                        applyTargetSync(states);
                    }
                }, 50);
            }
        });

        const [sendHit, getHit] = this.room.makeAction('hit');
        this.sendHit = sendHit;
        getHit(() => { this.applyHitKnockback(); });

        const [sendCubeImpact, getCubeImpact] = this.room.makeAction('cimpa');
        this.sendCubeImpact = sendCubeImpact;
        getCubeImpact((data: any, peerId: string) => {
            if (peerId === selfId) return;
            if (!this.isPhysicsHost) return;
            const target = this.breakableTargets.find(t => t.id === data.id);
            if (!target) return;
            target.body.applyImpulse(
                new CANNON.Vec3(data.vx, data.vy, data.vz),
                target.body.position
            );
        });

        const [sendMyInfo, getMyInfo] = this.room.makeAction('myinfo');
        this.sendMyInfo = sendMyInfo;
        getMyInfo((data: any, peerId: string) => {
            if (peerId === selfId) return;
            this.peerNames[peerId] = data.name;
            this.peerCharacterModels[peerId] = data.characterModel || 'male-a';
            this.peerProjectileModels[peerId] = data.projectileModel || 'donut';

            // Re-spawn peer with correct model if they had a default placeholder loaded
            if (this.peerModels[peerId]) {
                const loadedPath = (this.peerModels[peerId] as any)._modelPath;
                const correctPath = CHARACTER_MODELS[data.characterModel] || CHARACTER_MODELS['male-a'];
                if (loadedPath !== correctPath) {
                    this.removePeer(peerId);
                    this.spawnPeer(peerId);
                }
            }

            this.updatePeerNameLabel(peerId, data.name);
            this.updatePlayerList();

            const now = Date.now();
            if (!this.lastInfoSent[peerId] || now - this.lastInfoSent[peerId] > 2000) {
                this.lastInfoSent[peerId] = now;
                this.sendMyInfo?.({
                    name: this.myName,
                    characterModel: this.characterModel,
                    projectileModel: this.projectileModel
                }, [peerId]);
            }
        });

        // Pull-based sync: new joiners request state; any synced peer (preferably host) responds
        const [sendRequestSync, getRequestSync] = this.room.makeAction('rsync');
        this.sendRequestSync = sendRequestSync;
        getRequestSync((_data: any, peerId: string) => {
            if (peerId === selfId || !this.synced) return;
            // Only the current host answers to avoid duplicate/conflicting states
            if (!this.isPhysicsHost) return;
            const states = this.breakableTargets.map(t => ({
                id: t.id,
                px: t.body.position.x, py: t.body.position.y, pz: t.body.position.z,
                qx: t.body.quaternion.x, qy: t.body.quaternion.y,
                qz: t.body.quaternion.z, qw: t.body.quaternion.w,
                health: t.health,
            }));
            this.sendInitialTargets?.(states, [peerId]);
            this.sendMyInfo?.({
                name: this.myName,
                characterModel: this.characterModel,
                projectileModel: this.projectileModel
            }, [peerId]);
        });

        const [sendTargetPhysics, getTargetPhysics] = this.room.makeAction('tgphy');
        this.sendTargetPhysics = sendTargetPhysics;
        getTargetPhysics((data: any, peerId: string) => {
            if (peerId === selfId) return;
            if (this.isPhysicsHost) return;
            const target = this.breakableTargets.find(t => t.id === data.id);
            if (!target) return;
            target.body.velocity.set(data.vx, data.vy, data.vz);
            target.body.angularVelocity.set(data.avx ?? 0, data.avy ?? 0, data.avz ?? 0);
            const f = 0.4;
            target.body.position.x += (data.px - target.body.position.x) * f;
            target.body.position.y += (data.py - target.body.position.y) * f;
            target.body.position.z += (data.pz - target.body.position.z) * f;
            target.body.quaternion.set(data.qx, data.qy, data.qz, data.qw);
            const p = target.body.position;
            if ((target as any)._lastPhysPos) {
                (target as any)._lastPhysPos.x = p.x;
                (target as any)._lastPhysPos.y = p.y;
                (target as any)._lastPhysPos.z = p.z;
            }
        });

        this.pingInterval = setInterval(() => {
            const now = Date.now();
            Object.keys(this.peerModels).forEach(peerId => {
                if (peerId === selfId) return;
                const last = this.peerLastSeen[peerId] ?? 0;
                if (last === 0 || now - last <= 300000) return;
                const name = this.peerNames?.[peerId];
                const wasHost = this.isPhysicsHost;
                if (this.currentHostId === peerId) {
                    this.timedOutPeers.add(peerId);
                    this.electNewHost(peerId);
                } else {
                    this.timedOutPeers.add(peerId);
                }
                this.removePeer(peerId);
                delete (this.peerLastSeen as any)[peerId];
                delete (this.peerNames as any)[peerId];
                delete (this.peerCharacterModels as any)[peerId];
                delete (this.peerProjectileModels as any)[peerId];
                if (this.synced) this.syncTargetPhysicsType(!wasHost && this.isPhysicsHost);
                this.showHostToast(`${name ?? 'Jogador'} saiu da sala`);
                this.updatePlayerList();
            });
        }, 3000);

        const loadDesc = document.getElementById('loading-desc');
        if (this.isRoomCreator) {
            if (loadDesc) loadDesc.textContent = 'Criando sala...';
            document.getElementById('loading-screen').style.display = '';
            this.syncTimeout = setTimeout(() => {
                if (this.synced) return;
                this.finishSync();
            }, 500);
        } else {
            if (loadDesc) loadDesc.textContent = 'Aguardando host...';
            document.getElementById('loading-screen').style.display = '';
            // Non-creator NEVER self-elects as host.
            // We wait up to 5 minutes for the host to push sync data.
            // If nothing arrives, show an error instead of self-hosting.
            this.syncTimeout = setTimeout(() => {
                if (this.synced) return;
                this.showRoomError();
            }, 300000);
        }

        // Periodic myinfo broadcast so late-joining peers always get skin/name
        setInterval(() => {
            if (this.synced && this.sendMyInfo) {
                this.sendMyInfo({
                    name: this.myName,
                    characterModel: this.characterModel,
                    projectileModel: this.projectileModel
                });
            }
        }, 5000);
    }

    destroy() {
        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId !== selfId) this.removePeer(peerId);
        });

        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0;
            this.backgroundMusic = null;
        }

        if (this.targetSyncTimeout) clearTimeout(this.targetSyncTimeout);
        if (this.syncTimeout) clearTimeout(this.syncTimeout);
        if (this.pingInterval) clearInterval(this.pingInterval);
        document.getElementById('room-panel')?.remove();
        super.destroy();
    }

    spawnPeer(peerId) {
        if (this.peerModels[peerId] || this.peerLoading[peerId]) return;
        this.peerLoading[peerId] = true;

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        const modelKey = this.peerCharacterModels[peerId] || 'male-a';
        const modelPath = CHARACTER_MODELS[modelKey] || CHARACTER_MODELS['male-a'];

        loader.load(modelPath, (gltf) => {
            // If myinfo arrived with a different model key while we were loading, restart
            const latestKey = this.peerCharacterModels[peerId] || 'male-a';
            const latestPath = CHARACTER_MODELS[latestKey] || CHARACTER_MODELS['male-a'];
            if (latestPath !== modelPath) {
                delete this.peerLoading[peerId];
                this.spawnPeer(peerId);
                return;
            }

            const model = gltf.scene;
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    (child as THREE.Mesh).castShadow = true;
                    (child as THREE.Mesh).receiveShadow = true;
                }
            });
            model.position.set(Math.random() * 4 - 2, 2, Math.random() * 4 - 2);
            model.scale.set(1.5, 1.5, 1.5);
            model.rotation.set(0, 0, 0);
            (model as any)._modelPath = modelPath;
            this.scene.add(model);

            if (!this.peerNameLabels) this.peerNameLabels = {};
            const displayName = this.peerNames?.[peerId] ?? '...';
            const nameLabel = this.createNameLabel(displayName);
            model.add(nameLabel);
            nameLabel.position.set(0, 3.2, 0);
            this.peerNameLabels[peerId] = nameLabel;

            const radius = 0.5;
            const shape = new CANNON.Sphere(radius);
            const body = new CANNON.Body({
                mass: 0,
                type: CANNON.Body.KINEMATIC,
                position: new CANNON.Vec3(model.position.x, model.position.y, model.position.z),
                shape: shape,
                collisionFilterGroup: this.GROUPS.PEER_CHARACTER,
                collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.PROJECTILE | this.GROUPS.CHARACTER | this.GROUPS.STATIC
            });
            (body as any).peerId = peerId;
            this.physicsWorld.addBody(body);

            if (!this.peerTargets[peerId]) {
                this.peerTargets[peerId] = { position: model.position.clone(), rotY: 0 };
            }

            if (gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);
                (model as any).animations = {};
                gltf.animations.forEach((clip) => {
                    (model as any).animations[clip.name] = mixer.clipAction(clip);
                });
                if (!this.peerMixers) this.peerMixers = {};
                this.peerMixers[peerId] = mixer;
            }

            this.peerModels[peerId] = model;
            this.peerBodies[peerId] = body;

            delete this.peerLoading[peerId];
            this.updatePlayerList();
        });
    }

    removePeer(peerId) {
        if (this.peerModels[peerId]) {
            this.scene.remove(this.peerModels[peerId]);
            delete this.peerModels[peerId];
        }
        if (this.peerBodies[peerId]) {
            this.physicsWorld.removeBody(this.peerBodies[peerId]);
            delete this.peerBodies[peerId];
        }
        if (this.peerMixers?.[peerId]) delete this.peerMixers[peerId];
        if (this.peerAnims?.[peerId])  delete this.peerAnims[peerId];
        if (this.peerTargets?.[peerId]) delete this.peerTargets[peerId];
        if (this.peerNameLabels?.[peerId]) delete this.peerNameLabels[peerId];
        delete this.peerLoading[peerId];
    }

    createRoomUI() {
        const panel = document.createElement('div');
        panel.id = 'room-panel';

        const roomIdEl = document.createElement('div');
        roomIdEl.className = 'room-id';
        roomIdEl.textContent = `Sala: ${this.roomId}`;

        const copyBtn = document.createElement('button');
        copyBtn.id = 'copy-link-btn';
        copyBtn.textContent = 'Copiar link';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                copyBtn.textContent = '✓ Copiado!';
                setTimeout(() => { copyBtn.textContent = 'Copiar link'; }, 2000);
            });
        });

        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'room-section-title';
        sectionTitle.textContent = 'Online';

        const playerList = document.createElement('div');
        playerList.id = 'player-list';

        panel.appendChild(roomIdEl);
        panel.appendChild(copyBtn);
        panel.appendChild(sectionTitle);
        panel.appendChild(playerList);
        document.body.appendChild(panel);

        this.updatePlayerList();
    }

    updatePlayerList() {
        const list = document.getElementById('player-list');
        if (!list) return;

        list.innerHTML = '';
        const peerIds = this.room.getPeers ? Object.keys(this.room.getPeers()) : [];
        const hostId = this.currentHostId;

        const selfEl = document.createElement('div');
        selfEl.className = 'player-item player-self';
        selfEl.textContent = `${this.myName}${hostId === selfId ? ' (host)' : ''}`;
        list.appendChild(selfEl);

        peerIds.forEach(peerId => {
            const name = this.peerNames?.[peerId] ?? '...';
            const el = document.createElement('div');
            el.className = 'player-item';
            el.textContent = `${name}${hostId === peerId ? ' (host)' : ''}`;
            list.appendChild(el);
        });
    }

    playAnimation(animName) {
        if (!this.character || !this.character.animations) return;
        if (this.currentAnim === animName) return;
        Object.values(this.character.animations).forEach((action: any) => action.stop());
        if (this.character.animations[animName]) {
            this.character.animations[animName].play();
            this.currentAnim = animName;
        }
    }

    getRandomGoblinName() {
        const adjectives = [
            "Travesso", "Astuto", "Fedorento", "Saltitante", "Ranzinza",
            "Veloz", "Barulhento", "Zangado", "Misterioso", "Sorrateiro",
            "Bagunceiro", "Engraçado", "Fanfarrão", "Desastrado", "Esperto"
        ];
        return `Goblin ${adjectives[Math.floor(Math.random() * adjectives.length)]}`;
    }

    createNameLabel(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 0.5, 1);
        return sprite;
    }

    createInitialTargets() {
        for (let i = 0; i < 7; i++) {
            const position = new THREE.Vector3(
                seededRandom(this.roomId, i * 2) * 30 - 15,
                0,
                seededRandom(this.roomId, i * 2 + 1) * 30 - 15
            );
            const id = `${this.roomId}-t${i}`;
            this.breakableTargets.push(this.createBreakableTarget(position, id, true));
        }
    }

    applyHitKnockback() {
        if (!this.characterBody) return;
        this.characterBody.applyImpulse(
            new CANNON.Vec3(
                (Math.random() - 0.5) * 14,
                7,
                (Math.random() - 0.5) * 14
            ),
            this.characterBody.position
        );
    }

    enableMusicOnUserGesture() {
        if (this.backgroundMusic) return;

        this.backgroundMusic = new Audio('/sounds/background/Aylex - Uke Waves (freetouse.com).mp3');
        this.backgroundMusic.loop = true;
        this.backgroundMusic.volume = 0.5;

        const playMusic = () => {
            this.backgroundMusic.play().catch(() => {});
            window.removeEventListener('pointerdown', playMusic);
            window.removeEventListener('keydown', playMusic);
        };

        window.addEventListener('pointerdown', playMusic);
        window.addEventListener('keydown', playMusic);
    }

    updateTargetAppearance(target) {
        if (!target.mesh) return;
        const maxHealth = target.maxHealth ?? 3;
        const damageFrac = 1 - Math.max(0, target.health) / maxHealth;

        target.mesh.traverse((child: any) => {
            if (!child.isMesh || !child.material) return;
            if (!child.material.isMeshStandardMaterial) return;
            if (!child.userData.origColor) {
                child.userData.origColor = child.material.color.clone();
            }
            child.material.color.copy(child.userData.origColor)
                .lerp(new THREE.Color(0xff4400), damageFrac * 0.7);
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

        const spawnPos = new THREE.Vector3(
            this.characterBody.position.x,
            this.characterBody.position.y + 1.0,
            this.characterBody.position.z
        );

        // Fire toward the cursor's floor-plane hit point
        const dir = new THREE.Vector3().subVectors(this.aimTarget, spawnPos).normalize();
        // Ensure we always have a valid direction (fallback to camera forward)
        if (dir.lengthSq() < 0.01) {
            this.camera.getWorldDirection(dir);
        }

        spawnPos.addScaledVector(dir, 1.2);

        this.createProjectile(spawnPos, dir, this.projectileSpeed, true, this.projectileModel);

        if (this.sendProjectile) {
            this.sendProjectile({
                position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
                direction: { x: dir.x, y: dir.y, z: dir.z },
                velocity: this.projectileSpeed,
                model: this.projectileModel
            });
        }

        this.triggerSpellAnimation();
    }

    createProjectile(position, direction, speed, isLocal = false, modelKey = '') {
        const posVector = position instanceof THREE.Vector3
            ? position : new THREE.Vector3(position.x, position.y, position.z);

        const dirVector = direction instanceof THREE.Vector3
            ? direction : new THREE.Vector3(direction.x, direction.y, direction.z);

        // Visual container
        const container = new THREE.Object3D();
        container.position.copy(posVector);

        const cachedModel = modelKey ? this.projectileCache.get(modelKey) : null;
        if (cachedModel) {
            const model = cachedModel.clone();
            model.scale.setScalar(1.5);
            model.traverse((child: any) => {
                if (child.isMesh) child.castShadow = true;
            });
            container.add(model);
        } else {
            const fallback = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 8, 8),
                new THREE.MeshStandardMaterial({ color: 'brown', metalness: 0.3, roughness: 0.8 })
            );
            fallback.castShadow = true;
            container.add(fallback);
        }
        this.scene.add(container);

        const shape = new CANNON.Sphere(0.5);
        const body = new CANNON.Body({
            mass: this.projectileMass,
            shape: shape,
            material: this.characterMaterial,
            collisionResponse: true,
            linearDamping: 0.1,
            angularDamping: 0.1,
            collisionFilterGroup: this.GROUPS.PROJECTILE,
            collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.BREAKABLE | this.GROUPS.CHARACTER | this.GROUPS.PEER_CHARACTER | this.GROUPS.STATIC
        });
        body.position.copy(posVector as any);

        const velocity = dirVector.normalize().multiplyScalar(speed);
        body.velocity.set(velocity.x, velocity.y, velocity.z);

        this.physicsWorld.addBody(body);
        this.projectiles.push({ mesh: container, body, createTime: Date.now(), isLocal });
    }

    createBreakableTarget(position, id = null, skipOverlapCheck = false) {
        if (!skipOverlapCheck) {
            const minDistance = 3;
            for (const target of this.breakableTargets) {
                const dist = position.distanceTo(target.mesh.position);
                if (dist < minDistance) {
                    position.x += minDistance * (Math.random() - 0.5);
                    position.z += minDistance * (Math.random() - 0.5);
                }
            }
        }

        let physHalfX = 0.75, physHalfY = 0.75, physHalfZ = 0.75;
        const wrapper = new THREE.Group();

        if (this.roundedCubeModel) {
            const modelClone = this.roundedCubeModel.clone();
            modelClone.scale.setScalar(2.5);
            modelClone.traverse((child: any) => {
                if (child.isMesh) {
                    // Clone original material so each target is independent (preserves textures)
                    if (child.material) child.material = child.material.clone();
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            // Compute visual bounds with the model at origin (no parent yet)
            modelClone.updateWorldMatrix(false, true);
            const bbox = new THREE.Box3().setFromObject(modelClone);
            const bboxCenter = new THREE.Vector3();
            bbox.getCenter(bboxCenter);
            const bSize = new THREE.Vector3();
            bbox.getSize(bSize);
            physHalfX = bSize.x / 2;
            physHalfY = bSize.y / 2;
            physHalfZ = bSize.z / 2;
            // Shift the model so its visual centre sits at the wrapper's origin.
            // Physics body position = wrapper position = visual centre → all three aligned.
            modelClone.position.sub(bboxCenter);
            wrapper.add(modelClone);
        } else {
            const s = 1.5;
            const boxMesh = new THREE.Mesh(
                new THREE.BoxGeometry(s, s, s),
                new THREE.MeshStandardMaterial({ color: '#a0a0a0', roughness: 0.8 })
            );
            boxMesh.castShadow = true;
            boxMesh.receiveShadow = true;
            physHalfX = physHalfY = physHalfZ = s / 2;
            wrapper.add(boxMesh);
        }

        const mesh: THREE.Object3D = wrapper;
        // body.position = wrapper.position = visual centre.
        // CANNON.Box is also centred at body.position, so bottom = physHalfY above floor at rest.
        position.y = physHalfY + 5;
        mesh.position.copy(position);
        this.scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(physHalfX, physHalfY, physHalfZ));
        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.KINEMATIC,
            shape: shape,
            material: this.groundMaterial,
            collisionResponse: true,
            linearDamping: 0.4,
            angularDamping: 0.4,
            collisionFilterGroup: this.GROUPS.BREAKABLE,
            collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.CHARACTER | this.GROUPS.PROJECTILE | this.GROUPS.DEBRIS
        });
        body.position.copy(position);
        this.physicsWorld.addBody(body);

        const physSize = physHalfX * 2;
        const target = {
            mesh,
            body,
            broken: false,
            size: { width: physSize, height: physHalfY * 2, depth: physSize },
            position: position.clone(),
            id: id || Math.random().toString(36).substr(2, 9),
            health: 3,
            maxHealth: 3,
        };

        mesh.userData.targetId = target.id;
        (body as any).targetId = target.id;

        return target;
    }

    createDebris(target, impactPoint) {
        const pieces = 20;
        const size = target.size.width / 6;

        for (let i = 0; i < pieces; i++) {
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * size * 4,
                (Math.random() - 0.5) * size * 4,
                (Math.random() - 0.5) * size * 4
            );

            const geometryType = Math.random() > 0.5
                ? new THREE.TetrahedronGeometry(size)
                : new THREE.BoxGeometry(size, size, size);

            const material = new THREE.MeshStandardMaterial({
                color: 0x8b6914,
                metalness: 0.2,
                roughness: 0.9,
            });
            const mesh = new THREE.Mesh(geometryType, material);

            const debrisPos = target.mesh.position.clone().add(offset);
            mesh.position.copy(debrisPos);
            this.scene.add(mesh);

            const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
            const body = new CANNON.Body({
                mass: 0.1,
                shape: shape,
                material: this.groundMaterial,
                linearDamping: 0.1,
                angularDamping: 0.1
            });
            body.position.copy(debrisPos);

            const direction = debrisPos.clone().sub(impactPoint).normalize();
            direction.y = Math.max(0, direction.y * 0.2);
            direction.normalize();
            const force = direction.multiplyScalar(5);

            body.angularVelocity.set(
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6
            );
            body.applyImpulse(
                new CANNON.Vec3(force.x, force.y, force.z),
                new CANNON.Vec3(0, 0, 0)
            );

            this.physicsWorld.addBody(body);
            this.debris.push({ mesh, body, createTime: Date.now() });
        }
    }

    populateScene() {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.copy(ISO_OFFSET);

        const canvas = this.renderer.domElement;
        canvas.style.pointerEvents = 'auto';

        // Track cursor for isometric aim
        document.addEventListener('mousemove', (e: MouseEvent) => {
            this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        // Scroll wheel zoom (range: 0.5 close — 1.5 far)
        canvas.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            this.isoZoomScale = Math.max(0.5, Math.min(1.5, this.isoZoomScale + e.deltaY * 0.001));
        }, { passive: false });

        const skyColor = '#87ceeb';
        this.scene.background = new THREE.Color(skyColor);
        this.scene.fog = new THREE.FogExp2(skyColor, 0.007);

        // ── Flat ground plane with PBR grass texture ──────────────────────────
        const geo = new THREE.PlaneGeometry(2000, 2000);
        geo.rotateX(-Math.PI / 2);
        const tl = new THREE.TextureLoader();
        const grassBase  = tl.load('/textures/testlab/grass_05_1k/grass_05_basecolor_1k.png');
        const grassNorm  = tl.load('/textures/testlab/grass_05_1k/grass_05_normal_gl_1k.png');
        const grassRough = tl.load('/textures/testlab/grass_05_1k/grass_05_roughness_1k.png');
        [grassBase, grassNorm, grassRough].forEach(t => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(80, 80);
        });
        const planeMat = new THREE.MeshStandardMaterial({
            map: grassBase, normalMap: grassNorm, roughnessMap: grassRough, roughness: 1.0
        });
        this.plane = new THREE.Mesh(geo, planeMat);
        this.plane.receiveShadow = true;
        this.scene.add(this.plane);
        this.geometries.push(this.plane);
        // ─────────────────────────────────────────────────────────────────────

        // ── Concrete plaza circle around the fountain / crystal ───────────────
        {
            const CR   = this.concreteRadius;   // solid-zone radius (units)
            const FADE = CR * 0.35;             // fade band width beyond CR
            const SEG  = 128;                   // circle segments for smooth edge

            const circleGeo = new THREE.CircleGeometry(CR + FADE, SEG);
            circleGeo.rotateX(-Math.PI / 2);

            // Build a radial alpha map: opaque inside CR, fades to transparent
            const alphaSize = 512;
            const alphaCanvas = document.createElement('canvas');
            alphaCanvas.width = alphaCanvas.height = alphaSize;
            const alphaCtx = alphaCanvas.getContext('2d');
            const half = alphaSize / 2;
            const outerPx = half;
            const innerPx = outerPx * (CR / (CR + FADE));
            const grad = alphaCtx.createRadialGradient(half, half, innerPx, half, half, outerPx);
            grad.addColorStop(0, 'white');
            grad.addColorStop(1, 'black');
            alphaCtx.fillStyle = grad;
            alphaCtx.fillRect(0, 0, alphaSize, alphaSize);
            const alphaMap = new THREE.CanvasTexture(alphaCanvas);

            // PBR concrete textures (tiled)
            const concreteBase  = tl.load('/textures/testlab/concrete/concrete_floor_worn_001_diff_1k.jpg');
            const concreteRough = tl.load('/textures/testlab/concrete/concrete_floor_worn_001_rough_1k.jpg');
            const tileR = (CR + FADE) / 3;
            [concreteBase, concreteRough].forEach(t => {
                t.wrapS = t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(tileR, tileR);
            });

            const concreteMat = new THREE.MeshStandardMaterial({
                map:             concreteBase,
                roughnessMap:    concreteRough,
                roughness:       0.95,
                alphaMap:        alphaMap,
                transparent:     true,
                depthWrite:      false,  // keep so it doesn't clobber grass depth
                polygonOffset:   true,   // GPU-level push prevents z-fighting
                polygonOffsetFactor: -2,
                polygonOffsetUnits:  -2,
            });

            const concreteMesh = new THREE.Mesh(circleGeo, concreteMat);
            concreteMesh.position.y = 0;  // sit flush — polygonOffset handles separation
            concreteMesh.renderOrder  = 1; // render after the opaque grass plane
            concreteMesh.receiveShadow = true;
            this.scene.add(concreteMesh);
        }
        // ─────────────────────────────────────────────────────────────────────

        // Wait for static models then place them
        const waitForModels = setInterval(() => {
            if (this.fountainModel && this.crystalModel && this.treeCrookedModel && this.treeHighCrookedModel) {
                clearInterval(waitForModels);
                this.placeStaticObjects();
            }
        }, 50);

        // Lighting
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.57);
        this.directionalLight.position.set(10, 50, 10);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.left = -60;
        this.directionalLight.shadow.camera.right = 60;
        this.directionalLight.shadow.camera.top = 60;
        this.directionalLight.shadow.camera.bottom = -60;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 120;
        // Reduce shadow acne on fountain / character meshes without over-brightening
        this.directionalLight.shadow.bias       = -0.0005;
        this.directionalLight.shadow.normalBias =  0.02;
        this.scene.add(this.directionalLight);

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.94);
        this.scene.add(this.ambientLight);

        this.createRoomUI();

        // Preload all projectile GLBs
        const projLoader = new GLTFLoader();
        Object.entries(PROJECTILE_MODELS).forEach(([key, path]) => {
            projLoader.load(path, (gltf) => {
                this.projectileCache.set(key, gltf.scene);
            });
        });

        window.addEventListener('keydown', (event) => {
            this.noKeysPressed = false;
            this.keys[event.key.toLowerCase()] = true;
            if (event.key === ' ' && !this.isJumping) {
                this.mobileJump = true;
            }
        });

        window.addEventListener('keyup', (event) => {
            this.keys[event.key.toLowerCase()] = false;
            this.noKeysPressed = !Object.values(this.keys).some(Boolean);
        });

        setTimeout(() => {
            if (this.debugGui.gui) this.initDebugGui();
        }, 3000);

        this.initSounds();
    }

    initMobileControls() {
        const SZ = 120, KZ = 46, KO = (SZ - KZ) / 2, MAX = SZ / 2 - KZ / 2;

        const baseStyle = (extra: string) =>
            `position:fixed;width:${SZ}px;height:${SZ}px;` +
            `background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.22);` +
            `border-radius:50%;touch-action:none;z-index:1000;${extra}`;
        const knobStyle = () =>
            `width:${KZ}px;height:${KZ}px;background:rgba(255,255,255,0.4);` +
            `border-radius:50%;position:absolute;left:${KO}px;top:${KO}px;`;

        const makeStick = (extra: string) => {
            const base = document.createElement('div');
            base.style.cssText = baseStyle(extra);
            const knob = document.createElement('div');
            knob.style.cssText = knobStyle();
            base.appendChild(knob);
            document.body.appendChild(base);
            return { base, knob };
        };

        // ── Left stick: movement ─────────────────────────────────────────────
        const left = makeStick('left:20px;bottom:30px;');
        let lDrag = false, lX = 0, lY = 0;
        left.base.addEventListener('touchstart', (e) => {
            e.preventDefault(); lDrag = true; lX = e.touches[0].clientX; lY = e.touches[0].clientY;
        }, { passive: false });
        left.base.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!lDrag) return;
            const dx = e.touches[0].clientX - lX, dy = e.touches[0].clientY - lY;
            const dist = Math.min(Math.sqrt(dx*dx + dy*dy), MAX), a = Math.atan2(dy, dx);
            left.knob.style.left = `${KO + dist * Math.cos(a)}px`;
            left.knob.style.top  = `${KO + dist * Math.sin(a)}px`;
            this.mobileMove.x = -Math.cos(a) * (dist / MAX);
            this.mobileMove.y = Math.sin(a) * (dist / MAX);
        }, { passive: false });
        left.base.addEventListener('touchend', () => {
            lDrag = false;
            left.knob.style.left = `${KO}px`; left.knob.style.top = `${KO}px`;
            this.mobileMove.x = 0; this.mobileMove.y = 0;
        });

        // ── Jump: centre bottom ──────────────────────────────────────────────
        const jump = document.createElement('div');
        jump.textContent = '↑';
        jump.style.cssText =
            `position:fixed;left:50%;transform:translateX(-50%);bottom:42px;` +
            `width:60px;height:60px;border-radius:50%;` +
            `background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.28);` +
            `color:#fff;font-size:1.6em;line-height:60px;text-align:center;` +
            `touch-action:none;z-index:1000;user-select:none;`;
        jump.addEventListener('touchstart', (e) => { e.preventDefault(); this.mobileJump = true; }, { passive: false });
        document.body.appendChild(jump);

        // ── Right stick: aim + shoot on release ──────────────────────────────
        const right = makeStick('right:20px;bottom:30px;');
        let rDrag = false, rX = 0, rY = 0;

        const applyAim = (normX: number, normY: number) => {
            if (!this.camera || !this.characterBody) return;
            const fwd = new THREE.Vector3();
            this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
            const rgt = new THREE.Vector3().crossVectors(this.camera.up, fwd).negate();
            const dir = new THREE.Vector3().addScaledVector(rgt, normX).addScaledVector(fwd, -normY);
            if (dir.lengthSq() > 0.001) {
                dir.normalize();
                this.aimTarget.set(
                    this.characterBody.position.x + dir.x * 10,
                    this.characterBody.position.y,
                    this.characterBody.position.z + dir.z * 10
                );
            }
        };

        right.base.addEventListener('touchstart', (e) => {
            e.preventDefault(); rDrag = true; rX = e.touches[0].clientX; rY = e.touches[0].clientY;
        }, { passive: false });
        right.base.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!rDrag) return;
            const dx = e.touches[0].clientX - rX, dy = e.touches[0].clientY - rY;
            const dist = Math.min(Math.sqrt(dx*dx + dy*dy), MAX), a = Math.atan2(dy, dx);
            right.knob.style.left = `${KO + dist * Math.cos(a)}px`;
            right.knob.style.top  = `${KO + dist * Math.sin(a)}px`;
            applyAim(Math.cos(a) * (dist / MAX), Math.sin(a) * (dist / MAX));
        }, { passive: false });
        right.base.addEventListener('touchend', () => {
            rDrag = false;
            right.knob.style.left = `${KO}px`; right.knob.style.top = `${KO}px`;
            this.throwProjectile();
        });
    }

    updateCharacterPhysics(delta) {
        if (!this.characterBody) return;

        let moveX = 0, moveZ = 0;
        if (this.keys['w'] || this.keys['arrowup'])    moveZ -= 1;
        if (this.keys['s'] || this.keys['arrowdown'])  moveZ += 1;
        if (this.keys['a'] || this.keys['arrowleft'])  moveX += 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX -= 1;

        if (this.isMobile) {
            moveX += this.mobileMove.x;
            moveZ += this.mobileMove.y;
        }

        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) {
            moveX /= len;
            moveZ /= len;

            // Movement is always relative to the fixed isometric camera angle
            const cameraForward = new THREE.Vector3();
            const cameraRight = new THREE.Vector3();
            this.camera.getWorldDirection(cameraForward);
            cameraRight.crossVectors(this.camera.up, cameraForward);
            cameraForward.y = 0;
            cameraRight.y = 0;
            cameraForward.normalize();
            cameraRight.normalize();

            const moveDir = new THREE.Vector3();
            moveDir.addScaledVector(cameraForward, -moveZ);
            moveDir.addScaledVector(cameraRight, moveX);
            moveDir.normalize();

            this.characterBody.velocity.x = moveDir.x * this.characterSpeed;
            this.characterBody.velocity.z = moveDir.z * this.characterSpeed;
        } else {
            this.characterBody.velocity.x = 0;
            this.characterBody.velocity.z = 0;
        }

        let onGround = false;
        const threshold = 0.5;
        if (this.characterBody.world?.contacts) {
            for (const contact of this.characterBody.world.contacts) {
                if (contact.bi === this.characterBody || contact.bj === this.characterBody) {
                    let contactNormal = new CANNON.Vec3();
                    if (contact.bi === this.characterBody) {
                        contact.ni.negate(contactNormal);
                    } else {
                        contactNormal.copy(contact.ni);
                    }
                    if (contactNormal.y > threshold) {
                        onGround = true;
                        break;
                    }
                }
            }
        }
        if ((this.keys[' '] || this.mobileJump) && onGround && !this.isJumping) {
            this.characterBody.velocity.y = this.jumpVelocity;
            this.isJumping = true;
            this.mobileJump = false;
            if (this.jumpSound) { this.jumpSound.currentTime = 0; this.jumpSound.play().catch(() => {}); }
        }
        this.wasOnGround = onGround;
        if (onGround) this.isJumping = false;

        this.isMovingLocal = len > 0.01;
        this.isOnGround    = onGround;

        if (this.character) {
            this.character.position.copy(this.characterBody.position);
        }

        const isMoving = len > 0.01;
        if (!this.isPlayingSpell) {
            let desiredAnim: string;
            if (!onGround && this.animNames.jump) {
                desiredAnim = this.animNames.jump;
            } else {
                desiredAnim = isMoving ? (this.animNames.walk || '') : (this.animNames.idle || '');
            }
            if (desiredAnim) this.playAnimation(desiredAnim);
        }

        if (this.sendAnim && this.currentAnim !== this.lastSentAnim) {
            this.sendAnim(this.currentAnim);
            this.lastSentAnim = this.currentAnim;
        }
    }

    customAnimate(delta = 1 / 60) {
        // Crystal float + rotate
        if (this.crystalMesh) {
            const t = performance.now() / 1000;
            const y = this.crystalBaseY + Math.sin(t * 0.9) * 0.35;
            this.crystalMesh.position.y = y;
            this.crystalMesh.rotation.y = t * 0.25;
            if (this.crystalLight) this.crystalLight.position.y = y;
            if (this.crystalBody)  this.crystalBody.position.y  = y;
        }

        if (this.physicsWorld) {
            this.physicsWorld.step(delta);

            for (const item of this.pendingRemovals) {
                const { breakTarget, impactPos } = item;
                if (breakTarget && this.breakableTargets.includes(breakTarget)) {
                    this.createDebris(breakTarget, impactPos ?? breakTarget.mesh.position);
                    this.scene.remove(breakTarget.mesh);
                    this.physicsWorld.removeBody(breakTarget.body);
                    this.breakableTargets = this.breakableTargets.filter(t => t !== breakTarget);
                }
            }
            this.pendingRemovals = [];

            this.updateCharacterPhysics(delta);
        }

        // Footstep sounds — switch between concrete (near centre) and grass
        if (this.characterBody) {
            const bx = this.characterBody.position.x;
            const bz = this.characterBody.position.z;
            const distFromCenter = Math.sqrt(bx * bx + bz * bz);
            this.footstepSounds = distFromCenter <= this.concreteRadius
                ? this.footstepConcreteSounds
                : this.footstepGrassSounds;
        }
        const nowFs = Date.now();
        if (this.isMovingLocal && this.isOnGround && nowFs - this.lastFootstepTime > 390 && this.footstepSounds.length) {
            const snd = this.footstepSounds[this.footstepIndex % this.footstepSounds.length];
            snd.currentTime = 0; snd.play().catch(() => {});
            this.footstepIndex = (this.footstepIndex + 1 + Math.floor(Math.random() * 3)) % this.footstepSounds.length;
            this.lastFootstepTime = nowFs;
        }

        // Peer interpolation
        const lerpFactor = 0.2;
        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId === selfId) return;
            const mesh = this.peerModels[peerId];
            const body = this.peerBodies[peerId];
            const target = this.peerTargets[peerId];
            if (mesh && target) {
                mesh.position.x += (target.position.x - mesh.position.x) * lerpFactor;
                mesh.position.y += (target.position.y - 0.5 - mesh.position.y) * lerpFactor;
                mesh.position.z += (target.position.z - mesh.position.z) * lerpFactor;
                mesh.rotation.y += (target.rotY - mesh.rotation.y) * lerpFactor;
            }
            if (body && target) {
                body.position.x += (target.position.x - body.position.x) * lerpFactor;
                body.position.y += (target.position.y - body.position.y) * lerpFactor;
                body.position.z += (target.position.z - body.position.z) * lerpFactor;
            }
        });

        // Sync character visual to physics body
        if (this.character && this.characterBody) {
            this.character.position.copy(this.characterBody.position);
            this.character.position.y -= 0.5;
        }

        // Peer animation mixers
        if (this.peerMixers) {
            Object.values(this.peerMixers).forEach(mixer => mixer.update(delta * 1.5));
        }

        // Keep peer animations playing
        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId === selfId) return;
            const mesh = this.peerModels[peerId];
            const animName = this.peerAnims[peerId];
            if (mesh?.animations && animName && mesh.animations[animName]) {
                if (!mesh.animations[animName].isRunning()) {
                    Object.values(mesh.animations).forEach((action: any) => action.stop());
                    mesh.animations[animName].play();
                }
            }
        });

        if (this.animationMixers.length > 0) {
            this.animationMixers.forEach(mixer => mixer.update(delta * 1.5));
        }

        // ── Isometric camera + aim ──────────────────────────────────────────
        if (this.character && this.characterBody) {
            const charPos = new THREE.Vector3(
                this.characterBody.position.x,
                this.characterBody.position.y,
                this.characterBody.position.z
            );

            // Camera follows character at fixed offset (zoom-scaled)
            this.camera.position.copy(charPos).add(ISO_OFFSET.clone().multiplyScalar(this.isoZoomScale));
            this.camera.lookAt(charPos);

            // Raycast cursor onto character-level floor plane (desktop only —
            // on mobile aimTarget is written directly by the right stick handler)
            if (!this.isMobile) {
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(this.mouseNDC, this.camera);
                const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(charPos.y - 0.5));
                raycaster.ray.intersectPlane(floorPlane, this.aimTarget);
            }

            // Rotate character to face aim target
            const dx = this.aimTarget.x - this.character.position.x;
            const dz = this.aimTarget.z - this.character.position.z;
            if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
                this.character.rotation.y = Math.atan2(dx, dz);
            }
        }
        // ───────────────────────────────────────────────────────────────────

        // Network: send position + rotation
        if (this.sendMove && this.character && this.characterBody) {
            const now = performance.now();
            if (now - this.lastSent > 40) {
                this.sendMove({
                    x: this.characterBody.position.x,
                    y: this.characterBody.position.y,
                    z: this.characterBody.position.z,
                    rotY: this.character.rotation.y
                });
                this.lastSent = now;
            }
        }

        // Projectiles — removed only by 10s timer
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.mesh.position.copy(proj.body.position);
            proj.mesh.quaternion.copy(proj.body.quaternion);

            if (Date.now() - proj.createTime > 10000) {
                this.scene.remove(proj.mesh);
                this.physicsWorld.removeBody(proj.body);
                this.projectiles.splice(i, 1);
            }
        }

        // Sync breakable target visuals to physics
        this.breakableTargets.forEach(target => {
            if (target.mesh && target.body) {
                target.mesh.position.copy(target.body.position);
                target.mesh.quaternion.copy(target.body.quaternion);
            }
        });

        // Host broadcasts target physics state at 20Hz
        if (this.sendTargetPhysics && this.isPhysicsHost) {
            const now = performance.now();
            this.breakableTargets.forEach(target => {
                const p = target.body.position;
                let lastPos = (target as any)._lastPhysPos;
                if (!lastPos) {
                    (target as any)._lastPhysPos = { x: p.x, y: p.y, z: p.z };
                    return;
                }
                const dx = p.x - lastPos.x, dy = p.y - lastPos.y, dz = p.z - lastPos.z;
                if (dx * dx + dy * dy + dz * dz < 0.0001) return;
                const lastSync = (target as any)._lastPhysSync || 0;
                if (now - lastSync < 50) return;
                lastPos.x = p.x; lastPos.y = p.y; lastPos.z = p.z;
                (target as any)._lastPhysSync = now;
                const vel = target.body.velocity;
                const av  = target.body.angularVelocity;
                const q   = target.body.quaternion;
                this.sendTargetPhysics({
                    id: target.id,
                    px: p.x, py: p.y, pz: p.z,
                    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
                    vx: vel.x, vy: vel.y, vz: vel.z,
                    avx: av.x, avy: av.y, avz: av.z,
                });
            });
        }

        // Debris cleanup after 5s
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const piece = this.debris[i];
            piece.mesh.position.copy(piece.body.position);
            piece.mesh.quaternion.copy(piece.body.quaternion);
            if (Date.now() - piece.createTime > 5000) {
                this.scene.remove(piece.mesh);
                this.physicsWorld.removeBody(piece.body);
                this.debris.splice(i, 1);
            }
        }
    }
    initSounds() {
        this.footstepGrassSounds = Array.from({ length: 5 }, (_, i) => {
            const a = new Audio(`/sounds/moves/footstep_grass_00${i}.ogg`);
            a.volume = 0.35; return a;
        });
        this.footstepConcreteSounds = Array.from({ length: 5 }, (_, i) => {
            const a = new Audio(`/sounds/moves/footstep_concrete_00${i}.ogg`);
            a.volume = 0.45; return a;
        });
        // Start on grass; switched each frame based on position
        this.footstepSounds = this.footstepGrassSounds;
        this.impactWoodSounds = Array.from({ length: 5 }, (_, i) => {
            const a = new Audio(`/sounds/moves/impactWood_heavy_00${i}.ogg`);
            a.volume = 0.5; return a;
        });
        this.jumpSound = new Audio('/sounds/moves/phaseJump1.ogg');
        this.jumpSound.volume = 0.6;
    }

    placeStaticObjects() {
        // ── Fountain ──────────────────────────────────────────────────────────
        const fMesh = this.fountainModel.clone();
        fMesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        fMesh.position.set(0, 0, 0);
        this.scene.add(fMesh);
        this.fountainMesh = fMesh;

        fMesh.updateWorldMatrix(false, true);
        const fbbox = new THREE.Box3().setFromObject(fMesh);
        const fSize = new THREE.Vector3(); fbbox.getSize(fSize);
        const fCenter = new THREE.Vector3(); fbbox.getCenter(fCenter);
        const fBody = new CANNON.Body({
            mass: 0, type: CANNON.Body.STATIC,
            collisionFilterGroup: this.GROUPS.STATIC,
            collisionFilterMask: this.GROUPS.CHARACTER | this.GROUPS.PROJECTILE | this.GROUPS.PEER_CHARACTER | this.GROUPS.DEBRIS
        });
        fBody.addShape(
            new CANNON.Box(new CANNON.Vec3(fSize.x / 2, fSize.y / 2, fSize.z / 2)),
            new CANNON.Vec3(fCenter.x, fCenter.y, fCenter.z)
        );
        fBody.position.set(0, 0, 0);
        this.physicsWorld.addBody(fBody);

        this.crystalBaseY = fbbox.max.y + 1.5;

        // ── Crystal ───────────────────────────────────────────────────────────
        const cMesh = this.crystalModel.clone();
        cMesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; } });
        cMesh.position.set(0, this.crystalBaseY, 0);
        this.scene.add(cMesh);
        this.crystalMesh = cMesh;

        this.crystalLight = new THREE.PointLight(0x4499ff, 2.5, 30);
        this.crystalLight.position.set(0, this.crystalBaseY, 0);
        this.scene.add(this.crystalLight);

        const cBody = new CANNON.Body({
            mass: 0, type: CANNON.Body.KINEMATIC,
            collisionFilterGroup: this.GROUPS.STATIC,
            collisionFilterMask: this.GROUPS.CHARACTER | this.GROUPS.PROJECTILE | this.GROUPS.PEER_CHARACTER
        });
        cBody.addShape(new CANNON.Sphere(0.6));
        cBody.position.set(0, this.crystalBaseY, 0);
        this.physicsWorld.addBody(cBody);
        this.crystalBody = cBody;

        // ── Trees ─────────────────────────────────────────────────────────────
        const TREE_COUNT = 12;
        for (let i = 0; i < TREE_COUNT; i++) {
            const angle  = seededRandom(this.roomId, 100 + i * 2) * Math.PI * 2;
            const radius = 18 + seededRandom(this.roomId, 101 + i * 2) * 22;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const tModel = i % 2 === 0 ? this.treeCrookedModel : this.treeHighCrookedModel;
            const tMesh = tModel.clone();
            tMesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            tMesh.position.set(x, 0, z);
            this.scene.add(tMesh);
            this.treeMeshes.push(tMesh);

            tMesh.updateWorldMatrix(false, true);
            const tbbox = new THREE.Box3().setFromObject(tMesh);
            const tSize = new THREE.Vector3(); tbbox.getSize(tSize);
            const tCenter = new THREE.Vector3(); tbbox.getCenter(tCenter);
            const tBody = new CANNON.Body({
                mass: 0, type: CANNON.Body.STATIC,
                collisionFilterGroup: this.GROUPS.STATIC,
                collisionFilterMask: this.GROUPS.CHARACTER | this.GROUPS.PROJECTILE | this.GROUPS.PEER_CHARACTER | this.GROUPS.DEBRIS
            });
            tBody.addShape(
                new CANNON.Box(new CANNON.Vec3(tSize.x / 2, tSize.y / 2, tSize.z / 2)),
                new CANNON.Vec3(tCenter.x - x, tCenter.y, tCenter.z - z)
            );
            tBody.position.set(x, 0, z);
            this.physicsWorld.addBody(tBody);
            this.treeBodies.push(tBody);
        }
    }
}

export default TestLabScene;

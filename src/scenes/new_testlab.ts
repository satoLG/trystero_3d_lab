import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as CANNON from 'cannon-es';
import ThreejsScene from '../base/scene.ts';
import { joinRoom, selfId } from '@trystero-p2p/nostr';

// ── ANIMATION NAMES ──────────────────────────────────────────────────────────
// Run the game once with the browser console open to see:
//   [character.glb] animations: ['...', '...', ...]
// Copy the exact clip names you want into the values below.
// Leave a field as '' to let the auto-detector pick from common names.
const ANIM_NAMES = {
    idle:  'Rig|Idle_Loop',   // e.g. 'Idle' or 'Breathing Idle'
    walk:  'Rig|Walk_Formal_Loop',   // e.g. 'Walk' or 'Walking'
    spell: 'Rig|Spell_Simple_Idle_Loop',   // e.g. 'Cast Spell' or 'Attack'
    run:   'Rig|Sprint_Loop',     // e.g. 'Run' or 'Running'
    jump:  'Rig|Jump_Start'    // e.g. 'Jump' or 'Jumping'
};
// ─────────────────────────────────────────────────────────────────────────────

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
    sky: any
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
    isDragging: boolean
    previousMouseX: number
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
    cameraMode: string
    cameraYaw: number
    cameraPitch: number
    isPointerLocked: boolean
    projectiles: any[]
    breakableTargets: any[]
    lastShot: number
    shootCooldown: number
    debris: any[]
    damageThreshold: number
    crackThresholds: number[]
    projectileSpeed: number
    projectileMass: number
    breakForce: number
    GROUPS: Record<string, number>
    targetSyncTimeout: any
    initialTargetsSent: boolean
    lastTargetSync: number
    targetSyncInterval: number
    button: any
    sendMove: any
    sendAnim: any
    sendCube: any
    sendButton: any
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
    myColor: string
    peerColors: Record<string, string>
    sendMyInfo: any
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

    constructor(debugGui = null, playerConfig: { name?: string; color?: string } = {}) {
        super(debugGui);
        this.plane = null;
        this.sky = null;
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
        this.isDragging = false;
        this.previousMouseX = 0;

        this.physicsWorld = null;

        this.mobileMove = { x: 0, y: 0 };
        this.mobileJump = false;
        this.isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

        const room = getOrCreateRoomId();
        this.roomId = room.id;
        this.isRoomCreator = room.isCreator;
        this.myName = playerConfig.name || this.getRandomGoblinName();
        this.myColor = playerConfig.color || '#2980b9';
        this.room = joinRoom({ appId: 'trystero-3d-lab' }, this.roomId);
        this.peers = {};
        this.peerModels = {};
        this.peerBodies = {};
        this.peerTargets = {};
        this.peerColors = {};
        this.peerNames = {};
        this.peerNameLabels = {};
        this.peerMixers = {};
        this.lastSent = 0;
        this.peerLoading = {};

        this.currentAnim = null;
        this.lastSentAnim = null;
        this.peerAnims = {};

        this.cameraMode = 'tps';
        this.cameraYaw = 0;
        this.cameraPitch = 0.4;
        this.isPointerLocked = false;

        this.animNames = {};
        this.isPlayingSpell = false;
        this.spellAnimTimeout = null;

        this.projectiles = [];
        this.breakableTargets = [];
        this.lastShot = 0;
        this.shootCooldown = 400;

        this.debris = [];

        this.damageThreshold = 2;
        this.crackThresholds = [80, 50, 20];

        this.projectileSpeed = 40;
        this.projectileMass = 5;
        this.breakForce = 40;

        this.GROUPS = {
            GROUND: 1,
            BREAKABLE: 2,
            PROJECTILE: 4,
            CHARACTER: 8,
            DEBRIS: 16,
            PEER_CHARACTER: 32
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
        this.peerLastSeen = {};
        this.lastInfoSent = {};
        this.timedOutPeers = new Set();
        this.pingInterval = null;
        this.synced = false;
        this.syncTimeout = null;
        this.currentHostId = selfId;
    }

    get isPhysicsHost(): boolean {
        return this.currentHostId === selfId;
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
        this.syncTargetPhysicsType();
        this.loadLocalCharacter();
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

        loader.load('/models/testlab/character.glb', (gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    (child as THREE.Mesh).castShadow = true;
                    (child as THREE.Mesh).receiveShadow = true;
                }
            });
            model.position.set(0, 2, 0);
            model.scale.set(1, 1, 1);
            model.rotation.set(0, 0, 0);
            this.scene.add(model);
            this.objectModels.push(model);
            this.character = model;

            this.applyColorToModel(model, this.myColor);

            const clipNames = gltf.animations.map(a => a.name);
            console.log('[character.glb] animations:', clipNames);
            this.animNames = {
                idle:  ANIM_NAMES.idle  || this.findAnim(gltf.animations, ['Idle', 'idle', 'Breathing Idle', 'Stand', 'Idle 1', 'Survey', 'T-Pose']),
                walk:  ANIM_NAMES.walk  || this.findAnim(gltf.animations, ['Walk', 'walk', 'Walking', 'Walk Forward', 'Walk In Place', 'Run', 'run']),
                run:   ANIM_NAMES.run   || this.findAnim(gltf.animations, ['Run', 'run', 'Running', 'Walk', 'walk']),
                jump:  ANIM_NAMES.jump  || this.findAnim(gltf.animations, ['Jump', 'jump', 'Jumping', 'Jump In Place']),
                spell: ANIM_NAMES.spell || this.findAnim(gltf.animations, ['Spell', 'spell', 'Cast Spell', 'Casting', 'Attack', 'attack', 'Throw', 'throw', 'Punch', 'Kick']),
            };
            console.log('[animNames resolved]:', this.animNames);

            const radius = 0.5;
            const shape = new CANNON.Sphere(radius);
            let spawnX: number, spawnZ: number;
            let tries = 0;
            const minDist = 1.5;
            do {
                spawnX = Math.random() * 8 - 4;
                spawnZ = Math.random() * 8 - 4;
                let overlap = false;
                if (this.button && this.button.body) {
                    if (Math.abs(this.button.body.position.x - spawnX) < minDist + 0.7 &&
                        Math.abs(this.button.body.position.z - spawnZ) < minDist + 0.7) {
                        overlap = true;
                    }
                }
                tries++;
                if (!overlap) break;
            } while (tries < 20);

            model.position.set(spawnX, 2, spawnZ);
            this.characterBody = new CANNON.Body({
                mass: 1,
                position: new CANNON.Vec3(spawnX, 2, spawnZ),
                shape: shape,
                linearDamping: 0.3,
                angularDamping: 0.5,
                collisionFilterGroup: this.GROUPS.CHARACTER,
                collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.BREAKABLE | this.GROUPS.PROJECTILE | this.GROUPS.CHARACTER | this.GROUPS.PEER_CHARACTER
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

    showHostToast(msg: string) {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 18px;border-radius:8px;font-size:14px;z-index:9999;pointer-events:none;';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    toggleCameraMode() {
        this.cameraMode = this.cameraMode === 'tps' ? 'fps' : 'tps';
    }

    findAnim(clips: THREE.AnimationClip[], candidates: string[]): string {
        for (const name of candidates) {
            if (clips.find(c => c.name === name)) return name;
        }
        return clips[0]?.name ?? '';
    }

    applyColorToModel(model: THREE.Object3D, colorHex: string) {
        const color = new THREE.Color(colorHex);
        model.traverse((child: any) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.color.set(color);
            }
        });
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

        const planeFolder = this.debugGui.gui.addFolder('Plane');
        planeFolder.add(this.plane.position, 'x', -50, 50).name('Position X').listen();
        planeFolder.add(this.plane.position, 'y', -50, 50).name('Position Y').listen();
        planeFolder.add(this.plane.position, 'z', -50, 50).name('Position Z').listen();
        planeFolder.add(this.plane.rotation, 'x', -Math.PI, Math.PI).name('Rotation X').listen();
        planeFolder.add(this.plane.rotation, 'y', -Math.PI, Math.PI).name('Rotation Y').listen();
        planeFolder.add(this.plane.rotation, 'z', -Math.PI, Math.PI).name('Rotation Z').listen();

        if (this.character) {
            const characterFolder = this.debugGui.gui.addFolder('Character');
            characterFolder.add(this.character.position, 'x', -50, 50).name('Position X').listen();
            characterFolder.add(this.character.position, 'y', -50, 50).name('Position Y').listen();
            characterFolder.add(this.character.position, 'z', -50, 50).name('Position Z').listen();
            characterFolder.add(this.character.rotation, 'x', -Math.PI, Math.PI).name('Rotation X').listen();
            characterFolder.add(this.character.rotation, 'y', -Math.PI, Math.PI).name('Rotation Y').listen();
            characterFolder.add(this.character.rotation, 'z', -Math.PI, Math.PI).name('Rotation Z').listen();
        }
    }

    init(container: HTMLElement) {
        this.physicsWorld = new CANNON.World({
            gravity: new CANNON.Vec3(0, -12.82, 0)
        });

        super.init(container);

        const groundMaterial = new CANNON.Material('ground');
        const characterMaterial = new CANNON.Material('character');

        const contactMaterial = new CANNON.ContactMaterial(
            groundMaterial,
            characterMaterial,
            {
                friction: 0.8,
                restitution: 0
            }
        );
        this.physicsWorld.addContactMaterial(contactMaterial);

        this.groundMaterial = groundMaterial;
        this.characterMaterial = characterMaterial;

        this.physicsWorld.addEventListener('beginContact', (event) => {
            if (!event || !event.bodyA || !event.bodyB) return;

            const bodyA = event.bodyA;
            const bodyB = event.bodyB;

            // --- Projectile collision ---
            const projectile = this.projectiles.find(p => p.body === bodyA || p.body === bodyB);
            if (projectile) {
                const otherBody = bodyA === projectile.body ? bodyB : bodyA;

                // Count each unique body once so bouncing on the same surface doesn't eat hits
                if (!projectile.hitBodies.has(otherBody)) {
                    projectile.hitBodies.add(otherBody);
                    projectile.hitCount++;
                }

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

                // Peer/self knockback
                const hitPeerId = Object.keys(this.peerBodies).find(
                    id => id !== selfId && this.peerBodies[id] === otherBody
                );
                if (hitPeerId && this.sendHit) {
                    this.sendHit({}, hitPeerId);
                }
                if (otherBody === this.characterBody) {
                    this.applyHitKnockback();
                }

                // Remove projectile only on 2nd unique hit; target break can happen independently
                const removeProjectile = projectile.hitCount >= 2;
                this.pendingRemovals.push({
                    projectile: removeProjectile ? projectile : null,
                    breakTarget,
                    impactPos
                });
                return;
            }

            // --- Character-cube push (non-host only) ---
            // On host the DYNAMIC cube reacts naturally. On non-host the cube is
            // KINEMATIC so we relay the contact impulse to the host.
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

        const planeShape = new CANNON.Plane();
        const planeBody = new CANNON.Body({
            mass: 0,
            shape: planeShape,
            material: this.groundMaterial,
            collisionFilterGroup: this.GROUPS.GROUND,
            collisionFilterMask: this.GROUPS.CHARACTER | this.GROUPS.BREAKABLE | this.GROUPS.PROJECTILE | this.GROUPS.DEBRIS
        });
        planeBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        planeBody.material = this.groundMaterial;
        this.physicsWorld.addBody(planeBody);

        this.enableMusicOnUserGesture();

        if (this.isMobile) this.initMobileControls();

        window.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                const el = event.target as Element;
                if (el.closest?.('#room-panel') || el.closest?.('#entry-modal')) return;
                this.throwProjectile();
            }
        });

        if (this.isMobile) {
            const shootBtn = document.createElement('button');
            shootBtn.innerText = '🎯';
            shootBtn.style.position = 'fixed';
            shootBtn.style.right = '30px';
            shootBtn.style.bottom = '150px';
            shootBtn.style.width = '80px';
            shootBtn.style.height = '80px';
            shootBtn.style.borderRadius = '50%';
            shootBtn.style.fontSize = '2em';
            shootBtn.style.opacity = '0.7';
            shootBtn.style.zIndex = '1000';
            shootBtn.addEventListener('touchstart', () => {
                this.throwProjectile();
            });
            document.body.appendChild(shootBtn);
        }

        const peerObj = this.room.getPeers ? this.room.getPeers() : {};
        Object.keys(peerObj).forEach(peerId => {
            if (peerId !== selfId) this.spawnPeer(peerId);
        });

        this.room.onPeerJoin = (peerId) => {
            if (peerId === selfId) return;
            this.timedOutPeers.delete(peerId);
            this.spawnPeer(peerId);
            this.syncTargetPhysicsType();
            // Data channel may not be open yet at onPeerJoin — delay and then keep retrying
            // via the getMove handler until the channel confirms open.
            const sendInfo = (attempt: number) => {
                this.sendMyInfo?.({ name: this.myName, color: this.myColor }, [peerId]);
                if (attempt < 4) setTimeout(() => sendInfo(attempt + 1), 600);
            };
            setTimeout(() => sendInfo(0), 300);
            if (this.isPhysicsHost && this.sendInitialTargets) {
                setTimeout(() => {
                    const states = this.breakableTargets.map(t => ({
                        id: t.id,
                        px: t.body.position.x, py: t.body.position.y, pz: t.body.position.z,
                        qx: t.body.quaternion.x, qy: t.body.quaternion.y,
                        qz: t.body.quaternion.z, qw: t.body.quaternion.w,
                        health: t.health,
                    }));
                    this.sendInitialTargets(states, [peerId]);
                }, 900);
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
            delete (this.peerColors as any)[peerId];
            if (this.synced) this.syncTargetPhysicsType(!wasHostBefore && this.isPhysicsHost);
            if (name) this.showHostToast(`${name} saiu da sala`);
            this.updatePlayerList();
        };

        const [sendMove, getMove] = this.room.makeAction('move');
        this.sendMove = sendMove;

        getMove((data, peerId) => {
            if (peerId === selfId) return;
            // Track heartbeat for disconnect detection
            this.peerLastSeen[peerId] = Date.now();
            // If we don't know this peer's info yet, send ours to prompt an exchange
            if (!this.peerNames[peerId]) {
                const now = Date.now();
                if (!this.lastInfoSent[peerId] || now - this.lastInfoSent[peerId] > 1500) {
                    this.lastInfoSent[peerId] = now;
                    this.sendMyInfo?.({ name: this.myName, color: this.myColor }, [peerId]);
                }
            }
            if (!this.peerModels[peerId]) {
                this.spawnPeer(peerId);
            }
            const { x, y, z, rotY } = data;
            // Store as interpolation target instead of hard-setting.
            // The game loop lerps towards this each frame for smooth movement.
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
            const { position, direction, velocity } = data;
            this.createProjectile(position, direction, velocity);
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

        getInitialTargets((states: any[], peerId: string) => {
            if (peerId === selfId) return;
            const alive = new Map(states.map((s: any) => [s.id, s]));
            // Remove targets already destroyed before we joined
            for (let i = this.breakableTargets.length - 1; i >= 0; i--) {
                const target = this.breakableTargets[i];
                if (!alive.has(target.id)) {
                    this.scene.remove(target.mesh);
                    this.physicsWorld.removeBody(target.body);
                    this.breakableTargets.splice(i, 1);
                }
            }
            // Apply current positions and health so we don't start at seeded state
            states.forEach((s: any) => {
                const target = this.breakableTargets.find(t => t.id === s.id);
                if (!target) return;
                target.body.position.set(s.px, s.py, s.pz);
                target.body.quaternion.set(s.qx, s.qy, s.qz, s.qw);
                target.body.velocity.set(0, 0, 0);
                target.body.angularVelocity.set(0, 0, 0);
                if (s.health !== undefined && s.health < target.maxHealth) {
                    target.health = s.health;
                    this.updateTargetAppearance(target);
                }
            });
            // Sender is the authoritative host — record them and proceed immediately
            this.currentHostId = peerId;
            this.finishSync();
        });

        const [sendHit, getHit] = this.room.makeAction('hit');
        this.sendHit = sendHit;
        getHit(() => {
            this.applyHitKnockback();
        });

        // Non-host relays cube impact vectors to the host so the authoritative
        // physics simulation applies the impulse and broadcasts the result.
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

        // Player identity: name and color — sent on peer join so everyone sees the same info.
        const [sendMyInfo, getMyInfo] = this.room.makeAction('myinfo');
        this.sendMyInfo = sendMyInfo;
        getMyInfo((data: any, peerId: string) => {
            if (peerId === selfId) return;
            this.peerNames[peerId] = data.name;
            this.peerColors[peerId] = data.color;
            if (this.peerModels[peerId]) this.applyColorToModel(this.peerModels[peerId], data.color);
            this.updatePeerNameLabel(peerId, data.name);
            this.updatePlayerList();
            // Echo our info back so they're guaranteed to receive ours too (1-round-trip handshake).
            // Throttled to avoid infinite ping-pong between both sides.
            const now = Date.now();
            if (!this.lastInfoSent[peerId] || now - this.lastInfoSent[peerId] > 2000) {
                this.lastInfoSent[peerId] = now;
                this.sendMyInfo?.({ name: this.myName, color: this.myColor }, [peerId]);
            }
        });

        // Real-time physics state sync for targets.
        // Whoever last moved a target broadcasts its physics state (pos/quat/vel) every ~50ms.
        // Receivers apply only if the incoming state is more recent than what they last sent.
        const [sendTargetPhysics, getTargetPhysics] = this.room.makeAction('tgphy');
        this.sendTargetPhysics = sendTargetPhysics;
        getTargetPhysics((data: any, peerId: string) => {
            if (peerId === selfId) return;
            // Host runs authoritative physics — it never receives state from non-hosts
            if (this.isPhysicsHost) return;
            const target = this.breakableTargets.find(t => t.id === data.id);
            if (!target) return;
            // Apply velocity so KINEMATIC body predicts motion between 20Hz updates
            target.body.velocity.set(data.vx, data.vy, data.vz);
            target.body.angularVelocity.set(data.avx ?? 0, data.avy ?? 0, data.avz ?? 0);
            // Gentle lerp correction to fix position drift without snapping
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

        // Keepalive: move packets arrive every 40ms; 8s silence = peer disconnected.
        // This fires well before WebRTC's own 10-30s timeout.
        this.pingInterval = setInterval(() => {
            const now = Date.now();
            Object.keys(this.peerModels).forEach(peerId => {
                if (peerId === selfId) return;
                const last = this.peerLastSeen[peerId] ?? 0;
                if (last === 0 || now - last <= 8000) return;
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
                delete (this.peerColors as any)[peerId];
                if (this.synced) this.syncTargetPhysicsType(!wasHost && this.isPhysicsHost);
                this.showHostToast(`${name ?? 'Jogador'} saiu da sala`);
                this.updatePlayerList();
            });
        }, 3000);

        // All clients create targets deterministically from the room ID seed.
        // Targets start KINEMATIC for everyone — finishSync() will switch the host to DYNAMIC
        // after the sync window, preventing a new joiner from falsely running physics.
        this.createInitialTargets();

        // Sync phase: wait for the host's world state before spawning the local character.
        // Room creator (fresh room, likely solo) uses a short 500ms window.
        // Joiners wait up to 2.5s; getInitialTargets arriving earlier will call finishSync() immediately.
        const waitMs = this.isRoomCreator ? 500 : 2500;
        const loadDesc = document.getElementById('loading-desc');
        if (loadDesc) loadDesc.textContent = 'Conectando à sala...';
        document.getElementById('loading-screen').style.display = '';
        this.syncTimeout = setTimeout(() => this.finishSync(), waitMs);
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

        loader.load('/models/testlab/character.glb', (gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    (child as THREE.Mesh).castShadow = true;
                    (child as THREE.Mesh).receiveShadow = true;
                }
            });
            model.position.set(Math.random() * 4 - 2, 2, Math.random() * 4 - 2);
            model.scale.set(1, 1, 1);
            model.rotation.set(0, 0, 0);
            this.scene.add(model);

            // Apply color tint if already received, otherwise use a neutral tint
            if (this.peerColors?.[peerId]) {
                this.applyColorToModel(model, this.peerColors[peerId]);
            }

            if (!this.peerNameLabels) this.peerNameLabels = {};
            // Show known name or placeholder until myinfo arrives
            const displayName = this.peerNames?.[peerId] ?? '...';
            const nameLabel = this.createNameLabel(displayName);
            model.add(nameLabel);
            nameLabel.position.set(0, 2, 0);
            this.peerNameLabels[peerId] = nameLabel;

            const radius = 0.5;
            const shape = new CANNON.Sphere(radius);
            const body = new CANNON.Body({
                mass: 0,
                type: CANNON.Body.KINEMATIC,
                position: new CANNON.Vec3(model.position.x, model.position.y, model.position.z),
                shape: shape,
                collisionFilterGroup: this.GROUPS.PEER_CHARACTER,
                collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.PROJECTILE | this.GROUPS.CHARACTER
            });
            (body as any).peerId = peerId;
            this.physicsWorld.addBody(body);

            if (!this.peerTargets[peerId]) {
                this.peerTargets[peerId] = {
                    position: model.position.clone(),
                    rotY: 0
                };
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
        if (this.peerMixers && this.peerMixers[peerId]) {
            delete this.peerMixers[peerId];
        }
        if (this.peerAnims && this.peerAnims[peerId]) {
            delete this.peerAnims[peerId];
        }
        if (this.peerTargets && this.peerTargets[peerId]) {
            delete this.peerTargets[peerId];
        }
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
        selfEl.innerHTML = `<span style="color:${this.myColor}">■</span> ${this.myName}${hostId === selfId ? ' <span style="color:#aaa;font-size:11px">(host)</span>' : ''}`;
        list.appendChild(selfEl);

        peerIds.forEach(peerId => {
            const name = this.peerNames?.[peerId] ?? '...';
            const color = this.peerColors?.[peerId] ?? '#888';
            const el = document.createElement('div');
            el.className = 'player-item';
            el.innerHTML = `<span style="color:${color}">■</span> ${name}${hostId === peerId ? ' <span style="color:#aaa;font-size:11px">(host)</span>' : ''}`;
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
        const idx = Math.floor(Math.random() * adjectives.length);
        return `Goblin ${adjectives[idx]}`;
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
        for (let i = 0; i < 5; i++) {
            const position = new THREE.Vector3(
                seededRandom(this.roomId, i * 2) * 20 - 10,
                1,
                seededRandom(this.roomId, i * 2 + 1) * 20 - 10
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

        this.backgroundMusic = new Audio('/sounds/background/mc.mp3');
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
        const healthFrac = Math.max(0, target.health) / maxHealth;
        const damageFrac = 1 - healthFrac;

        const material = new THREE.MeshStandardMaterial({
            map: target.texture ?? null,
            color: new THREE.Color(0xffffff).lerp(new THREE.Color(0xff4400), damageFrac * 0.7),
            metalness: 0.1,
            roughness: 0.8 + damageFrac * 0.2,
            emissive: new THREE.Color(0x550000),
            emissiveIntensity: damageFrac * 0.5,
        });
        target.mesh.material = material;

        // accumulate tilt as the cube gets damaged
        target.mesh.rotation.x += (Math.random() - 0.5) * 0.08 * damageFrac;
        target.mesh.rotation.z += (Math.random() - 0.5) * 0.08 * damageFrac;
    }

    throwProjectile() {
        if (!this.character || !this.characterBody) return;

        const now = Date.now();
        if (now - this.lastShot < this.shootCooldown) return;
        this.lastShot = now;

        // Direction = exactly where the camera is looking (crosshair aim)
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        // Spawn at chest height in front of the character
        const spawnPoint = new THREE.Vector3(
            this.characterBody.position.x,
            this.characterBody.position.y + 0.5,
            this.characterBody.position.z
        );
        spawnPoint.addScaledVector(direction, 1.2);

        this.createProjectile(spawnPoint, direction, this.projectileSpeed, true);

        if (this.sendProjectile) {
            this.sendProjectile({
                position: { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z },
                direction: { x: direction.x, y: direction.y, z: direction.z },
                velocity: this.projectileSpeed
            });
        }

        this.triggerSpellAnimation();
    }

    createProjectile(position, direction, speed, isLocal = false) {
        const posVector = position instanceof THREE.Vector3 ?
            position : new THREE.Vector3(position.x, position.y, position.z);

        const dirVector = direction instanceof THREE.Vector3 ?
            direction : new THREE.Vector3(direction.x, direction.y, direction.z);

        const radius = 0.3;
        const geometry = new THREE.IcosahedronGeometry(radius, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 'brown',
            metalness: 0.3,
            roughness: 0.8
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.position.copy(posVector);
        this.scene.add(mesh);

        const shape = new CANNON.Sphere(radius);
        const body = new CANNON.Body({
            mass: this.projectileMass,
            shape: shape,
            material: this.characterMaterial,
            collisionResponse: true,
            linearDamping: 0.1,
            angularDamping: 0.1,
            collisionFilterGroup: this.GROUPS.PROJECTILE,
            collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.BREAKABLE | this.GROUPS.CHARACTER | this.GROUPS.PEER_CHARACTER
        });
        body.position.copy(posVector as any);

        const velocity = dirVector.normalize().multiplyScalar(speed);
        body.velocity.set(velocity.x, velocity.y, velocity.z);

        this.physicsWorld.addBody(body);
        this.projectiles.push({ mesh, body, createTime: Date.now(), isLocal, hitCount: 0, hitBodies: new Set() });
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

        const size = 2;
        const mcTex = new THREE.TextureLoader().load('/textures/testlab/minecraft.png');
        mcTex.magFilter = THREE.NearestFilter;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({
            map: mcTex,
            metalness: 0.1,
            roughness: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2));
        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.KINEMATIC,
            shape: shape,
            material: this.groundMaterial,
            collisionResponse: true,
            linearDamping: 0.4,
            angularDamping: 0.4,
            collisionFilterGroup: this.GROUPS.BREAKABLE,
            collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.CHARACTER |
                            this.GROUPS.PROJECTILE | this.GROUPS.DEBRIS
        });
        body.position.copy(position);
        this.physicsWorld.addBody(body);

        const target = {
            mesh,
            body,
            broken: false,
            size: { width: size, height: size, depth: size },
            position: position.clone(),
            id: id || Math.random().toString(36).substr(2, 9),
            health: 3,
            maxHealth: 3,
            texture: mcTex,
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

            const geometryType = Math.random() > 0.5 ?
                new THREE.TetrahedronGeometry(size) :
                new THREE.BoxGeometry(size, size, size);

            const material = new THREE.MeshStandardMaterial({
                color: 0x8b4513,
                metalness: 0.3,
                roughness: 0.8,
                emissive: 0x331a00,
                emissiveIntensity: 0.2
            });
            const mesh = new THREE.Mesh(geometryType, material);

            const position = target.mesh.position.clone().add(offset);
            mesh.position.copy(position);
            this.scene.add(mesh);

            const shape = new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2));
            const body = new CANNON.Body({
                mass: 0.1,
                shape: shape,
                material: this.groundMaterial,
                collisionResponse: true,
                linearDamping: 0.1,
                angularDamping: 0.1
            });
            body.position.copy(position);

            const explosionForce = 8;
            const direction = position.clone().sub(impactPoint).normalize();
            const force = direction.multiplyScalar(explosionForce);

            force.y += 3 + Math.random() * 4;

            body.angularVelocity.set(
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8
            );

            body.applyImpulse(
                new CANNON.Vec3(force.x, force.y, force.z),
                new CANNON.Vec3(0, 0, 0)
            );

            this.physicsWorld.addBody(body);
            this.debris.push({
                mesh,
                body,
                createTime: Date.now()
            });
        }
    }

    createDecorativeCubes() {
        const textureLoader = new THREE.TextureLoader();
        const tex = textureLoader.load('/textures/testlab/minecraft.png');
        tex.magFilter = THREE.NearestFilter;

        for (let i = 0; i < 3; i++) {
            const x = (seededRandom(this.roomId, 100 + i * 2) * 16 - 8);
            const z = (seededRandom(this.roomId, 101 + i * 2) * 16 - 8);
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ map: tex })
            );
            mesh.position.set(x, 0.5, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);

            const body = new CANNON.Body({
                mass: 0,
                position: new CANNON.Vec3(x, 0.5, z),
                shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
                material: this.groundMaterial
            });
            this.physicsWorld.addBody(body);
        }
    }

    populateScene() {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.rotation.order = 'YXZ';
        this.camera.position.set(0, 5, 10);

        // Canvas must receive pointer events and be focusable for pointer lock
        const canvas = this.renderer.domElement;
        canvas.style.pointerEvents = 'auto';
        canvas.tabIndex = 0;

        // Click canvas to request pointer lock (hides and captures cursor)
        canvas.addEventListener('click', async () => {
            if (!this.isPointerLocked) {
                try {
                    await (canvas as any).requestPointerLock({ unadjustedMovement: true });
                } catch (_) {
                    try { await canvas.requestPointerLock(); } catch (__) {}
                }
            }
        });
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === canvas;
        });

        // Camera rotation — works with pointer lock (infinite movement) or as fallback (raw delta)
        let prevMouseX = -1, prevMouseY = -1;
        document.addEventListener('mousemove', (e: MouseEvent) => {
            let dx = 0, dy = 0;
            if (this.isPointerLocked) {
                dx = e.movementX;
                dy = e.movementY;
            } else if (prevMouseX >= 0) {
                dx = e.clientX - prevMouseX;
                dy = e.clientY - prevMouseY;
            }
            prevMouseX = e.clientX;
            prevMouseY = e.clientY;
            this.cameraYaw   -= dx * 0.002;
            this.cameraPitch -= dy * 0.002;
            this.cameraPitch  = Math.max(-Math.PI / 8, Math.min(Math.PI / 2.5, this.cameraPitch));
        });

        // Scroll wheel toggles TPS/FPS (debounced 400ms)
        let lastScrollToggle = 0;
        canvas.addEventListener('wheel', () => {
            const now = Date.now();
            if (now - lastScrollToggle < 400) return;
            lastScrollToggle = now;
            this.toggleCameraMode();
        }, { passive: true });

        const textureLoader = new THREE.TextureLoader();

        const skyColor = '#336dbf';
        this.scene.background = new THREE.Color(skyColor);
        this.scene.fog = new THREE.FogExp2(skyColor, 0.0142);

        const cobbleTexture = textureLoader.load('/textures/testlab/cobble.png');
        cobbleTexture.wrapS = THREE.RepeatWrapping;
        cobbleTexture.wrapT = THREE.RepeatWrapping;
        cobbleTexture.repeat.set(50, 50);
        cobbleTexture.magFilter = THREE.NearestFilter;

        const planeGeometry = new THREE.PlaneGeometry(500, 500);
        const planeMaterial = new THREE.MeshStandardMaterial({ map: cobbleTexture, side: THREE.DoubleSide });
        this.plane = new THREE.Mesh(planeGeometry, planeMaterial);
        this.plane.rotation.x = -Math.PI / 2;
        this.plane.position.set(0, 0, 0);
        this.plane.receiveShadow = true;
        this.scene.add(this.plane);
        this.geometries.push(this.plane);

        // Lighting values scaled by π relative to legacy values to maintain visual parity
        // after Three.js r155 changed useLegacyLights default to false
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.57);
        this.directionalLight.position.set(10, 50, 10);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.left = -50;
        this.directionalLight.shadow.camera.right = 50;
        this.directionalLight.shadow.camera.top = 50;
        this.directionalLight.shadow.camera.bottom = -50;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 100;
        this.scene.add(this.directionalLight);

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.94);
        this.scene.add(this.ambientLight);

        this.createRoomUI();
        this.createDecorativeCubes();

        window.addEventListener('keydown', (event) => {
            this.noKeysPressed = false;
            this.keys[event.key.toLowerCase()] = true;
            if (event.key === ' ' && !this.isJumping) {
                this.mobileJump = true;
            }
            if (event.key.toLowerCase() === 'u') {
                this.toggleCameraMode();
            }
        });

        window.addEventListener('keyup', (event) => {
            this.keys[event.key.toLowerCase()] = false;
            this.noKeysPressed = !Object.values(this.keys).some(Boolean);
        });

        setTimeout(() => {
            if (this.debugGui.gui) this.initDebugGui();
            this.cameraTransitioning = true;
        }, 3000);
    }

    initMobileControls() {
        const joystick = document.createElement('div');
        joystick.id = 'joystick';
        joystick.style.position = 'fixed';
        joystick.style.left = '30px';
        joystick.style.bottom = '30px';
        joystick.style.width = '100px';
        joystick.style.height = '100px';
        joystick.style.background = 'rgba(100,100,100,0.2)';
        joystick.style.borderRadius = '50%';
        joystick.style.zIndex = '1000';
        joystick.style.touchAction = 'none';

        const knob = document.createElement('div');
        knob.style.width = '50px';
        knob.style.height = '50px';
        knob.style.background = 'rgba(200,200,200,0.7)';
        knob.style.borderRadius = '50%';
        knob.style.position = 'absolute';
        knob.style.left = '25px';
        knob.style.top = '25px';
        joystick.appendChild(knob);

        let dragging = false, startX = 0, startY = 0;
        joystick.addEventListener('touchstart', (e) => {
            dragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
        });
        joystick.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            const maxDist = 40;
            const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
            const angle = Math.atan2(dy, dx);
            knob.style.left = `${25 + dist * Math.cos(angle)}px`;
            knob.style.top = `${25 + dist * Math.sin(angle)}px`;
            this.mobileMove.x = Math.cos(angle) * (dist / maxDist);
            this.mobileMove.y = Math.sin(angle) * (dist / maxDist);
        });
        joystick.addEventListener('touchend', () => {
            dragging = false;
            knob.style.left = '25px';
            knob.style.top = '25px';
            this.mobileMove.x = 0;
            this.mobileMove.y = 0;
        });
        document.body.appendChild(joystick);

        const jumpBtn = document.createElement('button');
        jumpBtn.innerText = 'Jump';
        jumpBtn.style.position = 'fixed';
        jumpBtn.style.right = '30px';
        jumpBtn.style.bottom = '60px';
        jumpBtn.style.width = '80px';
        jumpBtn.style.height = '80px';
        jumpBtn.style.borderRadius = '50%';
        jumpBtn.style.fontSize = '1.5em';
        jumpBtn.style.opacity = '0.7';
        jumpBtn.style.zIndex = '1000';
        jumpBtn.addEventListener('touchstart', () => {
            this.mobileJump = true;
        });
        document.body.appendChild(jumpBtn);
    }

    updateCharacterPhysics(delta) {
        if (!this.characterBody) return;

        let moveX = 0, moveZ = 0;
        if (this.keys['w'] || this.keys['arrowup']) moveZ -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) moveZ += 1;
        if (this.keys['a'] || this.keys['arrowleft']) moveX += 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX -= 1;

        if (this.isMobile) {
            moveX += this.mobileMove.x;
            moveZ += this.mobileMove.y;
        }

        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) {
            moveX /= len;
            moveZ /= len;

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
        if (this.characterBody.world && this.characterBody.world.contacts) {
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
        }
        if (onGround) this.isJumping = false;

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
        if (this.physicsWorld) {
            this.physicsWorld.step(delta);

            // Process collisions queued in beginContact — safe to remove bodies here
            for (const item of this.pendingRemovals) {
                const { projectile, breakTarget, impactPos } = item;
                if (projectile && this.projectiles.includes(projectile)) {
                    this.scene.remove(projectile.mesh);
                    this.physicsWorld.removeBody(projectile.body);
                    this.projectiles = this.projectiles.filter(p => p !== projectile);
                }
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

        const lerpFactor = 0.2;
        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId === selfId) return;
            const mesh = this.peerModels[peerId];
            const body = this.peerBodies[peerId];
            const target = this.peerTargets[peerId];
            if (mesh && target) {
                // Smooth visual interpolation
                mesh.position.x += (target.position.x - mesh.position.x) * lerpFactor;
                mesh.position.y += (target.position.y - 0.5 - mesh.position.y) * lerpFactor;
                mesh.position.z += (target.position.z - mesh.position.z) * lerpFactor;
                mesh.rotation.y += (target.rotY - mesh.rotation.y) * lerpFactor;
                if (this.peerNameLabels?.[peerId]) {
                    this.peerNameLabels[peerId].position.set(0, 2, 0);
                }
            }
            if (body && target) {
                // Kinematic body follows same lerped position for stable collision response
                body.position.x += (target.position.x - body.position.x) * lerpFactor;
                body.position.y += (target.position.y - body.position.y) * lerpFactor;
                body.position.z += (target.position.z - body.position.z) * lerpFactor;
            }
        });

        if (this.character && this.characterBody) {
            this.character.position.copy(this.characterBody.position);
            this.character.position.y += -.5;
        }

        if (this.peerMixers) {
            Object.values(this.peerMixers).forEach(mixer => mixer.update(delta * 1.5));
        }

        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId === selfId) return;
            const mesh = this.peerModels[peerId];
            const animName = this.peerAnims[peerId];
            if (mesh && mesh.animations && animName && mesh.animations[animName]) {
                if (!mesh.animations[animName].isRunning()) {
                    Object.values(mesh.animations).forEach((action: any) => action.stop());
                    mesh.animations[animName].play();
                }
            }
        });

        if (this.animationMixers.length > 0) {
            this.animationMixers.forEach(mixer => {
                mixer.update(delta * 1.5);
            });
        }

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

        if (this.character && this.characterBody) {
            const cy = this.cameraYaw, cp = this.cameraPitch;
            if (this.cameraMode === 'tps') {
                const dist = 7;
                const shoulder = 1.5;
                const rightX = Math.cos(cy), rightZ = -Math.sin(cy);
                this.camera.position.set(
                    this.characterBody.position.x + Math.sin(cy) * dist * Math.cos(cp) + rightX * shoulder,
                    this.characterBody.position.y + 1.5 + Math.sin(cp) * dist,
                    this.characterBody.position.z + Math.cos(cy) * dist * Math.cos(cp) + rightZ * shoulder
                );
                this.character.visible = true;
            } else {
                // FPS: camera above head so model body stays out of view
                this.camera.position.set(
                    this.characterBody.position.x,
                    this.characterBody.position.y + 1.5,
                    this.characterBody.position.z
                );
                this.character.visible = false;
            }
            // Both modes: camera rotation drives aim direction — same as FPS, fixes TPS vertical inversion
            this.camera.rotation.y = cy;
            this.camera.rotation.x = cp;
            // Character mesh always faces camera yaw
            this.character.rotation.y = cy;
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.mesh.position.copy(proj.body.position);
            proj.mesh.quaternion.copy(proj.body.quaternion);

            if (Date.now() - proj.createTime > 3000) {
                this.scene.remove(proj.mesh);
                this.physicsWorld.removeBody(proj.body);
                this.projectiles.splice(i, 1);
                continue;
            }
        }

        this.breakableTargets.forEach(target => {
            if (target.mesh && target.body) {
                target.mesh.position.copy(target.body.position);
                target.mesh.quaternion.copy(target.body.quaternion);
            }
        });

        // Only the physics host broadcasts cube state — non-hosts receive it.
        if (this.sendTargetPhysics && this.isPhysicsHost) {
            const now = performance.now();
            this.breakableTargets.forEach(target => {
                const pos = target.body.position;
                let lastPos = (target as any)._lastPhysPos;
                if (!lastPos) {
                    (target as any)._lastPhysPos = { x: pos.x, y: pos.y, z: pos.z };
                    return;
                }
                const dx = pos.x - lastPos.x;
                const dy = pos.y - lastPos.y;
                const dz = pos.z - lastPos.z;
                if (dx * dx + dy * dy + dz * dz < 0.0001) return; // < 1 cm change
                const lastSync = (target as any)._lastPhysSync || 0;
                if (now - lastSync < 50) return; // max 20 Hz
                lastPos.x = pos.x; lastPos.y = pos.y; lastPos.z = pos.z;
                (target as any)._lastPhysSync = now;
                this.targetLastMoved[target.id] = now;
                const vel = target.body.velocity;
                const av = target.body.angularVelocity;
                const q = target.body.quaternion;
                this.sendTargetPhysics({
                    id: target.id,
                    px: pos.x, py: pos.y, pz: pos.z,
                    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
                    vx: vel.x, vy: vel.y, vz: vel.z,
                    avx: av.x, avy: av.y, avz: av.z,
                });
            });
        }

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
}

export default TestLabScene;

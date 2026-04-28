import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { selfId } from '@trystero-p2p/firebase';
import { ANIM_NAMES, CHARACTER_MODELS } from '../config/characters.ts';

export function createNameLabel(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 64;
    const ctx2d = canvas.getContext('2d');
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.font = 'bold 32px Arial';
    ctx2d.fillStyle = '#fff';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(name, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
}

export function updatePeerNameLabel(ctx: any, peerId: string, name: string) {
    if (!ctx.peerNameLabels?.[peerId]) return;
    const oldLabel = ctx.peerNameLabels[peerId];
    const parent = oldLabel.parent;
    if (!parent) return;
    parent.remove(oldLabel);
    const newLabel = createNameLabel(name);
    newLabel.position.set(0, 2, 0);
    parent.add(newLabel);
    ctx.peerNameLabels[peerId] = newLabel;
}

function findAnim(clips: THREE.AnimationClip[], candidates: string[]): string {
    for (const name of candidates) {
        if (clips.find(c => c.name === name)) return name;
    }
    return clips[0]?.name ?? '';
}

export function loadLocalCharacter(ctx: any) {
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
        () => { document.getElementById('loading-screen').style.display = ''; }
    );

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    const loader = new GLTFLoader(loadingManager);
    loader.setDRACOLoader(dracoLoader);

    const modelPath = CHARACTER_MODELS[ctx.characterModel] || CHARACTER_MODELS['male-a'];
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

        ctx.animNames = {
            idle:  findAnim(gltf.animations, [ANIM_NAMES.idle,  'Idle', 'idle', 'Breathing Idle', 'Stand', 'Idle 1', 'Survey', 'T-Pose']),
            walk:  findAnim(gltf.animations, [ANIM_NAMES.walk,  'Walk', 'walk', 'Walking', 'Walk Forward', 'Walk In Place', 'Run', 'run']),
            run:   findAnim(gltf.animations, [ANIM_NAMES.run,   'Run', 'run', 'Running', 'Walk', 'walk']),
            jump:  findAnim(gltf.animations, [ANIM_NAMES.jump,  'Jump', 'jump', 'Jumping', 'Jump In Place']),
            spell: findAnim(gltf.animations, [ANIM_NAMES.spell, 'Spell', 'spell', 'Cast Spell', 'Casting', 'Attack', 'attack', 'Throw', 'throw', 'Punch', 'Kick']),
        };
        console.log('[animNames resolved]:', ctx.animNames);

        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist  = 6 + Math.random() * 4;
        const spawnX = Math.cos(spawnAngle) * spawnDist;
        const spawnZ = Math.sin(spawnAngle) * spawnDist;

        model.position.set(spawnX, 2, spawnZ);
        model.scale.set(1.5, 1.5, 1.5);
        model.rotation.set(0, 0, 0);
        ctx.scene.add(model);
        ctx.objectModels.push(model);
        ctx.character = model;

        const shape = new CANNON.Sphere(0.5);
        ctx.characterBody = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(spawnX, 2, spawnZ),
            shape,
            linearDamping: 0.3,
            angularDamping: 0.5,
            collisionFilterGroup: ctx.GROUPS.CHARACTER,
            collisionFilterMask: ctx.GROUPS.GROUND | ctx.GROUPS.BREAKABLE | ctx.GROUPS.PROJECTILE | ctx.GROUPS.CHARACTER | ctx.GROUPS.PEER_CHARACTER | ctx.GROUPS.STATIC,
        });
        ctx.physicsWorld.addBody(ctx.characterBody);
        ctx.characterBody.material = ctx.characterMaterial;

        ctx.peerModels[selfId] = ctx.character;
        ctx.peerBodies[selfId] = ctx.characterBody;

        const peerObj = ctx.room?.getPeers ? ctx.room.getPeers() : {};
        Object.keys(peerObj).forEach(peerId => {
            if (peerId !== selfId) spawnPeer(ctx, peerId);
        });

        if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            ctx.animationMixers.push(mixer);
            (model as any).animations = {};
            gltf.animations.forEach((clip) => {
                (model as any).animations[clip.name] = mixer.clipAction(clip);
            });
        }
    });
}

export function spawnPeer(ctx: any, peerId: string) {
    if (ctx.peerModels[peerId] || ctx.peerLoading[peerId]) return;
    ctx.peerLoading[peerId] = true;

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const modelKey  = ctx.peerCharacterModels[peerId] || 'male-a';
    const modelPath = CHARACTER_MODELS[modelKey] || CHARACTER_MODELS['male-a'];

    loader.load(modelPath, (gltf) => {
        const latestKey  = ctx.peerCharacterModels[peerId] || 'male-a';
        const latestPath = CHARACTER_MODELS[latestKey] || CHARACTER_MODELS['male-a'];
        if (latestPath !== modelPath) {
            delete ctx.peerLoading[peerId];
            spawnPeer(ctx, peerId);
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
        ctx.scene.add(model);

        if (!ctx.peerNameLabels) ctx.peerNameLabels = {};
        const displayName = ctx.peerNames?.[peerId] ?? '...';
        const nameLabel = createNameLabel(displayName);
        model.add(nameLabel);
        nameLabel.position.set(0, 3.2, 0);
        ctx.peerNameLabels[peerId] = nameLabel;

        const shape = new CANNON.Sphere(0.5);
        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.KINEMATIC,
            position: new CANNON.Vec3(model.position.x, model.position.y, model.position.z),
            shape,
            collisionFilterGroup: ctx.GROUPS.PEER_CHARACTER,
            collisionFilterMask: ctx.GROUPS.GROUND | ctx.GROUPS.PROJECTILE | ctx.GROUPS.CHARACTER | ctx.GROUPS.STATIC,
        });
        (body as any).peerId = peerId;
        ctx.physicsWorld.addBody(body);

        if (!ctx.peerTargets[peerId]) {
            ctx.peerTargets[peerId] = { position: model.position.clone(), rotY: 0 };
        }

        if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            (model as any).animations = {};
            gltf.animations.forEach((clip) => {
                (model as any).animations[clip.name] = mixer.clipAction(clip);
            });
            if (!ctx.peerMixers) ctx.peerMixers = {};
            ctx.peerMixers[peerId] = mixer;
        }

        ctx.peerModels[peerId] = model;
        ctx.peerBodies[peerId] = body;
        delete ctx.peerLoading[peerId];
        ctx.updatePlayerList();
    });
}

export function removePeer(ctx: any, peerId: string) {
    if (ctx.peerModels[peerId]) {
        ctx.scene.remove(ctx.peerModels[peerId]);
        delete ctx.peerModels[peerId];
    }
    if (ctx.peerBodies[peerId]) {
        ctx.physicsWorld.removeBody(ctx.peerBodies[peerId]);
        delete ctx.peerBodies[peerId];
    }
    if (ctx.peerMixers?.[peerId])    delete ctx.peerMixers[peerId];
    if (ctx.peerAnims?.[peerId])     delete ctx.peerAnims[peerId];
    if (ctx.peerTargets?.[peerId])   delete ctx.peerTargets[peerId];
    if (ctx.peerNameLabels?.[peerId]) delete ctx.peerNameLabels[peerId];
    delete ctx.peerLoading[peerId];
    ctx.peersSynced?.delete(peerId);
}

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SCENE_CONFIG } from '../config/scene.ts';
import { seededRandom } from '../utils/seededRandom.ts';

export function setupGround(ctx: any) {
    const geo = new THREE.PlaneGeometry(SCENE_CONFIG.groundSize, SCENE_CONFIG.groundSize);
    geo.rotateX(-Math.PI / 2);
    const tl = new THREE.TextureLoader();

    const grassTex = tl.load('/textures/testlab/floor_ground_grass.png');
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(SCENE_CONFIG.grassRepeat, SCENE_CONFIG.grassRepeat);
    grassTex.minFilter = THREE.LinearMipmapLinearFilter;
    grassTex.magFilter = THREE.LinearFilter;
    grassTex.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    const planeMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.9 });
    ctx.plane = new THREE.Mesh(geo, planeMat);
    ctx.plane.receiveShadow = true;
    ctx.scene.add(ctx.plane);
    ctx.geometries.push(ctx.plane);

    const SQ = ctx.concreteRadius;
    const tileGeo = new THREE.PlaneGeometry(SQ * 2, SQ * 2);
    tileGeo.rotateX(-Math.PI / 2);
    const tileTex = tl.load('/textures/testlab/floor_tiles_tan_small.png');
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    tileTex.repeat.set(SCENE_CONFIG.tileRepeat, SCENE_CONFIG.tileRepeat);
    tileTex.minFilter = THREE.LinearMipmapLinearFilter;
    tileTex.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    const tileMat = new THREE.MeshStandardMaterial({
        map: tileTex, roughness: 0.85,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const tileMesh = new THREE.Mesh(tileGeo, tileMat);
    tileMesh.position.y = 0.001;
    tileMesh.receiveShadow = true;
    tileMesh.renderOrder = 1;
    ctx.scene.add(tileMesh);

    const maskCv = document.createElement('canvas');
    maskCv.width = maskCv.height = 256;
    const mCtx = maskCv.getContext('2d');
    mCtx.fillStyle = 'black';
    mCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 10; i++) {
        const rx = Math.random() * 256, ry = Math.random() * 256;
        const rr = 15 + Math.random() * 35;
        const grd = mCtx.createRadialGradient(rx, ry, 0, rx, ry, rr);
        grd.addColorStop(0, 'rgba(255,255,255,0.8)');
        grd.addColorStop(1, 'transparent');
        mCtx.fillStyle = grd;
        mCtx.fillRect(0, 0, 256, 256);
    }
    const alphaMask = new THREE.CanvasTexture(maskCv);
    alphaMask.wrapS = alphaMask.wrapT = THREE.RepeatWrapping;

    const damagedTex = tl.load('/textures/testlab/floor_tiles_tan_small_damaged.png');
    damagedTex.wrapS = damagedTex.wrapT = THREE.RepeatWrapping;
    damagedTex.repeat.set(SCENE_CONFIG.tileRepeat, SCENE_CONFIG.tileRepeat);
    damagedTex.minFilter = THREE.LinearMipmapLinearFilter;
    damagedTex.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    const damagedMat = new THREE.MeshStandardMaterial({
        map: damagedTex, roughness: 0.9,
        transparent: true, alphaMap: alphaMask, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const damagedMesh = new THREE.Mesh(tileGeo.clone(), damagedMat);
    damagedMesh.position.y = 0.002;
    damagedMesh.receiveShadow = true;
    damagedMesh.renderOrder = 2;
    ctx.scene.add(damagedMesh);
}

export function setupLighting(ctx: any) {
    ctx.directionalLight = new THREE.DirectionalLight(0xffffff, SCENE_CONFIG.directionalLightIntensity);
    ctx.directionalLight.position.set(
        SCENE_CONFIG.directionalLightPos.x,
        SCENE_CONFIG.directionalLightPos.y,
        SCENE_CONFIG.directionalLightPos.z,
    );
    ctx.directionalLight.castShadow = true;
    ctx.directionalLight.shadow.mapSize.width  = 2048;
    ctx.directionalLight.shadow.mapSize.height = 2048;
    ctx.directionalLight.shadow.camera.left   = -60;
    ctx.directionalLight.shadow.camera.right  =  60;
    ctx.directionalLight.shadow.camera.top    =  60;
    ctx.directionalLight.shadow.camera.bottom = -60;
    ctx.directionalLight.shadow.camera.near   = 0.5;
    ctx.directionalLight.shadow.camera.far    = 120;
    ctx.directionalLight.shadow.bias          = -0.0005;
    ctx.directionalLight.shadow.normalBias    =  0.02;
    ctx.scene.add(ctx.directionalLight);

    ctx.ambientLight = new THREE.AmbientLight(0xffffff, SCENE_CONFIG.ambientLightIntensity);
    ctx.scene.add(ctx.ambientLight);
}

export function placeStaticObjects(ctx: any) {
    // ── Fountain ─────────────────────────────────────────────────────────────
    const fMesh = ctx.fountainModel.clone();
    fMesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    fMesh.position.set(0, 0.15, 0);
    ctx.scene.add(fMesh);
    ctx.fountainMesh = fMesh;

    fMesh.updateWorldMatrix(false, true);
    const fbbox = new THREE.Box3().setFromObject(fMesh);
    const fSize = new THREE.Vector3(); fbbox.getSize(fSize);
    const fCenter = new THREE.Vector3(); fbbox.getCenter(fCenter);
    const fBody = new CANNON.Body({
        mass: 0, type: CANNON.Body.STATIC,
        collisionFilterGroup: ctx.GROUPS.STATIC,
        collisionFilterMask: ctx.GROUPS.CHARACTER | ctx.GROUPS.PROJECTILE | ctx.GROUPS.PEER_CHARACTER | ctx.GROUPS.DEBRIS,
    });
    fBody.addShape(
        new CANNON.Box(new CANNON.Vec3(fSize.x / 2, fSize.y / 2, fSize.z / 2)),
        new CANNON.Vec3(fCenter.x, fCenter.y, fCenter.z),
    );
    fBody.position.set(0, 0, 0);
    ctx.physicsWorld.addBody(fBody);
    ctx.crystalBaseY = fbbox.max.y + 1.5;

    // ── Crystal ───────────────────────────────────────────────────────────────
    const cMesh = ctx.crystalModel.clone();
    cMesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; } });
    cMesh.position.set(0, ctx.crystalBaseY, 0);
    ctx.scene.add(cMesh);
    ctx.crystalMesh = cMesh;

    ctx.crystalLight = new THREE.PointLight(0x4499ff, 2.5, 30);
    ctx.crystalLight.position.set(0, ctx.crystalBaseY, 0);
    ctx.scene.add(ctx.crystalLight);

    const cBody = new CANNON.Body({
        mass: 0, type: CANNON.Body.KINEMATIC,
        collisionFilterGroup: ctx.GROUPS.STATIC,
        collisionFilterMask: ctx.GROUPS.CHARACTER | ctx.GROUPS.PROJECTILE | ctx.GROUPS.PEER_CHARACTER,
    });
    cBody.addShape(new CANNON.Sphere(0.6));
    cBody.position.set(0, ctx.crystalBaseY, 0);
    ctx.physicsWorld.addBody(cBody);
    ctx.crystalBody = cBody;

    // ── Trees ─────────────────────────────────────────────────────────────────
    for (let i = 0; i < SCENE_CONFIG.treeCount; i++) {
        const angle  = seededRandom(ctx.roomId, 100 + i * 2) * Math.PI * 2;
        const radius = SCENE_CONFIG.treeMinRadius + seededRandom(ctx.roomId, 101 + i * 2) * (SCENE_CONFIG.treeMaxRadius - SCENE_CONFIG.treeMinRadius);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const tModel = i % 2 === 0 ? ctx.treeCrookedModel : ctx.treeHighCrookedModel;
        const tMesh = tModel.clone();
        tMesh.scale.setScalar(SCENE_CONFIG.treeScale);
        tMesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        tMesh.position.set(x, 0, z);
        ctx.scene.add(tMesh);
        ctx.treeMeshes.push(tMesh);

        tMesh.updateWorldMatrix(false, true);
        const tbbox = new THREE.Box3().setFromObject(tMesh);
        const tSize = new THREE.Vector3(); tbbox.getSize(tSize);
        const tCenter = new THREE.Vector3(); tbbox.getCenter(tCenter);
        const tBody = new CANNON.Body({
            mass: 0, type: CANNON.Body.STATIC,
            collisionFilterGroup: ctx.GROUPS.STATIC,
            collisionFilterMask: ctx.GROUPS.CHARACTER | ctx.GROUPS.PROJECTILE | ctx.GROUPS.PEER_CHARACTER | ctx.GROUPS.DEBRIS,
        });
        tBody.addShape(
            new CANNON.Box(new CANNON.Vec3(tSize.x / 2, tSize.y / 2, tSize.z / 2)),
            new CANNON.Vec3(tCenter.x - x, tCenter.y, tCenter.z - z),
        );
        tBody.position.set(x, 0, z);
        ctx.physicsWorld.addBody(tBody);
        ctx.treeBodies.push(tBody);
    }

    ctx.buildCastle();
}

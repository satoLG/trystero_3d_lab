import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export function destroyCastle(ctx: any) {
    ctx.castleMeshes.forEach((m: THREE.Object3D) => ctx.scene.remove(m));
    ctx.castleMeshes = [];
    ctx.castleBodies.forEach((b: CANNON.Body) => ctx.physicsWorld?.removeBody(b));
    ctx.castleBodies = [];
    ctx.castleLanternLights.forEach((l: THREE.PointLight) => ctx.scene.remove(l));
    ctx.castleLanternLights = [];
}

export function buildCastle(ctx: any) {
    const SQ = ctx.concreteRadius;
    const WS = ctx.castleWallScale;
    const HS = ctx.hedgeScale;
    const LS = ctx.lanternScale;
    const RO = Math.PI / 2;

    const place = (model: THREE.Object3D, x: number, z: number, rotY: number, scale: number): THREE.Object3D => {
        const mesh = model.clone();
        mesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        mesh.scale.setScalar(scale);
        mesh.position.set(x, 0, z);
        mesh.rotation.y = rotY;
        ctx.scene.add(mesh);
        ctx.castleMeshes.push(mesh);
        return mesh;
    };

    const addBody = (mesh: THREE.Object3D) => {
        mesh.updateWorldMatrix(true, true);
        const bbox = new THREE.Box3().setFromObject(mesh);
        const sz = new THREE.Vector3(); bbox.getSize(sz);
        const ctr = new THREE.Vector3(); bbox.getCenter(ctr);
        const body = new CANNON.Body({
            mass: 0, type: CANNON.Body.STATIC,
            collisionFilterGroup: ctx.GROUPS.STATIC,
            collisionFilterMask: ctx.GROUPS.CHARACTER | ctx.GROUPS.PROJECTILE | ctx.GROUPS.PEER_CHARACTER | ctx.GROUPS.DEBRIS,
        });
        body.addShape(new CANNON.Box(new CANNON.Vec3(sz.x / 2, sz.y / 2, sz.z / 2)));
        body.position.set(ctr.x, ctr.y, ctr.z);
        ctx.physicsWorld.addBody(body);
        ctx.castleBodies.push(body);
    };

    const footprint = (model: THREE.Object3D, scale: number, rotY: number) => {
        const ref = model.clone();
        ref.scale.setScalar(scale);
        ref.rotation.y = rotY;
        ref.updateWorldMatrix(false, true);
        const bb = new THREE.Box3().setFromObject(ref);
        const s = new THREE.Vector3(); bb.getSize(s);
        return s;
    };

    const R_N = 0          + RO;
    const R_S = Math.PI    + RO;
    const R_E = Math.PI/2  + RO;
    const R_W = -Math.PI/2 + RO;

    const wFP_N = footprint(ctx.castleWallModel, WS, R_N).x;
    const wFP_E = footprint(ctx.castleWallModel, WS, R_E).z;
    const wallH = footprint(ctx.castleWallModel, WS, R_N).y;
    const cFP_N = footprint(ctx.castleCornerModel, WS, 0 + RO).x;
    const cFP_E = footprint(ctx.castleCornerModel, WS, Math.PI/2 + RO).z;
    const gFP_N = footprint(ctx.castleGateModel, WS, R_N).x;
    const gFP_E = footprint(ctx.castleGateModel, WS, R_E).z;

    [
        { x: -SQ, z: -SQ, ry: 0          + RO },
        { x:  SQ, z: -SQ, ry: Math.PI/2  + RO },
        { x:  SQ, z:  SQ, ry: Math.PI    + RO },
        { x: -SQ, z:  SQ, ry: -Math.PI/2 + RO },
    ].forEach(({ x, z, ry }) => {
        const m = place(ctx.castleCornerModel, x, z, ry, WS);
        addBody(m);
        const tower = place(ctx.castleTowerModel, x, z, ry, WS);
        tower.position.y = wallH;
    });

    [
        { x:   0, z: -SQ, ry: R_N },
        { x:  SQ, z:   0, ry: R_E },
        { x:   0, z:  SQ, ry: R_S },
        { x: -SQ, z:   0, ry: R_W },
    ].forEach(({ x, z, ry }) => place(ctx.castleGateModel, x, z, ry, WS));

    const fillSpan = (startT: number, endT: number, fixed: number, axis: 'x'|'z', rotY: number, step: number) => {
        const span = Math.abs(endT - startT);
        const count = Math.max(1, Math.round(span / step));
        const s = span / count;
        const dir = endT > startT ? 1 : -1;
        for (let i = 0; i < count; i++) {
            const t = startT + dir * (i + 0.5) * s;
            const wx = axis === 'z' ? t : fixed;
            const wz = axis === 'z' ? fixed : t;
            const m = place(ctx.castleWallModel, wx, wz, rotY, WS);
            addBody(m);
        }
    };

    const hiN = SQ - cFP_N / 2;
    const hgN = gFP_N / 2;
    const hiE = SQ - cFP_E / 2;
    const hgE = gFP_E / 2;

    fillSpan(-hiN, -hgN, -SQ, 'z', R_N, wFP_N);
    fillSpan( hgN,  hiN, -SQ, 'z', R_N, wFP_N);
    fillSpan(-hiN, -hgN,  SQ, 'z', R_S, wFP_N);
    fillSpan( hgN,  hiN,  SQ, 'z', R_S, wFP_N);
    fillSpan(-hiE, -hgE,  SQ, 'x', R_E, wFP_E);
    fillSpan( hgE,  hiE,  SQ, 'x', R_E, wFP_E);
    fillSpan(-hiE, -hgE, -SQ, 'x', R_W, wFP_E);
    fillSpan( hgE,  hiE, -SQ, 'x', R_W, wFP_E);

    const CR = ctx.hedgeCurvedRotOffset;
    const hedgeInset = SQ - 1.5;
    [
        { x: -hedgeInset, z: -hedgeInset, ry:  Math.PI      + CR },
        { x:  hedgeInset, z: -hedgeInset, ry: -Math.PI / 2  + CR },
        { x:  hedgeInset, z:  hedgeInset, ry:  0             + CR },
        { x: -hedgeInset, z:  hedgeInset, ry:  Math.PI / 2   + CR },
    ].forEach(({ x, z, ry }) => place(ctx.hedgeCurvedModel, x, z, ry, HS));

    const SR = ctx.hedgeStraightRotOffset;
    const hedgeWallInset = SQ - 1.0;
    const hedgeSpacing = 3;
    for (let t = -SQ + 3.5; t < SQ - 3; t += hedgeSpacing) {
        if (Math.abs(t) < gFP_N / 2 + 0.5) continue;
        place(ctx.hedgeLargeModel ?? ctx.hedgeModel, t,              -hedgeWallInset,  Math.PI / 2 + SR, HS);
        place(ctx.hedgeLargeModel ?? ctx.hedgeModel, t,               hedgeWallInset, -Math.PI / 2 + SR, HS);
        place(ctx.hedgeLargeModel ?? ctx.hedgeModel, -hedgeWallInset,  t,              0            + SR, HS);
        place(ctx.hedgeLargeModel ?? ctx.hedgeModel,  hedgeWallInset,  t,              Math.PI      + SR, HS);
    }

    const lanternInset = SQ - 2.5;
    ([
        [-lanternInset, -lanternInset],
        [ lanternInset, -lanternInset],
        [ lanternInset,  lanternInset],
        [-lanternInset,  lanternInset],
    ] as [number, number][]).forEach(([x, z]) => {
        const lMesh = ctx.lanternModel.clone();
        lMesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; } });
        lMesh.scale.setScalar(LS);
        lMesh.position.set(x, 0, z);
        ctx.scene.add(lMesh);
        ctx.castleMeshes.push(lMesh);
        const light = new THREE.PointLight(0xffaa22, ctx.lanternLightIntensity, ctx.lanternLightDistance);
        light.position.set(x, 3.0 * LS, z);
        ctx.scene.add(light);
        ctx.castleLanternLights.push(light);
    });
}

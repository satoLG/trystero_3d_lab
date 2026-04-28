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
    const SQ     = ctx.concreteRadius;
    const WS     = ctx.castleWallScale;
    const NS     = ctx.nsRotOffset;
    const EW     = ctx.ewRotOffset;
    const CS     = ctx.cornerScale;
    const CR_C   = ctx.cornerRotOffset;
    const TS     = ctx.towerScale;
    const TR     = ctx.towerRotOffset;
    // Straight hedges — N/S and E/W independent
    const HNS    = ctx.hedgeNsScale;
    const HNSR   = ctx.hedgeNsRotOffset;
    const HNSI   = ctx.hedgeNsInset;
    const HEW    = ctx.hedgeEwScale;
    const HEWR   = ctx.hedgeEwRotOffset;
    const HEWI   = ctx.hedgeEwInset;
    // Curved hedges at corners
    const HCS    = ctx.hedgeCurvedScale;
    const HCR    = ctx.hedgeCurvedRotOffset;
    const HCD    = ctx.hedgeCurvedDistFromCenter;
    // Lanterns
    const LS     = ctx.lanternScale;
    const LDC    = ctx.lanternDistFromCenter;
    const LLY    = ctx.lanternLightY;
    const RO     = Math.PI / 2;

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
            // BREAKABLE added so cubes physically collide with walls
            collisionFilterMask: ctx.GROUPS.CHARACTER | ctx.GROUPS.PROJECTILE | ctx.GROUPS.PEER_CHARACTER | ctx.GROUPS.DEBRIS | ctx.GROUPS.BREAKABLE,
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

    // Base rotations without offsets — used for footprint/spacing math only
    const R_N_base = 0          + RO;
    const R_S_base = Math.PI    + RO;
    const R_E_base = Math.PI/2  + RO;
    const R_W_base = -Math.PI/2 + RO;

    // Actual placement rotations
    const R_N = R_N_base + NS;
    const R_S = R_S_base + NS;
    const R_E = R_E_base + EW;
    const R_W = R_W_base + EW;

    const wFP_N = footprint(ctx.castleWallModel,   WS, R_N_base).x;
    const wFP_E = footprint(ctx.castleWallModel,   WS, R_E_base).z;
    const cFP_N = footprint(ctx.castleCornerModel, CS, R_N_base).x;
    const cFP_E = footprint(ctx.castleCornerModel, CS, R_E_base).z;
    const gFP_N = footprint(ctx.castleGateModel,   WS, R_N_base).x;
    const gFP_E = footprint(ctx.castleGateModel,   WS, R_E_base).z;
    const wallH = footprint(ctx.castleCornerModel, CS, R_N_base).y;

    // ── Corners: wall-narrow-corner + tower-square-roof ───────────────────────
    [
        { x: -SQ, z: -SQ, ry: 0          + RO + CR_C },
        { x:  SQ, z: -SQ, ry: Math.PI/2  + RO + CR_C },
        { x:  SQ, z:  SQ, ry: Math.PI    + RO + CR_C },
        { x: -SQ, z:  SQ, ry: -Math.PI/2 + RO + CR_C },
    ].forEach(({ x, z, ry }) => {
        const m = place(ctx.castleCornerModel, x, z, ry, CS);
        addBody(m);
        const tower = place(ctx.castleTowerModel, x, z, ry + TR, TS);
        tower.position.y = wallH;
    });

    // ── Gates ─────────────────────────────────────────────────────────────────
    [
        { x:   0, z: -SQ, ry: R_N },
        { x:  SQ, z:   0, ry: R_E },
        { x:   0, z:  SQ, ry: R_S },
        { x: -SQ, z:   0, ry: R_W },
    ].forEach(({ x, z, ry }) => place(ctx.castleGateModel, x, z, ry, WS));

    // ── Wall segments ─────────────────────────────────────────────────────────
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

    // ── Curved hedges at corners ──────────────────────────────────────────────
    // NW/SE share +HCR, NE/SW share -HCR so all four open "inward" at the same rate
    [
        { x: -HCD, z: -HCD, ry:  Math.PI      + HCR },    // NW: +
        { x:  HCD, z: -HCD, ry: -Math.PI / 2  - HCR },    // NE: −
        { x:  HCD, z:  HCD, ry:  0             + HCR },    // SE: +
        { x: -HCD, z:  HCD, ry:  Math.PI / 2   - HCR },   // SW: −
    ].forEach(({ x, z, ry }) => place(ctx.hedgeCurvedModel, x, z, ry, HCS));

    // ── Straight hedges: N/S and E/W have independent scale, rot, inset ───────
    const hwNS = SQ - HNSI;   // N/S hedge wall-inset position
    const hwEW = SQ - HEWI;   // E/W hedge wall-inset position
    const hedgeSpacing = 3;
    for (let t = -SQ + 3.5; t < SQ - 3; t += hedgeSpacing) {
        if (Math.abs(t) < gFP_N / 2 + 0.5) continue;
        place(ctx.hedgeLargeModel ?? ctx.hedgeModel, t,    -hwNS, R_N_base + HNSR, HNS);  // N
        place(ctx.hedgeLargeModel ?? ctx.hedgeModel, t,     hwNS, R_S_base + HNSR, HNS);  // S
        place(ctx.hedgeLargeModel ?? ctx.hedgeModel, -hwEW, t,    R_W_base + HEWR, HEW);  // W
        place(ctx.hedgeLargeModel ?? ctx.hedgeModel,  hwEW, t,    R_E_base + HEWR, HEW);  // E
    }

    // ── Lanterns at corners — position is direct distance from center ─────────
    ([
        [-LDC, -LDC],
        [ LDC, -LDC],
        [ LDC,  LDC],
        [-LDC,  LDC],
    ] as [number, number][]).forEach(([x, z]) => {
        const lMesh = ctx.lanternModel.clone();
        lMesh.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; } });
        lMesh.scale.setScalar(LS);
        lMesh.position.set(x, 0, z);
        ctx.scene.add(lMesh);
        ctx.castleMeshes.push(lMesh);
        const light = new THREE.PointLight(0xffaa22, ctx.lanternLightIntensity, ctx.lanternLightDistance);
        light.position.set(x, LLY * LS, z);
        ctx.scene.add(light);
        ctx.castleLanternLights.push(light);
    });
}

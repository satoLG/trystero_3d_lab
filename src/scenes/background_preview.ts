import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SCENE_CONFIG } from '../config/scene.ts';
import { CASTLE_CONFIG } from '../config/castle.ts';
import { buildCastle } from '../modules/castle.ts';
import { setupGround, setupLighting, plantTrees, addForestFog, placeStaticObjects } from '../modules/environment.ts';

export default class BackgroundPreviewScene {
    private renderer!: THREE.WebGLRenderer;
    private clock!: THREE.Clock;
    private animFrameId: number = 0;
    private ctx: any = null;

    init(container: HTMLElement) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(SCENE_CONFIG.skyColor);
        scene.fog = new THREE.FogExp2(SCENE_CONFIG.skyColor, SCENE_CONFIG.fogDensity);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(20, 25, 20);
        camera.lookAt(0, 0, 0);

        const noop = () => {};
        const mockPhysics = { addBody: noop, removeBody: noop };

        this.ctx = {
            scene,
            camera,
            renderer: this.renderer,
            physicsWorld: mockPhysics,
            GROUPS: { GROUND: 1, BREAKABLE: 2, PROJECTILE: 4, CHARACTER: 8, DEBRIS: 16, PEER_CHARACTER: 32, STATIC: 64 },
            geometries: [],
            treeMeshes: [],
            treeBodies: [],
            castleMeshes: [],
            castleBodies: [],
            castleLanternLights: [],
            forestFogMesh: null,
            crystalMesh: null,
            crystalLight: null,
            crystalBody: null,
            fountainMesh: null,
            crystalBaseY: 0,
            directionalLight: null,
            ambientLight: null,
            plane: null,
            // preview room id for seededRandom
            roomId: 'preview',
            // scene config
            concreteRadius:           SCENE_CONFIG.concreteRadius,
            treeForestInnerRadius:    SCENE_CONFIG.treeForestInnerRadius,
            treeForestOuterRadius:    SCENE_CONFIG.treeForestOuterRadius,
            treeCount:                SCENE_CONFIG.treeCount,
            treeScale:                SCENE_CONFIG.treeScale,
            forestFogRadius:          SCENE_CONFIG.forestFogRadius,
            forestFogOpacity:         SCENE_CONFIG.forestFogOpacity,
            forestFogHeight:          SCENE_CONFIG.forestFogHeight,
            crystalYOffset:           SCENE_CONFIG.crystalYOffset,
            crystalLightIntensity:    SCENE_CONFIG.crystalLightIntensity,
            crystalLightDistance:     SCENE_CONFIG.crystalLightDistance,
            // castle config
            castleWallScale:              CASTLE_CONFIG.wallScale,
            nsRotOffset:                  CASTLE_CONFIG.nsRotOffset,
            ewRotOffset:                  CASTLE_CONFIG.ewRotOffset,
            cornerScale:                  CASTLE_CONFIG.cornerScale,
            cornerRotOffset:              CASTLE_CONFIG.cornerRotOffset,
            towerScale:                   CASTLE_CONFIG.towerScale,
            towerRotOffset:               CASTLE_CONFIG.towerRotOffset,
            hedgeCurvedScale:             CASTLE_CONFIG.hedgeCurvedScale,
            hedgeCurvedRotOffset:         CASTLE_CONFIG.hedgeCurvedRotOffset,
            hedgeCurvedDistFromCenter:    CASTLE_CONFIG.hedgeCurvedDistFromCenter,
            hedgeCountPerSide:            CASTLE_CONFIG.hedgeCountPerSide,
            hedgeNsScale:                 CASTLE_CONFIG.hedgeNsScale,
            hedgeNsRotOffset:             CASTLE_CONFIG.hedgeNsRotOffset,
            hedgeNsInset:                 CASTLE_CONFIG.hedgeNsInset,
            hedgeEwScale:                 CASTLE_CONFIG.hedgeEwScale,
            hedgeEwRotOffset:             CASTLE_CONFIG.hedgeEwRotOffset,
            hedgeEwInset:                 CASTLE_CONFIG.hedgeEwInset,
            lanternScale:                 CASTLE_CONFIG.lanternScale,
            lanternDistFromCenter:        CASTLE_CONFIG.lanternDistFromCenter,
            lanternLightY:                CASTLE_CONFIG.lanternLightY,
            lanternLightIntensity:        CASTLE_CONFIG.lanternLightIntensity,
            lanternLightDistance:         CASTLE_CONFIG.lanternLightDistance,
            // models (filled after load)
            fountainModel:        null,
            crystalModel:         null,
            treeCrookedModel:     null,
            treeHighCrookedModel: null,
            castleWallModel:      null,
            castleCornerModel:    null,
            castleGateModel:      null,
            castleTowerModel:     null,
            hedgeModel:           null,
            hedgeCurvedModel:     null,
            hedgeLargeModel:      null,
            lanternModel:         null,
            buildCastle() { buildCastle(this); },
        };

        setupGround(this.ctx);
        setupLighting(this.ctx);

        this.clock = new THREE.Clock();
        this.loadModels();
        this.animate();
    }

    private async loadModels() {
        const loader = new GLTFLoader();
        const load = (path: string): Promise<THREE.Group> =>
            new Promise((resolve) => loader.load(path, (g) => resolve(g.scene)));

        const [fountain, crystal, treeCrooked, treeHighCrooked,
               castleWall, castleCorner, castleGate, castleTower,
               hedge, hedgeCurved, hedgeLarge, lantern] = await Promise.all([
            load('/models/testlab/structures/fountain-round.glb'),
            load('/models/testlab/objects/cristal.glb'),
            load('/models/testlab/objects/tree-crooked.glb'),
            load('/models/testlab/objects/tree-high-crooked.glb'),
            load('/models/testlab/structures/castle/wall.glb'),
            load('/models/testlab/structures/castle/wall-narrow-corner.glb'),
            load('/models/testlab/structures/castle/wall-narrow-gate.glb'),
            load('/models/testlab/structures/castle/tower-square-roof.glb'),
            load('/models/testlab/structures/hedge.glb'),
            load('/models/testlab/structures/hedge-curved.glb'),
            load('/models/testlab/structures/hedge-large.glb'),
            load('/models/testlab/structures/lantern.glb'),
        ]);

        Object.assign(this.ctx, {
            fountainModel: fountain, crystalModel: crystal,
            treeCrookedModel: treeCrooked, treeHighCrookedModel: treeHighCrooked,
            castleWallModel: castleWall, castleCornerModel: castleCorner,
            castleGateModel: castleGate, castleTowerModel: castleTower,
            hedgeModel: hedge, hedgeCurvedModel: hedgeCurved,
            hedgeLargeModel: hedgeLarge, lanternModel: lantern,
        });

        placeStaticObjects(this.ctx);
    }

    private animate() {
        this.animFrameId = requestAnimationFrame(() => this.animate());
        const t = this.clock.getElapsedTime();
        const ctx = this.ctx;
        if (ctx?.crystalMesh) {
            ctx.crystalMesh.rotation.y += 0.005;
            ctx.crystalMesh.position.y = ctx.crystalBaseY + Math.sin(t * 1.5) * 0.1;
        }
        if (ctx?.crystalLight) {
            ctx.crystalLight.intensity = SCENE_CONFIG.crystalLightIntensity * (0.85 + 0.15 * Math.sin(t * 2.3));
        }
        this.renderer.render(ctx.scene, ctx.camera);
    }

    resize() {
        if (!this.ctx) return;
        this.ctx.camera.aspect = window.innerWidth / window.innerHeight;
        this.ctx.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    destroy() {
        cancelAnimationFrame(this.animFrameId);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

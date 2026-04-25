import * as THREE from 'three';

class ThreejsScene {
    sizes: { width: number; height: number }
    mouse: THREE.Vector2
    mouseMoveHandler: (event: MouseEvent) => void
    raycaster: THREE.Raycaster
    rayDirection: THREE.Vector3
    currentIntersect: any
    scene: THREE.Scene
    renderer: THREE.WebGLRenderer | null
    camera: THREE.PerspectiveCamera | null
    clock: THREE.Clock
    debugGui: any

    constructor(debugGui = null) {
        this.sizes = {
            width: window.innerWidth,
            height: window.innerHeight
        }

        this.mouse = new THREE.Vector2();

        this.mouseMoveHandler = (event) => {
            this.mouse.x = event.clientX / this.sizes.width * 2 - 1
            this.mouse.y = - (event.clientY / this.sizes.height) * 2 + 1
        }

        window.removeEventListener('mousemove', this.mouseMoveHandler);
        window.addEventListener('mousemove', this.mouseMoveHandler);

        this.raycaster = new THREE.Raycaster();
        this.rayDirection = new THREE.Vector3(0, 0, 0);
        this.rayDirection.normalize();
        this.currentIntersect = null;

        this.scene = new THREE.Scene();
        this.renderer = null;
        this.camera = null;
        this.clock = new THREE.Clock();

        this.debugGui = debugGui;
    }

    init(container: HTMLElement) {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        container.appendChild(this.renderer.domElement);

        this.populateScene();

        this.animate();
    }

    resize() {
        if (this.camera) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }
        if (this.renderer) {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    populateScene() {
        throw new Error('You have to implement the method populateScene!');
    }

    animate() {
        this.customAnimate();
        this.renderer.render(this.scene, this.camera);
        window.requestAnimationFrame(this.animate.bind(this));
    }

    customAnimate() {
        throw new Error('You have to implement the method customAnimate!');
    }

    destroy() {
        if (this.debugGui) this.debugGui.close();

        console.log('Disposing scene...');
        window.removeEventListener('mousemove', this.mouseMoveHandler);

        this.scene.traverse((object) => {
            if (!(object as THREE.Mesh).isMesh) return;
            const mesh = object as THREE.Mesh;

            console.log('Disposing geometry: ', mesh.geometry);
            mesh.geometry.dispose();

            if ((mesh.material as THREE.MeshStandardMaterial).map) {
                (mesh.material as THREE.MeshStandardMaterial).map.dispose();
            }

            if ((mesh.material as THREE.Material).isMaterial) {
                this.disposeMaterial(mesh.material as THREE.Material);
            } else {
                for (const material of mesh.material as THREE.Material[]) this.disposeMaterial(material);
            }
        });

        console.log('Disposing renderer...');
        this.renderer.dispose();
    }

    disposeMaterial(material: THREE.Material) {
        for (const key in material) {
            if (!material.hasOwnProperty(key)) continue;
            const value = (material as any)[key];
            if (value && typeof value.dispose === 'function') {
                console.log('Disposing material: ', value);
                value.dispose();
            }
        }
    }
}

export default ThreejsScene;

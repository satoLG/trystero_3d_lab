import * as THREE from 'three';

class ThreejsScene {
    constructor(debugGui=null) {
        this.sizes = {
            width: window.innerWidth,
            height: window.innerHeight
        }

        this.mouse = new THREE.Vector2();

        this.mouseMoveHandler = (event) => {
            this.mouse.x = event.clientX / this.sizes.width * 2 - 1
            this.mouse.y = - (event.clientY / this.sizes.height) * 2 + 1
            // console.log(this.mouse.x, this.mouse.y);
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

    init(container) {
        this.renderer = new THREE.WebGLRenderer( { 
            antialias: true, 
            alpha: true,
            powerPreference: 'high-performance', 
        } );
        this.renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.shadowMap.enabled = true;
        
        container.appendChild( this.renderer.domElement );

        this.populateScene();

        this.animate();
    }

    resize() {
        // Check if the camera and renderer exist before resizing
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

        this.renderer.render( this.scene, this.camera );
        window.requestAnimationFrame( this.animate.bind(this) );
    }

    customAnimate() {
        throw new Error('You have to implement the method customAnimate!');
    }

    destroy() {
        if (this.debugGui) this.debugGui.close();

        console.log('Disposing scene...');
        // Remove event listeners
        window.removeEventListener('mousemove', this.mouseMoveHandler);

        // Dispose of scene resources
        this.scene.traverse((object) => {
            if (!object.isMesh) return;

            console.log('Disposing geometry: ', object.geometry);
            object.geometry.dispose();
            
            // Dispose of textures if they exist
            if (object.material.map) {
                object.material.map.dispose();
            }

            if (object.material.isMaterial) {
                this.disposeMaterial(object.material);
            } else {
                // an array of materials
                for (const material of object.material) this.disposeMaterial(material);
            }
        });

        console.log('Disposiing renderer...');
        this.renderer.dispose();
    }

    disposeMaterial(material) {
        // Dispose of material resources
        for (const key in material) {
            if (!material.hasOwnProperty(key)) continue;

            const value = material[key];
            if (value && typeof value.dispose === 'function') {
                console.log('Disposing material: ', value);
                value.dispose();
            }
        }
    }

}

export default ThreejsScene;
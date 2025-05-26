import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import ThreejsScene from '../base/scene.js';

class TestLabScene extends ThreejsScene {
    constructor(debugGui = null) {
        super(debugGui);
        this.plane = null;
        this.sky = null;
        this.directionalLight = null; // Directional light for global illumination
        this.ambientLight = null; // Ambient light to reduce overly dark areas
        this.character = null; // this.character model
        this.characterSpeed = new THREE.Vector3(0, 0, 0); // Velocity for the cube
        this.isJumping = false; // Flag to track if the cube is in the air        
        this.keys = {}; // Track key presses
        this.noKeysPressed = true; // Flag to track if no keys are pressed

        this.geometries = [];
        this.objectModels = [];
        this.animationMixers = [];

        this.cameraTransitioning = false; // Flag to track camera transition

        this.backgroundMusic = null; // Reference to the audio object

        this.isDragging = false; // Flag to track if the mouse is being dragged
        this.previousMouseX = 0; // Store the previous mouse X position    
    }

    initDebugGui() {
        // Add a folder for cube controls
        const cubeFolder = this.debugGui.gui.addFolder('Cubes');
    
        // Add a button to create a new cube
        cubeFolder.add({ addCube: () => this.addNewCube() }, 'addCube').name('Add New Cube');
    
        // Add a folder for camera controls
        const cameraFolder = this.debugGui.gui.addFolder('Camera');
        cameraFolder.add(this.camera.position, 'x', -50, 50).name('Position X').listen();
        cameraFolder.add(this.camera.position, 'y', -50, 50).name('Position Y').listen();
        cameraFolder.add(this.camera.position, 'z', -50, 50).name('Position Z').listen();
    
        // Add a folder for directional light controls
        const lightFolder = this.debugGui.gui.addFolder('Directional Light');
        lightFolder.add(this.directionalLight.position, 'x', -100, 100).name('Position X').listen();
        lightFolder.add(this.directionalLight.position, 'y', -100, 100).name('Position Y').listen();
        lightFolder.add(this.directionalLight.position, 'z', -100, 100).name('Position Z').listen();
        lightFolder.add(this.directionalLight, 'intensity', 0, 2).name('Intensity').listen();
    
        // Add a folder for ambient light controls
        const ambientLightFolder = this.debugGui.gui.addFolder('Ambient Light');
        ambientLightFolder.add(this.ambientLight, 'intensity', 0, 2).name('Intensity').listen();
    
        // Add a folder for the plane
        const planeFolder = this.debugGui.gui.addFolder('Plane');
        planeFolder.add(this.plane.position, 'x', -50, 50).name('Position X').listen();
        planeFolder.add(this.plane.position, 'y', -50, 50).name('Position Y').listen();
        planeFolder.add(this.plane.position, 'z', -50, 50).name('Position Z').listen();
        planeFolder.add(this.plane.rotation, 'x', -Math.PI, Math.PI).name('Rotation X').listen();
        planeFolder.add(this.plane.rotation, 'y', -Math.PI, Math.PI).name('Rotation Y').listen();
        planeFolder.add(this.plane.rotation, 'z', -Math.PI, Math.PI).name('Rotation Z').listen();
    
        // Add a folder for the character (if loaded)
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

    init(container) {
        super.init(container);

        // Initialize and play background music
        this.backgroundMusic = new Audio('sounds/background/mc.mp3');
        this.backgroundMusic.loop = true; // Loop the music
        this.backgroundMusic.volume = 0.5; // Set volume (adjust as needed)
        this.backgroundMusic.play().catch((error) => {
            console.error('Error playing background music:', error);
        });

        // Add event listeners for mouse drag
        window.addEventListener('mousedown', (event) => {
            this.isDragging = true;
            this.previousMouseX = event.clientX; // Store the initial mouse X position
        });

        window.addEventListener('mousemove', (event) => {
            if (this.isDragging && this.character) {
                const deltaX = event.clientX - this.previousMouseX; // Calculate the change in mouse X position
                this.previousMouseX = event.clientX; // Update the previous mouse X position

                // Adjust the character's Y rotation based on the mouse movement
                const rotationSpeed = 0.01; // Adjust this value to control rotation speed
                this.character.rotation.y -= deltaX * rotationSpeed;
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false; // Stop dragging when the mouse button is released
        });        
    }

    destroy() {
        // Stop and clean up background music
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0; // Reset playback position
            this.backgroundMusic = null;
        }

        super.destroy(); // Call the parent class's destroy method
    }

    addNewCube() {
        const textureLoader = new THREE.TextureLoader();
        const minecraftTexture = textureLoader.load('textures/testlab/minecraft.png');
        minecraftTexture.magFilter = THREE.NearestFilter; // Pixelated look for the cube
    
        // Create a new cube
        const cubeGeometry = new THREE.BoxGeometry();
        const cubeMaterial = new THREE.MeshStandardMaterial({ map: minecraftTexture });
        const newCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    
        // Set random position for the new cube
        newCube.position.set(
            Math.random() * 20 - 5, // Random X position between -5 and 5
            Math.random() * 9 + 1,                   // Fixed Y position
            Math.random() * 20 - 5 // Random Z position between -5 and 5
        );
    
        newCube.castShadow = true; // Allow the cube to cast shadows
        newCube.receiveShadow = true; // Allow the cube to receive shadows
    
        newCube.name = `Cube ${this.geometries.length + 1}`; // Name based on the number of cubes

        // Add the cube to the scene
        this.scene.add(newCube);
    
        // Add a bounding box for the cube
        // newCube.boundingBox = new THREE.Box3().setFromObject(newCube);
    
        // Add a helper for debugging
        // const cubeHelper = new THREE.BoxHelper(newCube, 0xff0000); // Red for the new cube
        // this.scene.add(cubeHelper);
    
        // Store the cube in the geometries array
        this.geometries.push(newCube);
    
        // Add GUI controls for the new cube
        if (this.debugGui.gui) {
            const cubeFolder = this.debugGui.gui.addFolder(`Cube ${this.geometries.length}`);
            cubeFolder.add(newCube.position, 'x', -10, 10).name('Position X').listen();
            cubeFolder.add(newCube.position, 'y', 0, 10).name('Position Y').listen();
            cubeFolder.add(newCube.position, 'z', -10, 10).name('Position Z').listen();
        }
    
        console.log('New cube added:', newCube);
    }

    populateScene() {
        // Set the shadow map type to PCFSoftShadowMap
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Add camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 10;

        // Create orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.maxPolarAngle = Math.PI / 2.5;
        this.controls.minPolarAngle = Math.PI / 3.5;
        this.controls.minAzimuthAngle = - Math.PI / 4; // radians
        this.controls.maxAzimuthAngle = Math.PI / 4; // radians
        this.controls.maxDistance = 100;
        this.controls.minDistance = 4;
        this.controls.maxZoom = 3;
        this.controls.minZoom = 0.5;
        this.controls.rotateSpeed = 1;

        const textureLoader = new THREE.TextureLoader();

        // Add a dark blue sky
        const skyColor = '#1d3557'; // Dark blue color

        this.scene.background = new THREE.Color(skyColor);

        // Add fog to match the background color
        this.scene.fog = new THREE.FogExp2(skyColor, 0.0142);

        // Load cobble.png texture for new objects
        const cobbleTexture = textureLoader.load('textures/testlab/cobble.png');
        cobbleTexture.wrapS = THREE.RepeatWrapping;
        cobbleTexture.wrapT = THREE.RepeatWrapping;
        cobbleTexture.repeat.set(50, 50); // Repeat the texture for better detail on a larger plane
        cobbleTexture.magFilter = THREE.NearestFilter; // Ensure the cobble texture looks sharp

        // Create a large plane and apply the cobble texture
        const planeGeometry = new THREE.PlaneGeometry(500, 500); // Much larger plane for the floor
        const planeMaterial = new THREE.MeshStandardMaterial({ map: cobbleTexture, side: THREE.DoubleSide });
        this.plane = new THREE.Mesh(planeGeometry, planeMaterial);
        this.plane.rotation.x = -Math.PI / 2; // Rotate to make it horizontal
        this.plane.position.set(0, 0, 0); // Slightly closer
        this.plane.receiveShadow = true; // Allow the plane to receive shadows
        this.scene.add(this.plane);

        this.geometries.push(this.plane); // Add the plane to the geometries array

        // this.plane.boundingBox = new THREE.Box3().setFromObject(this.plane);

        // this.planeHelper = new THREE.BoxHelper(this.plane, 0xffff00); // Yellow for the plane
        // this.scene.add(this.planeHelper);

        // Add a directional light for global illumination
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.5); // White light
        this.directionalLight.position.set(10, 50, 10); // Position the light
        this.directionalLight.castShadow = true; // Enable shadow casting for the directional light
        this.directionalLight.shadow.mapSize.width = 2048; // Shadow map resolution
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.left = -50; // Adjust shadow camera frustum
        this.directionalLight.shadow.camera.right = 50;
        this.directionalLight.shadow.camera.top = 50;
        this.directionalLight.shadow.camera.bottom = -50;
        this.directionalLight.shadow.camera.near = 0.5; // Near clipping plane
        this.directionalLight.shadow.camera.far = 100; // Far clipping plane
        this.scene.add(this.directionalLight);

        // Add ambient light to reduce overly dark areas
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Soft white light
        this.scene.add(this.ambientLight);

        document.getElementById('loading-screen').style.display = '';
        // Loading manager
        const loadingManager = new THREE.LoadingManager(
            () => {
                // On load complete
                setTimeout(() => {
                    document.getElementById('loading-screen').style.display = 'none';
                    document.getElementById('progress-bar').style.width = '0%';
                }, 500);
            },
            (itemUrl, itemsLoaded, itemsTotal) => {
                // On progress
                const progress = (itemsLoaded / itemsTotal) * 100;
                document.getElementById('progress-bar').style.width = `${progress}%`;
            },
            (url) => {
                // On load start
                document.getElementById('loading-screen').style.display = '';
            }
        );

        // Setup model loader
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath( 'jsm/' );
        const loader = new GLTFLoader(loadingManager);
        loader.setDRACOLoader( dracoLoader );

        // Load models
        this.loadModel(loader, 'models/testlab/goblin.glb', [0, 15, 0], [1, 1, 1], [0, 0, 0], true);

        // Add event listeners for keyboard input
        window.addEventListener('keydown', (event) => {
            this.noKeysPressed = false; // Set to false when any key is pressed
            this.keys[event.key] = true;

            // Handle jump on space bar press
            // console.log('Key pressed:', event.key, 'IS JUMPING ?', this.isJumping); // Debugging line
            if (event.key === ' ' && !this.isJumping) {
                // console.log('YES Jumping!'); // Debugging line
                this.characterSpeed.y = 0.85; // Initial upward velocity
                this.isJumping = true; // Set jumping flag
            }
        });

        window.addEventListener('keyup', (event) => {
             // Set to true when all keys are released
            // Reset the key state for the released key
            this.keys[event.key] = false; 

            let keys_values = []
            for (const key in this.keys) if (this.keys[key]) keys_values.push(key);

            if (!keys_values.some(item => item == true)) this.noKeysPressed = true;
        });

        setTimeout(() => {
            if (this.debugGui.gui) this.initDebugGui();
            this.cameraTransitioning = true; // Start camera transition
        }, 3000); // Adjust the delay as needed
    }

    loadModel(loader, path, position, scale, rotation = [0, 0, 0], allowShadow = false) {
        loader.load(path, (gltf) => {
            const model = gltf.scene;
            model.traverse(function (child) {
                if (child.isMesh && allowShadow) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            model.position.set(...position);
            model.scale.set(...scale);
            model.rotation.set(...rotation);
            this.scene.add(model);
            this.objectModels.push(model);
    
            // Store animations if available
            if (gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);
                this.animationMixers.push(mixer);
    
                // Store animations in an object for later use
                model.animations = {}; // Add an `animations` property to the model
                gltf.animations.forEach((clip) => {
                    console.log('Animation clip:', clip.name, clip);
                    model.animations[clip.name] = mixer.clipAction(clip); // Store each animation by name
                });
            }
        });
    }

    updateCharacterPosition() {
        this.character = this.objectModels[0]; // Assuming the first model is the character
        if (!this.character) return; // Ensure the character is loaded
    
        if (this.noKeysPressed) {
            // Reset speed if no keys are pressed
            this.characterSpeed.x = 0;
            this.characterSpeed.z = 0;
        } else {
            // Set movement speed
            this.characterSpeed.x = 0.1; // Fixed movement speed per frame
            this.characterSpeed.z = 0.1; // Fixed movement speed per frame
    
            // Increase speed if Shift is pressed
            if (this.keys['Shift'] || this.keys['SHIFT']) {
                this.characterSpeed.x = 0.25; // Sprint speed
                this.characterSpeed.z = 0.25; // Sprint speed
            }
        }
    
        // Reset the direction vector to prevent accumulation of values
        const direction = new THREE.Vector3(0, 0, 0);
    
        // Define fixed global directions
        const forward = new THREE.Vector3(0, 0, -1); // Forward along negative Z-axis
        const right = new THREE.Vector3(1, 0, 0);    // Right along positive X-axis
    
        // Check for movement keys and calculate the movement direction
        if (this.keys['w'] || this.keys['W']) direction.add(forward); // Forward
        if (this.keys['s'] || this.keys['S']) direction.sub(forward); // Backward
        if (this.keys['a'] || this.keys['A']) direction.sub(right);   // Left
        if (this.keys['d'] || this.keys['D']) direction.add(right);   // Right
    
        if (direction.length() > 0) {
            direction.normalize(); // Normalize to prevent faster diagonal movement
            direction.multiplyScalar(this.characterSpeed.x); // Scale by fixed speed
    
            // Rotate the character to face the movement direction
            const targetRotation = Math.atan2(-direction.x, -direction.z); // Calculate the target Y rotation
            this.character.rotation.y = targetRotation; // Set the character's Y rotation
    
            // Move the character in the given direction
            this.character.position.add(direction);
    
            // Transition to the walking animation
            if (this.character.animations) {
                const walkingAction = this.character.animations['animation.goblin.walk'];
                const idleAction = this.character.animations['animation.goblin.idle'];
    
                if (idleAction && idleAction.isRunning()) {
                    idleAction.fadeOut(0.1); // Fade out the idle animation
                    setTimeout(() => {
                        idleAction.stop(); // Stop the idle animation after fading out
                    }, 100); // Match the fade-out duration
                }
    
                if (walkingAction && !walkingAction.isRunning()) {
                    walkingAction.reset().fadeIn(0.2).play(); // Smoothly fade in the walking animation
                }
            }
        } else {
            // Transition to the idle animation
            if (this.character.animations) {
                const walkingAction = this.character.animations['animation.goblin.walk'];
                const idleAction = this.character.animations['animation.goblin.idle'];
    
                if (walkingAction && walkingAction.isRunning()) {
                    walkingAction.fadeOut(0.1); // Fade out the walking animation
                    setTimeout(() => {
                        walkingAction.stop(); // Stop the walking animation after fading out
                    }, 100); // Match the fade-out duration
                }
    
                if (idleAction && !idleAction.isRunning()) {
                    idleAction.reset().fadeIn(0.2).play(); // Smoothly fade in the idle animation
                }
            }
        }
    }

    applyGravity() {
        this.character = this.objectModels[0]; // Assuming the first model is the character
        if (!this.character) return; // Ensure the character is loaded
    
        const gravity = -0.005; // Gravity force
    
        // Apply gravity to the vertical velocity
        this.characterSpeed.y += gravity;
    
        // Cast a downward ray to check for collisions with the ground or objects
        const downwardRay = new THREE.Vector3(0, -0.5, 0); // Downward direction
        const collisionInfo = this.checkRaycastCollisions(downwardRay, true);
    
        if (collisionInfo) {
            const { position } = collisionInfo;
    
            // Add a small buffer to prevent jittering
            const buffer = -0.01;
    
            // Check if the character is slightly above the collision point
            if (this.character.position.y - position.y > buffer) {
                // Snap the character to the top of the collided object
                this.character.position.y = position.y;
                this.characterSpeed.y = Math.max(this.characterSpeed.y, 0); // Stop downward movement but allow upward movement
                this.isJumping = false; // Reset jumping flag when grounded
            } else {
                // Allow the character to settle naturally
                this.character.position.y += this.characterSpeed.y;
            }
        } else {
            // If no ground is detected, continue applying gravity
            this.character.position.y += this.characterSpeed.y;
        }
    }

    checkRaycastCollisions(direction, vertical = false) {
        const raycaster = new THREE.Raycaster();
        const rayOrigin = this.character.position.clone();
    
        rayOrigin.y += 0.5; // Start the ray slightly above the character's position
    
        // Define offsets to spread the rays horizontally
        const offsets = [
            new THREE.Vector3(0.25, 0, 0),  // Right
            new THREE.Vector3(-0.25, 0, 0), // Left
            new THREE.Vector3(0, 0, 0.25),  // Forward
            new THREE.Vector3(0, 0, -0.25)  // Backward
        ];
    
        let collisionInfo = null;
    
        // Cast rays from multiple points around the character's bounding box
        offsets.forEach((offset) => {
            const origin = rayOrigin.clone().add(offset); // Adjust the ray origin with the offset
            raycaster.set(origin, direction);
    
            // // Visualize the ray using an ArrowHelper (for debugging)
            // const arrowHelper = new THREE.ArrowHelper(direction, origin, 2, 0xff0000); // Length = 2, Color = Red
            // this.scene.add(arrowHelper);
    
            // // Remove the arrow helper after a short delay to avoid clutter
            // setTimeout(() => {
            //     this.scene.remove(arrowHelper);
            // }, 100); // Adjust the delay as needed
    
            // Check for intersections with objects in the scene
            const intersects = raycaster.intersectObjects([...this.geometries], true);
    
            // If any ray detects a collision, store the collision info
            if (intersects.length > 0 && intersects[0].distance < 1) {
                const collisionPoint = intersects[0].point; // Collision point in world coordinates

                collisionInfo = {
                    object: intersects[0].object, // The object collided with
                    position: new THREE.Vector3(
                        parseFloat(collisionPoint.x.toFixed(3)),
                        parseFloat(collisionPoint.y.toFixed(3)),
                        parseFloat(collisionPoint.z.toFixed(3))
                    ) // The position of the collision
                };
            }
        });
    
        return collisionInfo; // Return collision info or null if no collision
    }

    customAnimate() {
        // Cast a ray from the mouse and handle events
        this.raycaster.setFromCamera(this.mouse, this.camera)

        const objectsToTest = this.geometries.filter(object => object.geometry?.type != 'PlaneGeometry'); // Filter objects with bounding boxes
        const intersects = this.raycaster.intersectObjects(objectsToTest)
        
        if(intersects.length)
        {
            if(!this.currentIntersect)
            {
                console.log('mouse enter')
            }

            this.currentIntersect = intersects[0]
            console.log('objectsToTest', objectsToTest)
            console.log('intersects', intersects)

            // Convert 3D position to 2D screen position
            const screenPosition = this.currentIntersect?.object?.position.clone().project(this.camera);
            const x = (screenPosition.x * 0.5 + 0.5) * this.sizes.width;
            const y = (-screenPosition.y * 0.5 + 0.5) * this.sizes.height;
       
        }
        else
        {
            if(this.currentIntersect)
            {
                console.log('mouse leave')
            }
            
            this.currentIntersect = null
        }

        // console.log(this.mouse)
        this.controls.update();

        // Update cube position based on WASD input
        this.updateCharacterPosition();

        // Apply gravity and handle jumping
        this.applyGravity();

        // Smoothly move the camera behind the character if transitioning
        // if (this.cameraTransitioning) {
        //     this.smoothCameraFollow();
        // }

        this.character = this.objectModels[0]; // Assuming the first model is the this.character
        // Update OrbitControls to target the character
        if (this.character) {
            this.controls.target.copy(this.character.position); // Set the controls' target to the character's position
            this.controls.update(); // Update the controls to reflect the new target
        }

        if (this.animationMixers.length > 0) {
            this.animationMixers.forEach(mixer => {
                mixer.update((1 / 60) * 1.5);
            });     
        }
    }
}

export default TestLabScene;
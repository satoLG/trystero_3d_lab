import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as CANNON from 'cannon-es';
import ThreejsScene from '../base/scene.js';
import { joinRoom, selfId } from '../trystero/trystero-nostr.min.js';

class TestLabScene extends ThreejsScene {
    constructor(debugGui = null) {
        super(debugGui);
        this.plane = null;
        this.sky = null;
        this.directionalLight = null;
        this.ambientLight = null;
        this.character = null;
        this.characterBody = null; // Cannon body for character
        this.characterSpeed = 5; // Movement speed
        this.jumpVelocity = 8; // Jump velocity
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

        // Cannon.js world
        this.physicsWorld = null;

        // Mobile controls
        this.mobileMove = { x: 0, y: 0 };
        this.mobileJump = false;
        this.isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
        
        this.room = joinRoom({ appId: 'trystero-3d-lab' }, 'main-room');
        this.peers = {};  // { peerId: { mesh, body } }
        this.peerModels = {}; // { peerId: mesh }
        this.peerBodies = {}; // { peerId: body }
        this.lastSent = 0; // For throttling network updates
        this.peerLoading = {}; // Track which peers are loading

        this.currentAnim = null; // Track current animation name
        this.lastSentAnim = null; // Track last sent animation name
        this.peerAnims = {};     // Track remote peer animation states        
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
        // --- Physics world setup ---
        this.physicsWorld = new CANNON.World({
            gravity: new CANNON.Vec3(0, -12.82, 0)
        });

        super.init(container);

        // --- Physics materials for friction ---
        const groundMaterial = new CANNON.Material('ground');
        const characterMaterial = new CANNON.Material('character');

        // Set high friction between character and ground
        const contactMaterial = new CANNON.ContactMaterial(
            groundMaterial,
            characterMaterial,
            {
                friction: 0.8,    // Increase for more friction (try 0.6 - 1.0)
                restitution: 0  // No bounce
            }
        );
        this.physicsWorld.addContactMaterial(contactMaterial);

        // Save for later use
        this.groundMaterial = groundMaterial;
        this.characterMaterial = characterMaterial;

        // --- Plane physics ---
        const planeShape = new CANNON.Plane();
        const planeBody = new CANNON.Body({ mass: 0, shape: planeShape });
        planeBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        planeBody.material = this.groundMaterial;
        this.physicsWorld.addBody(planeBody);

        this.enableMusicOnUserGesture();

        // --- Mouse drag for character rotation ---
        window.addEventListener('mousedown', (event) => {
            this.isDragging = true;
            this.previousMouseX = event.clientX;
        });
        window.addEventListener('mousemove', (event) => {
            if (this.isDragging && this.character) {
                const deltaX = event.clientX - this.previousMouseX;
                this.previousMouseX = event.clientX;
                const rotationSpeed = 0.01;
                this.character.rotation.y -= deltaX * rotationSpeed;
            }
        });
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // --- Keyboard controls ---
        window.addEventListener('keydown', (event) => {
            this.noKeysPressed = false;
            this.keys[event.key.toLowerCase()] = true;
            if ((event.key === ' ' || event.key === 'Spacebar') && !this.isJumping) {
                this.mobileJump = true;
            }
        });
        window.addEventListener('keyup', (event) => {
            this.keys[event.key.toLowerCase()] = false;
            this.noKeysPressed = !Object.values(this.keys).some(Boolean);
        });

        // --- Mobile controls ---
        if (this.isMobile) this.initMobileControls();

        setTimeout(() => {
            if (this.debugGui.gui) this.initDebugGui();
            this.cameraTransitioning = true;
        }, 3000);

        // --- Multiplayer setup ---
        // this.room = joinRoom({ appId: 'trystero-3d-lab' }, 'main-room');

        const peerObj = this.room.getPeers ? this.room.getPeers() : {};
        Object.keys(peerObj).forEach(peerId => {
            if (peerId !== selfId) this.spawnPeer(peerId);
        });

        // Listen for peer join/leave
        this.room.onPeerJoin = (peerId) => {
            console.log('onPeerJoin fired for', peerId);
            if (peerId === selfId) return;
            console.log(`Peer joined: ${peerId}`);
            this.spawnPeer(peerId);
        };
        this.room.onPeerLeave = (peerId) => {
            this.removePeer(peerId);
        };

        // Use the array API for actions
        const [sendMove, getMove] = this.room.makeAction('move');
        this.sendMove = sendMove;

        // Listen for incoming moves
        getMove((data, peerId) => {
            if (peerId === selfId) return;
            if (!this.peerModels[peerId]) {
                this.spawnPeer(peerId);
            }
            const { x, y, z, rotY } = data;
            if (this.peerModels[peerId]) {
                this.peerModels[peerId].position.set(x, y, z);
                this.peerModels[peerId].rotation.y = rotY;
                if (this.peerBodies[peerId]) {
                    this.peerBodies[peerId].position.set(x, y, z);
                }
            }
        });
        
        const [sendAnim, getAnim] = this.room.makeAction('anim');
        this.sendAnim = sendAnim;

        // Listen for incoming animation changes
        getAnim((animName, peerId) => {
            this.peerAnims[peerId] = animName;
            // Play animation on remote peer if model and animations exist
            const mesh = this.peerModels[peerId];
            if (mesh && mesh.animations && mesh.animations[animName]) {
                // Stop all
                Object.values(mesh.animations).forEach(action => action.stop());
                mesh.animations[animName].play();
            }
        });        

        const [sendCube, getCube] = this.room.makeAction('addCube');
        this.sendCube = sendCube;
        getCube((cubeData) => {
            this.addNewCube(cubeData); // cubeData: {x, z}
        });

        const [sendButton, getButton] = this.room.makeAction('pressButton');
        this.sendButton = sendButton;
        getButton(() => {
            this.animateButtonPress();
        });        
    }

    destroy() {
        // Remove all peers
        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId !== selfId) this.removePeer(peerId);
        });

        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0;
            this.backgroundMusic = null;
        }
        super.destroy();
    }

    spawnPeer(peerId) {
        if (this.peerModels[peerId] || this.peerLoading[peerId]) return; // Prevent duplicates and double-loading
        this.peerLoading[peerId] = true; // Mark as loading

        // Load the goblin model for the remote peer
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('jsm/');
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        loader.load('models/testlab/goblin.glb', (gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            // Start at a random position near the center
            model.position.set(Math.random() * 4 - 2, 2, Math.random() * 4 - 2);
            model.scale.set(1, 1, 1);
            model.rotation.set(0, 0, 0);
            this.scene.add(model);

            // Assign a random name if not already set
            if (!this.peerNames) this.peerNames = {};
            if (!this.peerNames[peerId]) {
                this.peerNames[peerId] = this.getRandomGoblinName();
            }
            const nameLabel = this.createNameLabel(this.peerNames[peerId]);
            model.add(nameLabel);
            nameLabel.position.set(0, 2, 0); // Adjust Y to be above the head

            // Store for later updates if needed
            if (!this.peerNameLabels) this.peerNameLabels = {};
            this.peerNameLabels[peerId] = nameLabel;

            // Cannon body for remote peer
            const radius = 0.5;
            const shape = new CANNON.Sphere(radius);
            const body = new CANNON.Body({
                mass: 0, // Kinematic bodies should have mass 0
                type: CANNON.Body.KINEMATIC,
                position: new CANNON.Vec3(model.position.x, model.position.y, model.position.z),
                shape: shape,
                linearDamping: 0.3
            });
            this.physicsWorld.addBody(body);
            body.material = this.characterMaterial;

            // Animation setup for remote peer
            if (gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);
                model.animations = {};
                gltf.animations.forEach((clip) => {
                    model.animations[clip.name] = mixer.clipAction(clip);
                });
                // Store the mixer for updates (optional, if you want remote anims to blend)
                if (!this.peerMixers) this.peerMixers = {};
                this.peerMixers[peerId] = mixer;
            }

            this.peerModels[peerId] = model;
            this.peerBodies[peerId] = body;

            // Remove loading flag
            delete this.peerLoading[peerId];           
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
    }

    playAnimation(animName) {
        if (!this.character || !this.character.animations) return;
        if (this.currentAnim === animName) return;
        // Stop all
        Object.values(this.character.animations).forEach(action => action.stop());
        // Play requested
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
        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Text
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 0.5, 1); // Adjust size as needed
        return sprite;
    }

    enableMusicOnUserGesture() {
        if (this.backgroundMusic) return; // Already set up

        this.backgroundMusic = new Audio('sounds/background/mc.mp3');
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

    addNewCube(nearPosition = null) {
        const textureLoader = new THREE.TextureLoader();
        const minecraftTexture = textureLoader.load('textures/testlab/minecraft.png');
        minecraftTexture.magFilter = THREE.NearestFilter;

        // Create a new cube mesh
        const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
        const cubeMaterial = new THREE.MeshStandardMaterial({ map: minecraftTexture });
        const newCube = new THREE.Mesh(cubeGeometry, cubeMaterial);

        // Find a spawn position: above the plane, near the button, not overlapping
        let spawnX = 0, spawnZ = 0, spawnY = 1.5;
        if (nearPosition) {
            // Try to stack upward if possible
            spawnX = nearPosition.x;
            spawnZ = nearPosition.z;
            // Find the highest cube at this (x, z)
            let maxY = 0;
            this.geometries.forEach(obj => {
                if (Math.abs(obj.position.x - spawnX) < 0.6 && Math.abs(obj.position.z - spawnZ) < 0.6) {
                    if (obj.position.y > maxY) maxY = obj.position.y;
                }
            });
            spawnY = maxY + 1; // Stack on top
        } else {
            // Random position if not near button
            spawnX = Math.random() * 8 - 4;
            spawnZ = Math.random() * 8 - 4;
        }
        newCube.position.set(spawnX, spawnY, spawnZ);

        newCube.castShadow = true;
        newCube.receiveShadow = true;
        newCube.name = `Cube ${this.geometries.length + 1}`;
        this.scene.add(newCube);

        // --- Physics: add static Cannon body ---
        const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
        const body = new CANNON.Body({
            mass: 0, // static
            position: new CANNON.Vec3(spawnX, spawnY, spawnZ),
            shape: shape,
            material: this.groundMaterial
        });
        this.physicsWorld.addBody(body);

        // Store mesh and body for syncing
        if (!this.cubeBodies) this.cubeBodies = [];
        this.cubeBodies.push({ mesh: newCube, body });

        this.geometries.push(newCube);

        // Animate "coming out of ground"
        newCube.scale.y = 0.1;
        let grow = { y: 0.1 };
        const targetY = 1;
        const growAnim = () => {
            if (grow.y < targetY) {
                grow.y += 0.1;
                newCube.scale.y = grow.y;
                requestAnimationFrame(growAnim);
            } else {
                newCube.scale.y = targetY;
            }
        };
        growAnim();
    }

    animateButtonPress() {
        if (!this.button) return;
        this.button.pressed = true;
        this.button.mesh.scale.y = 0.5;
        setTimeout(() => {
            this.button.mesh.scale.y = 1;
            this.button.pressed = false;
            this.button.pressCooldown = 30;
        }, 200);
    }

    // --- Button creation ---
    createButton() {
        // Button mesh
        const buttonGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.3, 32);
        const buttonMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
        const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);

        buttonMesh.castShadow = true;
        buttonMesh.receiveShadow = true;
        this.scene.add(buttonMesh);

        // Button physics
        const buttonShape = new CANNON.Cylinder(0.7, 0.7, 0.3, 32);
        const buttonBody = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(0, 0.15, 0),
            shape: buttonShape,
            material: this.groundMaterial
        });
        this.physicsWorld.addBody(buttonBody);

        buttonMesh.position.set(5, 0.15, 0); // Place button at x=5, z=0
        buttonBody.position.set(5, 0.15, 0);

        // Store for collision detection
        this.button = { mesh: buttonMesh, body: buttonBody, pressed: false, pressCooldown: 0 };
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
        // ...existing code up to plane creation...

        // Add a large plane (Three.js)
        // ...existing code for plane...
        this.scene.add(this.plane);
        this.geometries.push(this.plane);

        // ...existing code for lights...
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

        // Add this line here:
        this.createButton();

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

        // --- Load character model ---
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('jsm/');
        const loader = new GLTFLoader(loadingManager);
        loader.setDRACOLoader(dracoLoader);

        loader.load('models/testlab/goblin.glb', (gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            model.position.set(0, 2, 0);
            model.scale.set(1, 1, 1);
            model.rotation.set(0, 0, 0);
            this.scene.add(model);
            this.objectModels.push(model);
            this.character = model;

            // --- Character physics body ---
            // Use a capsule or sphere for simplicity
            const radius = 0.5, height = 1.5;
            const shape = new CANNON.Sphere(radius);
            // Find a random, non-overlapping spawn position for the original goblin
            let spawnX, spawnZ;
            let tries = 0;
            let minDist = 1.5;
            do {
                spawnX = Math.random() * 8 - 4;
                spawnZ = Math.random() * 8 - 4;
                let overlap = false;
                // Avoid button
                if (this.button && this.button.body) {
                    if (Math.abs(this.button.body.position.x - spawnX) < minDist + 0.7 && Math.abs(this.button.body.position.z - spawnZ) < minDist + 0.7) {
                        overlap = true;
                    }
                }
                // Avoid other objects if needed (optional)
                tries++;
                if (!overlap) break;
            } while (tries < 20);

            model.position.set(spawnX, 2, spawnZ);
            this.characterBody = new CANNON.Body({
                mass: 1,
                position: new CANNON.Vec3(spawnX, 2, spawnZ),
                shape: shape,
                linearDamping: 0.3 // Damping for smoother stop
            });
            this.physicsWorld.addBody(this.characterBody);
            this.characterBody.material = this.characterMaterial;

            this.peerModels[selfId] = this.character;
            this.peerBodies[selfId] = this.characterBody;

            // Spawn all existing peers
            const peerObj = this.room.getPeers ? this.room.getPeers() : {};
            Object.keys(peerObj).forEach(peerId => {
                if (peerId !== selfId) this.spawnPeer(peerId);
            });

            // --- Animations ---
            if (gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);
                this.animationMixers.push(mixer);
                model.animations = {};
                gltf.animations.forEach((clip) => {
                    model.animations[clip.name] = mixer.clipAction(clip);
                });
            }
        });

        // this.createButton()

        // Add event listeners for keyboard input
        window.addEventListener('keydown', (event) => {
            this.noKeysPressed = false; // Set to false when any key is pressed
            this.keys[event.key] = true;

            // Handle jump on space bar press
            // console.log('Key pressed:', event.key, 'IS JUMPING ?', this.isJumping); // Debugging line
            if (event.key === ' ' && !this.isJumping) {
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

    // --- Mobile controls UI ---
    initMobileControls() {
        // Simple joystick and jump button
        const joystick = document.createElement('div');
        joystick.id = 'joystick';
        joystick.style.position = 'fixed';
        joystick.style.left = '30px';
        joystick.style.bottom = '30px';
        joystick.style.width = '100px';
        joystick.style.height = '100px';
        joystick.style.background = 'rgba(100,100,100,0.2)';
        joystick.style.borderRadius = '50%';
        joystick.style.zIndex = 1000;
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

        // Jump button
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
        jumpBtn.style.zIndex = 1000;
        jumpBtn.addEventListener('touchstart', () => {
            this.mobileJump = true;
        });
        document.body.appendChild(jumpBtn);
    }

    // --- Character movement and physics update ---
    updateCharacterPhysics(delta) {
        if (!this.characterBody) return;

        // --- Movement input ---
        let moveX = 0, moveZ = 0;
        // Keyboard (WASD/arrows)
        if (this.keys['w'] || this.keys['arrowup']) moveZ -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) moveZ += 1;
        if (this.keys['a'] || this.keys['arrowleft']) moveX -= 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX += 1;
        // Mobile joystick
        if (this.isMobile) {
            moveX += this.mobileMove.x;
            moveZ += this.mobileMove.y; // Invert Y for forward
        }

        // Normalize direction
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) {
            moveX /= len;
            moveZ /= len;
        }

        // --- Apply movement velocity ---
        const speed = this.characterSpeed;
        if (len > 0) {
            // Invert X and Z to match Three.js forward direction (-Z)
            this.characterBody.velocity.x = moveX * speed;
            this.characterBody.velocity.z = moveZ * speed;

            // Rotate character to face movement direction (forward = -Z)
            if (this.character) {
                let rotationY = Math.atan2(-moveX, -moveZ);
                this.character.rotation.y = rotationY;
            }
        } else {
            // Let Cannon's damping slow the character naturally
            this.characterBody.velocity.x = 0;
            this.characterBody.velocity.z = 0;
        }

        // --- Jumping ---
        // Consider "on ground" if close to y=radius and not falling fast
        let onGround = false;
        const threshold = 0.5; // Adjust as needed for how "flat" the contact must be
        if (this.characterBody.world && this.characterBody.world.contacts) {
            for (const contact of this.characterBody.world.contacts) {
                // Is this contact involving the character?
                if (contact.bi === this.characterBody || contact.bj === this.characterBody) {
                    // Get the contact normal in world space
                    let contactNormal = new CANNON.Vec3();
                    if (contact.bi === this.characterBody) {
                        contact.ni.negate(contactNormal);
                    } else {
                        contactNormal.copy(contact.ni);
                    }
                    // If the normal points up, it's a ground-like contact
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

        // --- Sync Three.js model with Cannon body ---
        if (this.character) {
            this.character.position.copy(this.characterBody.position);
        }

        // Determine animation state
        const isMoving = len > 0.01;
        const desiredAnim = isMoving ? 'animation.goblin.walk' : 'animation.goblin.idle';
        this.playAnimation(desiredAnim);

        // Broadcast animation state if changed
        if (this.sendAnim && this.currentAnim !== this.lastSentAnim) {
            this.sendAnim(this.currentAnim);
            this.lastSentAnim = this.currentAnim;
        }        
    }

    customAnimate(delta = 1 / 60) {
        // --- Physics step ---
        if (this.physicsWorld) {
            this.physicsWorld.step(delta);
            this.updateCharacterPhysics(delta);
        }

        // --- In your update loop, after physics step ---
        if (this.button && this.characterBody) {
            // Check for collision from above
            const charPos = this.characterBody.position;
            const btnPos = this.button.body.position;
            const distXZ = Math.sqrt(
                (charPos.x - btnPos.x) ** 2 +
                (charPos.z - btnPos.z) ** 2
            );
            const isAbove = Math.abs(charPos.y - (btnPos.y + 0.5)) < 0.7;
            if (
                distXZ < 0.7 &&
                isAbove &&
                !this.button.pressed &&
                this.button.pressCooldown <= 0
            ) {
                // Animate button press locally and for all peers
                this.animateButtonPress();
                if (this.sendButton) this.sendButton();

                // Find a far, non-overlapping cube position
                let angle = Math.random() * Math.PI * 2;
                let minDistance = 4;
                let maxDistance = 6;
                let distance = minDistance + Math.random() * (maxDistance - minDistance);
                let tryX = this.button.body.position.x + Math.cos(angle) * distance;
                let tryZ = this.button.body.position.z + Math.sin(angle) * distance;

                let found = false;
                for (let tries = 0; tries < 20 && !found; tries++) {
                    found = true;
                    for (const obj of this.geometries) {
                        if (Math.abs(obj.position.x - tryX) < 0.9 && Math.abs(obj.position.z - tryZ) < 0.9) {
                            angle = Math.random() * Math.PI * 2;
                            distance = minDistance + Math.random() * (maxDistance - minDistance);
                            tryX = this.button.body.position.x + Math.cos(angle) * distance;
                            tryZ = this.button.body.position.z + Math.sin(angle) * distance;
                            found = false;
                            break;
                        }
                    }
                    if (found && Math.abs(this.button.body.position.x - tryX) < 1.5 && Math.abs(this.button.body.position.z - tryZ) < 1.5) {
                        angle = Math.random() * Math.PI * 2;
                        distance = minDistance + Math.random() * (maxDistance - minDistance);
                        tryX = this.button.body.position.x + Math.cos(angle) * distance;
                        tryZ = this.button.body.position.z + Math.sin(angle) * distance;
                        found = false;
                    }
                    if (found && Math.abs(0 - tryX) < 1.5 && Math.abs(0 - tryZ) < 1.5) {
                        angle = Math.random() * Math.PI * 2;
                        distance = minDistance + Math.random() * (maxDistance - minDistance);
                        tryX = this.button.body.position.x + Math.cos(angle) * distance;
                        tryZ = this.button.body.position.z + Math.sin(angle) * distance;
                        found = false;
                    }
                }
                // Add the cube locally and for all peers
                if (this.sendCube) this.sendCube({ x: tryX, z: tryZ });
                this.addNewCube({ x: tryX, z: tryZ });
            }
            if (this.button.pressCooldown > 0) this.button.pressCooldown--;
        }

        // --- In your customAnimate, sync cube meshes with bodies ---
        if (this.cubeBodies) {
            this.cubeBodies.forEach(({ mesh, body }) => {
                mesh.position.copy(body.position);
            });
        }

        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId === selfId) return;
            const mesh = this.peerModels[peerId];
            const body = this.peerBodies[peerId];
            if (mesh && body) {
                mesh.position.copy(body.position);
                mesh.position.y += -0.5; // Offset so feet touch the ground
                // Keep name label above head
                if (this.peerNameLabels && this.peerNameLabels[peerId]) {
                    this.peerNameLabels[peerId].position.set(0, 2, 0); // Adjust Y as needed
                }
            }
        });

        if (this.character && this.characterBody) {
            this.character.position.copy(this.characterBody.position);
            this.character.position.y += -.5; // Offset so feet touch the ground
        }

        // --- Update remote peer animation mixers ---
        if (this.peerMixers) {
            Object.values(this.peerMixers).forEach(mixer => mixer.update(delta * 1.5));
        }

        // --- Play correct animation for remote peers ---
        Object.keys(this.peerModels).forEach(peerId => {
            if (peerId === selfId) return;
            const mesh = this.peerModels[peerId];
            const animName = this.peerAnims[peerId];
            if (mesh && mesh.animations && animName && mesh.animations[animName]) {
                if (!mesh.animations[animName].isRunning()) {
                    Object.values(mesh.animations).forEach(action => action.stop());
                    mesh.animations[animName].play();
                }
            }
        });   

        // --- Camera follow ---
        if (this.character) {
            this.controls.target.copy(this.character.position);
            this.controls.update();
        }

        // --- Animations ---
        if (this.animationMixers.length > 0) {
            this.animationMixers.forEach(mixer => {
                mixer.update(delta * 1.5);
            });
        }

        // --- Multiplayer: send my position ---
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
    }
}

export default TestLabScene;
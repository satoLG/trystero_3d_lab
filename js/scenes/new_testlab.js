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

        this.cameraMode = 'orbit'; // 'orbit' or 'follow'
        this.followCameraPosition = new THREE.Vector3();
        this.followCameraTarget = new THREE.Vector3();
        this.cameraTransitionSpeed = 0.1;

        this.cameraOffset = new THREE.Vector3(0, 4, 8); // Default camera position relative to character
        this.cameraLookOffset = new THREE.Vector3(0, 2, 0); // Look slightly above character
        this.cameraSmoothness = 0.1; // Lower = smoother camera
        this.rotationSmoothness = 0.1; // Lower = smoother rotation
        
        this.projectiles = [];
        this.breakableTargets = [];
        this.lastShot = 0;
        this.shootCooldown = 200; // ms between shots  
        
        this.debris = []; // Store broken pieces 

        this.damageThreshold = 2; // Lower = easier to damage
        this.crackThresholds = [80, 50, 20]; // Show damage earlier

        this.projectileSpeed = 50; // Faster projectiles
        this.projectileMass = 5;   // Lighter but still impactful
        this.breakForce = 40;      // Lower break threshold

        // Collision groups
        this.GROUPS = {
            GROUND: 1,
            BREAKABLE: 2,
            PROJECTILE: 4,
            CHARACTER: 8,
            DEBRIS: 16
        };

        this.targetSyncTimeout = null;
        this.initialTargetsSent = false;
        this.lastTargetSync = 0;
        this.targetSyncInterval = 5000; // Sync every 5 seconds
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

        // NOW add the collision listener
        this.physicsWorld.addEventListener('beginContact', (event) => {
            if (!event || !event.bodyA || !event.bodyB) return;

            requestAnimationFrame(() => {
                try {
                    let projectile = this.projectiles.find(p => 
                        p.body === event.bodyA || p.body === event.bodyB);
                    if (!projectile) return;

                    const otherBody = event.bodyA === projectile.body ? event.bodyB : event.bodyA;

                    // First, check if we hit a breakable target
                    const target = this.breakableTargets.find(t => t.body === otherBody);
                    if (target) {
                        // Broadcast broken state immediately
                        if (this.sendTarget) {
                            this.sendTarget({
                                position: { 
                                    x: target.mesh.position.x, 
                                    y: target.mesh.position.y, 
                                    z: target.mesh.position.z 
                                },
                                broken: true,
                                impactPoint: {
                                    x: projectile.mesh.position.x,
                                    y: projectile.mesh.position.y,
                                    z: projectile.mesh.position.z
                                },
                                id: target.id
                            });
                        }

                        // Create local debris
                        this.createDebris(target, projectile.mesh.position);

                        // Remove target
                        this.scene.remove(target.mesh);
                        this.physicsWorld.removeBody(target.body);
                        this.breakableTargets = this.breakableTargets.filter(t => t !== target);
                    }

                    // Remove projectile
                    this.scene.remove(projectile.mesh);
                    this.physicsWorld.removeBody(projectile.body);
                    this.projectiles = this.projectiles.filter(p => p !== projectile);

                } catch (error) {
                    console.warn('Error in collision handler:', error);
                }
            });
        });

        // --- Plane physics ---
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

        // --- Mouse drag for character rotation ---
        // window.addEventListener('mousedown', (event) => {
        //     this.isDragging = true;
        //     this.previousMouseX = event.clientX;
        // });
        // window.addEventListener('mousemove', (event) => {
        //     if (this.isDragging && this.character) {
        //         const deltaX = event.clientX - this.previousMouseX;
        //         this.previousMouseX = event.clientX;
        //         const rotationSpeed = 0.01;
        //         this.character.rotation.y -= deltaX * rotationSpeed;
        //     }
        // });
        // window.addEventListener('mouseup', () => {
        //     this.isDragging = false;
        // });

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

        window.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Left click
                this.throwProjectile();
            }
        });

        // For mobile, add shoot button
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
            shootBtn.style.zIndex = 1000;
            shootBtn.addEventListener('touchstart', () => {
                this.throwProjectile();
            });
            document.body.appendChild(shootBtn);
        }        

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

        const [sendProjectile, getProjectile] = this.room.makeAction('projectile');
        this.sendProjectile = sendProjectile;
        getProjectile((data, peerId) => {
            if (peerId === selfId) return;
            const { position, direction, velocity } = data;
            this.createProjectile(position, direction, velocity);
        });

        const [sendTarget, getTarget] = this.room.makeAction('trg'); // Shortened name
        this.sendTarget = sendTarget;
        getTarget((data, peerId) => {
            if (peerId === selfId) return;
            const { position, broken, impactPoint, id } = data;
            
            if (broken) {
                // Find and break the target
                const target = this.breakableTargets.find(t => t.id === id);
                if (target) {
                    this.createDebris(target, new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z));
                    this.scene.remove(target.mesh);
                    this.physicsWorld.removeBody(target.body);
                    this.breakableTargets = this.breakableTargets.filter(t => t !== target);
                }
            }
        }); 
        
        const [sendInitialTargets, getInitialTargets] = this.room.makeAction('sync');
        this.sendInitialTargets = sendInitialTargets;

        // Listen for initial targets from other players
        getInitialTargets((targets, peerId) => {
            if (peerId === selfId) return;
            // Clear existing targets if we're receiving from an "older" peer
            this.breakableTargets = [];
            targets.forEach(targetData => {
                const position = new THREE.Vector3(
                    targetData.position.x,
                    targetData.position.y,
                    targetData.position.z
                );
                this.breakableTargets.push(this.createBreakableTarget(position));
            });
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

        if (this.targetSyncTimeout) {
            clearTimeout(this.targetSyncTimeout);
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
                mass: 1,
                type: CANNON.Body.DYNAMIC,
                position: new CANNON.Vec3(model.position.x, model.position.y, model.position.z),
                shape: shape,
                linearDamping: 0.3,
                angularDamping: 0.5, // Add angular damping to prevent spinning
                collisionFilterGroup: this.GROUPS.CHARACTER,
                collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.PROJECTILE | this.GROUPS.CHARACTER // Add CHARACTER here
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

    // Add this new method to handle target appearance changes
    updateTargetAppearance(target) {
        if (!target.mesh) return;

        // Calculate damage percentage
        const damagePercent = 100 - target.health;
        
        // Update material color based on damage
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x964B00), // Base brown color
            metalness: 0.2,
            roughness: 0.7 + (damagePercent / 100) * 0.3, // Increase roughness with damage
            emissive: new THREE.Color(0x771111), // Red glow
            emissiveIntensity: (damagePercent / 100) * 0.5 // Increase glow with damage
        });

        // Add cracks via opacity
        material.transparent = true;
        material.opacity = Math.max(0.4, 1 - (damagePercent / 100));

        target.mesh.material = material;

        // Add impact shake
        target.mesh.rotation.x += (Math.random() - 0.5) * 0.2;
        target.mesh.rotation.z += (Math.random() - 0.5) * 0.2;
    }

    // Add this method to create and throw projectiles
    throwProjectile() {
        if (!this.character) return;
        
        const now = Date.now();
        if (now - this.lastShot < this.shootCooldown) return;
        this.lastShot = now;

        // Get spawn position and direction
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.character.quaternion);
        const spawnPoint = this.character.position.clone().add(direction.multiplyScalar(1));
        
        // Create projectile locally
        this.createProjectile(spawnPoint, direction, this.projectileSpeed);
        
        // Broadcast projectile to other players
        if (this.sendProjectile) {
            this.sendProjectile({
                position: { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z },
                direction: { x: direction.x, y: direction.y, z: direction.z },
                velocity: this.projectileSpeed
            });
        }
    }

    createProjectile(position, direction, speed) {
        // Convert position and direction to Vector3 if they're plain objects
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
            collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.BREAKABLE | this.GROUPS.CHARACTER // Add CHARACTER here
        });
        body.position.copy(posVector);

        // Add velocity using the normalized direction vector
        const velocity = dirVector.normalize().multiplyScalar(speed);
        body.velocity.set(velocity.x, velocity.y + 2, velocity.z);

        this.physicsWorld.addBody(body);
        this.projectiles.push({ mesh, body, createTime: Date.now() });
    }

    // Update createBreakableTarget method:
    createBreakableTarget(position, id = null) {
        // Verify position doesn't overlap with existing targets
        const minDistance = 3; // Minimum distance between targets
        for (const target of this.breakableTargets) {
            const dist = position.distanceTo(target.mesh.position);
            if (dist < minDistance) {
                // Adjust position if too close
                position.x += minDistance * (Math.random() - 0.5);
                position.z += minDistance * (Math.random() - 0.5);
            }
        }

        const size = 2;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x964B00,
            metalness: 0.2,
            roughness: 0.7,
            emissive: 0x000000
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2));
        const body = new CANNON.Body({
            mass: 5,
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
            id: id || Math.random().toString(36).substr(2, 9)
        };

        // Store the ID on both mesh and body for easier lookup
        mesh.userData.targetId = target.id;
        body.targetId = target.id;

        return target;
    }

    createDebris(target, impactPoint) {
        const pieces = 20; // More debris pieces (increased from 8)
        const size = target.size.width / 6; // Smaller pieces (1/6 of original)

        for (let i = 0; i < pieces; i++) {
            // Random offset from center with wider spread
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * size * 4,
                (Math.random() - 0.5) * size * 4,
                (Math.random() - 0.5) * size * 4
            );
            
            // Create piece with random geometry
            const geometryType = Math.random() > 0.5 ? 
                new THREE.TetrahedronGeometry(size) : // Random sharp fragments
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

            // Physics for debris
            const shape = new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2));
            const body = new CANNON.Body({
                mass: 0.1, // Lighter pieces for more dynamic movement
                shape: shape,
                material: this.groundMaterial,
                collisionResponse: true,
                linearDamping: 0.1, // Less damping for more bouncy debris
                angularDamping: 0.1
            });
            body.position.copy(position);

            // Stronger explosion force
            const explosionForce = 25; // Increased from 10
            const direction = position.clone().sub(impactPoint).normalize();
            const force = direction.multiplyScalar(explosionForce);
            
            // Add more random upward force
            force.y += 10 + Math.random() * 10;

            // Add random rotation
            body.angularVelocity.set(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20
            );

            // Apply the explosion force
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

        // Set up camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Modified orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true; // Add smooth camera movement
        this.controls.dampingFactor = 0.05;
        this.controls.enablePan = false;
        this.controls.maxPolarAngle = Math.PI / 2.7; // Don't go below ground
        this.controls.minPolarAngle = Math.PI / 2.7; // Allow full vertical rotation
        this.controls.maxDistance = 10;
        this.controls.minDistance = 10;
        this.controls.zoomSpeed = 0.5;

        this.camera.position.set(0, 5, 10);

        const textureLoader = new THREE.TextureLoader();

        // Add a dark blue sky
        const skyColor = '#336dbf'; // Dark blue color

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
                linearDamping: 0.3,
                angularDamping: 0.5,
                collisionFilterGroup: this.GROUPS.CHARACTER,
                collisionFilterMask: this.GROUPS.GROUND | this.GROUPS.BREAKABLE | this.GROUPS.PROJECTILE | this.GROUPS.CHARACTER
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

        // Create breakable targets only if we're the first player
        if (Object.keys(this.room.getPeers()).length === 0) {
            // First player creates targets
            this.breakableTargets = [];
            const targets = [];
            for (let i = 0; i < 5; i++) {
                const position = new THREE.Vector3(
                    Math.random() * 20 - 10,
                    1,
                    Math.random() * 20 - 10
                );
                const id = Math.random().toString(36).substr(2, 9);
                const target = this.createBreakableTarget(position, id);
                this.breakableTargets.push(target);
                targets.push({
                    position: { x: position.x, y: position.y, z: position.z },
                    id: id
                });
            }
            
            // Send targets to other players
            if (this.sendInitialTargets) {
                setTimeout(() => {
                    this.sendInitialTargets(targets);
                }, 1000);
            }
        }

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

        // Get movement input
        let moveX = 0, moveZ = 0;
        if (this.keys['w'] || this.keys['arrowup']) moveZ -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) moveZ += 1;
        if (this.keys['a'] || this.keys['arrowleft']) moveX += 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX -= 1;

        // Mobile controls
        if (this.isMobile) {
            moveX += this.mobileMove.x;
            moveZ += this.mobileMove.y;
        }

        // Normalize movement vector
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        // In updateCharacterPhysics(), replace the movement and rotation code:
        if (len > 0) {
            moveX /= len;
            moveZ /= len;

            // Get camera's forward and right directions
            const cameraForward = new THREE.Vector3();
            const cameraRight = new THREE.Vector3();
            
            // Get camera direction
            this.camera.getWorldDirection(cameraForward);
            cameraRight.crossVectors(this.camera.up, cameraForward);
            
            // Remove vertical component
            cameraForward.y = 0;
            cameraRight.y = 0;
            
            // Normalize
            cameraForward.normalize();
            cameraRight.normalize();

            // Calculate movement direction
            const moveDir = new THREE.Vector3();
            moveDir.addScaledVector(cameraForward, -moveZ); // Keep this negative
            moveDir.addScaledVector(cameraRight, moveX);    // Keep this positive
            moveDir.normalize();

            // Apply movement
            this.characterBody.velocity.x = moveDir.x * this.characterSpeed;
            this.characterBody.velocity.z = moveDir.z * this.characterSpeed;

            // Fix character rotation to face movement direction
            const angle = Math.atan2(-moveDir.x, -moveDir.z); // Add negative signs here
            this.character.rotation.y = angle;
        } else {
            // Stop movement but keep rotation
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

        // Camera behavior
        if (this.character) {
            // Update orbit controls target to follow character
            this.controls.target.copy(this.character.position);
            
            // Update controls
            this.controls.update();
        }
        
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.mesh.position.copy(proj.body.position);
            proj.mesh.quaternion.copy(proj.body.quaternion);

            // Remove old projectiles
            if (Date.now() - proj.createTime > 5000) {
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
        
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const piece = this.debris[i];
            piece.mesh.position.copy(piece.body.position);
            piece.mesh.quaternion.copy(piece.body.quaternion);

            // Remove old debris after 5 seconds
            if (Date.now() - piece.createTime > 5000) {
                this.scene.remove(piece.mesh);
                this.physicsWorld.removeBody(piece.body);
                this.debris.splice(i, 1);
            }
        }

        const now = Date.now();
        if (now - this.lastTargetSync > this.targetSyncInterval) {
            this.lastTargetSync = now;
            if (this.sendInitialTargets && Object.keys(this.room.getPeers()).length > 0) {
                const targetsData = this.breakableTargets.map(target => ({
                    position: {
                        x: target.mesh.position.x,
                        y: target.mesh.position.y,
                        z: target.mesh.position.z
                    },
                    id: target.id
                }));
                this.sendInitialTargets(targetsData);
            }
        }
    }
}

export default TestLabScene;
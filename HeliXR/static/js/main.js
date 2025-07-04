class HeliXR3DViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.mixer = null; // For animations
        this.animationId = null;
        this.isWireframe = false;
        this.isAnimating = true;
        this.clock = new THREE.Clock(); // For animation timing
        
        this.init();
    }
    
    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupControls();
        this.loadModel();
        this.setupEventListeners();
        this.animate();
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        // Set background to match your color scheme
        this.scene.background = new THREE.Color(0x151019);
        
        // Add subtle fog for depth
        this.scene.fog = new THREE.Fog(0x151019, 50, 200);
    }
    
    setupCamera() {
        const container = document.getElementById('canvas-container');
        const aspect = container.clientWidth / container.clientHeight;
        
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(15, 10, 15);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupRenderer() {
        const container = document.getElementById('canvas-container');
        
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        
        this.renderer.domElement.id = 'three-canvas';
        container.appendChild(this.renderer.domElement);
    }
    
    setupLights() {
        // Ambient light for overall illumination
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        // Main directional light (orange tint to match theme)
        const mainLight = new THREE.DirectionalLight(0xEC4E20, 1.2);
        mainLight.position.set(20, 20, 10);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 500;
        this.scene.add(mainLight);
        
        // Secondary light (white fill light)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
        fillLight.position.set(-10, 15, -10);
        this.scene.add(fillLight);
        
        // Rim light for definition
        const rimLight = new THREE.DirectionalLight(0xDB8A74, 0.5);
        rimLight.position.set(0, -10, -20);
        this.scene.add(rimLight);
        
        // Point light for additional highlights
        const pointLight = new THREE.PointLight(0xEC4E20, 0.8, 100);
        pointLight.position.set(10, 10, 10);
        this.scene.add(pointLight);
    }
    
    setupControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        this.controls.maxDistance = 50;
        this.controls.minDistance = 5;
        this.controls.maxPolarAngle = Math.PI / 1.5;
        
        // Set the target to origin for proper centering
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }
    
    loadModel() {
        const loader = new THREE.GLTFLoader();
        const loadingElement = document.getElementById('loading-spinner');
        
        // Replace 'your-model.glb' with the actual path to your GLB file
        loader.load(
            '/static/models/model.glb', // Update this path to your GLB file
            (gltf) => {
                this.model = gltf.scene;
                
                // IMPROVED CENTERING LOGIC
                const box = new THREE.Box3().setFromObject(gltf.scene);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                
                console.log('Model bounds:', {
                    center: center,
                    size: size,
                    min: box.min,
                    max: box.max
                });
                
                // Create a group to contain the model for easier manipulation
                const modelGroup = new THREE.Group();
                modelGroup.add(gltf.scene);
                
                // Center the model at origin (0, 0, 0)
                gltf.scene.position.set(-center.x, -center.y, -center.z);
                
                // Scale the model to fit nicely in view
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 10 / maxDim; // Adjusted scale for better visibility
                modelGroup.scale.setScalar(scale);
                
                // Position the group at origin
                modelGroup.position.set(0, 0, 0);
                
                // Setup animations if they exist
                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(gltf.scene);
                    
                    // Play all animations
                    gltf.animations.forEach((clip) => {
                        const action = this.mixer.clipAction(clip);
                        action.play();
                    });
                    
                    console.log(`Loaded ${gltf.animations.length} animations`);
                }
                
                // Apply materials and shadows
                gltf.scene.traverse((child) => {
                    if (child.isMesh) {
                        // Enhance existing materials
                        if (child.material) {
                            // Store original material
                            child.userData = { originalMaterial: child.material.clone() };
                            
                            // Enhance material properties
                            if (child.material.map) {
                                child.material.map.flipY = false;
                            }
                            
                            // Add HeliXR color accent if material is too plain
                            if (!child.material.color || child.material.color.getHex() === 0x000000) {
                                child.material.color = new THREE.Color(0x888888);
                            }
                        } else {
                            // Create new material if none exists
                            child.material = new THREE.MeshPhongMaterial({
                                color: 0x888888,
                                shininess: 100,
                                specular: 0xEC4E20
                            });
                            child.userData = { originalMaterial: child.material };
                        }
                        
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // Add the group to the scene instead of the raw model
                this.model = modelGroup;
                this.scene.add(modelGroup);
                
                // Update camera and controls to focus on the centered model
                this.resetView();
                
                loadingElement.style.display = 'none';
                
                console.log('GLB model loaded and centered successfully');
                
                // Log model info
                console.log('Model info:', {
                    animations: gltf.animations?.length || 0,
                    scenes: gltf.scenes?.length || 0,
                    cameras: gltf.cameras?.length || 0,
                    finalPosition: modelGroup.position,
                    finalScale: modelGroup.scale
                });
            },
            (progress) => {
                const percentComplete = (progress.loaded / progress.total * 100);
                console.log(percentComplete + '% loaded');
                
                // Update loading text
                const loadingText = loadingElement.querySelector('span');
                if (loadingText) {
                    loadingText.textContent = `Loading 3D Model... ${Math.round(percentComplete)}%`;
                }
            },
            (error) => {
                console.error('Error loading GLB model:', error);
                loadingElement.innerHTML = `
                    <div style="color: #EC4E20;">
                        <h3>Model Loading Error</h3>
                        <p>Please ensure your 3D model is placed in /static/models/ as a .glb file</p>
                        <p style="font-size: 0.8em; opacity: 0.7;">For now, showing a placeholder model</p>
                    </div>
                `;
                
                // Create a placeholder model if GLB fails to load
                this.createPlaceholderModel();
            }
        );
    }
    
    createPlaceholderModel() {
        // Create a stylized industrial valve placeholder
        const group = new THREE.Group();
        
        // Main valve body - ALREADY CENTERED
        const bodyGeometry = new THREE.CylinderGeometry(2, 2, 4, 12);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0x666666,
            shininess: 100,
            specular: 0xEC4E20
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);
        
        // Top flange
        const flangeGeometry = new THREE.CylinderGeometry(2.5, 2.5, 0.3, 12);
        const flangeTop = new THREE.Mesh(flangeGeometry, bodyMaterial);
        flangeTop.position.y = 2.15;
        flangeTop.castShadow = true;
        group.add(flangeTop);
        
        // Bottom flange
        const flangeBottom = new THREE.Mesh(flangeGeometry, bodyMaterial);
        flangeBottom.position.y = -2.15;
        flangeBottom.castShadow = true;
        group.add(flangeBottom);
        
        // Control actuator
        const actuatorGeometry = new THREE.BoxGeometry(1, 2, 1);
        const actuatorMaterial = new THREE.MeshPhongMaterial({
            color: 0xEC4E20,
            shininess: 100
        });
        const actuator = new THREE.Mesh(actuatorGeometry, actuatorMaterial);
        actuator.position.set(2.5, 0, 0);
        actuator.castShadow = true;
        group.add(actuator);
        
        // Control wheel
        const wheelGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 8);
        const wheel = new THREE.Mesh(wheelGeometry, actuatorMaterial);
        wheel.position.set(2.5, 1.5, 0);
        wheel.rotation.x = Math.PI / 2;
        wheel.castShadow = true;
        group.add(wheel);
        
        // Connecting pipes
        const pipeGeometry = new THREE.CylinderGeometry(0.4, 0.4, 6, 8);
        const pipeMaterial = new THREE.MeshPhongMaterial({
            color: 0x999999,
            shininess: 80
        });
        
        // Input pipe
        const inputPipe = new THREE.Mesh(pipeGeometry, pipeMaterial);
        inputPipe.position.set(0, 0, -5);
        inputPipe.rotation.x = Math.PI / 2;
        inputPipe.castShadow = true;
        group.add(inputPipe);
        
        // Output pipe
        const outputPipe = new THREE.Mesh(pipeGeometry, pipeMaterial);
        outputPipe.position.set(0, 0, 5);
        outputPipe.rotation.x = Math.PI / 2;
        outputPipe.castShadow = true;
        group.add(outputPipe);
        
        // Add some industrial details
        for (let i = 0; i < 8; i++) {
            const boltGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6);
            const boltMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
            const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
            
            const angle = (i / 8) * Math.PI * 2;
            bolt.position.x = Math.cos(angle) * 2.2;
            bolt.position.z = Math.sin(angle) * 2.2;
            bolt.position.y = 2.15;
            bolt.castShadow = true;
            group.add(bolt);
        }
        
        // The placeholder is already centered at origin
        group.position.set(0, 0, 0);
        
        this.model = group;
        this.scene.add(group);
        
        // Hide loading spinner
        document.getElementById('loading-spinner').style.display = 'none';
        
        console.log('Placeholder industrial valve model created and centered');
    }
    
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Control buttons
        document.getElementById('resetView')?.addEventListener('click', () => this.resetView());
        document.getElementById('toggleWireframe')?.addEventListener('click', () => this.toggleWireframe());
        document.getElementById('toggleAnimation')?.addEventListener('click', () => this.toggleAnimation());
    }
    
    onWindowResize() {
        const container = document.getElementById('canvas-container');
        const aspect = container.clientWidth / container.clientHeight;
        
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }
    
    resetView() {
        // Smooth camera transition to optimal viewing position
        const targetPosition = { x: 15, y: 10, z: 15 };
        const currentPosition = this.camera.position;
        
        // Animate camera movement
        const animateCamera = () => {
            const progress = 0.1;
            currentPosition.x += (targetPosition.x - currentPosition.x) * progress;
            currentPosition.y += (targetPosition.y - currentPosition.y) * progress;
            currentPosition.z += (targetPosition.z - currentPosition.z) * progress;
            
            this.camera.position.copy(currentPosition);
            
            // Make sure camera looks at center
            this.camera.lookAt(0, 0, 0);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
            
            // Continue animation if not close enough
            if (Math.abs(currentPosition.x - targetPosition.x) > 0.1) {
                requestAnimationFrame(animateCamera);
            }
        };
        
        animateCamera();
    }
    
    toggleWireframe() {
        this.isWireframe = !this.isWireframe;
        
        if (this.model) {
            this.model.traverse((child) => {
                if (child.isMesh) {
                    if (this.isWireframe) {
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0xEC4E20,
                            wireframe: true
                        });
                    } else {
                        child.material = child.userData.originalMaterial || new THREE.MeshPhongMaterial({
                            color: 0x888888,
                            shininess: 100,
                            specular: 0xEC4E20
                        });
                    }
                }
            });
        }
    }
    
    toggleAnimation() {
        this.isAnimating = !this.isAnimating;
        const btn = document.getElementById('toggleAnimation');
        btn.textContent = this.isAnimating ? 'Stop Animation' : 'Start Animation';
        
        // If there are built-in animations, pause/resume them
        if (this.mixer) {
            if (this.isAnimating) {
                this.mixer.timeScale = 1;
            } else {
                this.mixer.timeScale = 0;
            }
        }
    }
    
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        
        // Update animation mixer for GLB animations
        if (this.mixer) {
            this.mixer.update(delta);
        }
        
        // Rotate model slowly if custom animation is enabled
        if (this.model && this.isAnimating && !this.mixer) {
            this.model.rotation.y += 0.005;
        }
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        if (this.controls) {
            this.controls.dispose();
        }
        
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
    }
}

// Initialize the 3D viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const viewer = new HeliXR3DViewer();
    
    // Store reference for potential cleanup
    window.heliXRViewer = viewer;
});

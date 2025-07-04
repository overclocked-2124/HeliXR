document.addEventListener('DOMContentLoaded', () => {
    class VisualHeliXR3DViewer {
        constructor() {
            this.scene = null;
            this.camera = null;
            this.renderer = null;
            this.controls = null;
            this.model = null;
            this.mixer = null;
            this.animationId = null;
            this.isWireframe = false;
            this.isAnimating = true;
            this.clock = new THREE.Clock();
            
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
            this.scene.background = new THREE.Color(0x151019);
            this.scene.fog = new THREE.Fog(0x151019, 50, 200);
        }
        
        setupCamera() {
            const container = document.getElementById('visual-canvas-container');
            const aspect = container.clientWidth / container.clientHeight;
            
            this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
            this.camera.position.set(15, 10, 15);
            this.camera.lookAt(0, 0, 0);
        }
        
        setupRenderer() {
            const container = document.getElementById('visual-canvas-container');
            
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
            
            this.renderer.domElement.id = 'visual-three-canvas';
            container.appendChild(this.renderer.domElement);
        }
        
        setupLights() {
            const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
            this.scene.add(ambientLight);
            
            const mainLight = new THREE.DirectionalLight(0xEC4E20, 1.2);
            mainLight.position.set(20, 20, 10);
            mainLight.castShadow = true;
            mainLight.shadow.mapSize.width = 2048;
            mainLight.shadow.mapSize.height = 2048;
            mainLight.shadow.camera.near = 0.5;
            mainLight.shadow.camera.far = 500;
            this.scene.add(mainLight);
            
            const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
            fillLight.position.set(-10, 15, -10);
            this.scene.add(fillLight);
            
            const rimLight = new THREE.DirectionalLight(0xDB8A74, 0.5);
            rimLight.position.set(0, -10, -20);
            this.scene.add(rimLight);
            
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
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
        
        loadModel() {
            const loader = new THREE.GLTFLoader();
            const loadingElement = document.getElementById('visual-loading-spinner');
            
            loader.load(
                '/static/models/model.glb',
                (gltf) => {
                    this.model = gltf.scene;
                    
                    const box = new THREE.Box3().setFromObject(gltf.scene);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    
                    const modelGroup = new THREE.Group();
                    modelGroup.add(gltf.scene);
                    
                    gltf.scene.position.set(-center.x, -center.y, -center.z);
                    
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scale = 10 / maxDim;
                    modelGroup.scale.setScalar(scale);
                    modelGroup.position.set(0, 0, 0);
                    
                    if (gltf.animations && gltf.animations.length > 0) {
                        this.mixer = new THREE.AnimationMixer(gltf.scene);
                        gltf.animations.forEach((clip) => {
                            const action = this.mixer.clipAction(clip);
                            action.play();
                        });
                    }
                    
                    gltf.scene.traverse((child) => {
                        if (child.isMesh) {
                            if (child.material) {
                                child.userData = { originalMaterial: child.material.clone() };
                                if (child.material.map) {
                                    child.material.map.flipY = false;
                                }
                                if (!child.material.color || child.material.color.getHex() === 0x000000) {
                                    child.material.color = new THREE.Color(0x888888);
                                }
                            } else {
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
                    
                    this.model = modelGroup;
                    this.scene.add(modelGroup);
                    this.resetView();
                    loadingElement.style.display = 'none';
                    console.log('Visual GLB model loaded successfully');
                },
                (progress) => {
                    const percentComplete = (progress.loaded / progress.total * 100);
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
                            <p>Using placeholder model</p>
                        </div>
                    `;
                    this.createPlaceholderModel();
                }
            );
        }
        
        createPlaceholderModel() {
            const group = new THREE.Group();
            
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
            
            const actuatorGeometry = new THREE.BoxGeometry(1, 2, 1);
            const actuatorMaterial = new THREE.MeshPhongMaterial({
                color: 0xEC4E20,
                shininess: 100
            });
            const actuator = new THREE.Mesh(actuatorGeometry, actuatorMaterial);
            actuator.position.set(2.5, 0, 0);
            actuator.castShadow = true;
            group.add(actuator);
            
            group.position.set(0, 0, 0);
            this.model = group;
            this.scene.add(group);
            document.getElementById('visual-loading-spinner').style.display = 'none';
        }
        
        setupEventListeners() {
            window.addEventListener('resize', () => this.onWindowResize());
            document.getElementById('resetVisualView')?.addEventListener('click', () => this.resetView());
            document.getElementById('toggleVisualWireframe')?.addEventListener('click', () => this.toggleWireframe());
            document.getElementById('toggleVisualAnimation')?.addEventListener('click', () => this.toggleAnimation());
        }
        
        onWindowResize() {
            const container = document.getElementById('visual-canvas-container');
            const aspect = container.clientWidth / container.clientHeight;
            
            this.camera.aspect = aspect;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        }
        
        resetView() {
            const targetPosition = { x: 15, y: 10, z: 15 };
            const currentPosition = this.camera.position;
            
            const animateCamera = () => {
                const progress = 0.1;
                currentPosition.x += (targetPosition.x - currentPosition.x) * progress;
                currentPosition.y += (targetPosition.y - currentPosition.y) * progress;
                currentPosition.z += (targetPosition.z - currentPosition.z) * progress;
                
                this.camera.position.copy(currentPosition);
                this.camera.lookAt(0, 0, 0);
                this.controls.target.set(0, 0, 0);
                this.controls.update();
                
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
            const btn = document.getElementById('toggleVisualAnimation');
            btn.textContent = this.isAnimating ? 'Stop Animation' : 'Start Animation';
            
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
            
            if (this.mixer) {
                this.mixer.update(delta);
            }
            
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

    // Initialize the 3D viewer
    const visualViewer = new VisualHeliXR3DViewer();
    
    // Store reference for cleanup
    window.visualHeliXRViewer = visualViewer;

    if (window.startMonitoring) {
    window.startMonitoring();
  }
});
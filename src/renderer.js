import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { DIRS, bridgeAt, doorAt, laserAt, requiresAreOn, switchAt } from "./engine.js";

const MODEL_ASSETS = {
    player: {
        url: "vendor/3d%20model%20for%20robot/source/deadnaut.fast.glb",
        targetHeight: 2.18,
        yOffset: -.18,
        rotation: [0, Math.PI, 0]
    },
    exit: {
        url: "vendor/server_rack/server-rack.fast.glb",
        targetHeight: 2.05,
        yOffset: -.36,
        rotation: [0, Math.PI, 0]
    }
};

export class GameRenderer {
    constructor({ canvas, host, settings }) {
        this.canvas = canvas;
        this.host = host;
        this.settings = settings;
        this.cell = 2.72;
        this.tileSize = 2.38;
        this.baseY = 0.34;
        this.level = null;
        this.state = null;
        this.tweens = [];
        this.particles = [];
        this.pathMarkers = [];
        this.environmentStrips = [];
        this.clock = new THREE.Clock();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x071014);
        this.scene.fog = new THREE.Fog(0x071014, 22, 48);

        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 140);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.applyRenderQuality();

        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 7;
        this.controls.maxDistance = 30;
        this.controls.maxPolarAngle = Math.PI * 0.48;

        this.world = new THREE.Group();
        this.boardGroup = new THREE.Group();
        this.entityGroup = new THREE.Group();
        this.fxGroup = new THREE.Group();
        this.world.add(this.boardGroup, this.entityGroup, this.fxGroup);
        this.scene.add(this.world);

        this.objects = {
            tiles: [],
            bridges: [],
            chips: [],
            doors: [],
            switches: [],
            guards: [],
            enemies: [],
            cables: [],
            lasers: [],
            obstacles: [],
            exit: null,
            player: null
        };

        this.gltfLoader = new GLTFLoader();
        this.modelAssets = Object.fromEntries(Object.entries(MODEL_ASSETS).map(([key, config]) => [key, {
            ...config,
            scene: null,
            promise: null,
            failed: false
        }]));
        this.heroTexture = this.makeHeroFallbackTexture();
        Object.keys(this.modelAssets).forEach((key) => this.preloadModel(key));
        this.mats = this.makeMaterials();
        this.setupLights();
        this.resize();
        window.addEventListener("resize", () => this.resize());
        this.tick();
    }

    makeMaterials() {
        const shared = {
            tileA: new THREE.MeshStandardMaterial({ color: 0x26394a, roughness: .82, metalness: .08 }),
            tileB: new THREE.MeshStandardMaterial({ color: 0x304655, roughness: .78, metalness: .10 }),
            edge: new THREE.LineBasicMaterial({ color: 0x67d7d3, transparent: true, opacity: .28 }),
            obstacle: new THREE.MeshStandardMaterial({ color: 0x202832, roughness: .68, metalness: .16 }),
            chip: new THREE.MeshStandardMaterial({ color: 0xffc857, emissive: 0xff9c2a, emissiveIntensity: .7, roughness: .18, metalness: .12 }),
            player: new THREE.MeshStandardMaterial({ color: 0x5ca9ff, roughness: .48, metalness: .16 }),
            playerDark: new THREE.MeshStandardMaterial({ color: 0x101820, roughness: .68, metalness: .18 }),
            glass: new THREE.MeshPhysicalMaterial({
                color: 0x7fe9ff,
                transmission: .28,
                opacity: .22,
                transparent: true,
                roughness: .04,
                metalness: 0,
                clearcoat: 1,
                clearcoatRoughness: .1,
                depthWrite: false,
                side: THREE.DoubleSide
            }),
            path: new THREE.MeshBasicMaterial({ color: 0x99ffdf, transparent: true, opacity: .36, depthWrite: false }),
            bridgeOff: new THREE.MeshStandardMaterial({ color: 0x0b1118, transparent: true, opacity: .28, roughness: .72, metalness: .22 }),
            laser: new THREE.MeshBasicMaterial({ color: 0xff4d5f, transparent: true, opacity: .72, depthWrite: false }),
            portal: new THREE.MeshStandardMaterial({ color: 0x17d6c3, emissive: 0x17d6c3, emissiveIntensity: .65, roughness: .22, metalness: .18 }),
            neon: new THREE.MeshBasicMaterial({ color: 0x17d6c3, transparent: true, opacity: .7 }),
            amberNeon: new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: .74 }),
            darkPanel: new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: .8, metalness: .25 }),
            shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false })
        };
        Object.values(shared).forEach((mat) => {
            mat.userData.shared = true;
        });
        return shared;
    }

    setupLights() {
        this.scene.add(new THREE.HemisphereLight(0xdffcff, 0x1d1410, 1.25));
        const key = new THREE.DirectionalLight(0xffffff, 2.25);
        key.position.set(8, 14, -10);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.bias = -.0005;
        key.shadow.camera.left = -22;
        key.shadow.camera.right = 22;
        key.shadow.camera.top = 22;
        key.shadow.camera.bottom = -22;
        this.scene.add(key);
        const cyan = new THREE.PointLight(0x17d6c3, 40, 30);
        cyan.position.set(-10, 6, -8);
        this.scene.add(cyan);
        const amber = new THREE.PointLight(0xffc857, 16, 24);
        amber.position.set(9, 5, 7);
        this.scene.add(amber);
    }

    setLevel(level, state) {
        this.level = level;
        this.state = state;
        this.clearGroup(this.boardGroup);
        this.clearGroup(this.entityGroup);
        this.clearGroup(this.fxGroup);
        this.pathMarkers = [];
        this.particles = [];
        this.environmentStrips = [];
        this.objects = {
            tiles: [],
            bridges: [],
            chips: [],
            doors: [],
            switches: [],
            guards: [],
            enemies: [],
            cables: [],
            lasers: [],
            obstacles: [],
            exit: null,
            player: null
        };
        this.buildBoard(level);
        this.buildEntities(level);
        this.objects.player = this.createPlayer();
        this.entityGroup.add(this.objects.player);
        this.syncState(state);
        this.applyCamera(true);
    }

    buildBoard(level) {
        const tileGeo = new THREE.BoxGeometry(this.tileSize, .34, this.tileSize);
        const edgeGeo = new THREE.EdgesGeometry(tileGeo);
        const offset = this.offset(level.grid);
        for (let y = 0; y < level.grid; y++) {
            for (let x = 0; x < level.grid; x++) {
                const tile = new THREE.Group();
                const bridge = bridgeAt(level, x, y);
                const mat = bridge ? this.mats.bridgeOff : ((x + y) % 2 ? this.mats.tileA : this.mats.tileB);
                const mesh = new THREE.Mesh(tileGeo, mat);
                mesh.receiveShadow = true;
                const edge = new THREE.LineSegments(edgeGeo, this.mats.edge);
                tile.add(mesh, edge);
                tile.position.set(offset + x * this.cell, 0, offset + y * this.cell);
                tile.userData = { x, y, bridge: Boolean(bridge), mesh };
                this.boardGroup.add(tile);
                this.objects.tiles.push(tile);
            }
        }

        const under = new THREE.Mesh(
            new THREE.BoxGeometry(level.grid * this.cell + .7, .18, level.grid * this.cell + .7),
            new THREE.MeshStandardMaterial({ color: 0x111820, roughness: .85, metalness: .28 })
        );
        under.position.y = -.36;
        under.receiveShadow = true;
        this.boardGroup.add(under);
        this.createArenaEnvironment(level);
    }

    createArenaEnvironment(level) {
        const span = (level.grid - 1) * this.cell + this.tileSize;
        const outer = span + 2.2;
        const half = outer / 2;
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(outer, .12, outer),
            this.mats.darkPanel
        );
        deck.position.y = -.58;
        deck.receiveShadow = true;
        this.boardGroup.add(deck);

        const railLong = new THREE.BoxGeometry(outer, .08, .12);
        const railShort = new THREE.BoxGeometry(.12, .08, outer);
        [
            [0, .06, -half, railLong, this.mats.neon],
            [0, .06, half, railLong, this.mats.neon],
            [-half, .06, 0, railShort, this.mats.neon],
            [half, .06, 0, railShort, this.mats.neon]
        ].forEach(([x, y, z, geo, mat]) => {
            const rail = new THREE.Mesh(geo, mat);
            rail.position.set(x, y, z);
            this.boardGroup.add(rail);
        });

        const pulseMatA = this.mats.neon.clone();
        const pulseMatB = this.mats.amberNeon.clone();
        const laneGeo = new THREE.BoxGeometry(.08, .035, outer - 1.4);
        for (let i = -2; i <= 2; i++) {
            const lane = new THREE.Mesh(laneGeo, i % 2 ? pulseMatA.clone() : pulseMatB.clone());
            lane.position.set(i * this.cell * .82, -.48, 0);
            lane.userData.phase = i * .7;
            this.boardGroup.add(lane);
            this.environmentStrips.push(lane);
        }

        const pylonGeo = new THREE.BoxGeometry(.42, .9, .42);
        const capGeo = new THREE.BoxGeometry(.7, .08, .7);
        [
            [-half, -half],
            [half, -half],
            [-half, half],
            [half, half]
        ].forEach(([x, z], index) => {
            const pylon = new THREE.Group();
            const body = new THREE.Mesh(pylonGeo, this.mats.darkPanel);
            body.position.y = -.08;
            const cap = new THREE.Mesh(capGeo, index % 2 ? this.mats.amberNeon : this.mats.neon);
            cap.position.y = .4;
            pylon.add(body, cap);
            pylon.position.set(x, 0, z);
            this.boardGroup.add(pylon);
            this.environmentStrips.push(cap);
        });
    }

    buildEntities(level) {
        (level.obstacles || []).forEach((item) => {
            const mesh = this.createObstacle();
            mesh.position.copy(this.gridToWorld(item.x, item.y, .52));
            this.entityGroup.add(mesh);
            this.objects.obstacles.push(mesh);
        });
        (level.chips || []).forEach((chip, index) => {
            const mesh = this.createChip(index);
            mesh.position.copy(this.gridToWorld(chip.x, chip.y, .92));
            mesh.userData.onExit = chip.x === level.exit.x && chip.y === level.exit.y;
            this.entityGroup.add(mesh);
            this.objects.chips.push(mesh);
        });
        (level.switches || []).forEach((sw, index) => {
            const mesh = this.createSwitch(sw);
            mesh.position.copy(this.gridToWorld(sw.x, sw.y, .30));
            this.entityGroup.add(mesh);
            this.objects.switches[index] = mesh;
        });
        (level.cables || []).forEach((cable, index) => {
            const mesh = this.createCable(cable);
            mesh.position.copy(this.gridToWorld(cable.x, cable.y, .28));
            this.entityGroup.add(mesh);
            this.objects.cables[index] = mesh;
        });
        (level.bridges || []).forEach((bridge, bridgeIndex) => {
            bridge.cells.forEach((cell) => {
                const pad = this.createBridgePad(bridge);
                pad.position.copy(this.gridToWorld(cell.x, cell.y, .22));
                pad.userData.bridgeIndex = bridgeIndex;
                this.entityGroup.add(pad);
                this.objects.bridges.push(pad);
            });
        });
        (level.doors || []).forEach((door, index) => {
            const mesh = this.createDoor(door);
            mesh.position.copy(this.gridToWorld(door.x, door.y, .92));
            this.entityGroup.add(mesh);
            this.objects.doors[index] = mesh;
        });
        (level.guards || []).forEach((guard, index) => {
            const mesh = this.createGuard(guard);
            const point = guard.path[(guard.phase || 0) % guard.path.length];
            mesh.position.copy(this.gridToWorld(point.x, point.y, .66));
            this.entityGroup.add(mesh);
            this.objects.guards[index] = mesh;
        });
        (level.enemies || []).forEach((enemy, index) => {
            const mesh = this.createEnemy(enemy);
            mesh.position.copy(this.gridToWorld(enemy.x, enemy.y, .62));
            this.entityGroup.add(mesh);
            this.objects.enemies[index] = mesh;
        });
        (level.lasers || []).forEach((laser, laserIndex) => {
            laser.cells.forEach((cell) => {
                const beam = this.createLaser(laser);
                beam.position.copy(this.gridToWorld(cell.x, cell.y, .78));
                beam.userData.laserIndex = laserIndex;
                beam.userData.cell = cell;
                this.entityGroup.add(beam);
                this.objects.lasers.push(beam);
            });
        });
        this.objects.exit = this.createPortal();
        this.objects.exit.position.copy(this.gridToWorld(level.exit.x, level.exit.y, .62));
        this.entityGroup.add(this.objects.exit);
    }

    createObstacle() {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.02, .82, 1.02), this.mats.obstacle);
        base.castShadow = true;
        base.receiveShadow = true;
        const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: .45, metalness: .08 });
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.08, .12, 1.08), stripeMat);
        stripe.position.y = .18;
        const top = new THREE.Mesh(new THREE.ConeGeometry(.46, .5, 4), this.mats.obstacle);
        top.position.y = .64;
        top.rotation.y = Math.PI / 4;
        group.add(base, stripe, top);
        return group;
    }

    createChip(index) {
        const group = new THREE.Group();
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0), this.mats.chip);
        gem.castShadow = true;
        const halo = new THREE.Mesh(
            new THREE.CylinderGeometry(.52, .52, .035, 28),
            new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: .2, depthWrite: false })
        );
        halo.position.y = -.43;
        group.add(gem, halo);
        group.userData.index = index;
        return group;
    }

    createSwitch(sw) {
        const color = sw.color || 0x17d6c3;
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .12, roughness: .36, metalness: .18 });
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(.46, .54, .18, 36), mat);
        const button = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .16, 28), mat);
        button.position.y = .16;
        const light = new THREE.PointLight(color, 1.5, 4);
        light.position.y = .35;
        group.add(base, button, light);
        group.userData.power = sw.power;
        return group;
    }

    createCable(cable) {
        const color = cable.color || 0xffc857;
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35, roughness: .32, metalness: .18 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: .8, metalness: .2 });
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(.58, .58, .08, 36), dark);
        const lineA = new THREE.Mesh(new THREE.BoxGeometry(1.15, .08, .12), mat);
        const lineB = new THREE.Mesh(new THREE.BoxGeometry(.12, .08, 1.15), mat);
        lineA.position.y = .08;
        lineB.position.y = .1;
        const spark = new THREE.PointLight(color, 1.8, 4);
        spark.position.y = .38;
        group.add(base, lineA, lineB, spark);
        group.userData.cableId = cable.id;
        return group;
    }

    createBridgePad(bridge) {
        const color = bridge.color || 0x5ca9ff;
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .25, transparent: true, opacity: .62, roughness: .38, metalness: .12 });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(1.55, .08, 1.55), mat);
        pad.receiveShadow = true;
        pad.userData.requires = bridge.requires || [];
        return pad;
    }

    createDoor(door) {
        const color = door.color || 0x17d6c3;
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: .48, metalness: .32 });
        const glowMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .5, roughness: .2, metalness: .1 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.38, .22), mat);
        body.castShadow = true;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(.84, .12, .26), glowMat);
        bar.position.y = .22;
        const top = bar.clone();
        top.position.y = -.18;
        const light = new THREE.PointLight(color, 2.2, 5);
        light.position.y = .2;
        group.add(body, bar, top, light);
        group.userData.requires = door.requires || [];
        return group;
    }

    createGuard(guard) {
        const color = guard.color || 0xff6b6b;
        const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: .42, metalness: .28 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: .66, metalness: .2 });
        const eye = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: .95 });
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(.34, .66, 6, 16), bodyMat);
        body.position.y = .36;
        body.castShadow = true;
        const head = new THREE.Mesh(new THREE.BoxGeometry(.66, .42, .48), dark);
        head.position.y = .95;
        head.castShadow = true;
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), eye);
        const eyeR = eyeL.clone();
        eyeL.position.set(-.16, .98, -.25);
        eyeR.position.set(.16, .98, -.25);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 8), eye);
        dot.position.y = 1.36;
        group.add(body, head, eyeL, eyeR, dot);
        group.userData.name = guard.name;
        return group;
    }

    createEnemy(enemy) {
        const color = enemy.color || 0xff4d5f;
        const bodyMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .12, roughness: .5, metalness: .2 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x080b0f, roughness: .7, metalness: .25 });
        const eye = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(.38, .82, 8), bodyMat);
        body.position.y = .42;
        body.rotation.x = Math.PI;
        body.castShadow = true;
        const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 18, 12), dark);
        head.position.y = .92;
        head.castShadow = true;
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), eye);
        const eyeR = eyeL.clone();
        eyeL.position.set(-.1, .95, -.24);
        eyeR.position.set(.1, .95, -.24);
        const light = new THREE.PointLight(color, 1.8, 4);
        light.position.y = .85;
        group.add(body, head, eyeL, eyeR, light);
        group.userData.name = enemy.name;
        return group;
    }

    createLaser(laser) {
        const group = new THREE.Group();
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1.72, .06, .18), this.mats.laser);
        const beam2 = new THREE.Mesh(new THREE.BoxGeometry(.18, .06, 1.72), this.mats.laser);
        const light = new THREE.PointLight(laser.color || 0xff4d5f, 2.6, 4);
        group.add(beam, beam2, light);
        group.userData.cells = laser.cells;
        return group;
    }

    createPortal() {
        const group = new THREE.Group();
        const fallback = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.64, .065, 14, 54), this.mats.portal);
        ring.rotation.x = Math.PI / 2;
        ring.castShadow = true;
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(.72, .72, .10, 48), new THREE.MeshBasicMaterial({ color: 0x17d6c3, transparent: true, opacity: .28 }));
        pad.position.y = -.35;
        fallback.add(ring, pad);
        const light = new THREE.PointLight(0x17d6c3, 3.2, 6);
        light.position.y = 1.15;
        group.add(fallback, light);
        group.userData.fallback = fallback;
        group.userData.spinTarget = fallback;
        this.mountModel(group, "exit");
        return group;
    }

    createPlayer() {
        const root = new THREE.Group();
        const fallback = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(.36, .72, 8, 18), this.mats.player);
        body.position.y = .55;
        body.castShadow = true;
        const head = new THREE.Mesh(new THREE.BoxGeometry(.58, .40, .46), this.mats.playerDark);
        head.position.y = 1.12;
        head.castShadow = true;
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x99ffdf });
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 8), eyeMat);
        const eyeR = eyeL.clone();
        eyeL.position.set(-.13, 1.14, -.25);
        eyeR.position.set(.13, 1.14, -.25);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, 1.34, 40, 1, true), this.mats.glass);
        glass.position.y = .76;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heroTexture, transparent: true, depthTest: false, depthWrite: false }));
        sprite.position.set(0, 1.08, .02);
        sprite.scale.set(1.18, 1.78, 1);
        sprite.renderOrder = 10;
        fallback.add(body, head, eyeL, eyeR, glass, sprite);
        fallback.userData.basePosition = fallback.position.clone();
        fallback.userData.baseRotation = fallback.rotation.clone();
        const shadow = this.createSoftShadow(1.12, .86);
        root.add(shadow, fallback);
        root.userData.fallback = fallback;
        root.userData.visualRoot = fallback;
        root.userData.sprite = sprite;
        this.mountModel(root, "player");
        return root;
    }

    createSoftShadow(width, depth) {
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), this.mats.shadow);
        shadow.rotation.x = -Math.PI / 2;
        shadow.scale.set(width, depth, 1);
        shadow.position.y = -.16;
        shadow.renderOrder = -1;
        return shadow;
    }

    preloadModel(key) {
        const asset = this.modelAssets[key];
        if (!asset) return Promise.resolve(null);
        if (asset.promise) return asset.promise;
        asset.promise = new Promise((resolve) => {
            this.gltfLoader.load(asset.url, (gltf) => {
                asset.scene = gltf.scene;
                this.prepareModelAsset(asset.scene, key);
                resolve(asset.scene);
            }, undefined, (error) => {
                asset.failed = true;
                console.warn(`Unable to load ${key} model from ${asset.url}`, error);
                resolve(null);
            });
        });
        return asset.promise;
    }

    prepareModelAsset(root, key) {
        root.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = key !== "player";
            if (child.geometry) child.geometry.userData.shared = true;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.filter(Boolean).forEach((material) => {
                material.userData.shared = true;
                if (material.emissiveMap) material.emissiveIntensity = Math.max(material.emissiveIntensity || 1, 1.15);
                [
                    material.map,
                    material.normalMap,
                    material.roughnessMap,
                    material.metalnessMap,
                    material.emissiveMap,
                    material.aoMap
                ].filter(Boolean).forEach((texture) => {
                    texture.anisotropy = 1;
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = false;
                    texture.needsUpdate = true;
                });
            });
        });
    }

    mountModel(root, key) {
        const attach = () => {
            const model = this.createModelInstance(key);
            if (!model) return false;
            if (root.userData.assetModel) {
                root.remove(root.userData.assetModel);
                this.disposeObject(root.userData.assetModel);
            }
            if (root.userData.fallback) root.userData.fallback.visible = false;
            root.add(model);
            root.userData.assetModel = model;
            if (key === "player") {
                root.userData.visualRoot = model;
                root.userData.walkRig = this.collectPlayerRig(model);
            }
            return true;
        };

        if (attach()) return;
        this.preloadModel(key).then(() => {
            if (root.userData.disposed) return;
            if (key === "player" && this.objects.player !== root) return;
            if (key === "exit" && this.objects.exit !== root) return;
            attach();
        });
    }

    createModelInstance(key) {
        const asset = this.modelAssets[key];
        if (!asset?.scene) return null;
        const model = cloneSkeleton(asset.scene);
        model.rotation.set(...asset.rotation);
        model.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = key !== "player";
        });
        this.fitModelToBounds(model, asset);
        return model;
    }

    fitModelToBounds(model, asset) {
        model.updateMatrixWorld(true);
        const startBox = new THREE.Box3().setFromObject(model);
        const size = startBox.getSize(new THREE.Vector3());
        const scale = asset.targetHeight && size.y ? asset.targetHeight / size.y : 1;
        model.scale.multiplyScalar(scale);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y += (asset.yOffset || 0) - box.min.y;
        model.updateMatrixWorld(true);
        const fitted = new THREE.Box3().setFromObject(model);
        model.userData.basePosition = model.position.clone();
        model.userData.baseRotation = model.rotation.clone();
        model.userData.modelTop = fitted.max.y;
    }

    collectPlayerRig(model) {
        const rig = {
            bones: {},
            baseRotations: new Map()
        };
        const aliases = {
            pelvis: "bip_pelvis",
            spine: "bip_spine_0",
            hipL: "bip_hip_L",
            hipR: "bip_hip_R",
            kneeL: "bip_knee_L",
            kneeR: "bip_knee_R",
            footL: "bip_foot_L",
            footR: "bip_foot_R",
            upperArmL: "bip_upperArm_L",
            upperArmR: "bip_upperArm_R",
            lowerArmL: "bip_lowerArm_L",
            lowerArmR: "bip_lowerArm_R",
            handL: "bip_hand_L",
            handR: "bip_hand_R"
        };
        model.traverse((child) => {
            if (!child.isBone) return;
            Object.entries(aliases).forEach(([key, name]) => {
                if (child.name === name) rig.bones[key] = child;
            });
        });
        Object.values(rig.bones).forEach((bone) => {
            rig.baseRotations.set(bone, bone.rotation.clone());
        });
        return rig;
    }

    syncState(state) {
        this.state = state;
        if (!this.level) return;
        const player = this.objects.player;
        if (player) {
            player.position.copy(this.gridToWorld(state.x, state.y, this.baseY));
            player.rotation.y = -state.dir * Math.PI / 2;
        }
        state.guards.forEach((guard, index) => {
            if (this.objects.guards[index]) this.objects.guards[index].position.copy(this.gridToWorld(guard.x, guard.y, .66));
        });
        state.enemies.forEach((enemy, index) => {
            if (!this.objects.enemies[index]) return;
            this.objects.enemies[index].visible = enemy.alive;
            this.objects.enemies[index].position.copy(this.gridToWorld(enemy.x, enemy.y, .62));
        });
        this.objects.chips.forEach((chip, index) => {
            chip.visible = !state.collected.has(index);
        });
        this.updateDynamicMeshes();
    }

    updateDynamicMeshes() {
        if (!this.level || !this.state) return;
        this.objects.doors.forEach((door, index) => {
            const data = this.level.doors[index];
            const open = requiresAreOn(this.state, data.requires);
            door.visible = true;
            door.scale.y = open ? .12 : 1;
            door.position.y = open ? .24 : .92;
            door.traverse((child) => {
                if (child.isLight) child.intensity = open ? 4 : 1.1;
            });
        });
        this.objects.bridges.forEach((bridge) => {
            const active = requiresAreOn(this.state, bridge.userData.requires);
            bridge.visible = true;
            bridge.material.opacity = active ? .76 : .18;
            bridge.position.y = active ? .25 : -.02;
        });
        this.objects.switches.forEach((sw) => {
            const active = this.state.power[sw.userData.power];
            sw.scale.setScalar(active ? 1.12 : 1);
            sw.traverse((child) => {
                if (child.isLight) child.intensity = active ? 4 : 1.2;
            });
        });
        this.objects.cables.forEach((cable) => {
            const repaired = this.state.repaired.has(cable.userData.cableId);
            cable.scale.setScalar(repaired ? 1.12 : 1);
            cable.traverse((child) => {
                if (child.isLight) child.intensity = repaired ? 3.8 : 1.1 + Math.sin(performance.now() * .012) * .5;
            });
        });
        this.objects.lasers.forEach((mesh) => {
            const laser = this.level.lasers[mesh.userData.laserIndex];
            const cell = mesh.userData.cell;
            mesh.visible = laserAt(this.level, this.state, cell.x, cell.y);
        });
        if (this.objects.exit) {
            const ready = this.state.complete || ((this.state.collected.size === (this.level.chips || []).length) && (this.level.requiredPower || []).every((c) => this.state.power[c]));
            this.objects.exit.scale.setScalar(ready ? 1.08 : .9);
        }
    }

    async animateEvents(events, state) {
        const move = events.find((event) => event.type === "move");
        const turn = events.find((event) => event.type === "turn");
        const guardEvents = events.filter((event) => event.type === "guard");
        const enemyEvents = events.filter((event) => event.type === "enemy");
        const shootEvent = events.find((event) => event.type === "shoot");
        const duration = (move ? 420 : turn ? 230 : 300) / this.settings.speed;

        const player = this.objects.player;
        const guardStarts = guardEvents.map((event) => ({
            event,
            mesh: this.objects.guards[event.guardIndex],
            from: this.gridToWorld(event.from.x, event.from.y, .66),
            to: this.gridToWorld(event.to.x, event.to.y, .66)
        }));
        const enemyStarts = enemyEvents.map((event) => ({
            event,
            mesh: this.objects.enemies[event.enemyIndex],
            from: this.gridToWorld(event.from.x, event.from.y, .62),
            to: this.gridToWorld(event.to.x, event.to.y, .62)
        }));
        const projectile = shootEvent ? this.createProjectile() : null;
        let projectileFrom;
        let projectileTo;
        if (shootEvent && projectile) {
            projectileFrom = this.gridToWorld(shootEvent.from.x, shootEvent.from.y, 1.12);
            projectileTo = this.gridToWorld(shootEvent.to.x, shootEvent.to.y, 1.12);
            projectile.position.copy(projectileFrom);
            this.fxGroup.add(projectile);
        }

        let playerFrom;
        let playerTo;
        let rotationFrom;
        let rotationTo;
        if (move && player) {
            playerFrom = this.gridToWorld(move.from.x, move.from.y, this.baseY);
            playerTo = this.gridToWorld(move.to.x, move.to.y, this.baseY);
            player.position.copy(playerFrom);
            player.userData.walking = true;
            player.userData.walkPhase = 0;
        }
        if (turn && player) {
            rotationFrom = -turn.from.dir * Math.PI / 2;
            rotationTo = -turn.to.dir * Math.PI / 2;
            player.rotation.y = rotationFrom;
            player.userData.turning = true;
            player.userData.turnPhase = 0;
        }
        await this.tween(duration, (t) => {
            const eased = easeInOut(t);
            if (move && player) {
                player.position.lerpVectors(playerFrom, playerTo, eased);
                player.position.y = this.baseY + Math.sin(t * Math.PI) * .22;
                player.userData.walkPhase = t;
            }
            if (turn && player) {
                player.rotation.y = THREE.MathUtils.lerp(rotationFrom, rotationTo, eased);
                player.userData.turnPhase = t;
            }
            guardStarts.forEach(({ mesh, from, to }) => {
                if (!mesh) return;
                mesh.position.lerpVectors(from, to, eased);
                mesh.position.y = .66 + Math.sin(t * Math.PI) * .08;
            });
            enemyStarts.forEach(({ mesh, from, to }) => {
                if (!mesh) return;
                mesh.position.lerpVectors(from, to, eased);
                mesh.position.y = .62 + Math.sin(t * Math.PI) * .08;
            });
            if (projectile) {
                projectile.position.lerpVectors(projectileFrom, projectileTo, Math.min(1, t * 1.4));
                projectile.scale.setScalar(1 + Math.sin(t * Math.PI) * .4);
            }
        });
        if (player) {
            player.userData.walking = false;
            player.userData.turning = false;
            player.userData.walkPhase = 0;
            player.userData.turnPhase = 0;
        }
        if (projectile) {
            this.fxGroup.remove(projectile);
            this.disposeObject(projectile);
        }
        events.forEach((event) => {
            if (event.type === "collect") this.spawnParticles(this.gridToWorld(event.at.x, event.at.y, 1.08), 0xffc857, 16);
            if (event.type === "power") this.spawnParticles(this.gridToWorld(event.at.x, event.at.y, .8), event.value ? 0x17d6c3 : 0xff6b6b, 12);
            if (event.type === "repair") this.spawnParticles(this.gridToWorld(event.at.x, event.at.y, .8), 0x64e06b, 16);
            if (event.type === "shoot" && event.hit) this.spawnParticles(this.gridToWorld(event.to.x, event.to.y, .9), 0xff4d5f, 18);
        });
        this.syncState(state);
    }

    createProjectile() {
        const group = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 10), new THREE.MeshBasicMaterial({ color: 0x99ffdf }));
        const trail = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .46, 12), new THREE.MeshBasicMaterial({ color: 0x17d6c3, transparent: true, opacity: .62 }));
        trail.rotation.x = Math.PI / 2;
        const light = new THREE.PointLight(0x17d6c3, 4, 4);
        group.add(core, trail, light);
        return group;
    }

    previewPath(points) {
        this.clearPath();
        if (!points || points.length < 2) return;
        points.slice(1).forEach((point, index) => {
            const mark = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .025, 20), this.mats.path);
            mark.position.copy(this.gridToWorld(point.x, point.y, .23));
            mark.userData.index = index;
            this.fxGroup.add(mark);
            this.pathMarkers.push(mark);
        });
    }

    clearPath() {
        this.pathMarkers.forEach((mark) => {
            this.fxGroup.remove(mark);
            mark.geometry.dispose();
        });
        this.pathMarkers = [];
    }

    gridToWorld(x, y, zY = this.baseY) {
        const offset = this.offset(this.level.grid);
        return new THREE.Vector3(offset + x * this.cell, zY, offset + y * this.cell);
    }

    offset(grid) {
        return -((grid - 1) * this.cell) / 2;
    }

    applyCamera(move = false) {
        if (!this.level) return;
        this.controls.enabled = this.settings.camera === "orbit";
        this.controls.enableRotate = this.settings.camera === "orbit";
        if (!move) return;
        const span = this.level.grid * this.cell;
        if (this.settings.camera === "top") {
            this.camera.position.set(0, span * .95, .01);
            this.controls.target.set(0, 0, 0);
        } else if (this.settings.camera === "cinematic") {
            this.camera.position.set(span * .64, span * .56, span * -.76);
            this.controls.target.set(0, .45, 0);
        } else if (this.settings.camera === "chase") {
            this.updateChaseCamera(1);
        } else {
            this.camera.position.set(span * .58, span * .64, span * -.74);
            this.controls.target.set(0, .25, 0);
        }
        this.camera.lookAt(this.controls.target);
        this.controls.update();
    }

    cycleCamera() {
        const modes = ["orbit", "cinematic", "chase", "top"];
        this.settings.camera = modes[(modes.indexOf(this.settings.camera) + 1) % modes.length];
        this.applyCamera(true);
        return this.settings.camera;
    }

    updateSettings(settings) {
        this.settings = settings;
        this.applyRenderQuality();
        this.applyCamera(false);
        this.resize();
    }

    applyRenderQuality() {
        if (!this.renderer) return;
        this.renderer.shadowMap.enabled = this.settings.quality === "sharp";
    }

    resize() {
        const rect = this.host.getBoundingClientRect();
        const width = Math.max(320, Math.floor(rect.width));
        const height = Math.max(320, Math.floor(rect.height));
        const deviceRatio = window.devicePixelRatio || 1;
        const ratio = this.settings.quality === "sharp"
            ? Math.min(1.35, deviceRatio)
            : this.settings.quality === "light"
                ? Math.min(.85, deviceRatio)
                : Math.min(1, deviceRatio);
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    tick() {
        const delta = Math.min(.05, this.clock.getDelta());
        this.animateScene(delta);
        if (this.settings.camera === "chase") this.updateChaseCamera(.075);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(() => this.tick());
    }

    animateScene(delta) {
        const now = performance.now() * .001;
        this.objects.chips.forEach((chip, index) => {
            if (!chip.visible) return;
            chip.rotation.y += delta * 1.8;
            const exitModel = this.objects.exit?.userData.assetModel;
            const serverTop = exitModel ? this.objects.exit.position.y + (exitModel.userData.modelTop || 0) * this.objects.exit.scale.y : 0;
            const baseY = chip.userData.onExit && exitModel ? serverTop + .3 : .92;
            chip.position.y = baseY + Math.sin(now * 2.4 + index) * .08;
        });
        this.objects.guards.forEach((guard, index) => {
            guard.rotation.y = Math.sin(now * 1.5 + index) * .18;
        });
        this.objects.enemies.forEach((enemy, index) => {
            if (!enemy.visible) return;
            enemy.rotation.y = Math.sin(now * 2.6 + index) * .22;
        });
        if (this.objects.exit) {
            const spinTarget = this.objects.exit.userData.spinTarget;
            if (spinTarget?.visible) spinTarget.rotation.y += delta * 1.1;
        }
        if (this.objects.player) {
            this.updatePlayerPose(this.objects.player, now);
        }
        this.pathMarkers.forEach((mark, index) => {
            mark.scale.setScalar(1 + Math.sin(now * 3.3 + index * .34) * .18);
        });
        this.environmentStrips.forEach((strip) => {
            if (!strip.material) return;
            strip.material.opacity = .46 + Math.sin(now * 1.8 + (strip.userData.phase || 0)) * .18;
        });
        this.updateParticles(delta);
        this.updateDynamicMeshes();
    }

    updatePlayerPose(player, now) {
        const visual = player.userData.visualRoot;
        if (visual) {
            const basePosition = visual.userData.basePosition || new THREE.Vector3();
            const baseRotation = visual.userData.baseRotation || new THREE.Euler();
            const walking = Boolean(player.userData.walking);
            const walkPhase = (player.userData.walkPhase || 0) * Math.PI * 4;
            const idlePhase = now * 2.2;
            visual.position.copy(basePosition);
            visual.rotation.copy(baseRotation);
            visual.position.y += walking ? Math.abs(Math.sin(walkPhase)) * .085 : Math.sin(idlePhase) * .018;
            visual.rotation.x += walking ? Math.sin(walkPhase) * .035 : Math.sin(idlePhase * .7) * .01;
            if (player.userData.turning) {
                visual.rotation.z += Math.sin((player.userData.turnPhase || 0) * Math.PI) * .08;
            }
        }

        const rig = player.userData.walkRig;
        if (!rig) return;
        rig.baseRotations.forEach((rotation, bone) => {
            bone.rotation.copy(rotation);
        });
        const bones = rig.bones;
        const walking = Boolean(player.userData.walking);
        const phase = walking ? (player.userData.walkPhase || 0) * Math.PI * 4 : now * 1.35;
        const swing = Math.sin(phase);
        const counter = Math.cos(phase);
        const intensity = walking ? 1 : .12;
        this.rotateBone(bones.hipL, "x", swing * .34 * intensity);
        this.rotateBone(bones.hipR, "x", -swing * .34 * intensity);
        this.rotateBone(bones.kneeL, "x", Math.max(0, -swing) * .42 * intensity);
        this.rotateBone(bones.kneeR, "x", Math.max(0, swing) * .42 * intensity);
        this.rotateBone(bones.footL, "x", -swing * .18 * intensity);
        this.rotateBone(bones.footR, "x", swing * .18 * intensity);
        this.rotateBone(bones.upperArmL, "x", -swing * .26 * intensity);
        this.rotateBone(bones.upperArmR, "x", swing * .26 * intensity);
        this.rotateBone(bones.lowerArmL, "x", -counter * .12 * intensity);
        this.rotateBone(bones.lowerArmR, "x", counter * .12 * intensity);
        this.rotateBone(bones.pelvis, "z", swing * .035 * intensity);
        this.rotateBone(bones.spine, "z", -swing * .025 * intensity);
    }

    rotateBone(bone, axis, amount) {
        if (!bone) return;
        bone.rotation[axis] += amount;
    }

    updateChaseCamera(alpha = .08) {
        if (!this.objects.player || !this.state) return;
        const forward = new THREE.Vector3(DIRS[this.state.dir].x, 0, DIRS[this.state.dir].y).normalize();
        const back = forward.clone().multiplyScalar(-5.2);
        const side = new THREE.Vector3(-forward.z, 0, forward.x).multiplyScalar(1.8);
        const target = this.objects.player.position.clone().add(new THREE.Vector3(0, 1.0, 0));
        const desired = target.clone().add(back).add(side).add(new THREE.Vector3(0, 3.0, 0));
        this.camera.position.lerp(desired, alpha);
        this.controls.target.lerp(target, alpha);
        this.camera.lookAt(this.controls.target);
    }

    spawnParticles(origin, color, count = 14) {
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(.055 + Math.random() * .045, 8, 6),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
            );
            mesh.position.copy(origin);
            const angle = Math.random() * Math.PI * 2;
            const speed = .7 + Math.random() * 1.35;
            mesh.userData.velocity = new THREE.Vector3(Math.cos(angle) * speed, 1.1 + Math.random() * 1.6, Math.sin(angle) * speed);
            mesh.userData.life = .75 + Math.random() * .35;
            mesh.userData.maxLife = mesh.userData.life;
            this.fxGroup.add(mesh);
            this.particles.push(mesh);
        }
    }

    updateParticles(delta) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.userData.life -= delta;
            p.userData.velocity.y -= 2.6 * delta;
            p.position.addScaledVector(p.userData.velocity, delta);
            p.material.opacity = Math.max(0, p.userData.life / p.userData.maxLife);
            if (p.userData.life <= 0) {
                this.fxGroup.remove(p);
                p.geometry.dispose();
                p.material.dispose();
                this.particles.splice(i, 1);
            }
        }
    }

    tween(duration, update) {
        return new Promise((resolve) => {
            const start = performance.now();
            const step = (now) => {
                const t = Math.min(1, (now - start) / duration);
                update(t);
                if (t < 1) requestAnimationFrame(step);
                else resolve();
            };
            requestAnimationFrame(step);
        });
    }

    clearGroup(group) {
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
            group.remove(child);
            this.disposeObject(child);
        }
    }

    disposeObject(object) {
        object.userData.disposed = true;
        object.traverse((child) => {
            if (child.geometry && !child.geometry.userData.shared) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((mat) => this.disposeMaterial(mat));
                else this.disposeMaterial(child.material);
            }
        });
    }

    disposeMaterial(material) {
        if (!material || material.userData.shared) return;
        if (material.map && material.map !== this.heroTexture) material.map.dispose();
        material.dispose();
    }

    makeHeroFallbackTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
}

function easeInOut(t) {
    return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

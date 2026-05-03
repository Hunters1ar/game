import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DIRS, bridgeAt, doorAt, laserAt, requiresAreOn, switchAt } from "./engine.js";

export class GameRenderer {
    constructor({ canvas, host, settings }) {
        this.canvas = canvas;
        this.host = host;
        this.settings = settings;
        this.cell = 2.25;
        this.baseY = 0.34;
        this.level = null;
        this.state = null;
        this.tweens = [];
        this.particles = [];
        this.pathMarkers = [];
        this.clock = new THREE.Clock();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x071014);
        this.scene.fog = new THREE.Fog(0x071014, 22, 48);

        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 140);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

        this.textureLoader = new THREE.TextureLoader();
        this.heroTexture = this.makeHeroFallbackTexture();
        this.textureLoader.load("character.png", (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            this.heroTexture = texture;
            if (this.objects.player?.userData.sprite) {
                this.objects.player.userData.sprite.material.map = texture;
                this.objects.player.userData.sprite.material.needsUpdate = true;
            }
        });
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
            portal: new THREE.MeshStandardMaterial({ color: 0x17d6c3, emissive: 0x17d6c3, emissiveIntensity: .65, roughness: .22, metalness: .18 })
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
        key.shadow.mapSize.set(2048, 2048);
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
        const tileGeo = new THREE.BoxGeometry(1.96, .34, 1.96);
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
        const glow = new THREE.PointLight(0xffc857, 2.2, 4);
        glow.position.y = .05;
        group.add(gem, glow);
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
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.64, .065, 14, 54), this.mats.portal);
        ring.rotation.x = Math.PI / 2;
        ring.castShadow = true;
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(.72, .72, .10, 48), new THREE.MeshBasicMaterial({ color: 0x17d6c3, transparent: true, opacity: .28 }));
        pad.position.y = -.35;
        const light = new THREE.PointLight(0x17d6c3, 4, 6);
        light.position.y = .45;
        group.add(ring, pad, light);
        return group;
    }

    createPlayer() {
        const root = new THREE.Group();
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
        root.add(body, head, eyeL, eyeR, glass, sprite);
        root.userData.sprite = sprite;
        return root;
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
        }
        if (turn && player) {
            rotationFrom = -turn.from.dir * Math.PI / 2;
            rotationTo = -turn.to.dir * Math.PI / 2;
            player.rotation.y = rotationFrom;
        }
        await this.tween(duration, (t) => {
            const eased = easeInOut(t);
            if (move && player) {
                player.position.lerpVectors(playerFrom, playerTo, eased);
                player.position.y = this.baseY + Math.sin(t * Math.PI) * .22;
            }
            if (turn && player) {
                player.rotation.y = THREE.MathUtils.lerp(rotationFrom, rotationTo, eased);
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
        this.applyCamera(false);
        this.resize();
    }

    resize() {
        const rect = this.host.getBoundingClientRect();
        const width = Math.max(320, Math.floor(rect.width));
        const height = Math.max(320, Math.floor(rect.height));
        const ratio = this.settings.quality === "sharp" ? Math.min(2, window.devicePixelRatio || 1) : this.settings.quality === "light" ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
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
            chip.position.y = .92 + Math.sin(now * 2.4 + index) * .08;
        });
        this.objects.guards.forEach((guard, index) => {
            guard.rotation.y = Math.sin(now * 1.5 + index) * .18;
        });
        this.objects.enemies.forEach((enemy, index) => {
            if (!enemy.visible) return;
            enemy.rotation.y = Math.sin(now * 2.6 + index) * .22;
        });
        if (this.objects.exit) {
            this.objects.exit.rotation.y += delta * 1.1;
        }
        if (this.objects.player) {
            this.objects.player.position.y += Math.sin(now * 2.2) * .0008;
        }
        this.pathMarkers.forEach((mark, index) => {
            mark.scale.setScalar(1 + Math.sin(now * 3.3 + index * .34) * .18);
        });
        this.updateParticles(delta);
        this.updateDynamicMeshes();
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
        object.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
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

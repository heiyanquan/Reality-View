import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeSkyTexture, makeAsphaltTexture, makeWaterTexture, makeConcreteTexture } from './textures.js';
import { createVehicle } from './vehicles.js';

/* ============================================================
   世界坐标约定（务必保持）
   - 道路沿 X 轴延伸，自车朝 +X 行驶
   - 自车右侧（海的一侧）是 +Z
   - 对向车道在 -Z
   车辆模型的"车头"一律建在 +X 侧，长轴沿 X —— 不再靠旋转纠偏
   ============================================================ */

const ROAD_HALF = 8;          // 可行驶区半宽（z: -8..8）
const LANE_W = 4;
const CONVEYOR_SPAN = 252;    // 循环区间 [−126, 126]，能被各种间距整除

const TRAFFIC_DEFS = [
  { x:  26, z:  2, type: 'van',    color: 0xf4f4f4, spd: 5.2, dir:  1 },
  { x:  58, z:  6, type: 'sedan',  color: 0xe8e8e8, spd: 6.6, dir:  1 },
  { x: -22, z:  6, type: 'pickup', color: 0x1c2634, spd: 5.6, dir:  1 },
  { x: -62, z:  2, type: 'suv',    color: 0x33383e, spd: 5.4, dir:  1 },
  { x:  18, z: -2, type: 'pickup', color: 0x14161a, spd: 6.0, dir: -1 },
  { x:  74, z: -2, type: 'sedan',  color: 0x2e5a88, spd: 6.4, dir: -1 },
  { x: -34, z: -6, type: 'trailer',color: 0xdfe3e6, spd: 5.2, dir: -1 },
  { x:  96, z: -6, type: 'van',    color: 0xe9edf0, spd: 5.8, dir: -1 },
  { x: -96, z: -6, type: 'sedan',  color: 0x6b7280, spd: 6.1, dir: -1 },
];

export class RealityView {
  /**
   * @param {HTMLElement} container 挂载 canvas 的容器
   * @param {(hud: object) => void} onHud HUD 数据回调（约 10Hz）
   */
  constructor(container, onHud) {
    this.container = container;
    this.onHud = onHud || (() => {});

    this.topdown = false;
    this.paused = false;

    this.battery = 68;
    this.tripDist = 1.3;
    this.egoSpeed = 4.9;
    this.EGO_BASE_SPEED = 4.9;
    this.MIN_GAP = 6;
    this.SAFE_GAP = 12;
    this.hudTimer = 0;
    this.rafId = null;
    this.disposed = false;

    this._init();
  }

  _init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 900);

    this.canvas = document.createElement('canvas');
    this.container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // 环境光照（IBL，让车漆有反射而不是死黑）
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.06);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.scene.fog = new THREE.FogExp2(0xa9c1cf, 0.0075);

    this._buildSky();
    this._buildLights();
    this._buildGround();
    this._buildLaneLines();
    this._buildCurbs();
    this._buildSea();
    this._buildPalms();
    this._buildBoats();
    this._buildVehicles();
    this._initCamera();
    this._bindEvents();

    this.clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    this.rafId = requestAnimationFrame(this._animate);
  }

  /* ---------- 场景各部分 ---------- */

  _buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(500, 40, 24),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.scene.add(sky);

    // 太阳
    this.sunDir = new THREE.Vector3(0.55, 0.16, 0.82).normalize();
    const sunSprite = new THREE.Mesh(
      new THREE.CircleGeometry(26, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.85, fog: false, depthWrite: false })
    );
    sunSprite.position.copy(this.sunDir.clone().multiplyScalar(430));
    sunSprite.lookAt(0, 0, 0);
    this.scene.add(sunSprite);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xcfe4f5, 0x40474e, 0.55);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xffe0b0, 3.0);
    this.sun.position.copy(this.sunDir.clone().multiplyScalar(90));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34;
    sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const fill = new THREE.DirectionalLight(0x8fb4d8, 0.8);
    fill.position.set(-40, 20, -50);
    this.scene.add(fill);
  }

  _buildGround() {
    const asphalt = makeAsphaltTexture();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(520, ROAD_HALF * 2 + 2),
      new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.93, metalness: 0.02 })
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    this.scene.add(road);

    // 路外地面（土/草地）
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6f6a52, roughness: 1.0 });
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(520, 120), dirtMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, -0.02, side * (ROAD_HALF + 1 + 60));
      strip.receiveShadow = true;
      this.scene.add(strip);
    }
  }

  _buildLaneLines() {
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.65, metalness: 0.0 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xd8b23c, roughness: 0.7 });

    const solidLine = (z, mat, width = 0.14) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(CONVEYOR_SPAN, 0.02, width), mat);
      m.position.set(0, 0.012, z);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    solidLine(ROAD_HALF - 0.25, whiteMat);     // 右外侧白实线
    solidLine(-(ROAD_HALF - 0.25), whiteMat);  // 左外侧白实线
    solidLine(0.16, yellowMat);                // 中央双黄线
    solidLine(-0.16, yellowMat);

    // 移动的虚线（跟随自车滚动，制造前进感）
    this.dashMeshes = [];
    const dashGeo = new THREE.BoxGeometry(3.0, 0.02, 0.14);
    const DASH_GAP = 9;
    for (const z of [4, -4]) {
      for (let x = -126; x < 126; x += DASH_GAP) {
        const d = new THREE.Mesh(dashGeo, whiteMat);
        d.position.set(x, 0.014, z);
        d.receiveShadow = true;
        this.scene.add(d);
        this.dashMeshes.push(d);
      }
    }
  }

  _buildCurbs() {
    const concrete = makeConcreteTexture();
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(CONVEYOR_SPAN, 0.3, 0.55),
        new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9 })
      );
      curb.position.set(0, 0.15, side * (ROAD_HALF + 0.3));
      curb.receiveShadow = true;
      curb.castShadow = true;
      this.scene.add(curb);

      const walk = new THREE.Mesh(
        new THREE.PlaneGeometry(CONVEYOR_SPAN, 3.4),
        new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.95 })
      );
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(0, 0.02, side * (ROAD_HALF + 0.6 + 1.7));
      walk.receiveShadow = true;
      this.scene.add(walk);
    }
  }

  _buildSea() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 160, 1, 1),
      new THREE.MeshStandardMaterial({
        map: makeWaterTexture(),
        roughness: 0.18, metalness: 0.45, envMapIntensity: 1.0,
        color: 0x9fc4d8,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.35, ROAD_HALF + 90);
    water.receiveShadow = true;
    this.scene.add(water);

    // 岸边的抛石护坡
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8478, roughness: 0.95, flatShading: true });
    for (let x = -126; x < 126; x += 2.2) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.35, 0), rockMat);
      r.position.set(x, 0.05, ROAD_HALF + 4.2 + Math.random() * 1.8);
      r.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      r.castShadow = true; r.receiveShadow = true;
      this.scene.add(r);
    }
  }

  _buildPalms() {
    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.95 });
    const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x35592f, roughness: 0.9, side: THREE.DoubleSide });
    const makePalm = () => {
      const p = new THREE.Group();
      const h = 6 + Math.random() * 2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, h, 8), palmTrunkMat);
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      p.add(trunk);
      const nLeaves = 8;
      for (let i = 0; i < nLeaves; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), palmLeafMat);
        const a = (i / nLeaves) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 1.0, h + 0.2, Math.sin(a) * 1.0);
        leaf.rotation.z = Math.cos(a) * 1.15;
        leaf.rotation.x = -Math.sin(a) * 1.15;
        leaf.castShadow = true;
        p.add(leaf);
      }
      return p;
    };
    this.palms = [];
    for (let x = -126; x < 126; x += 21) {
      for (const side of [-1, 1]) {
        const p = makePalm();
        p.position.set(x + Math.random() * 6, 0, side * (ROAD_HALF + 4.5 + Math.random() * 2));
        p.rotation.y = Math.random() * Math.PI;
        this.scene.add(p);
        this.palms.push(p);
      }
    }
  }

  _buildBoats() {
    const makeBoat = () => {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.5 }));
      hull.rotation.z = Math.PI / 2;
      hull.position.y = 0.15;
      b.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0xb0b6bc }));
      mast.position.y = 1.8;
      b.add(mast);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.6), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8, side: THREE.DoubleSide }));
      sail.position.set(0.5, 2.0, 0);
      b.add(sail);
      return b;
    };
    this.boats = [];
    for (let i = 0; i < 9; i++) {
      const b = makeBoat();
      const x = -200 + i * 50 + Math.random() * 20;
      b.position.set(x, -0.1, ROAD_HALF + 22 + Math.random() * 55);
      b.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(b);
      this.boats.push(b);
    }
  }

  _buildVehicles() {
    // 自车
    this.ego = createVehicle('pickup', 0x9fb2c8, { coverColor: 0x2f7fd0 });
    this.ego.position.set(0, 0, 2);
    this.scene.add(this.ego);

    // 交通流（相对自车的运动）
    this.traffic = [];
    for (const d of TRAFFIC_DEFS) {
      const v = createVehicle(d.type, d.color);
      v.position.set(d.x, 0, d.z);
      v.rotation.y = d.dir === 1 ? 0 : Math.PI;
      this.scene.add(v);
      this.traffic.push({ mesh: v, x: d.x, z: d.z, spd: d.spd, cur: d.spd, dir: d.dir });
    }
  }

  /* ---------- 相机（可拖拽环绕，360° 看车） ---------- */

  _initCamera() {
    const CHASE_AZ = Math.PI;
    const CHASE_EL = 0.30;
    const CHASE_DIST = 9.6;
    this.chase = { az: CHASE_AZ, el: CHASE_EL, dist: CHASE_DIST };
    this.orbit = {
      az: CHASE_AZ,
      el: CHASE_EL,
      dist: CHASE_DIST,
      target: new THREE.Vector3(0, 1.05, 2),
    };
    this.camLookAt = this.orbit.target.clone();

    this._orbitPosition(this.camera.position);
    this.camera.lookAt(this.orbit.target);

    this.drag = { active: false, x: 0, y: 0, id: null };
    this.canvas.style.cursor = 'grab';
  }

  _orbitPosition(out) {
    const r = this.orbit.dist * Math.cos(this.orbit.el);
    return out.set(
      this.orbit.target.x + r * Math.cos(this.orbit.az),
      this.orbit.target.y + this.orbit.dist * Math.sin(this.orbit.el),
      this.orbit.target.z + r * Math.sin(this.orbit.az)
    );
  }

  resetCamera() {
    this.orbit.az = this.chase.az;
    this.orbit.el = this.chase.el;
    this.orbit.dist = this.chase.dist;
    this.orbit.target.set(0, 1.05, 2);
    this.camLookAt.copy(this.orbit.target);
  }

  /* ---------- 事件 ---------- */

  _onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.drag.active = true;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.drag.id = e.pointerId;
    this.canvas.style.cursor = 'grabbing';
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  _onPointerMove = (e) => {
    if (!this.drag.active) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.orbit.az -= dx * 0.006;
    this.orbit.el = Math.min(1.40, Math.max(0.02, this.orbit.el + dy * 0.005));
  };

  _onPointerUp = (e) => {
    if (!this.drag.active) return;
    this.drag.active = false;
    this.canvas.style.cursor = 'grab';
    if (e && this.drag.id != null) this.canvas.releasePointerCapture?.(this.drag.id);
  };

  _onPointerLeave = (e) => {
    if (this.drag.active && !this.canvas.hasPointerCapture?.(this.drag.id)) this._onPointerUp(e);
  };

  _onWheel = (e) => {
    e.preventDefault();
    this.orbit.dist = Math.min(32, Math.max(3.6, this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08)));
  };

  _onDblClick = () => this.resetCamera();

  _onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('pointerdown', this._onPointerDown);
    c.addEventListener('pointermove', this._onPointerMove);
    c.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('pointercancel', this._onPointerUp);
    c.addEventListener('pointerleave', this._onPointerLeave);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    c.addEventListener('dblclick', this._onDblClick);
    window.addEventListener('resize', this._onResize);
  }

  /* ---------- 相机更新 ---------- */

  _updateCamera(dt) {
    const want = new THREE.Vector3(this.ego.position.x, this.ego.position.y + 1.05, this.ego.position.z);
    this.orbit.target.lerp(want, 1 - Math.pow(0.0025, dt));

    if (this.topdown) {
      const desired = new THREE.Vector3(this.orbit.target.x - 0.01, this.orbit.target.y + 30, this.orbit.target.z + 0.01);
      this.camera.position.lerp(desired, 0.12);
      this.camLookAt.lerp(this.orbit.target, 0.2);
      this.camera.lookAt(this.camLookAt);
      return;
    }

    const desired = this._orbitPosition(new THREE.Vector3());
    this.camera.position.lerp(desired, 1 - Math.pow(0.00001, dt));
    this.camLookAt.lerp(this.orbit.target, 1 - Math.pow(0.0008, dt));
    this.camera.lookAt(this.camLookAt);
  }

  /* ---------- 世界循环（自车不动，世界后退） ---------- */

  _scrollWorld(dt) {
    // 计算自车当前车道上最近的前车（同向、同车道、在前方）
    let frontCar = null;
    let frontDist = Infinity;
    for (const t of this.traffic) {
      if (t.dir !== 1) continue;                    // 只看同向车
      if (Math.abs(t.z - this.ego.position.z) > 2.5) continue; // 只看同车道（车宽≈2m，lane≈4m）
      const dist = t.x - this.ego.position.x;
      if (dist > 0 && dist < frontDist) {           // 在前方
        frontDist = dist;
        frontCar = t;
      }
    }

    // 交通车之间的跟车：同车道同方向，前车太近就减速，避免互相穿透
    // （相对间距不受自车运动影响；自车也作为 z=2、dir=1 车道的障碍）
    const egoObstacle = { x: this.ego.position.x, z: this.ego.position.z, dir: 1, cur: this.egoSpeed, isEgo: true };
    for (const t of this.traffic) {
      let gap = Infinity, leader = null;
      for (const o of [...this.traffic, egoObstacle]) {
        if (o === t || o.dir !== t.dir || Math.abs(o.z - t.z) > 0.5) continue;
        let g = t.dir === 1 ? o.x - t.x : t.x - o.x;
        g = ((g % CONVEYOR_SPAN) + CONVEYOR_SPAN) % CONVEYOR_SPAN;
        if (g > 0 && g < gap) { gap = g; leader = o; }
      }
      if (leader && gap < this.SAFE_GAP) {
        t.cur += (Math.min(t.cur, leader.cur * 0.98) - t.cur) * 0.08;
      } else {
        t.cur += (t.spd - t.cur) * 0.02;
      }
    }

    // 简单的跟车逻辑：如果前车太近且比自车慢，自车减速跟随
    if (frontCar && frontDist < this.MIN_GAP + frontCar.mesh.userData.wheelR * 2) {
      const targetSpeed = Math.min(this.egoSpeed, frontCar.cur * 0.98);
      this.egoSpeed += (targetSpeed - this.egoSpeed) * 0.05;  // 平滑过渡
    } else {
      // 恢复基础速度
      this.egoSpeed += (this.EGO_BASE_SPEED - this.egoSpeed) * 0.02;
    }

    const dx = this.egoSpeed * dt;  // 使用实际自车速度

    // 移动虚线
    for (const d of this.dashMeshes) {
      d.position.x -= dx;
      if (d.position.x < -126) d.position.x += CONVEYOR_SPAN;
    }
    // 移动棕榈树
    for (const p of this.palms) {
      p.position.x -= dx;
      if (p.position.x < -126) p.position.x += CONVEYOR_SPAN;
    }
    // 移动帆船
    for (const b of this.boats) {
      b.position.x -= dx * 0.65;
      if (b.position.x < -250) b.position.x += 500;
      b.position.y = -0.1 + Math.sin(performance.now() * 0.0009 + b.position.x * 0.05) * 0.06;
    }

    // 移动交通流（使用实际自车速度 egoSpeed 计算相对速度）
    for (const t of this.traffic) {
      const rel = t.dir * t.cur - this.egoSpeed;
      t.x += rel * dt;
      if (t.x > 126) t.x -= CONVEYOR_SPAN;
      if (t.x < -126) t.x += CONVEYOR_SPAN;
      t.mesh.position.x = t.x;
      // 车头始终朝本地 +X（对向车已整体旋转 π），所以车轮转向与方向无关
      const spin = (t.cur / t.mesh.userData.wheelR) * dt;
      for (const w of t.mesh.userData.wheels) w.rotation.z -= spin;
    }

    // 旋转自车的车轮（使用实际自车速度）
    if (this.ego.userData.wheels) {
      const spin = (this.egoSpeed / this.ego.userData.wheelR) * dt;
      for (const w of this.ego.userData.wheels) w.rotation.z -= spin;
    }
  }

  /* ---------- HUD 数据 ---------- */

  _updateHudState(dt) {
    if (!this.paused) {
      this.battery = Math.max(0, this.battery - dt * 0.004);
      this.tripDist = Math.max(0, this.tripDist - dt * this.egoSpeed * 0.000621371 * 0.12);
    }
  }

  _emitHud() {
    const mph = this.paused ? 0 : Math.round(this.egoSpeed * 2.23694);
    const range = Math.max(0, Math.round(212 - (100 - this.battery) * 2.4));
    const remainingMinutes = Math.ceil(7 * (this.tripDist / 1.3));
    this.onHud({
      mph,
      range,
      battery: this.battery,
      tripDist: this.tripDist,
      tripMinutes: remainingMinutes,
      now: Date.now(),
    });
  }

  /* ---------- 主循环 ---------- */

  _animate() {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) this._scrollWorld(dt);
    this._updateCamera(dt);
    this._updateHudState(dt);

    this.hudTimer += dt;
    if (this.hudTimer >= 0.1) {
      this.hudTimer = 0;
      this._emitHud();
    }

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this._animate);
  }

  /* ---------- 公开 API ---------- */

  setPaused(v) { this.paused = !!v; }
  setTopdown(v) { this.topdown = !!v; }
  get isPaused() { return this.paused; }
  get isTopdown() { return this.topdown; }

  dispose() {
    this.disposed = true;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onPointerDown);
    c.removeEventListener('pointermove', this._onPointerMove);
    c.removeEventListener('pointerup', this._onPointerUp);
    c.removeEventListener('pointercancel', this._onPointerUp);
    c.removeEventListener('pointerleave', this._onPointerLeave);
    c.removeEventListener('wheel', this._onWheel);
    c.removeEventListener('dblclick', this._onDblClick);
    window.removeEventListener('resize', this._onResize);
    this.scene.traverse(o => {
      if (o.isMesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const k of Object.keys(m)) {
            if (m[k] && m[k].isTexture) m[k].dispose();
          }
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
    c.remove();
  }
}

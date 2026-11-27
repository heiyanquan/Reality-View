import * as THREE from 'three';

/* 车辆（长轴沿 X，车头朝 +X） */
const SPECS = {
  sedan:   { len: 4.60, wid: 1.88, bodyH: 0.72, cabinLen: 2.10, cabinH: 0.60, cabinX: -0.20 },
  suv:     { len: 4.85, wid: 1.98, bodyH: 0.92, cabinLen: 2.55, cabinH: 0.70, cabinX: -0.30 },
  pickup:  { len: 5.35, wid: 2.05, bodyH: 0.82, cabinLen: 1.95, cabinH: 0.74, cabinX:  0.95 },
  van:     { len: 5.45, wid: 2.12, bodyH: 1.55, cabinLen: 1.60, cabinH: 0.85, cabinX:  1.85 },
  trailer: { len: 6.80, wid: 2.05, bodyH: 0.70, cabinLen: 1.95, cabinH: 0.74, cabinX:  2.20 },
};

export function createVehicle(type, colorHex, opts = {}) {
  const spec = SPECS[type] || SPECS.sedan;
  const g = new THREE.Group();
  const wheelR = type === 'van' ? 0.40 : 0.35;

  // 更真实的材质
  const paint = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: 0.32,
    metalness: 0.55,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.0,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0d1b26,
    roughness: 0.08,
    metalness: 0.6,
    transmission: 0.35,
    transparent: true,
    opacity: 0.9,
    envMapIntensity: 1.2,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95, metalness: 0.05 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9d2da, roughness: 0.22, metalness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.7, metalness: 0.2 });

  const baseY = wheelR;

  // 主车身（使用更真实的材质）
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.len, spec.bodyH, spec.wid), paint);
  body.position.y = baseY + spec.bodyH / 2;
  g.add(body);

  // 车顶（驾驶舱）
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.cabinLen, spec.cabinH, spec.wid * 0.9),
    type === 'van' || type === 'trailer' ? paint : glass
  );
  cabin.position.set(spec.cabinX, baseY + spec.bodyH + spec.cabinH / 2 - 0.02, 0);
  g.add(cabin);

  // 皮卡：后斗（低矮货箱 + 蓝色盖板）
  if (type === 'pickup') {
    const bedLen = spec.len - spec.cabinLen - 0.55;
    const bedX = spec.cabinX - spec.cabinLen / 2 - bedLen / 2;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bedLen, 0.42, spec.wid * 0.95), paint);
    bed.position.set(bedX, baseY + spec.bodyH + 0.16, 0);
    g.add(bed);
    const coverMat = new THREE.MeshPhysicalMaterial({ color: opts.coverColor ?? 0x2b6cb0, roughness: 0.35, metalness: 0.4, clearcoat: 0.6 });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(bedLen * 0.94, 0.06, spec.wid * 0.86), coverMat);
    cover.position.set(bedX, baseY + spec.bodyH + 0.4, 0);
    g.add(cover);
  }

  // 拖车：后部平板与挡板
  if (type === 'trailer') {
    const bedLen = spec.len - spec.cabinLen - 0.9;
    const bedX = spec.cabinX - spec.cabinLen / 2 - bedLen / 2;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bedLen, 0.16, spec.wid * 1.02), dark);
    bed.position.set(bedX, baseY + spec.bodyH + 0.1, 0);
    g.add(bed);
    for (const zz of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(bedLen, 0.06, 0.1), chrome);
      rail.position.set(bedX, baseY + spec.bodyH + 0.42, zz * spec.wid * 0.5);
      g.add(rail);
    }
  }

  // 车轮（轴向 Z）
  const wheels = [];
  const wGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 20);
  wGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.52, wheelR * 0.52, 0.28, 14);
  hubGeo.rotateX(Math.PI / 2);
  const axleXs = type === 'trailer' ? [1.8, -1.4, -2.6] : [spec.len / 2 - 1.15, -(spec.len / 2 - 1.15)];
  for (const ax of axleXs) {
    for (const side of [-1, 1]) {
      const z = side * (spec.wid / 2 - 0.02);
      const w = new THREE.Mesh(wGeo, rubber);
      w.position.set(ax, wheelR, z);
      g.add(w);
      const hub = new THREE.Mesh(hubGeo, chrome);
      hub.position.set(0, 0, 0);
      w.add(hub);
      wheels.push(w);
    }
  }

  // 头灯 / 尾灯
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff0c0, emissiveIntensity: 1.4, roughness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff1a1a, emissiveIntensity: 1.0, roughness: 0.4 });
  const frontX = spec.len / 2;
  const rearX = -spec.len / 2;
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.42), headMat);
    hl.position.set(frontX + 0.01, baseY + spec.bodyH * 0.72, side * spec.wid * 0.31);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.34), tailMat);
    tl.position.set(rearX - 0.01, baseY + spec.bodyH * 0.75, side * spec.wid * 0.33);
    g.add(tl);
  }

  // 前保险杠 + 格栅
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.22, spec.bodyH * 0.5, spec.wid * 0.98), dark);
  bumper.position.set(frontX - 0.02, baseY + spec.bodyH * 0.28, 0);
  g.add(bumper);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, spec.bodyH * 0.26, spec.wid * 0.6), chrome);
  grille.position.set(frontX + 0.06, baseY + spec.bodyH * 0.62, 0);
  g.add(grille);

  // 后视镜
  for (const side of [-1, 1]) {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.14), dark);
    mir.position.set(spec.cabinX + spec.cabinLen / 2 - 0.15, baseY + spec.bodyH + spec.cabinH * 0.35, side * (spec.wid / 2 + 0.09));
    g.add(mir);
  }

  g.userData.wheels = wheels;
  g.userData.wheelR = wheelR;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

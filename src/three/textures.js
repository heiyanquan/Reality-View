import * as THREE from 'three';

export function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 1024;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0.00, '#1d3557');
  g.addColorStop(0.22, '#3f6a91');
  g.addColorStop(0.42, '#7fa6c0');
  g.addColorStop(0.55, '#c9cbb0');
  g.addColorStop(0.62, '#f0c98a');
  g.addColorStop(0.66, '#e8b56e');
  g.addColorStop(0.70, '#9fb4c2');
  g.addColorStop(1.00, '#8a9ea8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeAsphaltTexture() {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3d42'; ctx.fillRect(0, 0, s, s);
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(20,20,22,0.12)';
  for (let i = 0; i < 24; i++) {
    ctx.lineWidth = 6 + Math.random() * 18;
    ctx.beginPath();
    ctx.moveTo(Math.random() * s, 0);
    ctx.bezierCurveTo(Math.random() * s, s * 0.4, Math.random() * s, s * 0.7, Math.random() * s, s);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(24, 4);
  t.anisotropy = 8;
  return t;
}

export function makeWaterTexture() {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#5f93b5');
  g.addColorStop(0.45, '#7ba9c4');
  g.addColorStop(1, '#93b9ce');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 220; i++) {
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    const y = Math.random() * s;
    const x = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12 + Math.random() * 40, y + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 6);
  return t;
}

export function makeConcreteTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a9c9e'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.04)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 8);
  return t;
}

/*
 * Two point clouds: a pooled burst system (spray, landings, confetti) and a
 * box of falling snow that wraps around the camera so it never runs out.
 */
import * as THREE from "three";

const HIDDEN = -1e7;

export function createBursts(capacity = 900) {
  const positions = new Float32Array(capacity * 3).fill(HIDDEN);
  const colors = new Float32Array(capacity * 3).fill(1);
  const state = Array.from({ length: capacity }, () => ({ alive: false }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 4.5, vertexColors: true, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  let cursor = 0;
  const color = new THREE.Color();

  function spawn({ x, y, z, vx, vy, vz, life, tint = "#ffffff", gravity = 900, flutter = false }) {
    const i = cursor;
    cursor = (cursor + 1) % capacity;
    Object.assign(state[i], { alive: true, x, y, z, vx, vy, vz, life, age: 0, gravity, flutter });
    color.set(tint).toArray(colors, i * 3);
    geometry.attributes.color.needsUpdate = true;
  }

  function update(dt) {
    for (let i = 0; i < capacity; i += 1) {
      const p = state[i];
      const k = i * 3;
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        positions[k + 1] = HIDDEN;
        continue;
      }
      p.vy -= p.gravity * dt;
      const sway = p.flutter ? Math.sin(p.age * 9 + i) * 40 : 0;
      p.x += (p.vx + sway) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      positions[k] = p.x;
      positions[k + 1] = p.y;
      positions[k + 2] = p.z;
    }
    geometry.attributes.position.needsUpdate = true;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { points, spawn, update, dispose };
}

export function createSnowfall(count = 1800, extent = 900) {
  const positions = new Float32Array(count * 3);
  const fall = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() * 2 - 1) * extent;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * extent * 0.6;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * extent;
    fall[i] = 25 + Math.random() * 45;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: 2.6,
    color: "#ffffff",
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const wrap = (value, center, size) => center + ((((value - center + size) % (2 * size)) + 2 * size) % (2 * size)) - size;

  function update(dt, time, center, still) {
    for (let i = 0; i < count; i += 1) {
      const k = i * 3;
      if (!still) {
        positions[k] += Math.sin(time * 0.8 + i) * 10 * dt;
        positions[k + 1] -= fall[i] * dt;
      }
      positions[k] = wrap(positions[k], center.x, extent);
      positions[k + 1] = wrap(positions[k + 1], center.y, extent * 0.6);
      positions[k + 2] = wrap(positions[k + 2], center.z, extent);
    }
    geometry.attributes.position.needsUpdate = true;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { points, update, dispose };
}

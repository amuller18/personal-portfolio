/*
 * The 3D mountain, built from the same course geometry as the 2D view. The
 * course's ground line runs down the middle of the piste (z = 0); the rest of
 * the valley, the trees and the peaks are dressing around it.
 *
 * Axes: x downhill, y up (= -course y), z across the slope.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KICKER, LANDING } from "../../model/course";
import { clamp, seededRandom, smoothRange } from "../../../shared/math";
import { GATE_COLORS } from "../palette";

const FONT = '"Press Start 2P", ui-monospace, monospace';
const LANE = 60;
const POLE_Z = 85;

const noise = (x, z) =>
  Math.sin(x * 0.0071 + z * 0.013) * Math.sin(z * 0.0093 - x * 0.0041) +
  0.5 * Math.sin(x * 0.019 - z * 0.017);

function paint(geometry, color) {
  const c = new THREE.Color(color);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) c.toArray(colors, i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function labelTexture(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = () => {
    draw(canvas.getContext("2d"), canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  redraw();
  return { texture, redraw };
}

function textLabel(text, background, foreground, { checkered = false } = {}) {
  return labelTexture((ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    if (checkered) {
      const cell = 24;
      for (let x = 0; x < w; x += cell) {
        for (let y = 0; y < h; y += cell) {
          if ((x / cell + y / cell) % 2 === 0) {
            ctx.fillStyle = "#0b1030";
            ctx.fillRect(x, y, cell, cell);
          }
        }
      }
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(w * 0.2, h * 0.18, w * 0.6, h * 0.64);
    }
    ctx.fillStyle = foreground;
    ctx.font = `40px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 3);
  });
}

export function buildWorld(course) {
  const group = new THREE.Group();
  const disposables = [];
  const labels = [];
  const animated = [];
  const keep = (thing) => {
    disposables.push(thing);
    return thing;
  };

  /* ---------- Terrain ---------- */

  const minX = course.startX - 2600;
  const maxX = course.endX + 2600;

  function heightAt(x, z) {
    const az = Math.abs(z);
    let h = -course.baseY(x);
    h += course.kickerBump(x) * (1 - smoothRange(az, LANE * 0.75, LANE * 1.25));
    h += smoothRange(az, 160, 2600) ** 1.4 * 950;
    h += noise(x, z) * smoothRange(az, 110, 500) * 45;
    return h;
  }

  const xs = [];
  for (let x = minX; x <= maxX; ) {
    xs.push(x);
    const u = x / course.runLength - Math.floor(x / course.runLength);
    const nearKicker = x > 0 && x < course.finishX && u > KICKER.start - 0.02 && u < KICKER.end + 0.01;
    x += nearKicker ? 4 : 22;
  }
  const half = [0, 18, 36, 52, 66, 82, 110, 150, 210, 290, 400, 560, 780, 1060, 1420, 1900, 2600];
  const zs = [...half.slice(1).reverse().map((z) => -z), ...half];

  const positions = new Float32Array(xs.length * zs.length * 3);
  const colors = new Float32Array(xs.length * zs.length * 3);
  const snow = new THREE.Color("#f6f9ff");
  const groomed = new THREE.Color("#eef3fd");
  const kicker = new THREE.Color("#d5e2f6");
  const rock = new THREE.Color("#8d9bb8");
  const tmp = new THREE.Color();
  xs.forEach((x, i) => {
    const bump = course.kickerBump(x);
    zs.forEach((z, j) => {
      const k = (i * zs.length + j) * 3;
      positions[k] = x;
      positions[k + 1] = heightAt(x, z);
      positions[k + 2] = z;
      const az = Math.abs(z);
      if (bump > 1 && az < LANE) tmp.copy(kicker);
      else if (az < LANE) tmp.copy(groomed);
      else tmp.copy(snow).lerp(rock, smoothRange(noise(x * 1.7, z * 1.3), 0.55, 1.1) * smoothRange(az, 500, 1400) * 0.7);
      tmp.toArray(colors, k);
    });
  });
  const indices = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < zs.length - 1; j += 1) {
      const a = i * zs.length + j;
      const b = a + zs.length;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const terrainGeometry = keep(new THREE.BufferGeometry());
  terrainGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  terrainGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeometry.setIndex(indices);
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terrainGeometry,
    keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })),
  );
  terrain.receiveShadow = true;
  group.add(terrain);

  /* ---------- Ski tracks: two grooves, revealed as the rider passes ---------- */

  const trackXs = [];
  const trackPoints = [];
  for (let x = 0; x < course.finishX + 400; x += 6) {
    const u = x / course.runLength - Math.floor(x / course.runLength);
    const inAir = x < course.finishX && u > KICKER.lip - 0.003 && u < LANDING + 0.004;
    if (inAir) continue;
    [-4.5, 4.5].forEach((z) => {
      trackPoints.push(x, heightAt(x, z) + 0.6, z, x + 6, heightAt(x + 6, z) + 0.6, z);
    });
    trackXs.push(x);
  }
  const trackGeometry = keep(new THREE.BufferGeometry());
  trackGeometry.setAttribute("position", new THREE.Float32BufferAttribute(trackPoints, 3));
  const tracks = new THREE.LineSegments(
    trackGeometry,
    keep(new THREE.LineBasicMaterial({ color: "#9fb5dc" })),
  );
  group.add(tracks);

  /* ---------- Trees (instanced) ---------- */

  const tierGeometries = [];
  const trunk = new THREE.CylinderGeometry(3, 4, 18, 5);
  trunk.translate(0, 9, 0);
  tierGeometries.push(paint(trunk, "#5a3b28"));
  [0, 1, 2].forEach((tier) => {
    const radius = 30 - tier * 7;
    const height = 42 - tier * 6;
    const base = 14 + tier * 26;
    const cone = new THREE.ConeGeometry(radius, height, 7);
    cone.translate(0, base + height / 2, 0);
    tierGeometries.push(paint(cone, "#1f5f4a"));
    const cap = new THREE.ConeGeometry(radius * 0.42, height * 0.4, 7);
    cap.translate(0, base + height * 0.8 + 0.5, 0);
    tierGeometries.push(paint(cap, "#f2f7ff"));
  });
  const treeGeometry = keep(mergeGeometries(tierGeometries));
  tierGeometries.forEach((g) => g.dispose());

  const rand = seededRandom(2028);
  const treeSpots = [];
  for (let x = minX + 300; x < maxX - 300; x += 26 + rand() * 40) {
    const side = rand() < 0.5 ? -1 : 1;
    const z = side * (115 + rand() ** 1.6 * 1700);
    const u = x / course.runLength - Math.floor(x / course.runLength);
    const onCourse = x > 0 && x < course.finishX;
    // Keep sight lines open where the camera works: gates and jump zones.
    const nearGate = Math.abs(x - Math.round(x / course.runLength) * course.runLength) < 220 && Math.abs(z) < 360;
    const nearJump = onCourse && u > 0.3 && u < 0.97 && Math.abs(z) < 380;
    const nearLodge = Math.abs(x - (course.finishX + 560)) < 260 && z < 0 && z > -520;
    if (nearGate || nearJump || nearLodge) continue;
    treeSpots.push({ x, z, scale: 0.7 + rand() * 0.9, yaw: rand() * Math.PI, shade: rand() });
  }
  const trees = new THREE.InstancedMesh(
    treeGeometry,
    keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 })),
    treeSpots.length,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const tint = new THREE.Color();
  treeSpots.forEach((spot, i) => {
    position.set(spot.x, heightAt(spot.x, spot.z) - 2, spot.z);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw);
    scale.setScalar(spot.scale);
    matrix.compose(position, quaternion, scale);
    trees.setMatrixAt(i, matrix);
    trees.setColorAt(i, tint.setScalar(0.8 + spot.shade * 0.4));
  });
  trees.castShadow = true;
  trees.receiveShadow = true;
  group.add(trees);

  /* ---------- Distant peaks ---------- */

  const peakGeometries = [];
  const prand = seededRandom(77);
  const addPeak = (x, z, radius, height) => {
    const baseY = -course.baseY(clamp(x, course.startX, course.endX)) + 700;
    const yaw = prand() * Math.PI;
    const cone = new THREE.ConeGeometry(radius, height, 6, 1);
    cone.rotateY(yaw);
    cone.translate(x, baseY + height / 2, z);
    peakGeometries.push(paint(cone, prand() < 0.5 ? "#5d74b8" : "#4b61a3"));
    const capHeight = height * 0.36;
    const cap = new THREE.ConeGeometry(radius * 0.36 * 1.01, capHeight, 6, 1);
    cap.rotateY(yaw);
    cap.translate(x, baseY + height - capHeight / 2 + 1, z);
    peakGeometries.push(paint(cap, "#f4f8ff"));
  };
  for (let x = minX - 3000; x < maxX + 3000; x += 700 + prand() * 600) {
    [-1, 1].forEach((side) => {
      addPeak(x, side * (3300 + prand() * 2600), 900 + prand() * 900, 1500 + prand() * 1700);
    });
  }
  for (let z = -6000; z <= 6000; z += 1300 + prand() * 500) {
    addPeak(maxX + 2500 + prand() * 2500, z, 1200 + prand() * 800, 1800 + prand() * 1500);
    addPeak(minX - 2500 - prand() * 2500, z, 1200 + prand() * 800, 1800 + prand() * 1500);
  }
  const peaks = new THREE.Mesh(
    keep(mergeGeometries(peakGeometries)),
    keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })),
  );
  peakGeometries.forEach((g) => g.dispose());
  group.add(peaks);

  /* ---------- Props ---------- */

  const standard = (color, extra = {}) =>
    keep(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, ...extra }));
  const mesh = (geometry, material, parent) => {
    const m = new THREE.Mesh(keep(geometry), material);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const poleMaterial = standard("#2b3550");

  function flag(parent, color, x, y, z, height = 46) {
    const pole = mesh(new THREE.CylinderGeometry(1, 1, height, 5), poleMaterial, parent);
    pole.position.set(x, y + height / 2, z);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(20, -6);
    shape.lineTo(0, -12);
    const cloth = mesh(new THREE.ShapeGeometry(shape), standard(color, { side: THREE.DoubleSide }), parent);
    cloth.position.set(x, y + height, z);
    animated.push((time) => {
      cloth.rotation.y = Math.sin(time * 5 + x * 0.01 + z) * 0.6;
    });
  }

  // Gates at every stop.
  const lamps = [];
  course.stops.forEach((stop, index) => {
    const x = course.stopX(index);
    const gate = new THREE.Group();
    gate.position.set(x, heightAt(x, 0), 0);
    group.add(gate);
    const finish = stop.kind === "finish";
    const span = finish ? POLE_Z * 1.4 : POLE_Z;
    const height = finish ? 140 : 112;
    const color = finish ? "#ffffff" : stop.kind === "start" ? "#ff4d4d" : GATE_COLORS[index % GATE_COLORS.length];

    [-span, span].forEach((z) => {
      const pole = mesh(new THREE.CylinderGeometry(3, 3, height, 6), poleMaterial, gate);
      pole.position.set(0, height / 2, z);
      const lamp = mesh(new THREE.SphereGeometry(5, 8, 6), standard("#ff4d4d", { emissive: "#ff4d4d", emissiveIntensity: 0.8 }), gate);
      lamp.position.set(0, height + 22, z);
      lamps.push({ lamp, index });
    });

    const text = finish ? "FINISH" : stop.kind === "start" ? "START" : stop.number;
    const label = textLabel(text, color, "#0b1030", { checkered: finish });
    labels.push(label);
    keep(label.texture);
    const face = keep(new THREE.MeshStandardMaterial({ map: label.texture, roughness: 0.6 }));
    const edge = standard(color);
    const banner = mesh(new THREE.BoxGeometry(5, 34, span * 2 + 8), [face, face, edge, edge, edge, edge], gate);
    banner.position.set(0, height, 0);
    flag(gate, color === "#ffffff" ? "#ff4d4d" : color, 0, height + 26, -span);
  });

  // Kicker flags: orange at the lip, cyan on the landing.
  course.jumps.forEach((jump) => {
    [-LANE - 12, LANE + 12].forEach((z) => {
      flag(group, "#ff8a3d", jump.lipX, heightAt(jump.lipX + 10, z), z, 36);
      flag(group, "#5ef0ff", jump.landX + 40, heightAt(jump.landX + 40, z), z, 36);
    });
  });

  // Summit sign and flag.
  const summitX = -200;
  const sign = new THREE.Group();
  sign.position.set(summitX, heightAt(summitX, -120), -120);
  sign.rotation.y = -0.5;
  group.add(sign);
  const post = mesh(new THREE.BoxGeometry(5, 50, 5), standard("#6b4a2f"), sign);
  post.position.y = 25;
  const signLabel = labelTexture((ctx, w, h) => {
    ctx.fillStyle = "#8b6340";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff6d0";
    ctx.font = `30px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SUMMIT 11,000'", w / 2, h / 2 + 2);
  });
  labels.push(signLabel);
  keep(signLabel.texture);
  const signFace = keep(new THREE.MeshStandardMaterial({ map: signLabel.texture }));
  const board = mesh(new THREE.BoxGeometry(150, 28, 4), [standard("#6b4a2f"), standard("#6b4a2f"), standard("#6b4a2f"), standard("#6b4a2f"), signFace, signFace], sign);
  board.position.y = 58;
  flag(group, "#ff4d4d", -340, heightAt(-340, 40), 40, 90);

  // Base lodge.
  const lodge = new THREE.Group();
  const lodgeX = course.finishX + 560;
  lodge.position.set(lodgeX, heightAt(lodgeX, -300) - 4, -300);
  lodge.rotation.y = 0.25;
  group.add(lodge);
  const walls = mesh(new THREE.BoxGeometry(260, 100, 160), standard("#7a4b2a"), lodge);
  walls.position.y = 50;
  const roof = mesh(new THREE.CylinderGeometry(0, 150, 80, 4, 1), standard("#f2f7ff"), lodge);
  roof.scale.set(1.25, 1, 0.85);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 140;
  const windowMaterial = standard("#ffd57a", { emissive: "#ffb347", emissiveIntensity: 0.9 });
  [-80, -20, 40].forEach((x) => {
    const win = mesh(new THREE.BoxGeometry(34, 28, 2), windowMaterial, lodge);
    win.position.set(x, 58, 81);
  });
  const chimney = mesh(new THREE.BoxGeometry(18, 60, 18), standard("#6b6f7a"), lodge);
  chimney.position.set(70, 150, -30);

  /* ---------- Per-frame ---------- */

  const green = new THREE.Color("#2bd9a0");
  const red = new THREE.Color("#ff4d4d");
  function update(frame) {
    const { time, maxProgress, skier } = frame;
    animated.forEach((fn) => fn(time));
    lamps.forEach(({ lamp, index }) => {
      const reached = maxProgress >= index - 0.02;
      const on = reached || Math.sin(time * 5) > 0;
      const color = reached ? green : red;
      lamp.material.color.copy(color);
      lamp.material.emissive.copy(color);
      lamp.material.emissiveIntensity = on ? 0.9 : 0.1;
    });

    // Reveal tracks up to just behind the rider.
    let lo = 0;
    let hi = trackXs.length;
    const limit = skier.x - 18;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (trackXs[mid] < limit) lo = mid + 1;
      else hi = mid;
    }
    trackGeometry.setDrawRange(0, lo * 4);
  }

  /* Repaint banners once the pixel font has loaded. */
  function refreshLabels() {
    labels.forEach((label) => label.redraw());
  }

  function dispose() {
    disposables.forEach((thing) => thing.dispose());
    trees.dispose();
  }

  return { group, heightAt, update, refreshLabels, dispose };
}

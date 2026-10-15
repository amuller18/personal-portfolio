/*
 * The 3D mountain, built from the same course geometry as the 2D view. The
 * course's ground line runs down the middle of the piste (z = 0); the rest of
 * the valley, the trees and the peaks are dressing around it.
 *
 * Axes: x downhill, y up (= -course y), z across the slope.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CLIFF, KICKER, LIFT, LODGE } from "../../model/course";
import { clamp, lerp, seededRandom, smoothRange } from "../../../shared/math";
import { GATE_COLORS } from "../palette";
import { SURFACE_MAX_WIDTH, SURFACE_SPECS, SURFACE_WORLD_HEIGHT, surfaceKindFor } from "../surfaces";

const FONT = '"Press Start 2P", ui-monospace, monospace';
const LANE = 60;
const POLE_Z = 85;
const BOARD_Z = -140;
const DOWN_LINE_Z = 60;
const CHAIRS_PER_LIFT = 18;

const noise = (x, z) =>
  Math.sin(x * 0.0071 + z * 0.013) * Math.sin(z * 0.0093 - x * 0.0041) +
  0.5 * Math.sin(x * 0.019 - z * 0.017);

const IDENTITY = new THREE.Quaternion();
const HIDDEN_SCALE = new THREE.Vector3(0.0001, 0.0001, 0.0001);

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
    let size = 40;
    ctx.font = `${size}px ${FONT}`;
    while (size > 12 && ctx.measureText(text).width > w * 0.9) {
      size -= 2;
      ctx.font = `${size}px ${FONT}`;
    }
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

  function naturalHeight(x, z) {
    const az = Math.abs(z);
    let h = -course.baseY(x);
    h += course.kickerBump(x) * (1 - smoothRange(az, LANE * 0.75, LANE * 1.25));
    h += smoothRange(az, 160, 2600) ** 1.4 * 950;
    h += noise(x, z) * smoothRange(az, 110, 500) * 45;
    return h;
  }

  /* Level building pads (the lodge) across the slope, feathered at the edges. */
  function heightAt(x, z) {
    const h = naturalHeight(x, z);
    let weight = 0;
    course.pads.forEach((pad) => {
      const dx = Math.max(pad.x0 - x, 0, x - pad.x1);
      const dz = Math.max(pad.z0 - z, 0, z - pad.z1);
      weight = Math.max(weight, 1 - smoothRange(Math.hypot(dx, dz), 0, 140));
    });
    return weight > 0 ? lerp(h, -course.baseY(x), weight) : h;
  }

  const isSteep = (x) => Math.abs(course.baseY(x + 4) - course.baseY(x - 4)) / 8 > 1.2;
  const cliffRuns = course.runs.filter((run) => run.cliff);

  const xs = [];
  for (let x = minX; x <= maxX; ) {
    xs.push(x);
    const at = course.descentAt(x);
    const nearKicker = Boolean(at) && at.u > KICKER.start - 0.02 && at.u < KICKER.end + 0.01;
    const nearCliff = cliffRuns.some((run) => x > run.cliff.lipX - 30 && x < run.cliff.lipX + 100);
    x += nearKicker ? 4 : nearCliff ? 6 : 22;
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
      if (isSteep(x)) tmp.copy(rock).lerp(snow, 0.15 * noise(x, z * 2) + 0.1);
      else if (bump > 1 && az < LANE) tmp.copy(kicker);
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
    if (!course.isSkied(x) || !course.isSkied(x + 6)) continue;
    // Two grooves that follow the rider's line (it weaves in the glade).
    const z0 = course.lineZ(x);
    const z1 = course.lineZ(x + 6);
    [-4.5, 4.5].forEach((dz) => {
      trackPoints.push(x, heightAt(x, z0 + dz) + 0.6, z0 + dz, x + 6, heightAt(x + 6, z1 + dz) + 0.6, z1 + dz);
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

  /* ---------- Set-piece placement (boards are built further down) ---------- */

  const stopXs = course.stops.map((_, index) => course.stopX(index));
  const placements = [];
  course.stops.forEach((stop, index) => {
    const kind = surfaceKindFor(stop);
    if (!kind) return;
    const sx = stopXs[index];
    const run = course.runs[index - 1];
    const base = { index, kind, stop, facing: 1 };
    switch (kind) {
      case "station":
        // Lift house to the right of the lift line (+z), its wall facing the queue.
        placements.push({ ...base, cx: sx - 120, faceZ: 300, facing: -1 });
        break;
      case "treeSign":
        // Small trail sign at the bottom of the glade, on the left.
        placements.push({ ...base, cx: sx + 120, faceZ: -100 });
        break;
      case "ski":
        // The lost ski, stuck upright in the snow just past where Alex stopped.
        placements.push({ ...base, cx: run.cliff.skiX, faceZ: run.cliff.skiZ });
        break;
      case "menu":
        // Chalkboard menu on the lodge's back wall, inside.
        placements.push({ ...base, cx: sx, faceZ: LODGE.frontZ - LODGE.depth + 14 });
        break;
      default:
        // Trail map and jumbotron: on the left, just past the stop.
        placements.push({ ...base, cx: sx + 40 + SURFACE_MAX_WIDTH / 2, faceZ: kind === "jumbotron" ? -170 : BOARD_Z });
    }
  });
  const clearZones = placements
    .filter((place) => place.kind !== "menu")
    .map(({ cx, faceZ, facing }) => ({
      x0: cx - SURFACE_MAX_WIDTH / 2 - 240,
      x1: cx + SURFACE_MAX_WIDTH / 2 + 240,
      z0: Math.min(faceZ + facing * 700, faceZ - facing * 420),
      z1: Math.max(faceZ + facing * 700, faceZ - facing * 420),
    }));
  // Open space around the base area where the intro happens, and the lodge.
  clearZones.push({ x0: -420, x1: stopXs[1] + 80, z0: -420, z1: 420 });
  course.pads.forEach((pad) => clearZones.push({ x0: pad.x0 - 120, x1: pad.x1 + 120, z0: pad.z0 - 120, z1: pad.z1 + 380 }));
  const inClearZone = (x, z) => clearZones.some((zone) => x > zone.x0 && x < zone.x1 && z > zone.z0 && z < zone.z1);

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
    const at = course.descentAt(x);
    const run = course.runAt(x);
    // Keep sight lines open where the camera works: stops, jumps, the lift line, boards.
    const nearGate = stopXs.some((sx) => Math.abs(x - sx) < 220) && Math.abs(z) < 360;
    const nearJump = Boolean(at) && at.u > 0.3 && at.u < 0.97 && Math.abs(z) < 380;
    const liftLine = Boolean(run) && run.type === "lift" && Math.abs(z - DOWN_LINE_Z / 2) < 210;
    const nearLodge = Math.abs(x - (course.finishX + 560)) < 260 && z < 0 && z > -520;
    const nearBoard = inClearZone(x, z);
    if (nearGate || nearJump || liftLine || nearLodge || nearBoard) continue;
    treeSpots.push({ x, z, scale: 0.7 + rand() * 0.9, yaw: rand() * Math.PI, shade: rand() });
  }

  // The glade: dense trees on both sides of the weaving line, plus a tree on
  // the far side of every turn so the line visibly weaves around it.
  const grand = seededRandom(404);
  course.runs
    .filter((run) => run.type === "glade")
    .forEach((run) => {
      for (let local = 140; local < run.length - 220; local += 30 + grand() * 22) {
        const x = run.start + local;
        const line = course.lineZ(x);
        [-1, 1].forEach((side) => {
          const z = line + side * (78 + grand() ** 1.4 * 330);
          if (!inClearZone(x, z)) {
            treeSpots.push({ x, z, scale: 0.75 + grand() * 0.7, yaw: grand() * Math.PI, shade: grand() });
          }
        });
      }
      for (let peak = 120; peak < run.length - 300; peak += 240) {
        const x = run.start + peak;
        const line = course.lineZ(x);
        if (Math.abs(line) > 40) {
          treeSpots.push({ x, z: -Math.sign(line) * 22, scale: 1.05, yaw: grand() * Math.PI, shade: grand() });
        }
      }
    });
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
    if (surfaceKindFor(stop) || stop.kind === "start") return;
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

  // Base area: a ski rack and a sign pointing to the lift.
  const rack = new THREE.Group();
  rack.position.set(-70, heightAt(-70, 120), 120);
  rack.rotation.y = Math.PI - 0.2;
  group.add(rack);
  [-1, 1].forEach((side) => {
    const leg = mesh(new THREE.BoxGeometry(5, 46, 5), standard("#6b4a2f"), rack);
    leg.position.set(side * 60, 23, 0);
  });
  const rail = mesh(new THREE.BoxGeometry(130, 5, 6), standard("#6b4a2f"), rack);
  rail.position.y = 44;
  ["#3a63d8", "#2bd9a0", "#ffd23f", "#c77dff", "#ff8a3d"].forEach((color, i) => {
    const pair = mesh(new THREE.BoxGeometry(5, 66, 3), standard(color), rack);
    pair.position.set(-48 + i * 24, 33, 5);
    pair.rotation.z = 0.08;
  });

  const sign = new THREE.Group();
  sign.position.set(170, heightAt(170, 110), 110);
  sign.rotation.y = -0.35;
  group.add(sign);
  const post = mesh(new THREE.BoxGeometry(5, 64, 5), standard("#6b4a2f"), sign);
  post.position.y = 32;
  const signLabel = labelTexture((ctx, w, h) => {
    ctx.fillStyle = "#8b6340";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff6d0";
    ctx.font = `30px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LIFT 1  ->", w / 2, h / 2 + 2);
  });
  labels.push(signLabel);
  keep(signLabel.texture);
  const signFace = keep(new THREE.MeshStandardMaterial({ map: signLabel.texture }));
  const signWood = standard("#6b4a2f");
  const board = mesh(new THREE.BoxGeometry(130, 26, 4), [signWood, signWood, signWood, signWood, signFace, signFace], sign);
  board.position.y = 72;

  // Lift-line maze: posts and ropes leading to the loading point.
  const queueX = placements.find((place) => place.kind === "station");
  const queueStops = [];
  if (queueX) {
    const sx = stopXs[queueX.index];
    const ropeMaterial = keep(new THREE.LineBasicMaterial({ color: "#ff4d4d" }));
    [-26, 26, 96, 142].forEach((z) => {
      const points = [];
      for (let x = sx - 200; x <= sx + 40; x += 40) {
        const ground = heightAt(x, z);
        const stake = mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 6), standard("#2b3550"), group);
        stake.position.set(x, ground + 15, z);
        points.push(new THREE.Vector3(x, ground + 26, z));
      }
      group.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(points)), ropeMaterial));
    });
    // Other skiers wait in the next lane over, so the walk-in stays clear.
    // Clear of the returning chairs (z = 60), so nobody stands in their path.
    queueStops.push({ x: sx + 20, z: 119 }, { x: sx - 30, z: 121 }, { x: sx - 82, z: 117 });
  }

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

  /* ---------- Chairlifts ---------- */

  // Chair in seat space: seat top at y = 7 (the rider's hips), backrest
  // behind the rider's back, hanger running up behind it to the cable grip.
  const chairParts = [];
  const hangerTop = LIFT.hanger + 7;
  const hangerPole = new THREE.CylinderGeometry(1.3, 1.3, hangerTop - 30, 5);
  hangerPole.translate(-27, 30 + (hangerTop - 30) / 2, 0);
  chairParts.push(paint(hangerPole, "#2b3550"));
  const grip = new THREE.BoxGeometry(29, 2.6, 2.6);
  grip.translate(-13.5, hangerTop, 0);
  chairParts.push(paint(grip, "#2b3550"));
  const seat = new THREE.BoxGeometry(26, 3, 44);
  seat.translate(-10, 5.5, 0);
  chairParts.push(paint(seat, "#3a63d8"));
  const back = new THREE.BoxGeometry(3, 28, 44);
  back.translate(-24, 20, 0);
  chairParts.push(paint(back, "#3a63d8"));
  const frameBar = new THREE.BoxGeometry(2, 2, 46);
  frameBar.translate(-27, 30, 0);
  chairParts.push(paint(frameBar, "#2b3550"));
  const bar = new THREE.BoxGeometry(2, 2, 46);
  bar.translate(16, 30, 0);
  chairParts.push(paint(bar, "#2b3550"));
  [-23, 23].forEach((z) => {
    const arm = new THREE.BoxGeometry(42, 2, 2);
    arm.translate(-5, 30, z);
    chairParts.push(paint(arm, "#2b3550"));
  });
  const footrest = new THREE.BoxGeometry(3, 2, 36);
  footrest.translate(18, -22, 0);
  chairParts.push(paint(footrest, "#2b3550"));
  const chairGeometry = keep(mergeGeometries(chairParts));
  chairParts.forEach((g) => g.dispose());
  const chairMaterial = keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }));

  const loopChairs = new THREE.InstancedMesh(chairGeometry, chairMaterial, Math.max(1, course.lifts.length * CHAIRS_PER_LIFT));
  loopChairs.castShadow = true;
  loopChairs.count = course.lifts.length * CHAIRS_PER_LIFT;
  group.add(loopChairs);
  const riderChair = new THREE.Mesh(chairGeometry, chairMaterial);
  riderChair.castShadow = true;
  riderChair.visible = false;
  group.add(riderChair);

  const steel = standard("#2b3550");
  const housing = standard("#d64545");
  const cableMaterial = keep(new THREE.LineBasicMaterial({ color: "#1b2236" }));
  course.lifts.forEach((lift) => {
    // Cables: one up line (z = 0, where the rider sits) and one down line.
    [0, DOWN_LINE_Z].forEach((z) => {
      const points = [];
      for (let i = 0; i <= 48; i += 1) {
        const seatPoint = lift.seatAt(i / 48);
        points.push(new THREE.Vector3(seatPoint.x, -seatPoint.y + LIFT.hanger + 7, z));
      }
      group.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(points)), cableMaterial));
    });

    // Bullwheel terminals at both ends.
    [
      [lift.seatAt(0), -40],
      [lift.seatAt(1), 40],
    ].forEach(([seatPoint, push]) => {
      const x = seatPoint.x + push;
      const ground = heightAt(x, DOWN_LINE_Z / 2);
      const cableY = -seatPoint.y + LIFT.hanger + 7;
      const column = mesh(new THREE.BoxGeometry(14, 1, 14), steel, group);
      column.scale.y = cableY + 24 - ground;
      column.position.set(x, ground + column.scale.y / 2, DOWN_LINE_Z / 2);
      const wheel = mesh(new THREE.CylinderGeometry(DOWN_LINE_Z / 2 + 4, DOWN_LINE_Z / 2 + 4, 4, 20), steel, group);
      wheel.position.set(x, cableY, DOWN_LINE_Z / 2);
      const cap = mesh(new THREE.BoxGeometry(96, 30, 92), housing, group);
      cap.position.set(x, cableY + 26, DOWN_LINE_Z / 2);
      const roofCap = mesh(new THREE.BoxGeometry(100, 6, 96), standard("#f2f7ff"), group);
      roofCap.position.set(x, cableY + 44, DOWN_LINE_Z / 2);
    });

    // Towers between the terminals.
    [0.18, 0.36, 0.54, 0.72, 0.88].forEach((t) => {
      const seatPoint = lift.seatAt(t);
      const x = seatPoint.x;
      const top = -seatPoint.y + LIFT.hanger + 14;
      const ground = heightAt(x, DOWN_LINE_Z / 2);
      const column = mesh(new THREE.BoxGeometry(9, 1, 9), steel, group);
      column.scale.y = top - ground;
      column.position.set(x, ground + column.scale.y / 2, DOWN_LINE_Z / 2);
      const arm = mesh(new THREE.BoxGeometry(6, 6, DOWN_LINE_Z + 28), steel, group);
      arm.position.set(x, top, DOWN_LINE_Z / 2);
      [0, DOWN_LINE_Z].forEach((z) => {
        const sheave = mesh(new THREE.BoxGeometry(22, 5, 5), housing, group);
        sheave.position.set(x, top - 6, z);
      });
    });
  });

  const chairMatrix = new THREE.Matrix4();
  const chairPos = new THREE.Vector3();
  const chairQuat = new THREE.Quaternion();
  const chairScale = new THREE.Vector3(1, 1, 1);
  const downTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  function updateChairs(time, skier) {
    course.lifts.forEach((lift, li) => {
      for (let i = 0; i < CHAIRS_PER_LIFT; i += 1) {
        const p = (((time * 0.035 + i / CHAIRS_PER_LIFT + li * 0.13) % 1) + 1) % 1;
        const up = p < 0.5;
        const seatPoint = lift.seatAt(up ? p * 2 : 1 - (p - 0.5) * 2);
        chairPos.set(seatPoint.x, -seatPoint.y, up ? 0 : DOWN_LINE_Z);
        chairQuat.copy(up ? IDENTITY : downTurn);
        // Leave a gap on the up line around the rider's own chair.
        const crowding = up && skier.lift && Math.abs(seatPoint.x - skier.lift.chairX) < 90;
        chairMatrix.compose(chairPos, chairQuat, crowding ? HIDDEN_SCALE : chairScale);
        loopChairs.setMatrixAt(li * CHAIRS_PER_LIFT + i, chairMatrix);
      }
    });
    loopChairs.instanceMatrix.needsUpdate = true;

    riderChair.visible = Boolean(skier.lift);
    if (skier.lift) riderChair.position.set(skier.lift.chairX, -skier.lift.chairY, 0);
  }

  /* ---------- Boards: lift station wall and trail map ---------- */

  function plankTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const prand2 = seededRandom(5);
    for (let x = 0; x < 256; x += 32) {
      const shade = 100 + Math.floor(prand2() * 28);
      ctx.fillStyle = `rgb(${shade + 22}, ${Math.floor(shade * 0.62)}, ${Math.floor(shade * 0.36)})`;
      ctx.fillRect(x, 0, 32, 256);
      ctx.fillStyle = "rgba(40, 22, 10, 0.55)";
      ctx.fillRect(x, 0, 2, 256);
      ctx.fillStyle = "rgba(40, 22, 10, 0.25)";
      ctx.fillRect(x + 10 + prand2() * 12, 40 + prand2() * 160, 3, 5);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 2);
    return keep(texture);
  }
  const timber = keep(new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.85 }));
  const darkWood = standard("#4a2f1c");
  const stone = standard("#8a8f9c");
  const snowCap = standard("#f4f8ff");
  const ink = standard("#0b1030");
  const bulb = standard("#fff1c1", { emissive: "#ffd57a", emissiveIntensity: 1.4 });

  /* A prism roof whose ridge runs along x. */
  function gableRoof(width, depth, rise) {
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2, 0);
    shape.lineTo(depth / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-width / 2, 0, 0);
    return geometry;
  }

  /* Wooden frame + dark backing that resizes to the board's content. */
  function boardFrame(parent) {
    const backing = mesh(new THREE.BoxGeometry(1, 1, 8), ink, parent);
    backing.position.z = -4;
    const rails = [0, 1, 2, 3].map(() => mesh(new THREE.BoxGeometry(1, 1, 16), darkWood, parent));
    return (w, h) => {
      backing.scale.set(w + 8, h + 8, 1);
      const [top, bottom, left, right] = rails;
      top.scale.set(w + 36, 18, 1);
      top.position.set(0, h / 2 + 9, 2);
      bottom.scale.set(w + 36, 18, 1);
      bottom.position.set(0, -h / 2 - 9, 2);
      left.scale.set(18, h + 36, 1);
      left.position.set(-w / 2 - 9, 0, 2);
      right.scale.set(18, h + 36, 1);
      right.position.set(w / 2 + 9, 0, 2);
    };
  }

  function floorAt(x0, x1, z) {
    let floor = -Infinity;
    for (let x = x0; x <= x1; x += 20) floor = Math.max(floor, heightAt(x, z));
    return floor;
  }

  const surfaces = new Map();

  /* Boards live in a "site" group: board center at the origin, front +z,
   * then the site is turned to face the right way in the world. */
  function makeSite(place, centerY) {
    const site = new THREE.Group();
    site.position.set(place.cx, centerY, place.faceZ);
    site.rotation.y = place.facing > 0 ? 0 : Math.PI;
    group.add(site);
    return site;
  }
  const worldX = (place, localX) => place.cx + place.facing * localX;
  const worldZ = (place, localZ) => place.faceZ + place.facing * localZ;

  function registerSurface(place, centerY, resize, extra = {}) {
    const surface = {
      kind: place.kind,
      center: new THREE.Vector3(place.cx, centerY, worldZ(place, 0.8)),
      normal: new THREE.Vector3(0, 0, place.facing),
      rotationY: place.facing > 0 ? 0 : Math.PI,
      rotationZ: 0,
      width: SURFACE_WORLD_HEIGHT,
      height: SURFACE_WORLD_HEIGHT,
      ...extra,
    };
    surface.resize = (w, h) => {
      surface.width = w;
      surface.height = h;
      resize(w, h);
    };
    surfaces.set(place.index, surface);
    return surface;
  }

  function buildStation(place) {
    const width = SURFACE_MAX_WIDTH + 190;
    const depth = 260;
    const floor = floorAt(place.cx - width / 2, place.cx + width / 2, worldZ(place, -14 - depth / 2));
    const centerY = floor + 70 + SURFACE_WORLD_HEIGHT / 2;
    const site = makeSite(place, centerY);

    const building = new THREE.Group();
    building.position.set(0, floor - centerY, -14 - depth / 2);
    site.add(building);
    const footing = mesh(new THREE.BoxGeometry(width + 24, 300, depth + 24), stone, building);
    footing.position.y = -110;
    const walls = mesh(new THREE.BoxGeometry(width, 400, depth), timber, building);
    walls.position.y = 240;
    [-width / 2, width / 2].forEach((x) => {
      const post = mesh(new THREE.BoxGeometry(22, 404, 22), darkWood, building);
      post.position.set(x, 240, depth / 2);
    });
    const beam = mesh(new THREE.BoxGeometry(width + 30, 20, 26), darkWood, building);
    beam.position.set(0, 446, depth / 2);
    const roof = mesh(gableRoof(width + 80, depth + 110, 170), darkWood, building);
    roof.position.y = 440;
    const snow = mesh(gableRoof(width + 70, depth + 96, 158), snowCap, building);
    snow.position.y = 452;

    const label = textLabel(`CHAIR 1 · ${(place.stop.ski.liftName || "EXPRESS").toUpperCase()}`, "#ffd23f", "#0b1030");
    labels.push(label);
    keep(label.texture);
    const face = keep(new THREE.MeshStandardMaterial({ map: label.texture, roughness: 0.6 }));
    const sign = mesh(new THREE.BoxGeometry(420, 56, 8), [darkWood, darkWood, darkWood, darkWood, face, darkWood], building);
    sign.position.set(0, 520, depth / 2 + 30);

    const resize = boardFrame(site);

    // Gooseneck lamps washing the board.
    [-0.3, 0.3].forEach((t) => {
      const lamp = new THREE.Group();
      lamp.position.set(t * SURFACE_MAX_WIDTH, SURFACE_WORLD_HEIGHT / 2 + 34, 0);
      site.add(lamp);
      const arm = mesh(new THREE.BoxGeometry(4, 4, 42), darkWood, lamp);
      arm.position.set(0, 0, 18);
      const shade = mesh(new THREE.ConeGeometry(12, 14, 8, 1, true), steel, lamp);
      shade.position.set(0, -6, 38);
      const glow = mesh(new THREE.SphereGeometry(5, 8, 6), bulb, lamp);
      glow.position.set(0, -10, 38);
    });

    registerSurface(place, centerY, resize);
  }

  function buildTrailMap(place) {
    const floor = floorAt(place.cx - SURFACE_MAX_WIDTH / 2, place.cx + SURFACE_MAX_WIDTH / 2, place.faceZ);
    const centerY = floor + 80 + SURFACE_WORLD_HEIGHT / 2;
    const site = makeSite(place, centerY);
    const sizeFrame = boardFrame(site);

    const posts = [0, 1].map(() => mesh(new THREE.CylinderGeometry(9, 11, 1, 8), darkWood, site));
    const roof = mesh(gableRoof(1, 70, 46), darkWood, site);
    const snow = mesh(gableRoof(1, 62, 40), snowCap, site);
    const label = textLabel("TRAIL MAP", "#0b1030", "#ffd23f");
    labels.push(label);
    keep(label.texture);
    const face = keep(new THREE.MeshStandardMaterial({ map: label.texture, roughness: 0.6 }));
    const header = mesh(new THREE.BoxGeometry(220, 40, 6), [darkWood, darkWood, darkWood, darkWood, face, darkWood], site);

    const resize = (w, h) => {
      sizeFrame(w, h);
      [-1, 1].forEach((side, i) => {
        const localX = side * (w / 2 + 24);
        const ground = heightAt(worldX(place, localX), place.faceZ) - 20 - centerY;
        const top = h / 2 + 40;
        posts[i].scale.y = top - ground;
        posts[i].position.set(localX, ground + (top - ground) / 2, -6);
      });
      roof.scale.set(w + 110, 1, 1);
      roof.position.set(0, h / 2 + 30, -6);
      snow.scale.set(w + 100, 1, 1);
      snow.position.set(0, h / 2 + 38, -6);
      header.position.set(0, h / 2 + 16, 14);
    };

    registerSurface(place, centerY, resize);
  }

  /* Chapter 3: a small trail sign in the trees that grows to fill the screen. */
  function buildTreeSign(place) {
    const spec = SURFACE_SPECS.treeSign;
    const ground = floorAt(place.cx - 60, place.cx + 60, place.faceZ);
    const smallScale = 0.3;
    const smallY = ground + 72;
    const fullY = ground + 40 + spec.height / 2;
    const site = makeSite(place, smallY);
    site.scale.setScalar(smallScale);
    const sizeFrame = boardFrame(site);
    const posts = [0, 1].map(() => mesh(new THREE.BoxGeometry(14, 1, 14), darkWood, site));
    const roof = mesh(gableRoof(1, 60, 40), darkWood, site);
    const snow = mesh(gableRoof(1, 54, 34), snowCap, site);
    const resize = (w, h) => {
      sizeFrame(w, h);
      posts.forEach((post, i) => {
        post.scale.y = 260;
        post.position.set((i ? 1 : -1) * (w / 2 - 30), -h / 2 - 130, -10);
      });
      roof.scale.set(w + 90, 1, 1);
      roof.position.set(0, h / 2 + 22, -8);
      snow.scale.set(w + 80, 1, 1);
      snow.position.set(0, h / 2 + 30, -8);
    };
    const surface = registerSurface(place, fullY, resize, {
      expand: { site, smallScale, smallY, fullY, value: 0 },
    });
    surface.center.y = fullY;
  }

  /* Chapter 4: the ski that came off in the crash, standing up in the snow. */
  function buildSki(place) {
    const spec = SURFACE_SPECS.ski;
    const ground = heightAt(place.cx, place.faceZ);
    const centerY = ground + spec.height / 2 - 10;
    const site = makeSite(place, centerY);
    site.rotation.z = 0.1;
    const topsheet = standard("#ff8a3d");
    const board = mesh(new THREE.BoxGeometry(1, 1, 3), topsheet, site);
    board.position.z = -1.6;
    // Rounded tip: a half disc on top of the plank.
    const tipShape = new THREE.Shape();
    tipShape.absarc(0, 0, 1, 0, Math.PI, false);
    tipShape.closePath();
    const tipGeometry = new THREE.ExtrudeGeometry(tipShape, { depth: 3, bevelEnabled: false, curveSegments: 14 });
    tipGeometry.translate(0, 0, -1.5);
    const tip = mesh(tipGeometry, topsheet, site);
    const mound = mesh(new THREE.SphereGeometry(30, 10, 6), snowCap, group);
    mound.scale.set(1.4, 0.35, 1);
    mound.position.set(place.cx, ground, place.faceZ);
    const resize = (w, h) => {
      board.scale.set(w + 4, h + 4, 1);
      tip.scale.set((w + 4) / 2, (w + 4) / 2, 1);
      tip.position.set(0, h / 2 + 2, -1.6);
    };
    registerSurface(place, centerY, resize, {
      rotationZ: 0.1,
      prop: { site, mound, home: site.position.clone(), rotationZ: 0.1 },
    });
  }

  /* Chapter 5: a terrain-park jumbotron on steel legs. */
  function buildJumbotron(place) {
    const floor = floorAt(place.cx - SURFACE_MAX_WIDTH / 2, place.cx + SURFACE_MAX_WIDTH / 2, place.faceZ);
    const centerY = floor + 120 + SURFACE_WORLD_HEIGHT / 2;
    const site = makeSite(place, centerY);
    const bezel = mesh(new THREE.BoxGeometry(1, 1, 18), ink, site);
    bezel.position.z = -10;
    const legs = [0, 1].map(() => mesh(new THREE.BoxGeometry(16, 1, 16), steel, site));
    const braces = [0, 1].map(() => mesh(new THREE.BoxGeometry(6, 1, 6), steel, site));
    const label = textLabel("PARK LEADERBOARD", "#ff4d4d", "#ffffff");
    labels.push(label);
    keep(label.texture);
    const face = keep(new THREE.MeshStandardMaterial({ map: label.texture, roughness: 0.5 }));
    const header = mesh(new THREE.BoxGeometry(320, 46, 8), [ink, ink, ink, ink, face, ink], site);
    const speakers = [0, 1].map(() => mesh(new THREE.BoxGeometry(30, 70, 24), ink, site));
    const resize = (w, h) => {
      bezel.scale.set(w + 30, h + 30, 1);
      legs.forEach((leg, i) => {
        const localX = (i ? 1 : -1) * (w / 2 - 40);
        const ground = heightAt(worldX(place, localX), place.faceZ) - centerY - 20;
        leg.scale.y = -h / 2 - ground;
        leg.position.set(localX, ground + leg.scale.y / 2, -14);
      });
      braces.forEach((brace, i) => {
        brace.scale.y = w - 80;
        brace.rotation.z = Math.PI / 2;
        brace.position.set(0, -h / 2 - 30 - i * 40, -14);
      });
      header.position.set(0, h / 2 + 40, 0);
      speakers.forEach((speaker, i) => speaker.position.set((i ? 1 : -1) * (w / 2 + 34), h / 2 - 40, -6));
    };
    registerSurface(place, centerY, resize);
  }

  /* Chapter 6: the mid-mountain lodge, open door, menu on the back wall. */
  function buildLodge(place) {
    const { width, depth, frontZ, doorWidth } = LODGE;
    const height = 290;
    const doorHeight = 180;
    const wall = 12;
    const backZ = frontZ - depth;
    const floor = floorAt(place.cx - width / 2, place.cx + width / 2, frontZ - depth / 2) + 4;
    const lodge = new THREE.Group();
    lodge.position.set(place.cx, floor, 0);
    group.add(lodge);
    const box = (w, h, d, material, x, y, z) => {
      const m = mesh(new THREE.BoxGeometry(w, h, d), material, lodge);
      m.position.set(x, y, z);
      return m;
    };
    box(width + 30, 200, depth + 30, stone, 0, -98, frontZ - depth / 2);
    box(width, 4, depth, standard("#7a5232"), 0, 2, frontZ - depth / 2);
    box(width, height, wall, timber, 0, height / 2, backZ + wall / 2);
    [-1, 1].forEach((side) => box(wall, height, depth, timber, side * (width / 2 - wall / 2), height / 2, frontZ - depth / 2));
    const sideWidth = (width - doorWidth) / 2;
    [-1, 1].forEach((side) => {
      box(sideWidth, height, wall, timber, side * (doorWidth / 2 + sideWidth / 2), height / 2, frontZ - wall / 2);
      // Warm windows either side of the door.
      box(110, 70, 2, bulb, side * (doorWidth / 2 + sideWidth / 2), 150, frontZ + 1);
    });
    box(doorWidth, height - doorHeight, wall, timber, 0, doorHeight + (height - doorHeight) / 2, frontZ - wall / 2);
    const roof = mesh(gableRoof(width + 70, depth + 90, 150), darkWood, lodge);
    roof.position.set(0, height, frontZ - depth / 2);
    const snowRoof = mesh(gableRoof(width + 60, depth + 78, 140), snowCap, lodge);
    snowRoof.position.set(0, height + 10, frontZ - depth / 2);
    box(30, 120, 30, stone, width / 2 - 80, height + 90, frontZ - depth / 2 - 60);

    // Inside: tables and benches, a counter, warm light.
    const tableWood = standard("#8b6340");
    [-1, 1].forEach((side) => {
      [0, 1].forEach((row) => {
        const x = side * 170;
        const z = frontZ - 120 - row * 150;
        box(120, 6, 50, tableWood, x, 44, z);
        box(10, 42, 10, darkWood, x, 21, z);
        [-1, 1].forEach((b) => box(120, 5, 16, darkWood, x, 24, z + b * 40));
      });
    });
    box(200, 60, 40, darkWood, 0, 30, backZ + 70);
    const light = new THREE.PointLight("#ffcf8f", 1.4, 700, 0);
    light.position.set(place.cx, floor + height - 50, frontZ - depth / 2);
    group.add(light);

    const sign = textLabel("LODGE", "#0b1030", "#ffd23f");
    labels.push(sign);
    keep(sign.texture);
    const signFace = keep(new THREE.MeshStandardMaterial({ map: sign.texture, roughness: 0.6 }));
    const signBoard = mesh(new THREE.BoxGeometry(220, 44, 8), [darkWood, darkWood, darkWood, darkWood, signFace, darkWood], lodge);
    signBoard.position.set(0, doorHeight + 50, frontZ + 8);

    // Ski rack by the door (where Alex leaves his skis).
    box(110, 5, 6, darkWood, doorWidth / 2 + 90, 44, frontZ + 30);
    ["#ff8a3d", "#d96a24", "#3a63d8"].forEach((color, i) => {
      const ski = box(5, 66, 3, standard(color), doorWidth / 2 + 60 + i * 22, 33, frontZ + 34);
      ski.rotation.z = 0.08;
    });

    // Menu chalkboard on the back wall, facing the door.
    const centerY = floor + 150;
    const site = makeSite(place, centerY);
    const resize = boardFrame(site);
    registerSurface(place, centerY, resize, { interior: true });
  }

  placements.forEach((place) => {
    const builders = {
      station: buildStation,
      trailMap: buildTrailMap,
      treeSign: buildTreeSign,
      ski: buildSki,
      jumbotron: buildJumbotron,
      menu: buildLodge,
    };
    builders[place.kind](place);
  });

  /* ---------- Drifting clouds (background motion behind the boards) ---------- */

  const cloudParts = [];
  [
    [0, 0, 0, 90],
    [80, -10, 20, 70],
    [-80, -14, -10, 64],
    [30, 30, 0, 60],
  ].forEach(([x, y, z, r]) => {
    const puff = new THREE.IcosahedronGeometry(r, 0);
    puff.translate(x, y, z);
    cloudParts.push(puff);
  });
  const cloudGeometry = keep(mergeGeometries(cloudParts));
  cloudParts.forEach((g) => g.dispose());
  const cloudMaterial = keep(
    new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 1, transparent: true, opacity: 0.92 }),
  );
  const crand = seededRandom(31);
  const clouds = Array.from({ length: 34 }, () => {
    const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
    const x = minX + crand() * (maxX - minX);
    const z = -(1100 + crand() * 2600);
    cloud.userData = { x, speed: 10 + crand() * 18, span: 2400 };
    cloud.position.set(x, -course.baseY(clamp(x, course.startX, course.endX)) + 700 + crand() * 900, z);
    cloud.scale.setScalar(0.8 + crand() * 1.6);
    group.add(cloud);
    return cloud;
  });

  /* ---------- Per-frame ---------- */

  const green = new THREE.Color("#2bd9a0");
  const red = new THREE.Color("#ff4d4d");
  function update(frame) {
    const { time, maxProgress, skier } = frame;
    animated.forEach((fn) => fn(time));
    updateChairs(time, skier);
    clouds.forEach((cloud) => {
      const { x, speed, span } = cloud.userData;
      cloud.position.x = x + ((time * speed) % span);
    });
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

  return { group, heightAt, update, refreshLabels, dispose, surfaces, queueStops };
}

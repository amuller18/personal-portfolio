/*
 * The 3D mountain, built from the same course geometry as the 2D view. The
 * course's ground line runs down the middle of the piste (z = 0); the rest of
 * the valley, the trees and the peaks are dressing around it.
 *
 * Axes: x downhill, y up (= -course y), z across the slope.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KICKER, LIFT } from "../../model/course";
import { clamp, seededRandom, smoothRange } from "../../../shared/math";
import { GATE_COLORS } from "../palette";
import { SURFACE_MAX_WIDTH, SURFACE_WORLD_HEIGHT, surfaceKindFor } from "../surfaces";

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
    const at = course.descentAt(x);
    const nearKicker = Boolean(at) && at.u > KICKER.start - 0.02 && at.u < KICKER.end + 0.01;
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
    if (!course.isSkied(x) || !course.isSkied(x + 6)) continue;
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

  /* ---------- Set-piece placement (boards are built further down) ---------- */

  const stopXs = course.stops.map((_, index) => course.stopX(index));
  const placements = [];
  course.stops.forEach((stop, index) => {
    const kind = surfaceKindFor(stop);
    if (!kind) return;
    const sx = stopXs[index];
    // The station sits uphill of its stop; the trail map just past it.
    const cx = kind === "station" ? sx - 70 - SURFACE_MAX_WIDTH / 2 : sx + 40 + SURFACE_MAX_WIDTH / 2;
    placements.push({ index, kind, stop, cx });
  });
  const clearZones = placements.map(({ cx, kind, index }) => ({
    x0: cx - SURFACE_MAX_WIDTH / 2 - 220,
    x1: kind === "station" ? stopXs[index] + 160 : cx + SURFACE_MAX_WIDTH / 2 + 120,
    z0: -720,
    z1: 560,
  }));

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
    const nearBoard = clearZones.some((zone) => x > zone.x0 && x < zone.x1 && z > zone.z0 && z < zone.z1);
    if (nearGate || nearJump || liftLine || nearLodge || nearBoard) continue;
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
    if (surfaceKindFor(stop)) return;
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

  /* ---------- Chairlifts ---------- */

  const chairParts = [];
  const hanger = new THREE.CylinderGeometry(1.2, 1.2, LIFT.hanger, 5);
  hanger.translate(0, LIFT.hanger / 2 + 7, 0);
  chairParts.push(paint(hanger, "#2b3550"));
  const seat = new THREE.BoxGeometry(18, 3, 42);
  seat.translate(1, 5.5, 0);
  chairParts.push(paint(seat, "#3a63d8"));
  const back = new THREE.BoxGeometry(3, 24, 42);
  back.translate(-8, 18, 0);
  chairParts.push(paint(back, "#3a63d8"));
  const bar = new THREE.BoxGeometry(2, 2, 44);
  bar.translate(14, 26, 0);
  chairParts.push(paint(bar, "#2b3550"));
  const footrest = new THREE.BoxGeometry(3, 2, 34);
  footrest.translate(16, -20, 0);
  chairParts.push(paint(footrest, "#2b3550"));
  [-21, 21].forEach((z) => {
    const arm = new THREE.BoxGeometry(2, 30, 2);
    arm.translate(-6, 22, z);
    chairParts.push(paint(arm, "#2b3550"));
  });
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

  function buildStation(place) {
    const width = SURFACE_MAX_WIDTH + 190;
    const depth = 260;
    const facade = BOARD_Z - 14;
    const floor = floorAt(place.cx - width / 2, place.cx + width / 2, facade - depth / 2);
    const building = new THREE.Group();
    building.position.set(place.cx, floor, facade - depth / 2);
    group.add(building);

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

    const centerY = floor + 70 + SURFACE_WORLD_HEIGHT / 2;
    const frame = new THREE.Group();
    frame.position.set(place.cx, centerY, BOARD_Z);
    group.add(frame);
    const resize = boardFrame(frame);

    // Gooseneck lamps washing the board.
    [-0.3, 0.3].forEach((t) => {
      const lamp = new THREE.Group();
      lamp.position.set(t * SURFACE_MAX_WIDTH, SURFACE_WORLD_HEIGHT / 2 + 34, 0);
      frame.add(lamp);
      const arm = mesh(new THREE.BoxGeometry(4, 4, 42), darkWood, lamp);
      arm.position.set(0, 0, 18);
      const shade = mesh(new THREE.ConeGeometry(12, 14, 8, 1, true), steel, lamp);
      shade.position.set(0, -6, 38);
      const glow = mesh(new THREE.SphereGeometry(5, 8, 6), bulb, lamp);
      glow.position.set(0, -10, 38);
    });

    surfaces.set(place.index, {
      kind: place.kind,
      center: new THREE.Vector3(place.cx, centerY, BOARD_Z + 0.8),
      resize,
    });
  }

  function buildTrailMap(place) {
    const floor = floorAt(place.cx - SURFACE_MAX_WIDTH / 2, place.cx + SURFACE_MAX_WIDTH / 2, BOARD_Z);
    const centerY = floor + 80 + SURFACE_WORLD_HEIGHT / 2;
    const frame = new THREE.Group();
    frame.position.set(place.cx, centerY, BOARD_Z);
    group.add(frame);
    const sizeFrame = boardFrame(frame);

    const posts = [0, 1].map(() => mesh(new THREE.CylinderGeometry(9, 11, 1, 8), darkWood, group));
    const roof = mesh(gableRoof(1, 70, 46), darkWood, frame);
    const snow = mesh(gableRoof(1, 62, 40), snowCap, frame);
    const label = textLabel("TRAIL MAP", "#0b1030", "#ffd23f");
    labels.push(label);
    keep(label.texture);
    const face = keep(new THREE.MeshStandardMaterial({ map: label.texture, roughness: 0.6 }));
    const header = mesh(new THREE.BoxGeometry(220, 40, 6), [darkWood, darkWood, darkWood, darkWood, face, darkWood], frame);

    const resize = (w, h) => {
      sizeFrame(w, h);
      [-1, 1].forEach((side, i) => {
        const x = place.cx + side * (w / 2 + 24);
        const ground = heightAt(x, BOARD_Z) - 20;
        const top = centerY + h / 2 + 40;
        posts[i].scale.y = top - ground;
        posts[i].position.set(x, ground + (top - ground) / 2, BOARD_Z - 6);
      });
      roof.scale.set(w + 110, 1, 1);
      roof.position.set(0, h / 2 + 30, -6);
      snow.scale.set(w + 100, 1, 1);
      snow.position.set(0, h / 2 + 38, -6);
      header.position.set(0, h / 2 + 16, 14);
    };

    surfaces.set(place.index, {
      kind: place.kind,
      center: new THREE.Vector3(place.cx, centerY, BOARD_Z + 0.8),
      resize,
    });
  }

  placements.forEach((place) => (place.kind === "station" ? buildStation(place) : buildTrailMap(place)));

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

  /* Resize every board to w x h world units (called on viewport resize). */
  function setSurfaceSize(w, h) {
    surfaces.forEach((surface) => surface.resize(w, h));
  }

  return { group, heightAt, update, refreshLabels, dispose, surfaces, setSurfaceSize };
}

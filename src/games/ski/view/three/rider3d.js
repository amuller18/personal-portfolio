/*
 * Low-poly 3D rider built from primitives. It reads the same pose fields as
 * the 2D sprite (see model/tricks.js): the joints are solved in the side
 * plane, then limbs are stretched between them, so every trick works in both
 * views. Here `spin` is a real rotation around the vertical axis.
 */
import * as THREE from "three";
import { clamp01, lerp } from "../../../shared/math";
import { RIDER, SKIER_SCALE } from "../drawSkier";

const PIVOT = 26;
const THIGH = 17;
const UP = new THREE.Vector3(0, 1, 0);

function kneeFor(hip, ankle) {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const d = Math.max(0.01, Math.min(Math.hypot(dx, dy), THIGH * 2 - 0.01));
  const off = Math.sqrt(Math.max(0, THIGH * THIGH - (d / 2) ** 2));
  // Perpendicular that points forward (+x): knees bend toward the ski tips.
  let nx = dy / d;
  let ny = -dx / d;
  if (nx < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: (hip.x + ankle.x) / 2 + nx * off, y: (hip.y + ankle.y) / 2 + ny * off };
}

const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

export function createRider() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const body = new THREE.Group();
  root.scale.setScalar(SKIER_SCALE);
  pivot.position.y = PIVOT;
  pivot.rotation.order = "ZYX";
  body.position.y = -PIVOT;
  root.add(pivot);
  pivot.add(body);

  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color)) {
      materials.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.65 }));
    }
    return materials.get(color);
  };
  const add = (geometry, color, parent = body) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const limbGeometry = (radius) => new THREE.CylinderGeometry(radius, radius, 1, 7);

  const ski = (color) => {
    const group = new THREE.Group();
    const board = add(new THREE.BoxGeometry(60, 1.6, 5.5), color, group);
    board.position.set(-1, 0.8, 0);
    const tip = add(new THREE.BoxGeometry(8, 1.6, 5.5), color, group);
    tip.position.set(31, 2.6, 0);
    tip.rotation.z = 0.55;
    const boot = add(new THREE.BoxGeometry(11, 7, 7), RIDER.boot, group);
    boot.position.set(0, 4.5, 0);
    body.add(group);
    return group;
  };

  const parts = {
    skiFront: ski(RIDER.ski),
    skiBack: ski(RIDER.skiBack),
    thighFront: add(limbGeometry(3.6), RIDER.pants),
    shinFront: add(limbGeometry(3.3), RIDER.pants),
    thighBack: add(limbGeometry(3.6), RIDER.pantsShade),
    shinBack: add(limbGeometry(3.3), RIDER.pantsShade),
    torso: add(new THREE.CylinderGeometry(6.2, 5.4, 1, 8), RIDER.jacket),
    armFront: add(limbGeometry(2.6), RIDER.jacketShade),
    armBack: add(limbGeometry(2.6), RIDER.jacketShade),
    poleFront: add(limbGeometry(0.7), RIDER.pole),
    poleBack: add(limbGeometry(0.7), RIDER.pole),
    gloveFront: add(new THREE.SphereGeometry(2.8, 6, 5), RIDER.goggles),
    gloveBack: add(new THREE.SphereGeometry(2.8, 6, 5), RIDER.goggles),
    head: new THREE.Group(),
    scarf: [0, 1, 2, 3].map(() => add(new THREE.BoxGeometry(5, 3, 3), RIDER.scarf)),
  };

  body.add(parts.head);
  add(new THREE.SphereGeometry(6.5, 10, 8), RIDER.skin, parts.head);
  const helmet = add(new THREE.SphereGeometry(7.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), RIDER.helmet, parts.head);
  helmet.position.y = 0.4;
  const goggles = add(new THREE.BoxGeometry(4, 4.2, 13), RIDER.goggles, parts.head);
  goggles.position.set(4.6, 0.5, 0);
  const lens = add(new THREE.BoxGeometry(1.2, 3, 11), RIDER.lens, parts.head);
  lens.position.set(6.8, 0.5, 0);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const place = (mesh, from, to) => {
    dir.subVectors(to, from);
    const length = Math.max(dir.length(), 0.001);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(length));
  };
  const v = (point, z) => new THREE.Vector3(point.x, -point.y, z);

  function update({ pose, time, speed, airborne, squash }) {
    pivot.rotation.z = (-pose.rotation * Math.PI) / 180;
    pivot.rotation.y = pose.spin * Math.PI * 2;

    const carve = airborne ? 0 : 0.15 + speed * 0.3;
    const bend = clamp01(Math.max(pose.tuck, carve) + squash * 0.6);
    const lift = pose.grab * 6 + pose.tuck * 3;

    // Side-plane joints (x forward, y down), same rig as the 2D sprite.
    const hip = { x: -3 - bend * 4, y: -(35 - bend * 13) };
    const front = { x: 4 + pose.split * 14, y: -pose.split * 4 - lift };
    const back = { x: -4 - pose.split * 14, y: -pose.split * 4 - lift };
    const shoulder = { x: hip.x + 7 + bend * 7, y: hip.y - 21 + bend * 5 };
    const head = { x: shoulder.x + 3, y: shoulder.y - 9 };

    parts.skiFront.position.set(front.x, -front.y, 5.5);
    parts.skiFront.rotation.set(0, pose.cross * 0.55, pose.split * 0.45);
    parts.skiBack.position.set(back.x, -back.y, -5.5);
    parts.skiBack.rotation.set(0, -pose.cross * 0.55, -pose.split * 0.45);

    [
      [front, 5, parts.thighFront, parts.shinFront],
      [back, -5, parts.thighBack, parts.shinBack],
    ].forEach(([foot, z, thigh, shin]) => {
      const ankle = { x: foot.x, y: foot.y - 7 };
      const knee = kneeFor(hip, ankle);
      place(thigh, v(hip, z * 0.7), v(knee, z));
      place(shin, v(knee, z), v(ankle, z));
    });

    place(parts.torso, a.copy(v(hip, 0)), b.copy(v(shoulder, 0)));
    parts.head.position.copy(v(head, 0));

    const rest = { x: shoulder.x + 12 - bend * 2, y: shoulder.y + 11 };
    const raised = { x: shoulder.x + 8, y: shoulder.y - 14 };
    const grabbed = { x: front.x + 8, y: front.y - 4 };
    const hand = mix(mix(rest, raised, pose.arms), grabbed, pose.grab);
    const backHand = mix(rest, raised, pose.arms);
    const tipFor = (h) =>
      mix(mix({ x: h.x - 26, y: h.y + 24 }, { x: h.x + 16, y: h.y - 22 }, pose.arms), { x: h.x - 30, y: h.y - 4 }, Math.max(pose.grab, pose.tuck * 0.6));

    const spread = 9 + pose.arms * 8;
    [
      [hand, spread, parts.armFront, parts.poleFront, parts.gloveFront],
      [backHand, -spread, parts.armBack, parts.poleBack, parts.gloveBack],
    ].forEach(([h, z, arm, pole, glove]) => {
      const handV = v(h, z);
      place(arm, v(shoulder, Math.sign(z) * 6), handV);
      place(pole, handV, v(tipFor(h), z * 1.1));
      glove.position.copy(handV);
    });

    const flutter = 1 + speed * 2.5;
    parts.scarf.forEach((piece, i) => {
      const k = i + 1;
      piece.position.set(
        shoulder.x - 2 - k * 5,
        -(shoulder.y - 2) - k * 1.2 + Math.sin(time * 14 + k * 1.3) * flutter * k * 0.5,
        Math.cos(time * 11 + k) * flutter * k * 0.4,
      );
      piece.rotation.z = Math.sin(time * 14 + k) * 0.4;
    });
  }

  function dispose() {
    root.traverse((node) => node.geometry && node.geometry.dispose());
    materials.forEach((m) => m.dispose());
  }

  return { root, update, dispose };
}

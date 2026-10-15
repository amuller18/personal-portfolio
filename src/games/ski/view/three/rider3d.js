/*
 * Low-poly 3D rider built from primitives. It reads the same pose fields as
 * the 2D sprite (see model/tricks.js): the joints are solved in the side
 * plane, then limbs are stretched between them, so every trick works in both
 * views. Here `spin` is a real rotation around the vertical axis.
 */
import * as THREE from "three";
import { RIDER, SKIER_SCALE } from "../drawSkier";
import { PIVOT, solveRig } from "../rig";

const UP = new THREE.Vector3(0, 1, 0);

export function createRider(palette = RIDER) {
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
    body.add(group);
    return group;
  };
  const boot = () => {
    const group = new THREE.Group();
    const shell = add(new THREE.BoxGeometry(11, 7, 7), palette.boot, group);
    shell.position.set(0, 3.5, 0);
    body.add(group);
    return group;
  };

  const parts = {
    skiFront: ski(palette.ski),
    bootFront: boot(),
    bootBack: boot(),
    skiBack: ski(palette.skiBack),
    thighFront: add(limbGeometry(3.6), palette.pants),
    shinFront: add(limbGeometry(3.3), palette.pants),
    thighBack: add(limbGeometry(3.6), palette.pantsShade),
    shinBack: add(limbGeometry(3.3), palette.pantsShade),
    torso: add(new THREE.CylinderGeometry(6.2, 5.4, 1, 8), palette.jacket),
    armFront: add(limbGeometry(2.6), palette.jacketShade),
    armBack: add(limbGeometry(2.6), palette.jacketShade),
    poleFront: add(limbGeometry(0.7), palette.pole),
    poleBack: add(limbGeometry(0.7), palette.pole),
    gloveFront: add(new THREE.SphereGeometry(2.8, 6, 5), palette.goggles),
    gloveBack: add(new THREE.SphereGeometry(2.8, 6, 5), palette.goggles),
    head: new THREE.Group(),
    scarf: [0, 1, 2].map(() => add(new THREE.BoxGeometry(6, 3, 3), palette.scarf)),
  };

  body.add(parts.head);
  add(new THREE.SphereGeometry(6.5, 10, 8), palette.skin, parts.head);
  const helmet = add(new THREE.SphereGeometry(7.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), palette.helmet, parts.head);
  helmet.position.y = 0.4;
  const goggles = add(new THREE.BoxGeometry(4, 4.2, 13), palette.goggles, parts.head);
  goggles.position.set(4.6, 0.5, 0);
  const lens = add(new THREE.BoxGeometry(1.2, 3, 11), palette.lens, parts.head);
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
    const rig = solveRig(pose, { time, speed, airborne, squash });

    // 2D angles are clockwise-positive in a y-down plane; flip for 3D.
    // Skis ride on the boots, or sit together on the shoulder when carried.
    const carry = rig.carry;
    parts.skiFront.position.copy(v(rig.skiFront, 5.5 + carry * 4.5));
    parts.skiFront.rotation.set(0, pose.cross * 0.55, -(rig.skiFront.angle - pose.cross * 0.6));
    parts.skiBack.position.copy(v(rig.skiBack, -5.5 + carry * 17));
    parts.skiBack.rotation.set(0, -pose.cross * 0.55, -(rig.skiBack.angle + pose.cross * 0.6));
    parts.bootFront.position.copy(v(rig.front, 5));
    parts.bootFront.rotation.set(0, 0, -rig.frontAngle * (1 - carry));
    parts.bootBack.position.copy(v(rig.back, -5));
    parts.bootBack.rotation.set(0, 0, -rig.backAngle * (1 - carry));

    place(parts.thighFront, v(rig.hip, 3.5), v(rig.kneeFront, 5));
    place(parts.shinFront, v(rig.kneeFront, 5), v(rig.ankleFront, 5));
    place(parts.thighBack, v(rig.hip, -3.5), v(rig.kneeBack, -5));
    place(parts.shinBack, v(rig.kneeBack, -5), v(rig.ankleBack, -5));

    place(parts.torso, a.copy(v(rig.hip, 0)), b.copy(v(rig.shoulder, 0)));
    parts.head.position.copy(v(rig.head, 0));

    const spread = 9 + pose.arms * 8;
    [
      [rig.hand, rig.tipFront, spread, parts.armFront, parts.poleFront, parts.gloveFront],
      [rig.backHand, rig.tipBack, -spread, parts.armBack, parts.poleBack, parts.gloveBack],
    ].forEach(([h, tip, z, arm, pole, glove]) => {
      const handV = v(h, z);
      place(arm, v(rig.shoulder, Math.sign(z) * 6), handV);
      place(pole, handV, v(tip, z * 1.1));
      glove.position.copy(handV);
    });

    parts.scarf.forEach((piece, i) => {
      const point = rig.scarf[Math.min(i, rig.scarf.length - 1)];
      const lead = i === 0 ? rig.neck : rig.scarf[i - 1];
      piece.position.set((point.x + lead.x) / 2, -(point.y + lead.y) / 2, point.z || 0);
      piece.rotation.z = Math.sin(time * 14 + i) * 0.4;
    });
  }

  function dispose() {
    root.traverse((node) => node.geometry && node.geometry.dispose());
    materials.forEach((m) => m.dispose());
  }

  return { root, update, dispose };
}

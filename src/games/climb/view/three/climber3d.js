/*
 * Low-poly climber built from primitives, posed every frame from the shared
 * rig (see ../rig.js). Limbs are stretched between joints, so any pose the
 * model produces just works. We mostly see Alex from behind, so the chalk
 * bag and harness are on show.
 */
import * as THREE from "three";
import { solveBody } from "../rig";

export const CLIMBER_COLORS = {
  shirt: "#ff6b3d",
  shirtShade: "#e2552a",
  pants: "#2b3a67",
  skin: "#e8b48f",
  helmet: "#ffd23f",
  shoe: "#1d1d27",
  harness: "#2bd9a0",
  chalkBag: "#c77dff",
};

const UP = new THREE.Vector3(0, 1, 0);

export function createClimber(colors = CLIMBER_COLORS) {
  const root = new THREE.Group();
  const materials = new Map();
  const geometries = [];
  const material = (color) => {
    if (!materials.has(color)) {
      materials.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 }));
    }
    return materials.get(color);
  };
  const add = (geometry, color, parent = root) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const limb = (radius, color) => add(new THREE.CylinderGeometry(radius, radius * 0.9, 1, 7), color);

  const torso = add(new THREE.CylinderGeometry(10, 8.5, 1, 8), colors.shirt);
  const pelvis = add(new THREE.SphereGeometry(9, 8, 6), colors.pants);
  const harness = add(new THREE.CylinderGeometry(10.4, 10.4, 3.2, 10), colors.harness);
  const chalkBag = add(new THREE.CylinderGeometry(4.2, 3.6, 7, 8), colors.chalkBag);
  const head = new THREE.Group();
  root.add(head);
  add(new THREE.SphereGeometry(7.5, 10, 8), colors.skin, head);
  const helmet = add(new THREE.SphereGeometry(8.6, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), colors.helmet, head);
  helmet.position.y = 1;

  const parts = {
    rh: {
      upper: limb(3.8, colors.shirtShade),
      lower: limb(3.2, colors.skin),
      end: add(new THREE.SphereGeometry(3.4, 6, 5), colors.skin),
    },
    lh: {
      upper: limb(3.8, colors.shirtShade),
      lower: limb(3.2, colors.skin),
      end: add(new THREE.SphereGeometry(3.4, 6, 5), colors.skin),
    },
    rf: {
      upper: limb(5.2, colors.pants),
      lower: limb(4.2, colors.pants),
      end: add(new THREE.BoxGeometry(7, 5, 14), colors.shoe),
    },
    lf: {
      upper: limb(5.2, colors.pants),
      lower: limb(4.2, colors.pants),
      end: add(new THREE.BoxGeometry(7, 5, 14), colors.shoe),
    },
  };

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const v = (point, out = new THREE.Vector3()) => out.set(point.x, point.y, point.z);
  const place = (mesh, from, to) => {
    dir.subVectors(to, from);
    const length = Math.max(dir.length(), 0.001);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(length));
  };
  const spine = new THREE.Vector3();

  function update(pose) {
    const body = solveBody(pose);
    v(body.up, spine);
    place(torso, v(body.hip, a), v(body.chest, b));
    pelvis.position.copy(v(body.hip, a));
    harness.position.copy(a).addScaledVector(spine, 4);
    harness.quaternion.setFromUnitVectors(UP, spine);
    chalkBag.position
      .copy(a)
      .addScaledVector(spine, 3)
      .add(b.set(0, 0, 11));
    chalkBag.quaternion.copy(harness.quaternion);

    head.position.copy(v(body.head, a));
    // Look up at the next hold while climbing, around at the view on top.
    head.quaternion.setFromUnitVectors(UP, spine);
    head.rotateX(-pose.look * 0.6);

    Object.entries(parts).forEach(([key, part]) => {
      const solved = body.limbs[key];
      place(part.upper, v(solved.root, a), v(solved.joint, b));
      place(part.lower, v(solved.joint, a), v(solved.end, b));
      part.end.position.copy(b);
      if (key === "rf" || key === "lf") {
        // Shoes point into the wall, tipped along the shin.
        part.end.rotation.set(Math.atan2(solved.end.y - solved.joint.y, 30) * 0.4, 0, 0);
        part.end.position.z -= 3;
      }
    });
  }

  function dispose() {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }

  return { root, update, dispose, hands: () => [parts.rh.end.position, parts.lh.end.position] };
}

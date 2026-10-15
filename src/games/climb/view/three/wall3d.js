/*
 * The desert tower, built from the same route geometry the model uses: the
 * face (wallZ), the holds, the bolts and the anchors. Everything else (the
 * summit, the desert floor, the far mesas) is dressing around it.
 *
 * Axes: x across the wall, y up, z out of the wall toward the viewer.
 */
import * as THREE from "three";
import { routeX, wallZ } from "../../model/route";
import { seededRandom, smoothRange } from "../../../shared/math";

const FONT = '"Press Start 2P", ui-monospace, monospace';
const HALF_WIDTH = 2400;
const STEP = 30;
const STRATA = ["#b5562f", "#c4653a", "#a94c2b", "#d07a45", "#9e4528", "#bf5d34"];
const VARNISH = new THREE.Color("#5a2f22");
const HOLD_ROCK = new THREE.Color("#e2ab72");
const HOLD_CHALK = new THREE.Color("#f6f1e8");
const QUICKDRAW = ["#ff4d4d", "#ffd23f", "#2bd9a0", "#5ef0ff", "#c77dff"];

const noise = (x, y) =>
  Math.sin(x * 0.0071 + y * 0.013) * Math.sin(y * 0.0093 - x * 0.0041) + 0.5 * Math.sin(x * 0.019 - y * 0.017);

/* Extra relief away from the route: columns and bulges the climber never touches. */
const relief = (x, y) => {
  const away = smoothRange(Math.abs(x - routeX(y)), 220, 520);
  return away * (26 * Math.sin(x * 0.014) + 14 * noise(x * 1.3, y * 0.8));
};
export const faceZ = (x, y) => wallZ(x, y) + relief(x, y);

function paint(geometry, color) {
  const c = new THREE.Color(color);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) c.toArray(colors, i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/* Chalk-on-rock lettering for each anchor ("P3 · 5.9 · Weekend Warrior"). */
function chalkLabel(lines) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = () => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 250, 240, 0.92)";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      let size = i === 0 ? 30 : 20;
      ctx.font = `${size}px ${FONT}`;
      while (size > 10 && ctx.measureText(line).width > canvas.width - 24) {
        size -= 2;
        ctx.font = `${size}px ${FONT}`;
      }
      ctx.fillText(line, 12, 36 + i * 52);
    });
    texture.needsUpdate = true;
  };
  redraw();
  return { texture, redraw };
}

export function buildWall(route) {
  const group = new THREE.Group();
  const disposables = [];
  const labels = [];
  const keep = (thing) => {
    disposables.push(thing);
    return thing;
  };
  const top = route.top;
  const rand = seededRandom(4242);
  const rockMaterial = keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));

  /* ---------- The face ---------- */

  const xs = [];
  for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += STEP) xs.push(x);
  const ys = [];
  for (let y = -120; y < top; y += STEP) ys.push(y);
  ys.push(top);

  const tmp = new THREE.Color();
  const stripe = new THREE.Color();
  function rockColor(x, y, out) {
    const band = Math.floor((y + 40 * noise(x * 0.4, y)) / 95);
    out.set(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]);
    // Desert varnish: dark streaks running down from the top.
    const streak = smoothRange(Math.sin(x * 0.021 + Math.sin(x * 0.005) * 3), 0.55, 0.95);
    out.lerp(VARNISH, streak * 0.55 * smoothRange(y, top * 0.2, top));
    out.lerp(stripe.set("#f0b27a"), 0.12 * (noise(x * 3.1, y * 2.7) + 0.5));
    return out;
  }

  const facePositions = new Float32Array(xs.length * ys.length * 3);
  const faceColors = new Float32Array(xs.length * ys.length * 3);
  xs.forEach((x, i) => {
    ys.forEach((y, j) => {
      const k = (i * ys.length + j) * 3;
      facePositions[k] = x;
      facePositions[k + 1] = y;
      facePositions[k + 2] = faceZ(x, y);
      rockColor(x, y, tmp).toArray(faceColors, k);
    });
  });
  const faceIndices = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const a = i * ys.length + j;
      const b = a + ys.length;
      faceIndices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const faceGeometry = keep(new THREE.BufferGeometry());
  faceGeometry.setAttribute("position", new THREE.BufferAttribute(facePositions, 3));
  faceGeometry.setAttribute("color", new THREE.BufferAttribute(faceColors, 3));
  faceGeometry.setIndex(faceIndices);
  faceGeometry.computeVertexNormals();
  const face = new THREE.Mesh(faceGeometry, rockMaterial);
  face.receiveShadow = true;
  group.add(face);

  /* ---------- The summit plateau ---------- */

  const depths = [0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.55, 0.8, 1];
  const capPositions = new Float32Array(xs.length * depths.length * 3);
  const capColors = new Float32Array(xs.length * depths.length * 3);
  const back = -2600;
  xs.forEach((x, i) => {
    const front = faceZ(x, top);
    depths.forEach((d, j) => {
      const k = (i * depths.length + j) * 3;
      const z = front + (back - front) * d;
      capPositions[k] = x;
      capPositions[k + 1] = top + 14 * noise(x, z) * smoothRange(d, 0.05, 0.4);
      capPositions[k + 2] = z;
      rockColor(x, top - 20, tmp)
        .lerp(stripe.set("#d9925a"), 0.35)
        .toArray(capColors, k);
    });
  });
  const capIndices = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < depths.length - 1; j += 1) {
      const a = i * depths.length + j;
      const b = a + depths.length;
      capIndices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const capGeometry = keep(new THREE.BufferGeometry());
  capGeometry.setAttribute("position", new THREE.BufferAttribute(capPositions, 3));
  capGeometry.setAttribute("color", new THREE.BufferAttribute(capColors, 3));
  capGeometry.setIndex(capIndices);
  capGeometry.computeVertexNormals();
  const cap = new THREE.Mesh(capGeometry, rockMaterial);
  cap.receiveShadow = true;
  group.add(cap);

  /* ---------- Desert floor and dressing ---------- */

  const groundGeometry = keep(new THREE.PlaneGeometry(80000, 80000, 1, 1));
  groundGeometry.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(
    groundGeometry,
    keep(new THREE.MeshStandardMaterial({ color: "#d58a52", roughness: 1 })),
  );
  ground.receiveShadow = true;
  group.add(ground);

  const sageGeometry = keep(paint(new THREE.IcosahedronGeometry(16, 0), "#8a9a5b"));
  const boulderGeometry = keep(paint(new THREE.DodecahedronGeometry(22, 0), "#a5532f"));
  const dressingMaterial = keep(
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
  );
  route.scenery.forEach((item) => {
    const mesh = new THREE.Mesh(item.kind === "sage" ? sageGeometry : boulderGeometry, dressingMaterial);
    mesh.position.set(item.x, item.kind === "sage" ? 8 * item.size : 10 * item.size, faceZ(item.x, 0) + item.z);
    mesh.scale.set(item.size * 1.3, item.size * (item.kind === "sage" ? 0.8 : 0.7), item.size);
    mesh.rotation.y = item.x;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  // Far mesas and spires behind and beside the tower.
  const mesaGeometry = keep(new THREE.CylinderGeometry(1, 1.15, 1, 7));
  const mesaMaterial = keep(new THREE.MeshStandardMaterial({ color: "#b8603a", flatShading: true, roughness: 1 }));
  for (let i = 0; i < 26; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const spire = rand() < 0.35;
    const x = side * (1800 + rand() * 14000);
    const z = -3000 - rand() * 16000;
    const height = spire ? 1400 + rand() * 1800 : 500 + rand() * 1200;
    const radius = spire ? 180 + rand() * 220 : 1200 + rand() * 2600;
    const mesa = new THREE.Mesh(mesaGeometry, mesaMaterial);
    mesa.position.set(x, height / 2, z);
    mesa.scale.set(radius, height, radius * (0.5 + rand() * 0.5));
    mesa.rotation.y = rand() * Math.PI;
    group.add(mesa);
  }

  // A rope bag at the base, and a summit flag.
  const bag = new THREE.Mesh(keep(paint(new THREE.CylinderGeometry(12, 14, 18, 8), "#2b3a67")), dressingMaterial);
  const base = route.stances[0].hip;
  bag.position.set(base.x + 52, 9, base.z + 38);
  bag.castShadow = true;
  group.add(bag);

  const summit = route.stances[route.stopCount - 1].hip;
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(keep(paint(new THREE.CylinderGeometry(1.4, 1.4, 120, 6), "#e8e8e8")), dressingMaterial);
  pole.position.y = 60;
  const cloth = new THREE.Mesh(
    keep(paint(new THREE.PlaneGeometry(56, 34, 6, 1), "#ff4d4d")),
    keep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })),
  );
  cloth.position.set(28, 100, 0);
  flag.add(pole, cloth);
  flag.position.set(summit.x - 70, top, summit.z - 40);
  flag.traverse((node) => {
    if (node.isMesh) node.castShadow = true;
  });
  group.add(flag);
  const clothBase = Float32Array.from(cloth.geometry.attributes.position.array);

  /* ---------- Holds ---------- */

  const holdGeometry = keep(new THREE.IcosahedronGeometry(1, 0));
  const holdMaterial = keep(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }));
  const holds = [...route.holds].sort((a, b) => a.progress - b.progress);
  const holdMesh = new THREE.InstancedMesh(holdGeometry, holdMaterial, holds.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  holds.forEach((hold, i) => {
    position.set(hold.x, hold.y, faceZ(hold.x, hold.y) + 1);
    quaternion.setFromEuler(euler.set(rand(), rand(), rand()));
    const size = hold.crux ? hold.size * 0.7 : hold.size;
    scale.set(size * 1.5, size * 0.8, size * 0.9);
    holdMesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    holdMesh.setColorAt(i, HOLD_ROCK);
  });
  holdMesh.castShadow = true;
  holdMesh.receiveShadow = true;
  group.add(holdMesh);
  let chalked = 0;

  /* ---------- Bolts, quickdraws and anchors ---------- */

  const metal = keep(new THREE.MeshStandardMaterial({ color: "#c9ccd6", metalness: 0.6, roughness: 0.4 }));
  const hangerGeometry = keep(new THREE.BoxGeometry(4, 6, 1.6));
  const drawGeometry = keep(new THREE.BoxGeometry(2.4, 12, 1.2));
  const drawMaterials = QUICKDRAW.map((color) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.6 })));
  // One quickdraw per bolt, shown while the rope runs through it.
  const draws = new Map();
  route.pitches.forEach((pitch) => {
    pitch.bolts.forEach((bolt) => {
      const z = faceZ(bolt.x, bolt.y);
      const hanger = new THREE.Mesh(hangerGeometry, metal);
      hanger.position.set(bolt.x, bolt.y, z + 0.8);
      const draw = new THREE.Mesh(drawGeometry, drawMaterials[draws.size % drawMaterials.length]);
      draw.position.set(bolt.x, bolt.y - 7, z + 3);
      draw.visible = false;
      draw.castShadow = true;
      group.add(hanger, draw);
      draws.set(bolt, draw);
    });
  });

  const chainGeometry = keep(new THREE.TorusGeometry(2.6, 0.8, 4, 8));
  route.anchors.forEach((anchor) => {
    [-8, 8].forEach((dx) => {
      const hanger = new THREE.Mesh(hangerGeometry, metal);
      hanger.position.set(anchor.x + dx, anchor.y, faceZ(anchor.x + dx, anchor.y) + 0.8);
      group.add(hanger);
      for (let link = 1; link <= 3; link += 1) {
        const ring = new THREE.Mesh(chainGeometry, metal);
        ring.position.set(anchor.x + dx * (1 - link * 0.22), anchor.y - link * 4.5, faceZ(anchor.x, anchor.y) + 2);
        ring.rotation.y = link % 2 ? Math.PI / 2 : 0;
        group.add(ring);
      }
    });

    // Chalked pitch name on the rock beside the anchor.
    const pitch = route.pitches[anchor.stop - 1];
    const stop = route.stops[anchor.stop];
    const label = chalkLabel([`P${anchor.stop} · ${pitch.grade}`, stop.title.toUpperCase()]);
    labels.push(label);
    const width = 150;
    const plane = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(width, width / 4)),
      keep(new THREE.MeshBasicMaterial({ map: keep(label.texture), transparent: true, depthWrite: false })),
    );
    const lx = anchor.x + 34 + width / 2;
    const ly = anchor.y + 34;
    let z = -Infinity;
    for (let dx = -width / 2; dx <= width / 2; dx += 15) {
      for (let dy = -20; dy <= 20; dy += 10) z = Math.max(z, faceZ(lx + dx, ly + dy));
    }
    plane.position.set(lx, ly, z + 1.5);
    group.add(plane);
  });

  /* ---------- Per-frame updates ---------- */

  function update(frame, rope) {
    // Holds turn white with chalk once used.
    let count = 0;
    while (count < holds.length && holds[count].progress <= frame.maxProgress) count += 1;
    if (count !== chalked) {
      holds.forEach((hold, i) => holdMesh.setColorAt(i, i < count ? HOLD_CHALK : HOLD_ROCK));
      holdMesh.instanceColor.needsUpdate = true;
      chalked = count;
    }

    draws.forEach((draw, bolt) => {
      draw.visible = rope.clipped.includes(bolt);
    });

    // The summit flag flaps.
    const attr = cloth.geometry.attributes.position;
    for (let i = 0; i < attr.count; i += 1) {
      const x = clothBase[i * 3] + 28;
      attr.array[i * 3 + 2] = clothBase[i * 3 + 2] + Math.sin(frame.time * 6 - x * 0.12) * x * 0.12;
    }
    attr.needsUpdate = true;
  }

  function refreshLabels() {
    labels.forEach((label) => label.redraw());
  }

  function dispose() {
    disposables.forEach((thing) => thing.dispose());
  }

  return { group, update, refreshLabels, dispose };
}

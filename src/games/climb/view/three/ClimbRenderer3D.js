/*
 * 3D view of the climb (three.js). Same contract as every game renderer:
 * resize(), render(frame, dt), reducedMotion, dispose(). It reads model
 * frames and never writes to the model; all effects here are cosmetic.
 *
 * The camera follows the climber from slightly below and to the right, and
 * at each anchor leaves room for the chapter card (right on wide screens,
 * bottom on narrow ones). It opens wide at the base and pulls back at the
 * summit for the view.
 */
import * as THREE from "three";
import { bodyWallZ } from "../../model/route";
import { clamp, lerp, smoothRange } from "../../../shared/math";
import { createBursts } from "../../../ski/view/three/particles3d";
import { createClimber } from "./climber3d";
import { buildWall } from "./wall3d";

const SKY = [
  { at: 0, top: "#2a2f6e", bottom: "#ffb27a", sun: "#ffc08f" },
  { at: 0.45, top: "#2f7fd6", bottom: "#d7ecff", sun: "#fff4dc" },
  { at: 1, top: "#3b2f7a", bottom: "#ff9a5c", sun: "#ffb070" },
];
const CONFETTI = ["#ff4d4d", "#ffd23f", "#2bd9a0", "#5ef0ff", "#c77dff", "#ffffff"];
const ROPE_COLOR = "#e8467c";
const ROPE_SEGMENTS = 48;
const UP = new THREE.Vector3(0, 1, 0);

const SKY_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAGMENT = `
uniform vec3 top;
uniform vec3 bottom;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y * 1.6 + 0.12, 0.0, 1.0);
  gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
  #include <colorspace_fragment>
}`;

const colorA = new THREE.Color();
const colorB = new THREE.Color();
function skyColor(t, key, out) {
  for (let i = 1; i < SKY.length; i += 1) {
    if (t <= SKY[i].at) {
      const k = (t - SKY[i - 1].at) / (SKY[i].at - SKY[i - 1].at);
      return out.copy(colorA.set(SKY[i - 1][key])).lerp(colorB.set(SKY[i][key]), k);
    }
  }
  return out.set(SKY[SKY.length - 1][key]);
}

/* Camera shots, relative to the hips. */
const FOLLOW = { offset: new THREE.Vector3(170, -40, 560), look: new THREE.Vector3(0, 30, 0) };
const BASE = { offset: new THREE.Vector3(320, 70, 900), look: new THREE.Vector3(0, 200, 0) };
const SUMMIT = { offset: new THREE.Vector3(620, 260, 1500), look: new THREE.Vector3(0, -120, -200) };

export default class ClimbRenderer3D {
  constructor(canvas, route) {
    this.canvas = canvas;
    this.route = route;
    this.reducedMotion = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog("#d7ecff", 2600, 26000);
    this.camera = new THREE.PerspectiveCamera(50, 1, 4, 60000);

    this.wall = buildWall(route);
    scene.add(this.wall.group);
    this.climber = createClimber();
    scene.add(this.climber.root);

    this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(50000, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    scene.add(this.sky);
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(900, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#fff4dc", fog: false }),
    );
    scene.add(this.sunDisc);

    this.hemi = new THREE.HemisphereLight("#ffe9d6", "#a8603d", 1.5);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff1d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -360, right: 360, top: 360, bottom: -360, near: 10, far: 3000 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    // The rope: a pool of cylinder segments stretched between rope points.
    this.ropeGeometry = new THREE.CylinderGeometry(1.5, 1.5, 1, 6);
    this.ropeMaterial = new THREE.MeshStandardMaterial({ color: ROPE_COLOR, roughness: 0.6 });
    this.rope = Array.from({ length: ROPE_SEGMENTS }, () => {
      const mesh = new THREE.Mesh(this.ropeGeometry, this.ropeMaterial);
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    });

    this.bursts = createBursts(600);
    scene.add(this.bursts.points);

    this.view = {
      ready: false,
      offset: new THREE.Vector3(),
      look: new THREE.Vector3(),
      frameX: 0,
      frameY: 0,
    };
    this.prev = { moving: {}, phase: null, velocity: 0 };
    this.sunDir = new THREE.Vector3();
    this.tint = new THREE.Color();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();

    if (typeof document !== "undefined" && document.fonts && document.fonts.load) {
      document.fonts
        .load('30px "Press Start 2P"')
        .then(() => this.wall && this.wall.refreshLabels())
        .catch(() => {});
    }
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.narrow = this.width < 760;
    const ratio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.renderer.setPixelRatio(Math.min(ratio, 1.5));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  render(frame, rawDt) {
    const dt = clamp(rawDt, 0, 0.05);
    const { pose } = frame;
    const lastStop = this.route.stopCount - 1;

    if (Math.abs(frame.progress - (this.lastProgress ?? frame.progress)) > 1.5) this.view.ready = false;
    this.lastProgress = frame.progress;

    this.updateAtmosphere(frame.progress / lastStop);
    this.climber.update(pose);
    const rope = this.route.ropeAt(frame.progress, pose);
    this.updateRope(rope.points);
    this.wall.update(frame, rope);
    this.updateEvents(frame);
    this.bursts.update(this.reducedMotion ? 0 : dt);
    this.updateCamera(frame, dt);

    const cam = this.camera.position;
    this.sky.position.copy(cam);
    this.sunDisc.position.copy(cam).addScaledVector(this.sunDir, 40000);
    this.sun.position.set(pose.hip.x, pose.hip.y, pose.hip.z).addScaledVector(this.sunDir, 1500);
    this.sun.target.position.set(pose.hip.x, pose.hip.y, pose.hip.z);

    this.renderer.render(this.scene, this.camera);
  }

  updateRope(points) {
    const from = this.tmp;
    const to = this.tmp2;
    this.rope.forEach((mesh, i) => {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) {
        mesh.visible = false;
        return;
      }
      from.set(a.x, a.y, a.z + 2);
      to.set(b.x, b.y, b.z + 2);
      const dir = to.sub(from);
      const length = Math.max(dir.length(), 0.001);
      mesh.visible = true;
      mesh.position.copy(from).addScaledVector(dir, 0.5);
      mesh.scale.set(1, length, 1);
      mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(length));
    });
  }

  updateCamera(frame, dt) {
    const { pose } = frame;
    const lastStop = this.route.stopCount - 1;
    const p = frame.progress;
    const view = this.view;

    // Blend between the opening wide shot, the follow cam and the summit view.
    const base = 1 - smoothRange(p, 0, 0.45);
    const summit = smoothRange(p, lastStop - 0.35, lastStop);
    const offset = this.tmp.copy(FOLLOW.offset).lerp(BASE.offset, base).lerp(SUMMIT.offset, summit);
    const look = this.tmp2.copy(FOLLOW.look).lerp(BASE.look, base).lerp(SUMMIT.look, summit);
    if (this.narrow) {
      // Portrait: pull back, and keep the climber above the bottom-sheet card.
      offset.multiplyScalar(1.35);
      look.y -= 220 * base;
    }

    // Leave room for the card at a stop: climber left on wide screens, up
    // top on narrow ones. Mid-pitch, the climber is centred.
    const nearest = Math.round(p);
    const atStop = (1 - smoothRange(Math.abs(p - nearest), 0.04, 0.3)) * (Math.abs(frame.velocity) < 0.3 ? 1 : 0.6);
    const frameX = this.narrow ? 0 : 0.17 * atStop;
    const frameY = this.narrow ? 0.2 * atStop : 0;

    // The camera rides in front of the smoothed wall line, not the hips' z,
    // so it doesn't sway in and out as the climber leans.
    const anchorZ = bodyWallZ(pose.hip.x) + 30;
    if (!view.ready || this.reducedMotion) {
      view.offset.copy(offset);
      view.look.copy(look);
      view.frameX = frameX;
      view.frameY = frameY;
      view.target = { x: pose.hip.x, y: pose.hip.y, z: anchorZ };
      view.ready = true;
    } else {
      const k = 1 - Math.exp(-dt * 3.2);
      view.offset.lerp(offset, k);
      view.look.lerp(look, k);
      const follow = 1 - Math.exp(-dt * 6);
      view.target.x = lerp(view.target.x, pose.hip.x, follow);
      view.target.y = lerp(view.target.y, pose.hip.y, follow);
      view.target.z = lerp(view.target.z, anchorZ, follow);
      const frameK = 1 - Math.exp(-dt * 2.5);
      view.frameX += (frameX - view.frameX) * frameK;
      view.frameY += (frameY - view.frameY) * frameK;
    }

    const camera = this.camera;
    camera.position.set(view.target.x, view.target.y, view.target.z).add(view.offset);
    camera.position.y = Math.max(camera.position.y, 40);
    camera.lookAt(view.target.x + view.look.x, view.target.y + view.look.y, view.target.z + view.look.z);
    camera.setViewOffset(
      this.width,
      this.height,
      view.frameX * this.width,
      view.frameY * this.height,
      this.width,
      this.height,
    );
    camera.updateProjectionMatrix();
  }

  updateAtmosphere(t) {
    const top = this.skyUniforms.top.value;
    const bottom = this.skyUniforms.bottom.value;
    skyColor(t, "top", top);
    skyColor(t, "bottom", bottom);
    this.scene.fog.color.copy(bottom);
    skyColor(t, "sun", this.tint);
    this.sun.color.copy(this.tint);
    this.sunDisc.material.color.copy(this.tint);
    this.hemi.color.copy(top).lerp(colorA.set("#ffffff"), 0.6);

    // Sunrise behind the camera's right shoulder, sunset low on the left.
    const elevation = lerp(0.15, 0.7, smoothRange(t, 0, 0.5)) - 0.5 * smoothRange(t, 0.6, 1);
    const azimuth = lerp(0.9, -0.9, t);
    this.sunDir
      .set(Math.sin(azimuth), elevation, 0.6 + 0.4 * Math.cos(azimuth) - 0.4 * smoothRange(t, 0.7, 1))
      .normalize();
  }

  burst(at, count, { spread, lift, colors = null, gravity = 300, life = 0.6 }) {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i += 1) {
      this.bursts.spawn({
        x: at.x,
        y: at.y,
        z: at.z + 4,
        vx: (Math.random() - 0.5) * spread * 2,
        vy: lift * (0.3 + Math.random() * 0.7),
        vz: Math.random() * spread,
        life: life * (0.6 + Math.random() * 0.8),
        tint: colors ? colors[Math.floor(Math.random() * colors.length)] : "#fffaf0",
        gravity,
      });
    }
  }

  updateEvents(frame) {
    const { pose } = frame;
    const prev = this.prev;
    const lastStop = this.route.stopCount - 1;

    // Chalk puffs whenever a hand lands on a hold.
    ["rh", "lh"].forEach((key) => {
      const limb = pose.limbs[key];
      if (prev.moving[key] && !limb.moving && !pose.falling && frame.velocity !== 0) {
        this.burst(limb, 10, { spread: 30, lift: 30, gravity: 40, life: 0.8 });
      }
      prev.moving[key] = limb.moving;
    });

    // Dust off the wall when the whipper starts.
    if (pose.phase === "fall" && prev.phase !== "fall" && frame.velocity > 0) {
      this.burst({ ...pose.chest, z: pose.chest.z - 20 }, 40, {
        spread: 60,
        lift: 40,
        colors: ["#e2ab72", "#c4653a"],
        gravity: 500,
      });
    }

    // Confetti at each anchor, and plenty at the summit.
    const stop = Math.round(frame.progress);
    const near = Math.abs(frame.progress - stop) < 0.05;
    if (near && stop > 0 && Math.abs(prev.velocity) >= 0.1 && Math.abs(frame.velocity) < 0.1) {
      this.burst({ x: pose.hip.x, y: pose.hip.y + 120, z: pose.hip.z }, 70, {
        spread: 140,
        lift: 160,
        colors: CONFETTI,
        gravity: 220,
        life: 1.6,
      });
    }
    if (frame.progress > lastStop - 0.01 && !this.reducedMotion && Math.random() < 0.6) {
      this.bursts.spawn({
        x: pose.hip.x + (Math.random() - 0.5) * 500,
        y: pose.hip.y + 260 + Math.random() * 120,
        z: pose.hip.z + (Math.random() - 0.5) * 300,
        vx: (Math.random() - 0.5) * 50,
        vy: -30 - Math.random() * 30,
        vz: (Math.random() - 0.5) * 50,
        life: 4,
        tint: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        gravity: 30,
        flutter: true,
      });
    }

    prev.phase = pose.phase;
    prev.velocity = frame.velocity;
  }

  dispose() {
    this.wall.dispose();
    this.climber.dispose();
    this.bursts.dispose();
    this.ropeGeometry.dispose();
    this.ropeMaterial.dispose();
    [this.sky, this.sunDisc].forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.renderer.dispose();
    this.wall = null;
  }
}

/*
 * 3D view of the run (three.js). Same contract as the 2D SkiRenderer:
 * resize(), render(frame, dt), reducedMotion, dispose(). It reads model frames
 * and never writes to the model; all effects here are cosmetic.
 */
import * as THREE from "three";
import { clamp, clamp01, lerp, smoothRange } from "../../../shared/math";
import Director from "./director";
import { createBursts, createSnowfall } from "./particles3d";
import { createRider } from "./rider3d";
import { buildWorld } from "./world3d";

const SKY = [
  { at: 0, top: "#1d2466", bottom: "#ffb38a", sun: "#ffc59a" },
  { at: 0.45, top: "#2a6fd0", bottom: "#cfe8ff", sun: "#fff4dc" },
  { at: 1, top: "#34489a", bottom: "#ffcf8f", sun: "#ffd9a0" },
];
const CONFETTI = ["#ff4d4d", "#ffd23f", "#2bd9a0", "#5ef0ff", "#c77dff", "#ffffff"];

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

export default class SkiRenderer3D {
  constructor(canvas, course) {
    this.canvas = canvas;
    this.course = course;
    this.reducedMotion = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog("#cfe8ff", 1600, 14000);
    this.camera = new THREE.PerspectiveCamera(50, 1, 2, 40000);

    this.world = buildWorld(course);
    scene.add(this.world.group);

    this.rider = createRider();
    scene.add(this.rider.root);

    this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(30000, 24, 16),
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
      new THREE.SphereGeometry(700, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#fff4dc", fog: false }),
    );
    this.sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#fff4dc", fog: false, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    scene.add(this.sunDisc, this.sunGlow);

    this.hemi = new THREE.HemisphereLight("#dfe9ff", "#8fa3cc", 1.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff1d6", 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 10, far: 2400 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.bursts = createBursts();
    this.snow = createSnowfall();
    scene.add(this.bursts.points, this.snow.points);

    this.director = new Director(this.camera, course, this.world.heightAt);
    this.prev = { airborne: false, velocity: 0 };
    this.shake = 0;
    this.squash = 0;
    this.sprayCarry = 0;
    this.sunDir = new THREE.Vector3();
    this.skyTint = new THREE.Color();

    if (typeof document !== "undefined" && document.fonts && document.fonts.load) {
      document.fonts
        .load('40px "Press Start 2P"')
        .then(() => this.world && this.world.refreshLabels())
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
    this.renderer.setPixelRatio(Math.min(ratio, this.narrow ? 1.5 : 2));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  render(frame, rawDt) {
    const dt = clamp(rawDt, 0, 0.05);
    const { skier } = frame;
    const lastStop = this.course.stopCount - 1;
    const progressFrac = frame.progress / lastStop;
    const speedNorm = clamp01(frame.speed / 1400);

    if (Math.abs(frame.progress - (this.lastProgress ?? frame.progress)) > 1.5) this.director.cut();
    this.lastProgress = frame.progress;

    this.updateAtmosphere(progressFrac);
    this.updateEvents(frame, dt);

    const { root } = this.rider;
    root.position.set(skier.x, -skier.y, 0);
    root.rotation.set(0, 0, -skier.angle);
    this.rider.update({
      pose: skier.pose,
      time: frame.time,
      speed: speedNorm,
      airborne: skier.airborne,
      squash: this.squash,
    });

    this.world.update(frame);
    this.bursts.update(this.reducedMotion ? 0 : dt);

    this.director.update(frame, dt, {
      narrow: this.narrow,
      width: this.width,
      height: this.height,
      shake: this.reducedMotion ? 0 : this.shake,
    });

    const cam = this.camera.position;
    this.snow.update(dt, frame.time, cam, this.reducedMotion);
    this.sky.position.copy(cam);
    this.sunDisc.position.copy(cam).addScaledVector(this.sunDir, 22000);
    this.sunGlow.position.copy(this.sunDisc.position);

    this.sun.position.set(skier.x, -skier.y, 0).addScaledVector(this.sunDir, 1200);
    this.sun.target.position.set(skier.x, -skier.y, 0);

    this.renderer.render(this.scene, this.camera);
  }

  updateAtmosphere(t) {
    const top = this.skyUniforms.top.value;
    const bottom = this.skyUniforms.bottom.value;
    skyColor(t, "top", top);
    skyColor(t, "bottom", bottom);
    this.scene.fog.color.copy(bottom);
    skyColor(t, "sun", this.skyTint);
    this.sun.color.copy(this.skyTint);
    this.sunDisc.material.color.copy(this.skyTint);
    this.sunGlow.material.color.copy(this.skyTint);
    this.hemi.color.copy(top).lerp(colorA.set("#ffffff"), 0.6);

    // Sun rises over the first half of the run and sinks toward golden hour.
    const elevation = lerp(0.12, 0.62, smoothRange(t, 0, 0.5)) - 0.32 * smoothRange(t, 0.6, 1);
    const azimuth = lerp(-0.6, 0.5, t);
    this.sunDir.set(Math.cos(azimuth) * 0.8, elevation, Math.sin(azimuth) * 0.8 - 0.4).normalize();
  }

  spawn(particle) {
    if (!this.reducedMotion) this.bursts.spawn(particle);
  }

  burst(x, y, count, { spread, lift, push = 0, colors = null, gravity = 900 }) {
    for (let i = 0; i < count; i += 1) {
      this.spawn({
        x,
        y: y + 2,
        z: (Math.random() - 0.5) * 20,
        vx: push + (Math.random() - 0.5) * spread * 2,
        vy: lift * (0.4 + Math.random() * 0.6),
        vz: (Math.random() - 0.5) * spread * 2,
        life: 0.5 + Math.random() * 0.7,
        tint: colors ? colors[Math.floor(Math.random() * colors.length)] : "#ffffff",
        gravity,
      });
    }
  }

  updateEvents(frame, dt) {
    const { skier } = frame;
    const prev = this.prev;
    const lastStop = this.course.stopCount - 1;
    const x = skier.x;
    const y = -skier.y;
    this.shake = Math.max(0, this.shake - dt);
    this.squash = Math.max(0, this.squash - dt * 2.8);

    if (prev.airborne && !skier.airborne && frame.velocity > 0) {
      this.burst(x, y, 70, { spread: 220, lift: 360 });
      this.shake = 0.3;
      this.squash = 1;
    }
    if (!prev.airborne && skier.airborne && frame.velocity > 0) {
      this.burst(x, y, 24, { spread: 110, lift: 200, push: 220 });
    }

    const stop = Math.round(frame.progress);
    const nearStop = Math.abs(frame.progress - stop) < 0.12;
    if (!skier.airborne && nearStop && Math.abs(prev.velocity) >= 0.12 && Math.abs(frame.velocity) < 0.12) {
      const dir = Math.sign(prev.velocity) || 1;
      this.burst(x + dir * 10, y, 60, { spread: 150, lift: 260, push: dir * 360 });
      const gx = this.course.stopX(stop);
      this.burst(gx, this.world.heightAt(gx, 0) + 130, 60, { spread: 200, lift: 240, colors: CONFETTI, gravity: 260 });
    }

    if (!skier.airborne && frame.speed > 200 && !this.reducedMotion) {
      this.sprayCarry += dt * clamp(frame.speed / 25, 0, 80);
      const dir = Math.sign(frame.velocity) || 1;
      while (this.sprayCarry >= 1) {
        this.sprayCarry -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.spawn({
          x: x - dir * 26,
          y: y + 2,
          z: side * (4 + Math.random() * 4),
          vx: -dir * (60 + Math.random() * 160),
          vy: 60 + Math.random() * 160,
          vz: side * (20 + Math.random() * 90),
          life: 0.35 + Math.random() * 0.4,
        });
      }
    }

    if (frame.progress > lastStop - 0.01 && !this.reducedMotion) {
      const fx = this.course.stopX(lastStop);
      for (let i = 0; i < 2; i += 1) {
        this.spawn({
          x: fx + (Math.random() - 0.5) * 300,
          y: this.world.heightAt(fx, 0) + 220 + Math.random() * 100,
          z: (Math.random() - 0.5) * 300,
          vx: (Math.random() - 0.5) * 50,
          vy: -30 - Math.random() * 30,
          vz: (Math.random() - 0.5) * 50,
          life: 3,
          tint: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
          gravity: 30,
          flutter: true,
        });
      }
    }

    prev.airborne = skier.airborne;
    prev.velocity = frame.velocity;
  }

  dispose() {
    this.world.dispose();
    this.rider.dispose();
    this.bursts.dispose();
    this.snow.dispose();
    [this.sky, this.sunDisc, this.sunGlow].forEach((m) => {
      m.geometry.dispose();
      m.material.dispose();
    });
    this.renderer.dispose();
    this.world = null;
  }
}

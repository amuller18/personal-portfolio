/*
 * 3D view of the run (three.js). Same contract as the 2D SkiRenderer:
 * resize(), render(frame, dt), reducedMotion, dispose(). It reads model frames
 * and never writes to the model; all effects here are cosmetic.
 *
 * Chapter boards (lift station wall, trail map) are real DOM placed in the
 * scene with CSS3DRenderer, so text stays sharp and buttons stay clickable.
 * `surfaceMounts` exposes one element per board for React to portal into.
 */
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { CLIFF, LODGE } from "../../model/course";
import { clamp, clamp01, lerp, smoothRange, smoothstep } from "../../../shared/math";
import { SURFACE_PX_HEIGHT, SURFACE_SPECS, surfaceAspect } from "../surfaces";
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
  constructor(canvas, course, { surfaceLayer = null } = {}) {
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
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 10, far: 2400 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.bursts = createBursts();
    this.snow = createSnowfall();
    scene.add(this.bursts.points, this.snow.points);

    this.director = new Director(this.camera, course, this.world.heightAt, this.world.surfaces);

    // Boards: one CSS3D object per board, positioned on its frame.
    this.surfaceLayer = surfaceLayer;
    this.surfaceMounts = {};
    this.surfaceObjects = new Map();
    if (surfaceLayer) {
      this.css = new CSS3DRenderer({ element: surfaceLayer });
      this.cssScene = new THREE.Scene();
      this.world.surfaces.forEach((surface, index) => {
        const mount = document.createElement("div");
        mount.className = `ski-surface ski-surface--${surface.kind}`;
        const object = new CSS3DObject(mount);
        object.position.copy(surface.center);
        object.rotation.set(0, surface.rotationY, surface.rotationZ || 0);
        this.cssScene.add(object);
        this.surfaceObjects.set(index, { object, mount, surface, opacity: -1, active: null });
        this.surfaceMounts[index] = mount;
      });
    }
    this.prev = { airborne: false, velocity: 0 };
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
    this.renderer.setPixelRatio(Math.min(ratio, 1.5));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    // Boards take the viewport's shape so they can fill it (unless the board
    // has a fixed shape, like the ski).
    this.world.surfaces.forEach((surface, index) => {
      const spec = SURFACE_SPECS[surface.kind];
      const aspect = surfaceAspect(this.width, this.height, surface.kind);
      const pxWidth = Math.round(SURFACE_PX_HEIGHT * aspect);
      surface.resize(spec.height * aspect, spec.height);
      const entry = this.surfaceObjects.get(index);
      if (!entry) return;
      entry.object.scale.setScalar(spec.height / SURFACE_PX_HEIGHT);
      entry.mount.style.width = `${pxWidth}px`;
      entry.mount.style.height = `${SURFACE_PX_HEIGHT}px`;
      entry.mount.classList.toggle("is-portrait", !spec.aspect && aspect < 0.95);
    });
    if (this.css) this.css.setSize(this.width, this.height);
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
    root.position.set(skier.x, -skier.y, skier.z || 0);
    root.rotation.set(0, skier.yaw || 0, -skier.angle);
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
      reduced: this.reducedMotion,
    });

    const cam = this.camera.position;
    this.snow.update(dt, frame.time, cam, this.reducedMotion);
    // No snowfall indoors (the lodge).
    this.snow.points.visible = !this.course.pads.some(
      (pad) => cam.x > pad.x0 && cam.x < pad.x1 && cam.z < LODGE.frontZ && cam.z > pad.z0,
    );
    this.sky.position.copy(cam);
    this.sunDisc.position.copy(cam).addScaledVector(this.sunDir, 22000);
    this.sunGlow.position.copy(this.sunDisc.position);

    this.sun.position.set(skier.x, -skier.y, 0).addScaledVector(this.sunDir, 1200);
    this.sun.target.position.set(skier.x, -skier.y, 0);

    this.renderer.render(this.scene, this.camera);
    this.renderSurfaces(frame, dt);
    this.updateLostSki(frame);
  }

  /* The ski that comes off in the cliff crash: flies off on impact, lands
   * upright in the snow, and flies back when Alex picks it up. */
  updateLostSki(frame) {
    this.world.lostSkis.forEach((prop) => {
      const { run } = prop;
      const index = run.index + 1;
      const p = frame.progress;
      let visible = false;
      let spin = 0;
      const position = this.skiPos || (this.skiPos = new THREE.Vector3());
      position.copy(prop.home);
      if (p >= run.index && p < index) {
        const f = p - run.index;
        if (f >= CLIFF.fall) {
          visible = true;
          const t = Math.min(1, (f - CLIFF.fall) / (CLIFF.tumble - CLIFF.fall));
          const flight = smoothRange(t, 0.06, 0.55);
          const ix = run.cliff.impactX;
          position.set(ix, -this.course.groundY(ix) + 20, 0).lerp(prop.home, flight);
          position.y += 140 * Math.sin(Math.PI * flight);
          spin = (1 - flight) * Math.PI * 4;
        }
      } else if (p >= index && p < index + 1) {
        const lost = frame.skier.pose.lostSki || 0;
        visible = lost > 0.01;
        position.set(frame.skier.x + 10, -frame.skier.y + 30, frame.skier.z || 0).lerp(prop.home, smoothstep(lost));
      }
      prop.site.visible = visible;
      prop.site.position.copy(position);
      prop.site.rotation.z = prop.rotationZ + spin;
    });
  }

  /* Boards fade in only around their own stop, so the DOM layer never draws
   * over unrelated 3D content, and only the one you're at is clickable. */
  renderSurfaces(frame, dt) {
    if (!this.css) return;
    this.surfaceObjects.forEach((entry, index) => {
      const { object, mount, surface } = entry;
      const distance = Math.abs(frame.progress - index);
      const near = distance < 0.05 && Math.abs(frame.velocity) < 0.3;

      // The trail sign grows from a small sign into a full-screen board.
      if (surface.expand) {
        const ex = surface.expand;
        const target = near ? 1 : 0;
        ex.value += (target - ex.value) * (1 - Math.exp(-dt * (this.reducedMotion ? 60 : 2.6)));
        const e = smoothstep(ex.value);
        const scale = lerp(ex.smallScale, 1, e);
        const y = lerp(ex.smallY, ex.fullY, e);
        ex.site.scale.setScalar(scale);
        ex.site.position.y = y;
        object.scale.setScalar((scale * SURFACE_SPECS[surface.kind].height) / SURFACE_PX_HEIGHT);
        object.position.y = y;
      }
      // Content fades in only as the camera arrives, and out as it leaves.
      const arriving = this.director.board === index ? this.director.boardBlend : 0;
      const opacity = Math.round(smoothRange(arriving, 0.55, 0.95) * 100) / 100;
      object.visible = opacity > 0.01;
      // Only touch the DOM when something changed; style writes are costly.
      if (opacity !== entry.opacity) {
        mount.style.opacity = String(opacity);
        entry.opacity = opacity;
      }
      const active = near;
      if (active !== entry.active) {
        mount.classList.toggle("is-active", active);
        mount.style.pointerEvents = active ? "auto" : "none";
        entry.active = active;
      }
    });
    this.css.render(this.cssScene, this.camera);
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
    this.squash = Math.max(0, this.squash - dt * 2.8);

    if (prev.airborne && !skier.airborne && frame.velocity > 0) {
      const crash = skier.phase === "tumble";
      this.burst(x, y, crash ? 160 : 70, { spread: crash ? 320 : 220, lift: crash ? 460 : 360 });
      this.squash = 1;
    }
    if (skier.phase === "tumble" && Math.random() < 0.5) {
      this.burst(x, y, 4, { spread: 140, lift: 220 });
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
    if (this.cssScene) {
      this.surfaceObjects.forEach(({ object }) => this.cssScene.remove(object));
      this.surfaceLayer.replaceChildren();
    }
    this.surfaceObjects.clear();
    this.surfaceMounts = {};
    this.world = null;
  }
}

/*
 * Camera director. Each frame it picks a "shot" from the model state, then
 * springs the camera toward it. Shots are expressed relative to the rider,
 * so blending stays smooth even at full speed. Under-damped springs give the
 * playful overshoot; a separate zoom spring adds punch on big moments.
 *
 *   at a board        locked square-on, filling ~90% of the screen
 *   at other stops    slow hero orbit beside the chapter card
 *   chairlift         scoop from the side, look up the cable, wide side-on
 *   skating           drifts toward the next board
 *   run-in            low chase cam that widens with speed
 *   in the air        rotates per jump: side dolly, sweeping orbit, low
 *                     hero from the landing, overhead; 360 orbit on the finale
 *   run-out           tracking shot from ahead, looking back
 *   rewinding         reverse angle
 */
import * as THREE from "three";
import { clamp, clamp01 } from "../../../shared/math";

const AIR_SHOTS = ["side", "orbit", "hero", "overhead"];
const BOARD_FOV = 38;
const BOARD_FILL = 0.9;

/* Damped spring on a number or a Vector3. */
function springScalar(state, target, stiffness, damping, dt) {
  const accel = (target - state.value) * stiffness - state.velocity * damping;
  state.velocity += accel * dt;
  state.value += state.velocity * dt;
}

function springVector(position, velocity, target, stiffness, damping, dt, scratch) {
  scratch.subVectors(target, position).multiplyScalar(stiffness);
  scratch.addScaledVector(velocity, -damping);
  velocity.addScaledVector(scratch, dt);
  position.addScaledVector(velocity, dt);
}

const dampingFor = (stiffness, ratio) => 2 * ratio * Math.sqrt(stiffness);

export default class Director {
  constructor(camera, course, heightAt, surfaces = new Map()) {
    this.camera = camera;
    this.course = course;
    this.heightAt = heightAt;
    this.surfaces = surfaces;
    this.surfaceSize = { width: 400, height: 300 };
    this.offset = new THREE.Vector3(260, 110, 160);
    this.offsetVelocity = new THREE.Vector3();
    this.look = new THREE.Vector3(0, 38, 0);
    this.lookVelocity = new THREE.Vector3();
    this.fov = { value: 50, velocity: 0 };
    this.zoom = { value: 0, velocity: 0 };
    this.roll = { value: 0, velocity: 0 };
    this.frameX = 0;
    this.frameY = 0;
    this.ready = false;
    this.shot = "idle";
    this.phase = "runin";
    this.target = { offset: new THREE.Vector3(), look: new THREE.Vector3() };
    this.rider = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
  }

  /* Add a zoom impulse in degrees of field of view (+ is out, - is in). */
  kick(degrees) {
    this.zoom.velocity += degrees * 9;
  }

  boardDistance(aspect) {
    const t = Math.tan((BOARD_FOV * Math.PI) / 360);
    const { width, height } = this.surfaceSize;
    return Math.max(height / 2 / t, width / 2 / (t * aspect)) / BOARD_FILL;
  }

  /* Returns the shot name; fills this.target. */
  pick(frame, narrow, aspect) {
    const { skier, progress, velocity, time } = frame;
    const target = this.target;
    const lastStop = this.course.stopCount - 1;
    const nearest = Math.round(progress);
    const idle = Math.abs(progress - nearest) < 0.06 && Math.abs(velocity) < 0.3;
    const speedNorm = clamp01(frame.speed / 1400);

    target.fov = 50;
    target.roll = 0;
    target.stiffness = 12;
    target.ratio = 1;
    target.frameX = 0;
    target.frameY = 0;

    const surface = idle ? this.surfaces.get(nearest) : null;
    if (surface) {
      // Square-on to the board, close enough to fill the screen.
      this.tmp.copy(surface.center);
      this.tmp.z += this.boardDistance(aspect);
      target.offset.copy(this.tmp).sub(this.rider);
      target.look.copy(surface.center).sub(this.rider);
      target.fov = BOARD_FOV;
      target.stiffness = 9;
      target.ratio = 0.55;
      target.frameY = -0.035;
      return "board";
    }

    if (idle) {
      const wide = nearest === 0 || nearest === lastStop;
      const theta = (nearest === 0 ? 0.55 : 0.8) + 0.32 * Math.sin(time * 0.22 + nearest * 1.7);
      const radius = wide ? 400 : 300;
      target.offset.set(Math.cos(theta) * radius, wide ? 120 : 85, Math.sin(theta) * radius);
      target.look.set(0, 40, 0);
      target.stiffness = 6;
      target.frameX = narrow ? 0 : -0.15;
      target.frameY = narrow ? 0.2 : 0;
      return "idle";
    }

    if (velocity < -0.05) {
      target.offset.set(230, 80, -90);
      target.look.set(0, 30, 0);
      return "rewind";
    }

    switch (skier.phase) {
      case "load":
        target.offset.set(-60, 70, 250);
        target.look.set(30, 34, 0);
        target.fov = 46;
        return "load";
      case "lift": {
        const s = skier.lift ? skier.lift.s : 0;
        if (s < 0.5) {
          // Over the shoulder, up the cable line toward the top.
          target.offset.set(-150, 18, 80);
          target.look.set(260, 110, 0);
          target.fov = 56;
          target.roll = 0.04;
          target.stiffness = 8;
          return "lift-up";
        }
        target.offset.set(40, 50, 320);
        target.look.set(0, 0, 0);
        target.fov = 48;
        target.stiffness = 5;
        target.ratio = 0.7;
        return "lift-side";
      }
      case "unload":
        target.offset.set(170, 70, 190);
        target.look.set(0, 22, 0);
        target.fov = 50;
        return "unload";
      case "skate":
        target.offset.set(-40, 110, 300);
        target.look.set(180, 40, -120);
        target.fov = 52;
        target.stiffness = 6;
        return "skate";
      default:
        break;
    }

    if (skier.airborne) {
      const s = skier.air;
      const arc = Math.sin(Math.PI * s);
      const finale = skier.jump.index === this.course.jumps.length - 1;
      const kind = finale ? "finale" : AIR_SHOTS[skier.jump.index % AIR_SHOTS.length];
      target.look.set(0, 26, 0);
      target.stiffness = 30;
      switch (kind) {
        case "side":
          target.offset.set(10, 34, 290);
          target.fov = 54;
          target.roll = 0.09 * arc;
          break;
        case "orbit": {
          const a = Math.PI - s * Math.PI * 1.25;
          target.offset.set(Math.cos(a) * 220, 40 + 60 * arc, Math.sin(a) * 220);
          target.fov = 56;
          target.stiffness = 45;
          break;
        }
        case "hero": {
          const x = skier.jump.landX + 150;
          const z = 150;
          this.tmp.set(x, this.heightAt(x, z) + 14, z);
          target.offset.copy(this.tmp).sub(this.rider);
          target.fov = 64;
          target.roll = -0.12;
          target.stiffness = 14;
          break;
        }
        case "overhead":
          target.offset.set(-40, 320, 70);
          target.look.set(30, 0, 0);
          target.fov = 52;
          target.stiffness = 18;
          break;
        default: {
          const a = Math.PI - s * Math.PI * 2;
          target.offset.set(Math.cos(a) * 240, 50 + 70 * arc, Math.sin(a) * 240);
          target.fov = 58;
          target.roll = 0.14 * arc;
          target.stiffness = 60;
        }
      }
      return `air-${kind}`;
    }

    if (skier.phase === "runin") {
      target.offset.set(-210, 78, 70);
      target.look.set(170, 10, 0);
      target.fov = 58 + 14 * speedNorm;
      target.roll = -0.05 * speedNorm;
      target.stiffness = 20;
      return "chase";
    }
    target.offset.set(220, 48, -100);
    target.look.set(0, 30, 0);
    target.fov = 54;
    target.stiffness = 14;
    return "track";
  }

  /* Zoom punches on the big moments. */
  react(shot, phase) {
    if (shot !== this.shot) {
      if (shot === "board") this.kick(26);
      else if (this.shot === "board") this.kick(30);
    }
    if (phase !== this.phase) {
      if (phase === "air") this.kick(-10);
      if (this.phase === "air") this.kick(14);
      if (phase === "lift") this.kick(-8);
    }
  }

  update(frame, dt, { narrow, width, height, shake, reduced }) {
    const { camera } = this;
    const { skier } = frame;
    const aspect = width / height;
    this.rider.set(skier.x, -skier.y, 0);
    const shot = this.pick(frame, narrow, aspect);
    const t = this.target;
    // Portrait screens have a narrow horizontal field of view: pull back.
    if (narrow && shot !== "air-hero" && shot !== "board") t.offset.multiplyScalar(1.6);
    if (!reduced) this.react(shot, skier.phase);
    this.shot = shot;
    this.phase = skier.phase;

    if (!this.ready || reduced) {
      this.offset.copy(t.offset);
      this.look.copy(t.look);
      this.offsetVelocity.set(0, 0, 0);
      this.lookVelocity.set(0, 0, 0);
      this.fov.value = t.fov;
      this.zoom.value = 0;
      this.zoom.velocity = 0;
      this.roll.value = t.roll;
      this.frameX = t.frameX;
      this.frameY = t.frameY;
      this.ready = true;
    } else {
      const step = Math.min(dt, 1 / 30);
      const damping = dampingFor(t.stiffness, t.ratio);
      springVector(this.offset, this.offsetVelocity, t.offset, t.stiffness, damping, step, this.scratch);
      springVector(this.look, this.lookVelocity, t.look, t.stiffness * 1.4, dampingFor(t.stiffness * 1.4, 1), step, this.scratch);
      springScalar(this.fov, t.fov, 10, dampingFor(10, 1), step);
      springScalar(this.zoom, 0, 36, dampingFor(36, 0.35), step);
      springScalar(this.roll, t.roll, 10, dampingFor(10, 1), step);
      const k = 1 - Math.exp(-3 * dt);
      this.frameX += (t.frameX - this.frameX) * k;
      this.frameY += (t.frameY - this.frameY) * k;
    }

    camera.position.copy(this.rider).add(this.offset);
    const floor = this.heightAt(camera.position.x, camera.position.z) + 12;
    camera.position.y = Math.max(camera.position.y, floor);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 18;
      camera.position.y += (Math.random() - 0.5) * shake * 18;
    }
    this.tmp.copy(this.rider).add(this.look);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.tmp);
    camera.rotateZ(this.roll.value);

    camera.fov = clamp(this.fov.value + this.zoom.value, 24, 100);
    camera.setViewOffset(width, height, this.frameX * width, this.frameY * height, width, height);
    camera.updateProjectionMatrix();
  }

  /* Skip easing on the next frame (teleports, first draw). */
  cut() {
    this.ready = false;
  }
}

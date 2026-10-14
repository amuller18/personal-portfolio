/*
 * Camera director. Each frame it picks a "shot" from the model state, then
 * eases the camera toward it. Shots are expressed relative to the rider, so
 * blending between them stays smooth even at full speed.
 *
 *   at a checkpoint   slow hero orbit, framed beside the chapter card
 *   run-in            low chase cam that widens with speed
 *   in the air        rotates per jump: side dolly, sweeping orbit,
 *                     low hero from the landing, overhead; the finale
 *                     gets a full 360 orbit
 *   landing/run-out   tracking shot from ahead, looking back
 *   rewinding         reverse angle
 */
import * as THREE from "three";
import { TOUCHDOWN } from "../../model/course";
import { clamp, clamp01 } from "../../../shared/math";

const AIR_SHOTS = ["side", "orbit", "hero", "overhead"];

function ease(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export default class Director {
  constructor(camera, course, heightAt) {
    this.camera = camera;
    this.course = course;
    this.heightAt = heightAt;
    this.offset = new THREE.Vector3(260, 110, 160);
    this.look = new THREE.Vector3(0, 38, 0);
    this.fov = 50;
    this.roll = 0;
    this.frameX = 0;
    this.frameY = 0;
    this.ready = false;
    this.shot = "idle";
    this.shotTarget = { offset: new THREE.Vector3(), look: new THREE.Vector3() };
    this.rider = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  /* Returns the shot name; fills this.shotTarget. */
  pick(frame, narrow) {
    const { skier, progress, velocity, time } = frame;
    const target = this.shotTarget;
    const lastStop = this.course.stopCount - 1;
    const nearest = Math.round(progress);
    const idle = Math.abs(progress - nearest) < 0.06 && Math.abs(velocity) < 0.3;
    const speedNorm = clamp01(frame.speed / 1400);

    target.fov = 50;
    target.roll = 0;
    target.rate = 3;
    target.frameX = 0;
    target.frameY = 0;

    if (idle) {
      const wide = nearest === 0 || nearest === lastStop;
      const theta = (nearest === 0 ? 0.55 : 0.8) + 0.32 * Math.sin(time * 0.22 + nearest * 1.7);
      const radius = wide ? 400 : 300;
      target.offset.set(Math.cos(theta) * radius, wide ? 120 : 85, Math.sin(theta) * radius);
      target.look.set(0, 40, 0);
      target.rate = 2.2;
      target.frameX = narrow ? 0 : -0.15;
      target.frameY = narrow ? 0.2 : 0;
      return "idle";
    }

    if (velocity < -0.05) {
      target.offset.set(230, 80, -90);
      target.look.set(0, 30, 0);
      target.rate = 3;
      return "rewind";
    }

    if (skier.airborne) {
      const s = skier.air;
      const arc = Math.sin(Math.PI * s);
      const finale = skier.run === lastStop - 1;
      const kind = finale ? "finale" : AIR_SHOTS[skier.run % AIR_SHOTS.length];
      target.look.set(0, 26, 0);
      switch (kind) {
        case "side":
          target.offset.set(10, 34, 290);
          target.fov = 54;
          target.roll = 0.09 * arc;
          target.rate = 5;
          break;
        case "orbit": {
          const a = Math.PI - s * Math.PI * 1.25;
          target.offset.set(Math.cos(a) * 220, 40 + 60 * arc, Math.sin(a) * 220);
          target.fov = 56;
          target.rate = 7;
          break;
        }
        case "hero": {
          const jump = skier.jump;
          const x = jump.landX + 150;
          const z = 150;
          this.tmp.set(x, this.heightAt(x, z) + 14, z);
          target.offset.copy(this.tmp).sub(this.rider);
          target.fov = 64;
          target.roll = -0.12;
          target.rate = 3;
          break;
        }
        case "overhead":
          target.offset.set(-40, 320, 70);
          target.look.set(30, 0, 0);
          target.fov = 52;
          target.rate = 4;
          break;
        default: {
          const a = Math.PI - s * Math.PI * 2;
          target.offset.set(Math.cos(a) * 240, 50 + 70 * arc, Math.sin(a) * 240);
          target.fov = 58;
          target.roll = 0.14 * arc;
          target.rate = 9;
        }
      }
      return `air-${kind}`;
    }

    const f = progress - Math.floor(progress);
    if (f < TOUCHDOWN) {
      target.offset.set(-210, 78, 70);
      target.look.set(170, 10, 0);
      target.fov = 58 + 14 * speedNorm;
      target.roll = -0.05 * speedNorm;
      target.rate = 4;
      return "chase";
    }
    target.offset.set(220, 48, -100);
    target.look.set(0, 30, 0);
    target.fov = 54;
    target.rate = 3.5;
    return "track";
  }

  update(frame, dt, { narrow, width, height, shake }) {
    const { camera } = this;
    const { skier } = frame;
    this.rider.set(skier.x, -skier.y, 0);
    this.shot = this.pick(frame, narrow);
    const t = this.shotTarget;
    // Portrait screens have a narrow horizontal field of view: pull back.
    if (narrow && this.shot !== "air-hero") t.offset.multiplyScalar(1.6);

    if (!this.ready) {
      this.offset.copy(t.offset);
      this.look.copy(t.look);
      this.fov = t.fov;
      this.roll = t.roll;
      this.frameX = t.frameX;
      this.frameY = t.frameY;
      this.ready = true;
    } else {
      const k = 1 - Math.exp(-t.rate * dt);
      this.offset.lerp(t.offset, k);
      this.look.lerp(t.look, k);
      this.fov = ease(this.fov, t.fov, 3, dt);
      this.roll = ease(this.roll, t.roll, 3, dt);
      this.frameX = ease(this.frameX, t.frameX, 3, dt);
      this.frameY = ease(this.frameY, t.frameY, 3, dt);
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
    camera.rotateZ(this.roll);

    camera.fov = clamp(this.fov, 30, 90);
    camera.setViewOffset(width, height, this.frameX * width, this.frameY * height, width, height);
    camera.updateProjectionMatrix();
  }

  /* Skip easing on the next frame (teleports, first draw). */
  cut() {
    this.ready = false;
  }
}

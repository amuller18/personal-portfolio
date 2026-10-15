/*
 * Camera director: one steady follow camera, watching from the near side of
 * the run so the rider always travels left to right, and a slow glide onto
 * each board when the rider stops at one. No orbits, zoom punches or shake.
 *
 * Shots are expressed relative to the rider and eased with critically damped
 * springs, so the camera never overshoots and never lags at speed.
 * `boardBlend` (0..1) says how far the glide onto the current board has got,
 * so the renderer can fade the board's content in as the camera arrives.
 */
import * as THREE from "three";
import { clamp } from "../../../shared/math";

const FOLLOW_OFFSET = new THREE.Vector3(0, 80, 360);
const FOLLOW_LOOK = new THREE.Vector3(70, 26, 0);
const FOLLOW_FOV = 48;
const BOARD_FOV = 38;
const BOARD_FILL = 0.86;
const FOLLOW_STIFFNESS = 14;
const BOARD_STIFFNESS = 3.2;

function springVector(position, velocity, target, stiffness, dt, scratch) {
  const damping = 2 * Math.sqrt(stiffness);
  scratch.subVectors(target, position).multiplyScalar(stiffness);
  scratch.addScaledVector(velocity, -damping);
  velocity.addScaledVector(scratch, dt);
  position.addScaledVector(velocity, dt);
}

function springScalar(state, target, stiffness, dt) {
  const damping = 2 * Math.sqrt(stiffness);
  state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * dt;
  state.value += state.velocity * dt;
}

export default class Director {
  constructor(camera, course, heightAt, surfaces = new Map()) {
    this.camera = camera;
    this.course = course;
    this.heightAt = heightAt;
    this.surfaces = surfaces;
    this.offset = FOLLOW_OFFSET.clone();
    this.offsetVelocity = new THREE.Vector3();
    this.look = FOLLOW_LOOK.clone();
    this.lookVelocity = new THREE.Vector3();
    this.fov = { value: FOLLOW_FOV, velocity: 0 };
    this.frameX = 0;
    this.frameY = 0;
    this.ready = false;
    this.shot = "follow";
    this.board = -1;
    this.boardBlend = 0;
    this.boardStart = 1;
    this.targetOffset = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    this.rider = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
  }

  boardDistance(aspect, surface) {
    const t = Math.tan((BOARD_FOV * Math.PI) / 360);
    return Math.max(surface.height / 2 / t, surface.width / 2 / (t * aspect)) / BOARD_FILL;
  }

  update(frame, dt, { narrow, width, height, reduced }) {
    const { camera } = this;
    const { skier, progress, velocity } = frame;
    const aspect = width / height;
    // Follow the middle of a jump's arc rather than every bump of it.
    this.rider.set(skier.x, -(skier.focusY ?? skier.y), skier.z || 0);

    const nearest = Math.round(progress);
    const stopped = Math.abs(progress - nearest) < 0.06 && Math.abs(velocity) < 0.3;
    const surface = stopped ? this.surfaces.get(nearest) : null;
    const lastStop = this.course.stopCount - 1;
    let stiffness = FOLLOW_STIFFNESS;
    let fov = FOLLOW_FOV;
    let frameX = 0;
    let frameY = 0;

    if (surface) {
      // Glide square-on to the board, close enough to fill the screen.
      this.tmp.copy(surface.center).addScaledVector(surface.normal, this.boardDistance(aspect, surface));
      this.targetOffset.copy(this.tmp).sub(this.rider);
      this.targetLook.copy(surface.center).sub(this.rider);
      stiffness = BOARD_STIFFNESS;
      fov = BOARD_FOV;
      frameY = -0.05;
      if (this.shot !== "board" || this.board !== nearest) {
        this.boardStart = Math.max(1, this.offset.distanceTo(this.targetOffset));
      }
      this.shot = "board";
      this.board = nearest;
    } else {
      this.targetOffset.copy(FOLLOW_OFFSET);
      this.targetLook.copy(FOLLOW_LOOK);
      if (narrow) this.targetOffset.z *= 1.5;
      // Stops with a floating card: leave room for it on the left.
      if (stopped && (nearest === 0 || nearest === lastStop || !this.surfaces.has(nearest))) {
        frameX = narrow ? 0 : -0.15;
        frameY = narrow ? 0.2 : 0;
      }
      // Leaving a board: glide back out at the same gentle pace.
      if (this.shot === "board") stiffness = BOARD_STIFFNESS;
      if (this.shot === "board" && this.offset.distanceTo(this.targetOffset) < 40) this.shot = "follow";
      this.board = -1;
    }

    if (!this.ready || reduced) {
      this.offset.copy(this.targetOffset);
      this.look.copy(this.targetLook);
      this.offsetVelocity.set(0, 0, 0);
      this.lookVelocity.set(0, 0, 0);
      this.fov.value = fov;
      this.fov.velocity = 0;
      this.frameX = frameX;
      this.frameY = frameY;
      this.ready = true;
    } else {
      const step = Math.min(dt, 1 / 30);
      springVector(this.offset, this.offsetVelocity, this.targetOffset, stiffness, step, this.scratch);
      springVector(this.look, this.lookVelocity, this.targetLook, stiffness, step, this.scratch);
      springScalar(this.fov, fov, Math.min(stiffness, 6), step);
      const k = 1 - Math.exp(-2.5 * dt);
      this.frameX += (frameX - this.frameX) * k;
      this.frameY += (frameY - this.frameY) * k;
    }

    this.boardBlend =
      this.shot === "board" && this.board >= 0
        ? clamp(1 - this.offset.distanceTo(this.targetOffset) / this.boardStart, 0, 1)
        : 0;

    camera.position.copy(this.rider).add(this.offset);
    const floor = this.heightAt(camera.position.x, camera.position.z) + 12;
    camera.position.y = Math.max(camera.position.y, floor);
    this.tmp.copy(this.rider).add(this.look);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.tmp);
    camera.fov = clamp(this.fov.value, 24, 90);
    camera.setViewOffset(width, height, this.frameX * width, this.frameY * height, width, height);
    camera.updateProjectionMatrix();
  }

  /* Skip easing on the next frame (teleports, first draw). */
  cut() {
    this.ready = false;
  }
}

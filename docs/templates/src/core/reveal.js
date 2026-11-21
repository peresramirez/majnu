import * as THREE from 'three';
import { tween, lerp, ease } from './tween.js';

/** Detach the card into world space and glide it to the front of the camera. */
export async function presentCard(stage, card, { duration = 1.4 } = {}) {
  stage.scene.attach(card);
  const p0 = card.position.clone();
  const q0 = card.quaternion.clone();
  const s0 = card.scale.x;
  const p1 = new THREE.Vector3(0, 0.75, 2.2);
  const q1 = new THREE.Quaternion();
  await tween({
    duration,
    easing: ease.inOutCubic,
    onUpdate: (t) => {
      card.position.lerpVectors(p0, p1, t);
      card.quaternion.slerpQuaternions(q0, q1, t);
      card.scale.setScalar(lerp(s0, 1, t));
    },
  });
  // Gentle hover once presented
  const base = card.position.y;
  stage.onUpdate((dt, time) => {
    card.position.y = base + Math.sin(time * 1.2) * 0.03;
    card.rotation.y = Math.sin(time * 0.6) * 0.06;
  });
}

/** Idle bobbing for the closed object; returns a stop() function. */
export function idleFloat(stage, obj, amp = 0.06) {
  let on = true;
  const y0 = obj.position.y;
  stage.onUpdate((dt, time) => {
    if (!on) return;
    obj.position.y = y0 + Math.sin(time * 1.5) * amp;
    obj.rotation.y = Math.sin(time * 0.7) * 0.15;
  });
  return () => (on = false);
}

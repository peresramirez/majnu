import * as THREE from 'three';
import { tween, lerp, ease, wait } from '../core/tween.js';
import { createParticles } from '../core/particles.js';
import { createBox, makeBow } from '../core/box.js';
import { presentCard, idleFloat } from '../core/reveal.js';

export function buildGift(stage, cfg, card) {
  const { scene } = stage;
  const c = cfg.colors;
  const ribbonColor = c.ribbon || c.accent;

  const box = createBox({ color: c.box || '#0f6b5c', ribbon: ribbonColor });
  const root = new THREE.Group();
  root.position.y = -0.98;
  root.add(box.group);
  scene.add(root);

  const bow = makeBow(box.ribbonMat);
  bow.position.y = 0.14;
  box.lid.add(bow);

  card.scale.setScalar(0.6);
  card.position.set(0, 0.62, 0);
  box.group.add(card);

  const sparkles = createParticles({
    type: 'sparkle',
    count: 260,
    colors: [ribbonColor, '#fff4c2', '#ffffff'],
    gravity: -0.6,
    drag: 0.96,
  });
  scene.add(sparkles.mesh);
  stage.onUpdate(sparkles.update);

  const stopFloat = idleFloat(stage, box.group, 0.0);

  async function open() {
    stopFloat();
    const ry = box.group.rotation.y;
    await tween({ duration: 0.4, onUpdate: (t) => (box.group.rotation.y = lerp(ry, 0, t)) });
    // Bow untie: loops stretch and vanish
    await tween({
      duration: 0.5,
      easing: ease.inOutCubic,
      onUpdate: (t) => {
        bow.scale.set(1 + t * 1.2, 1 - t, 1 - t * 0.5);
        bow.rotation.y = t * 1.5;
      },
    });
    bow.visible = false;
    // Lid lifts and floats away
    const l0 = box.lidHinge.position.clone();
    tween({
      duration: 1.3,
      easing: ease.inOutCubic,
      onUpdate: (t) => {
        box.lidHinge.position.set(l0.x - t * 2.4, l0.y + Math.sin(t * Math.PI) * 0.8 - t * 1.1, l0.z - t * 0.5);
        box.lidHinge.rotation.set(0, t * 0.8, t * 0.5);
      },
    });
    await wait(0.4);
    // Walls unfold like petals
    const glow = new THREE.Vector3(0, -0.3, 0);
    sparkles.burst(glow, { speed: 2.2, spread: 1, up: 1.3, n: 160 });
    await tween({
      duration: 1.0,
      easing: ease.outCubic,
      onUpdate: (t) => box.walls.forEach((w) => (w.rotation.x = lerp(0, Math.PI / 2 - 0.05, t))),
    });
    // Card rises with a trail of sparkles
    const interval = setInterval(
      () => sparkles.burst(card.getWorldPosition(new THREE.Vector3()), { speed: 1.2, spread: 1, up: 0.4, n: 12 }),
      90
    );
    await tween({ duration: 1.0, easing: ease.inOutCubic, onUpdate: (t) => (card.position.y = lerp(0.62, 1.9, t)) });
    await presentCard(stage, card, { duration: 1.2 });
    clearInterval(interval);
    sparkles.burst(new THREE.Vector3(0, 0.75, 2.0), { speed: 2.5, spread: 1.4, up: 0.8, n: 120 });
  }

  return { open };
}

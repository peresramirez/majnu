import * as THREE from 'three';
import { tween, lerp, ease } from '../core/tween.js';
import { createParticles } from '../core/particles.js';
import { createBox } from '../core/box.js';
import { presentCard, idleFloat } from '../core/reveal.js';

const CONFETTI = ['#ff3d7f', '#ffc93c', '#3ce0ff', '#7b3cff', '#3cff9e', '#ffffff'];

function makeBalloon(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 24), mat);
  body.scale.set(1, 1.2, 1);
  body.castShadow = true;
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 12), mat);
  knot.position.y = -0.4;
  knot.rotation.x = Math.PI;
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 1.4),
    new THREE.MeshBasicMaterial({ color: '#dddddd' })
  );
  string.position.y = -1.12;
  g.add(body, knot, string);
  return g;
}

export function buildParty(stage, cfg, card) {
  const { scene } = stage;
  const c = cfg.colors;

  const box = createBox({ color: c.box || '#7b3cff', ribbon: c.accent });
  const root = new THREE.Group();
  root.position.y = -0.98;
  root.add(box.group);
  scene.add(root);

  // Polka dots on the lid
  const dotMat = new THREE.MeshStandardMaterial({ color: '#ffc93c', roughness: 0.4 });
  for (let i = 0; i < 9; i++) {
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 20), dotMat);
    const x = ((i % 3) - 1) * 0.45, z = (Math.floor(i / 3) - 1) * 0.45;
    if (x === 0 || z === 0) continue; // ribbon cross
    dot.position.set(x, 0.145, z);
    box.lid.add(dot);
  }

  card.scale.setScalar(0.6);
  card.position.set(0, 0.62, 0);
  box.group.add(card);

  const confetti = createParticles({ type: 'confetti', count: 400, colors: CONFETTI, gravity: -3, drag: 0.985 });
  scene.add(confetti.mesh);
  stage.onUpdate(confetti.update);

  const balloonColors = ['#ff3d7f', '#3ce0ff', '#ffc93c', '#3cff9e', '#7b3cff'];
  const balloonTargets = [[-2.6, 1.6, -1], [2.6, 1.9, -1.2], [-1.9, 2.5, -2], [2.0, 2.7, -2.2], [0, 3.1, -2.8]];
  const balloons = balloonTargets.map(([x, y, z], i) => {
    const b = makeBalloon(balloonColors[i]);
    b.position.set(x, -4, z);
    b.userData = { y, phase: i * 1.3, up: false };
    scene.add(b);
    return b;
  });
  stage.onUpdate((dt, time) => {
    balloons.forEach((b) => {
      if (!b.userData.up) return;
      b.position.y += (b.userData.y + Math.sin(time + b.userData.phase) * 0.12 - b.position.y) * 0.03;
      b.rotation.z = Math.sin(time * 0.8 + b.userData.phase) * 0.1;
    });
  });

  // Box wobbles with anticipation while idle
  const stopFloat = idleFloat(stage, box.group, 0.0);
  stage.onUpdate((dt, time) => {
    if (box.lidHinge.userData.opened) return;
    box.lidHinge.position.y = box.h + Math.max(0, Math.sin(time * 4)) * 0.04;
  });

  async function open() {
    stopFloat();
    box.lidHinge.userData.opened = true;
    const ry = box.group.rotation.y;
    // Squash
    await tween({
      duration: 0.3,
      onUpdate: (t) => {
        box.group.scale.set(1 + t * 0.08, 1 - t * 0.12, 1 + t * 0.08);
        box.group.rotation.y = lerp(ry, 0, t);
      },
    });
    // Pop! lid flies off
    const lidStart = box.lidHinge.position.clone();
    tween({
      duration: 1.2,
      easing: ease.outCubic,
      onUpdate: (t) => {
        box.lidHinge.position.set(lidStart.x + t * 1.8, lidStart.y + Math.sin(t * Math.PI) * 1.6 + t * -1.4, lidStart.z - t * 0.6);
        box.lidHinge.rotation.set(-t * 2.4, 0, -t * 3.2);
      },
    });
    tween({
      duration: 0.4,
      easing: ease.outElastic,
      onUpdate: (t) => box.group.scale.set(1.08 - t * 0.08, 0.88 + t * 0.12, 1.08 - t * 0.08),
    });
    const top = new THREE.Vector3(0, 0.3, 0);
    confetti.burst(top, { speed: 4.5, spread: 1, up: 1.4, n: 250 });
    setTimeout(() => confetti.burst(top, { speed: 3.5, spread: 1.4, up: 1.2, n: 150 }), 600);
    balloons.forEach((b, i) => setTimeout(() => (b.userData.up = true), 200 + i * 150));
    // Card springs up
    await tween({ duration: 0.9, easing: ease.outBack, onUpdate: (t) => (card.position.y = lerp(0.62, 2.0, t)) });
    await presentCard(stage, card, { duration: 1.1 });
  }

  return { open };
}

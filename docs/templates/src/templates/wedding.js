import * as THREE from 'three';
import { tween, lerp, ease, wait } from '../core/tween.js';
import { createParticles } from '../core/particles.js';
import { presentCard, idleFloat } from '../core/reveal.js';

const EW = 1.9, EH = 1.3; // envelope size

function envelopeFrontShape() {
  // Pocket: full rectangle with a shallow V notch along the top
  const s = new THREE.Shape();
  s.moveTo(-EW / 2, -EH / 2);
  s.lineTo(EW / 2, -EH / 2);
  s.lineTo(EW / 2, EH / 2);
  s.lineTo(0, 0.0);
  s.lineTo(-EW / 2, EH / 2);
  s.closePath();
  return s;
}

function flapShape() {
  const s = new THREE.Shape();
  s.moveTo(-EW / 2, 0);
  s.lineTo(EW / 2, 0);
  s.quadraticCurveTo(0.15, -0.7, 0, -0.78);
  s.quadraticCurveTo(-0.15, -0.7, -EW / 2, 0);
  return s;
}

export function buildWedding(stage, cfg, card) {
  const { scene } = stage;
  const c = cfg.colors;
  const paper = new THREE.MeshStandardMaterial({ color: c.primary, roughness: 0.8, side: THREE.DoubleSide });
  const inner = new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });

  const env = new THREE.Group();
  env.position.set(0, 0.4, 0);
  scene.add(env);

  const back = new THREE.Mesh(new THREE.PlaneGeometry(EW, EH), inner);
  back.position.z = -0.03;
  env.add(back);

  const front = new THREE.Mesh(new THREE.ShapeGeometry(envelopeFrontShape()), paper);
  front.position.z = 0.03;
  front.castShadow = true;
  env.add(front);

  // Gold edge lines on the pocket
  const edgeMat = new THREE.LineBasicMaterial({ color: c.accent });
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ShapeGeometry(envelopeFrontShape())),
    edgeMat
  );
  edge.position.z = 0.032;
  env.add(edge);

  // Card starts tucked inside
  card.scale.setScalar(0.66);
  card.position.set(0, -0.02, 0);
  env.add(card);

  // Flap hinged on the top edge
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, EH / 2, 0.04);
  env.add(flapPivot);
  const flap = new THREE.Mesh(new THREE.ShapeGeometry(flapShape()), paper);
  flap.castShadow = true;
  flapPivot.add(flap);

  // Wax seal at the flap tip
  const sealMat = new THREE.MeshStandardMaterial({ color: c.seal || '#8e1b2c', roughness: 0.35, metalness: 0.2 });
  const seal = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.05, 32), sealMat);
  disc.rotation.x = Math.PI / 2;
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.06);
  heart.bezierCurveTo(-0.1, 0.0, -0.06, 0.08, 0, 0.04);
  heart.bezierCurveTo(0.06, 0.08, 0.1, 0.0, 0, -0.06);
  const emboss = new THREE.Mesh(
    new THREE.ExtrudeGeometry(heart, { depth: 0.02, bevelEnabled: false }),
    sealMat
  );
  emboss.position.z = 0.02;
  seal.add(disc, emboss);
  seal.position.set(0, -0.72, 0.03);
  flapPivot.add(seal);

  const petals = createParticles({
    type: 'petal',
    count: 160,
    mode: 'rain',
    colors: ['#f4a7b9', '#e8778f', '#fbd3dc', '#c94f6d', '#ffffff'],
  });
  scene.add(petals.mesh);
  stage.onUpdate(petals.update);

  const stopFloat = idleFloat(stage, env, 0.05);

  async function open() {
    stopFloat();
    // Settle to neutral pose
    const ry = env.rotation.y;
    await tween({ duration: 0.4, onUpdate: (t) => (env.rotation.y = lerp(ry, 0, t)) });
    // Seal pops
    await tween({ duration: 0.35, easing: ease.outCubic, onUpdate: (t) => seal.scale.setScalar(1 + t * 0.4 - t * t * 1.4) });
    seal.visible = false;
    // Flap swings open
    await tween({ duration: 0.9, easing: ease.inOutCubic, onUpdate: (t) => (flapPivot.rotation.x = lerp(0, -Math.PI * 0.97, t)) });
    flapPivot.position.z = -0.05; // tuck flap behind the rising card
    petals.startRain();
    // Card slides up out of the pocket
    await tween({ duration: 1.0, easing: ease.inOutCubic, onUpdate: (t) => (card.position.y = lerp(-0.02, 1.35, t)) });
    // Envelope drifts away as card comes forward
    const y0 = env.position.y;
    tween({
      duration: 1.4,
      delay: 0.2,
      onUpdate: (t) => {
        env.position.y = lerp(y0, -0.3, t);
        env.position.z = lerp(0, -1.5, t);
      },
    });
    await presentCard(stage, card);
    await wait(0.1);
  }

  return { open };
}

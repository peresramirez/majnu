import * as THREE from 'three';

function petalGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.06);
  shape.bezierCurveTo(0.06, -0.03, 0.06, 0.05, 0, 0.07);
  shape.bezierCurveTo(-0.06, 0.05, -0.06, -0.03, 0, -0.06);
  return new THREE.ShapeGeometry(shape, 6);
}

const GEOMETRIES = {
  petal: petalGeometry,
  confetti: () => new THREE.PlaneGeometry(0.06, 0.11),
  sparkle: () => new THREE.OctahedronGeometry(0.035),
};

/**
 * Instanced particle system.
 * mode 'rain'  : particles continuously fall from above (petals).
 * mode 'burst' : idle until burst(origin) fires them outward.
 */
export function createParticles({ type, count = 200, colors, mode = 'burst', gravity = -2.5, drag = 0.98 }) {
  const geo = GEOMETRIES[type]();
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    roughness: 0.5,
    metalness: type === 'sparkle' ? 0.6 : 0.1,
    emissive: type === 'sparkle' ? new THREE.Color(colors[0]) : new THREE.Color(0),
    emissiveIntensity: type === 'sparkle' ? 0.8 : 0,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;

  const color = new THREE.Color();
  const P = [];
  for (let i = 0; i < count; i++) {
    mesh.setColorAt(i, color.set(colors[i % colors.length]));
    P.push({
      pos: new THREE.Vector3(0, -100, 0),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
      life: 0,
      phase: Math.random() * 10,
      alive: false,
    });
  }

  let raining = false;
  const respawnRain = (p) => {
    p.pos.set((Math.random() - 0.5) * 9, 4 + Math.random() * 4, (Math.random() - 0.5) * 4);
    p.vel.set(0, -0.4 - Math.random() * 0.4, 0);
    p.alive = true;
    p.life = 99;
  };

  const dummy = new THREE.Object3D();
  function update(dt, time) {
    for (let i = 0; i < count; i++) {
      const p = P[i];
      if (p.alive) {
        if (mode === 'rain') {
          p.pos.x += Math.sin(time * 1.3 + p.phase) * 0.4 * dt;
          p.pos.addScaledVector(p.vel, dt);
          if (p.pos.y < -1.2) respawnRain(p);
        } else {
          p.vel.y += gravity * dt;
          p.vel.multiplyScalar(drag);
          p.pos.addScaledVector(p.vel, dt);
          p.life -= dt;
          if (p.life <= 0 || p.pos.y < -1.2) p.alive = false;
        }
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
      }
      if (p.alive) dummy.position.copy(p.pos);
      else dummy.position.set(0, -100, 0);
      dummy.rotation.copy(p.rot);
      const s = p.alive && mode === 'burst' ? Math.min(1, p.life) : 1;
      dummy.scale.setScalar(type === 'sparkle' ? s * (0.6 + 0.4 * Math.sin(time * 8 + p.phase)) : s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh,
    update,
    startRain() {
      if (raining) return;
      raining = true;
      P.forEach((p, i) => {
        respawnRain(p);
        p.pos.y += i * (8 / count); // stagger entry
      });
    },
    burst(origin, { speed = 4, spread = 1, up = 1, n = count } = {}) {
      let fired = 0;
      for (const p of P) {
        if (fired >= n) break;
        if (p.alive) continue;
        p.pos.copy(origin);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * spread;
        p.vel.set(Math.cos(a) * r, up * (0.6 + Math.random() * 0.8), Math.sin(a) * r * 0.6).multiplyScalar(speed);
        p.life = 2.5 + Math.random() * 2;
        p.alive = true;
        fired++;
      }
    },
  };
}

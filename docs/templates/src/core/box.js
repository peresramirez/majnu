import * as THREE from 'three';

/**
 * Open-top box whose four walls hinge at their bottom edge (so they can fold
 * outward) plus a separate lid group hinged at the back edge.
 * Origin is at the centre of the box floor.
 */
export function createBox({ w = 1.4, h = 1.2, d = 1.4, color, ribbon }) {
  const t = 0.04;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  const ribbonMat = ribbon
    ? new THREE.MeshStandardMaterial({ color: ribbon, roughness: 0.3, metalness: 0.6 })
    : null;
  const group = new THREE.Group();

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), mat);
  bottom.receiveShadow = true;
  group.add(bottom);

  // wall definitions: [hinge position, rotation.y, width]
  const defs = [
    [new THREE.Vector3(0, 0, d / 2), 0, w], // front
    [new THREE.Vector3(0, 0, -d / 2), Math.PI, w], // back
    [new THREE.Vector3(w / 2, 0, 0), Math.PI / 2, d], // right
    [new THREE.Vector3(-w / 2, 0, 0), -Math.PI / 2, d], // left
  ];
  const walls = defs.map(([pos, ry, width]) => {
    const hinge = new THREE.Group();
    hinge.position.copy(pos);
    hinge.rotation.order = 'YXZ'; // so rotation.x folds the wall outward in its own frame
    hinge.rotation.y = ry;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, h, t), mat);
    wall.position.y = h / 2;
    wall.castShadow = true;
    hinge.add(wall);
    if (ribbonMat) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, t + 0.012), ribbonMat);
      band.position.y = h / 2;
      hinge.add(band);
    }
    group.add(hinge);
    return hinge;
  });

  // Lid hinged on back edge
  const lidHinge = new THREE.Group();
  lidHinge.position.set(0, h, -d / 2);
  const lid = new THREE.Group();
  lid.position.z = d / 2;
  const lidTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1), mat);
  lidTop.position.y = 0.05;
  lidTop.castShadow = true;
  lid.add(lidTop);
  if (ribbonMat) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, d + 0.12), ribbonMat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.2, 0.18), ribbonMat);
    a.position.y = b.position.y = 0.05;
    lid.add(a, b);
  }
  lidHinge.add(lid);
  group.add(lidHinge);

  return { group, walls, lidHinge, lid, ribbonMat, h };
}

export function makeBow(material) {
  const bow = new THREE.Group();
  const loopGeo = new THREE.TorusGeometry(0.22, 0.06, 12, 32);
  [-1, 1].forEach((s) => {
    const loop = new THREE.Mesh(loopGeo, material);
    loop.scale.set(1, 0.6, 1);
    loop.position.set(0.2 * s, 0.12, 0);
    loop.rotation.set(0, s * 0.4, s * 0.5);
    loop.castShadow = true;
    bow.add(loop);
  });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), material);
  knot.position.y = 0.1;
  bow.add(knot);
  return bow;
}

import * as THREE from 'three';
import { updateTweens } from './tween.js';

export function createStage(container, background) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(background, 12, 30);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 1.2, 7);
  camera.lookAt(0, 0.6, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x443344, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const rim = new THREE.PointLight(0xffd9a0, 20, 20);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  // Soft floor to catch shadows
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 48),
    new THREE.ShadowMaterial({ opacity: 0.25 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  floor.receiveShadow = true;
  scene.add(floor);

  const updaters = [];
  const clickHandlers = [];

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // Pull the camera back on narrow (portrait) screens so content fits
    camera.position.z = w / h < 0.8 ? 7 / Math.max(w / h, 0.45) * 0.8 : 7;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // Subtle parallax following the pointer
  const pointer = new THREE.Vector2();
  window.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  });
  renderer.domElement.addEventListener('click', () => clickHandlers.forEach((fn) => fn()));

  const clock = new THREE.Clock();
  const baseX = camera.position.x, baseY = camera.position.y;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    updateTweens(dt);
    updaters.forEach((fn) => fn(dt, time));
    camera.position.x += (baseX + pointer.x * 0.4 - camera.position.x) * 0.05;
    camera.position.y += (baseY + pointer.y * 0.25 - camera.position.y) * 0.05;
    camera.lookAt(0, 0.6, 0);
    renderer.render(scene, camera);
  });

  return {
    scene,
    camera,
    renderer,
    onUpdate: (fn) => updaters.push(fn),
    onClick: (fn) => clickHandlers.push(fn),
  };
}

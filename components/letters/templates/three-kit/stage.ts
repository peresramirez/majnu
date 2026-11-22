// The three.js stage the newer 3D templates share (wedding-invite-3d,
// party-invite-3d, gift-3d): renderer, camera framed to fit, lights, a render
// loop with tweens, a soft blob shadow, pointer parallax on a mouse, and a
// dispose that hands the GPU back. Each template's scene module imports this;
// only those scene modules do, and they are reached only through import(), so
// three.js stays a separate chunk that no other page downloads.
//
// Performance on a mid phone: no shadow maps (a blurred disc stands in), at
// most 1.75 device pixels per CSS pixel on small screens, instanced particles,
// and the loop stops as soon as the template disposes the stage.
import * as THREE from "three"
import { ease, makeTweens } from "../wedding-envelope-3d/tweens"
import { FOV, renderPixelRatio } from "./fit"

export { ease, lerp } from "../wedding-envelope-3d/tweens"

export type StageOptions = {
  // The visitor tapped the scene.
  onTap: () => void
  // The GPU took the context away (a phone under memory pressure).
  onLost: () => void
  // Where the camera looks.
  lookAt?: THREE.Vector3
  // Distance from the camera to `lookAt` for a given aspect ratio.
  distance: (aspect: number) => number
  // Camera height above `lookAt`.
  lift?: number
}

export type Stage = ReturnType<typeof createStage>

export function createStage(container: HTMLElement, opts: StageOptions) {
  let disposed = false
  const tweens = makeTweens()
  const frames: ((dt: number, time: number) => void)[] = []
  const timers: ReturnType<typeof setTimeout>[] = []

  // Throws when WebGL is unavailable; the template then keeps its still drawing.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  const canvas = renderer.domElement
  canvas.setAttribute("aria-hidden", "true")
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    opacity: "0",
    transition: "opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1)",
    cursor: "pointer",
    touchAction: "manipulation",
  })

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100)
  const lookAt = opts.lookAt?.clone() ?? new THREE.Vector3(0, 0, 0)
  const lift = opts.lift ?? 0.6
  // The camera's resting place; templates move it with `distanceScale`.
  const base = new THREE.Vector3(0, lookAt.y + lift, 8)
  const view = { distanceScale: 1, distance: opts.distance }

  // ----- Sizing and pointer parallax -----
  const pointer = new THREE.Vector2()
  function resize() {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    renderer.setPixelRatio(renderPixelRatio(window.devicePixelRatio || 1, w))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  camera.position.set(base.x, base.y, lookAt.z + view.distance(camera.aspect))
  camera.lookAt(lookAt)

  const finePointer = window.matchMedia("(pointer: fine)").matches
  const onPointerMove = (e: PointerEvent) => {
    const r = container.getBoundingClientRect()
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }
  if (finePointer) container.addEventListener("pointermove", onPointerMove)
  const onClick = () => opts.onTap()
  canvas.addEventListener("click", onClick)
  const onLost = (e: Event) => {
    e.preventDefault()
    opts.onLost()
  }
  canvas.addEventListener("webglcontextlost", onLost)

  // ----- Render loop -----
  let last = performance.now()
  let time = 0
  function start() {
    renderer.setAnimationLoop((now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      time += dt
      tweens.update(dt)
      for (const f of frames) f(dt, time)
      const z = lookAt.z + view.distance(camera.aspect) * view.distanceScale
      camera.position.x += (base.x + pointer.x * 0.35 - camera.position.x) * 0.05
      camera.position.y += (base.y + pointer.y * 0.22 - camera.position.y) * 0.05
      camera.position.z += (z - camera.position.z) * 0.12
      camera.lookAt(lookAt)
      renderer.render(scene, camera)
    })
    container.appendChild(canvas)
    // Fade in over the still drawing once the first frames are up.
    requestAnimationFrame(() => requestAnimationFrame(() => (canvas.style.opacity = "1")))
  }

  return {
    THREE,
    renderer,
    scene,
    camera,
    base,
    lookAt,
    view,
    tweens,
    get disposed() {
      return disposed
    },
    onFrame(f: (dt: number, time: number) => void) {
      frames.push(f)
    },
    later(seconds: number, f: () => void) {
      timers.push(setTimeout(() => !disposed && f(), seconds * 1000))
    },
    start,
    dispose() {
      if (disposed) return
      disposed = true
      tweens.flush()
      timers.forEach(clearTimeout)
      renderer.setAnimationLoop(null)
      observer.disconnect()
      container.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("click", onClick)
      canvas.removeEventListener("webglcontextlost", onLost)
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose()
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        for (const m of mats) {
          ;(m as THREE.MeshStandardMaterial).map?.dispose()
          m.dispose()
        }
      })
      renderer.dispose()
      // Give the context back now: phones allow only a few.
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}

// Soft, even light that flatters paper, with a warm key from the upper right
// and a rim in the palette's accent.
export function addPaperLights(scene: THREE.Scene, ground: string, rim: string) {
  scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(ground), 2.1))
  const key = new THREE.DirectionalLight(0xfff4e8, 2.2)
  key.position.set(3, 5, 6)
  scene.add(key)
  const back = new THREE.PointLight(new THREE.Color(rim), 14, 18)
  back.position.set(-4, 3, -3)
  scene.add(back)
  return { key, back }
}

// A canvas as a texture, in sRGB, sharp at an angle.
export function textureOf(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return tex
}

// A rectangle with round corners, centred on the origin.
export function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

// ShapeGeometry's UVs are the shape's own coordinates; this maps a texture
// across the shape's bounding box instead, so the whole canvas shows.
export function fitTexture(tex: THREE.Texture, w: number, h: number, cx = 0, cy = 0) {
  tex.repeat.set(1 / w, 1 / h)
  tex.offset.set(0.5 - cx / w, 0.5 - cy / h)
}

// A thin card of any outline: a textured face at the front, an optional face
// at the back, and an edge between them.
export function slab({
  shape,
  depth,
  front,
  back,
  edge,
}: {
  shape: THREE.Shape
  depth: number
  front: THREE.Material
  back?: THREE.Material
  edge: THREE.Material
}): THREE.Group {
  const g = new THREE.Group()
  const face = new THREE.ShapeGeometry(shape, 8)
  const f = new THREE.Mesh(face, front)
  f.position.z = depth / 2 + 0.0005
  g.add(f)
  const b = new THREE.Mesh(face.clone(), back ?? edge)
  b.rotation.y = Math.PI
  b.position.z = -depth / 2 - 0.0005
  g.add(b)
  const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 }), edge)
  rim.position.z = -depth / 2
  g.add(rim)
  return g
}

// A soft round shadow under an object: a radial gradient on a flat disc.
export function blobShadow(radius: number, opacity = 0.32): THREE.Mesh {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, `rgba(0,0,0,${opacity})`)
  g.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  return m
}

// A warm glow: an additive sprite from a radial gradient.
export function glowSprite(color: string, size: number): THREE.Sprite {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, "rgba(255,255,255,1)")
  g.addColorStop(0.25, "rgba(255,255,255,0.55)")
  g.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  )
  sprite.scale.setScalar(size)
  return sprite
}

export type Flake = {
  pos: THREE.Vector3
  vel: THREE.Vector3
  rot: THREE.Euler
  spin: THREE.Vector3
  phase: number
  alive: boolean
  resting: boolean
}

// Instanced paper bits (confetti or petals) with simple physics: gravity, air
// drag, a sideways flutter, and a floor they settle on and stay.
export function createFlakes({
  count,
  colors,
  geometry,
  gravity = -3.2,
  drag = 1.6,
  flutter = 0.8,
  floor = -1.6,
}: {
  count: number
  colors: string[]
  geometry: THREE.BufferGeometry
  gravity?: number
  drag?: number
  flutter?: number
  floor?: number
}) {
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05 })
  const mesh = new THREE.InstancedMesh(geometry, mat, count)
  mesh.frustumCulled = false
  const color = new THREE.Color()
  const flakes: Flake[] = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, color.set(colors[i % colors.length]))
    return {
      pos: new THREE.Vector3(0, -100, 0),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
      phase: Math.random() * 10,
      alive: false,
      resting: false,
    }
  })
  const dummy = new THREE.Object3D()
  let anyAlive = false

  function update(dt: number, time: number) {
    if (!anyAlive) return
    for (let i = 0; i < count; i++) {
      const p = flakes[i]
      if (p.alive && !p.resting) {
        p.vel.y += gravity * dt
        // Air drag grows with speed, so pieces reach a gentle falling speed.
        p.vel.multiplyScalar(Math.max(0, 1 - drag * dt))
        p.pos.addScaledVector(p.vel, dt)
        p.pos.x += Math.sin(time * 3 + p.phase) * flutter * dt
        p.rot.x += p.spin.x * dt
        p.rot.y += p.spin.y * dt
        p.rot.z += p.spin.z * dt
        if (p.pos.y <= floor && p.vel.y < 0) {
          // Lands, lies flat and stays.
          p.pos.y = floor + 0.004 * (i % 5)
          p.resting = true
          p.rot.set(-Math.PI / 2, 0, p.rot.z)
        }
      }
      if (p.alive) dummy.position.copy(p.pos)
      else dummy.position.set(0, -100, 0)
      dummy.rotation.copy(p.rot)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  // Fires `n` pieces from `origin`, in a cone round `dir`.
  function burst(origin: THREE.Vector3, dir: THREE.Vector3, { n = count, speed = 5, spread = 0.6 } = {}) {
    let fired = 0
    for (const p of flakes) {
      if (fired >= n) break
      if (p.alive) continue
      p.pos.copy(origin)
      p.vel
        .copy(dir)
        .normalize()
        .add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread))
        .multiplyScalar(speed * (0.6 + Math.random() * 0.6))
      p.alive = true
      p.resting = false
      fired++
    }
    anyAlive = true
  }

  // Lets pieces drift down from above the view, like petals.
  function drift(n: number, width: number, top: number) {
    let fired = 0
    for (const p of flakes) {
      if (fired >= n) break
      if (p.alive) continue
      p.pos.set((Math.random() - 0.5) * width, top + Math.random() * 2.5, (Math.random() - 0.5) * 1.5)
      p.vel.set(0, -0.3, 0)
      p.alive = true
      p.resting = false
      fired++
    }
    anyAlive = true
  }

  return { mesh, update, burst, drift }
}


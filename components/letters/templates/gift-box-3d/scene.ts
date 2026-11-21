// The three.js scene of the 3D gift box, ported from the prototype archived in
// docs/templates/src (box.js, particles.js, cardTexture.js, reveal.js, tween.js
// and the gift and party templates). Every shape is built in code: no model
// files, no textures or fonts from other sites.
//
// Only gift-box-3d.tsx imports this module, and only with import(), so three.js
// is a separate chunk that loads when a 3D box is on screen and motion is
// allowed. No other gift page downloads it.
//
// Two moods share the box:
//   gift:  the bow unties, the lid floats away, the sides fold open like petals
//          and the card rises in a trail of sparkles.
//   party: the box squashes, the lid pops off, confetti bursts, balloons rise
//          and the card springs up.
// Either way the card ends facing the camera, showing the recipient's name and
// the headline. It never shows a gift code; the page shows those after.
import * as THREE from "three"
import { CARD_HEIGHT, CARD_WIDTH, cameraDistance, FOV, presentDistance, wrapLines, type BoxMood } from "./layout"

// Palette colours as hex strings, read from the template's CSS variables.
export type BoxColors = {
  wrap: string
  wrapShade: string
  accent: string
  accentSoft: string
  paper: string
  paperInk: string
  paperMuted: string
  paperAccent: string
}

// What the rising card says, and the faces to say it in (CSS font lists).
export type CardText = {
  eyebrow: string
  title: string
  headline: string
  from: string
  displayFont: string
  displayWeight: string
  bodyFont: string
  script: boolean
}

export type BoxSceneOptions = {
  mood: BoxMood
  colors: BoxColors
  card: CardText
  // The visitor tapped the box.
  onTap: () => void
  // The GPU took the context away (a phone under memory pressure).
  onLost: () => void
}

export type BoxScene = {
  // Plays the reveal; resolves when the card faces the camera.
  open: () => Promise<void>
  dispose: () => void
}

// ---------- Tweens: a tiny engine driven by the render loop ----------

type Easing = (t: number) => number

const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

type Tween = { elapsed: number; duration: number; easing: Easing; onUpdate: (t: number) => void; resolve: () => void }

function makeTweens() {
  const active: Tween[] = []
  function tween({
    duration = 1,
    delay = 0,
    easing = ease.inOutCubic,
    onUpdate,
  }: {
    duration?: number
    delay?: number
    easing?: Easing
    onUpdate: (t: number) => void
  }): Promise<void> {
    return new Promise((resolve) => active.push({ elapsed: -delay, duration, easing, onUpdate, resolve }))
  }
  return {
    tween,
    wait: (seconds: number) => tween({ duration: seconds, onUpdate: () => {} }),
    update(dt: number) {
      for (let i = active.length - 1; i >= 0; i--) {
        const tw = active[i]
        tw.elapsed += dt
        if (tw.elapsed < 0) continue
        const t = Math.min(tw.elapsed / tw.duration, 1)
        tw.onUpdate(tw.easing(t))
        if (t >= 1) {
          active.splice(i, 1)
          tw.resolve()
        }
      }
    },
    // On dispose: let anything awaiting a tween finish, so open() never hangs.
    flush() {
      active.splice(0).forEach((tw) => tw.resolve())
    },
  }
}

// ---------- Wrapping paper, drawn on a canvas ----------

function paperTexture(mood: BoxMood, c: BoxColors): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = c.wrap
  ctx.fillRect(0, 0, size, size)
  if (mood === "party") {
    // Polka dots, offset on alternate rows.
    ctx.fillStyle = c.accentSoft
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.beginPath()
        ctx.arc(col * 64 + (row % 2 ? 48 : 16), row * 64 + 32, 11, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else {
    // Diagonal stripes, as on the CSS gift reveal.
    ctx.strokeStyle = c.wrapShade
    ctx.lineWidth = 22
    for (let x = -size; x < size * 2; x += 64) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + size, size)
      ctx.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

// ---------- The box: walls hinged at the floor, a lid hinged at the back ----------

function createBox({ mood, colors }: { mood: BoxMood; colors: BoxColors }) {
  const w = 1.4
  const h = 1.2
  const d = 1.4
  const t = 0.04
  const map = paperTexture(mood, colors)
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.04 })
  const inner = new THREE.MeshStandardMaterial({ color: colors.wrapShade, roughness: 0.8 })
  // The lid's thin sides would squeeze the whole pattern; they are plain paper.
  const plain = new THREE.MeshStandardMaterial({ color: colors.wrap, roughness: 0.6, metalness: 0.04 })
  const ribbonMat = new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.32, metalness: 0.55 })
  const ribbon = mood === "gift"
  const group = new THREE.Group()

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), inner)
  bottom.receiveShadow = true
  group.add(bottom)

  // [hinge position, rotation about y, wall width]
  const defs: [THREE.Vector3, number, number][] = [
    [new THREE.Vector3(0, 0, d / 2), 0, w],
    [new THREE.Vector3(0, 0, -d / 2), Math.PI, w],
    [new THREE.Vector3(w / 2, 0, 0), Math.PI / 2, d],
    [new THREE.Vector3(-w / 2, 0, 0), -Math.PI / 2, d],
  ]
  const walls = defs.map(([pos, ry, width]) => {
    const hinge = new THREE.Group()
    hinge.position.copy(pos)
    // So rotation.x folds the wall outward in its own frame.
    hinge.rotation.order = "YXZ"
    hinge.rotation.y = ry
    // Outside face in wrapping paper, the rest plain.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, h, t), [inner, inner, inner, inner, mat, inner])
    wall.position.y = h / 2
    wall.castShadow = true
    hinge.add(wall)
    if (ribbon) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, t + 0.012), ribbonMat)
      band.position.y = h / 2
      hinge.add(band)
    }
    group.add(hinge)
    return hinge
  })

  const lidHinge = new THREE.Group()
  lidHinge.position.set(0, h, -d / 2)
  const lid = new THREE.Group()
  lid.position.z = d / 2
  const lidTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1), [plain, plain, mat, plain, plain, plain])
  lidTop.position.y = 0.05
  lidTop.castShadow = true
  lid.add(lidTop)
  if (ribbon) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, d + 0.12), ribbonMat)
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.2, 0.18), ribbonMat)
    a.position.y = b.position.y = 0.05
    lid.add(a, b)
  }
  lidHinge.add(lid)
  group.add(lidHinge)

  return { group, walls, lidHinge, lid, ribbonMat, h }
}

function makeBow(material: THREE.Material) {
  const bow = new THREE.Group()
  const loopGeo = new THREE.TorusGeometry(0.22, 0.06, 12, 32)
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(loopGeo, material)
    loop.scale.set(1, 0.6, 1)
    loop.position.set(0.2 * s, 0.12, 0)
    loop.rotation.set(0, s * 0.4, s * 0.5)
    loop.castShadow = true
    bow.add(loop)
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), material)
  knot.position.y = 0.1
  bow.add(knot)
  return bow
}

function makeBalloon(color: string) {
  const g = new THREE.Group()
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 24), mat)
  body.scale.set(1, 1.2, 1)
  body.castShadow = true
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 12), mat)
  knot.position.y = -0.4
  knot.rotation.x = Math.PI
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.4), new THREE.MeshBasicMaterial({ color: "#d8d2cc" }))
  string.position.y = -1.12
  g.add(body, knot, string)
  return g
}

// ---------- Particles: sparkles and confetti, instanced ----------

function createParticles({
  type,
  count,
  colors,
  gravity,
  drag,
}: {
  type: "sparkle" | "confetti"
  count: number
  colors: string[]
  gravity: number
  drag: number
}) {
  const geo = type === "sparkle" ? new THREE.OctahedronGeometry(0.035) : new THREE.PlaneGeometry(0.06, 0.11)
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    roughness: 0.5,
    metalness: type === "sparkle" ? 0.6 : 0.1,
    emissive: new THREE.Color(type === "sparkle" ? colors[0] : "#000000"),
    emissiveIntensity: type === "sparkle" ? 0.8 : 0,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.frustumCulled = false
  const color = new THREE.Color()
  const parts = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, color.set(colors[i % colors.length]))
    return {
      pos: new THREE.Vector3(0, -100, 0),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
      life: 0,
      phase: Math.random() * 10,
      alive: false,
    }
  })
  const dummy = new THREE.Object3D()

  function update(dt: number, time: number) {
    for (let i = 0; i < count; i++) {
      const p = parts[i]
      if (p.alive) {
        p.vel.y += gravity * dt
        p.vel.multiplyScalar(drag)
        p.pos.addScaledVector(p.vel, dt)
        p.life -= dt
        if (p.life <= 0 || p.pos.y < -1.2) p.alive = false
        p.rot.x += p.spin.x * dt
        p.rot.y += p.spin.y * dt
        p.rot.z += p.spin.z * dt
      }
      if (p.alive) dummy.position.copy(p.pos)
      else dummy.position.set(0, -100, 0)
      dummy.rotation.copy(p.rot)
      const s = p.alive ? Math.min(1, p.life) : 1
      dummy.scale.setScalar(type === "sparkle" ? s * (0.6 + 0.4 * Math.sin(time * 8 + p.phase)) : s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  function burst(origin: THREE.Vector3, { speed = 4, spread = 1, up = 1, n = count } = {}) {
    let fired = 0
    for (const p of parts) {
      if (fired >= n) break
      if (p.alive) continue
      p.pos.copy(origin)
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * spread
      p.vel.set(Math.cos(a) * r, up * (0.6 + Math.random() * 0.8), Math.sin(a) * r * 0.6).multiplyScalar(speed)
      p.life = 2.5 + Math.random() * 2
      p.alive = true
      fired++
    }
  }

  return { mesh, update, burst }
}

// ---------- The card: the recipient's name and the headline on paper ----------

async function loadFonts(card: CardText) {
  if (typeof document === "undefined" || !document.fonts) return
  const wanted = [
    `${card.displayWeight} 96px ${card.displayFont}`,
    `italic ${card.displayWeight} 64px ${card.displayFont}`,
    `400 40px ${card.bodyFont}`,
    `600 32px ${card.bodyFont}`,
  ]
  const timeout = new Promise((resolve) => setTimeout(resolve, 1500))
  await Promise.race([Promise.all(wanted.map((f) => document.fonts.load(f).catch(() => null))), timeout])
}

function cardTexture(card: CardText, c: BoxColors, maxAnisotropy: number): THREE.CanvasTexture {
  const W = 1024
  const H = Math.round((W * CARD_HEIGHT) / CARD_WIDTH)
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!

  ctx.fillStyle = c.paper
  ctx.fillRect(0, 0, W, H)
  const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W)
  vignette.addColorStop(0, "rgba(0,0,0,0)")
  vignette.addColorStop(1, "rgba(0,0,0,0.1)")
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = c.paperAccent
  ctx.globalAlpha = 0.75
  ctx.lineWidth = 6
  ctx.strokeRect(44, 44, W - 88, H - 88)
  ctx.lineWidth = 2
  ctx.strokeRect(64, 64, W - 128, H - 128)
  ctx.globalAlpha = 1

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const maxW = W - 220
  // Canvas letter spacing is newer than the rest; skip it where it is missing.
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  const canSpace = "letterSpacing" in spaced

  // Lay the words out first, then draw them centred on the card.
  type Block =
    | { kind: "text"; font: string; color: string; lineHeight: number; lines: string[]; spacing?: string }
    | { kind: "gap"; height: number }
    | { kind: "divider" }
  const text = (value: string, font: string, color: string, lineHeight: number, maxLines: number, spacing?: string): Block => {
    ctx.font = font
    if (canSpace) spaced.letterSpacing = spacing ?? "0px"
    const lines = value ? wrapLines(value, maxW, (str) => ctx.measureText(str).width, maxLines) : []
    return { kind: "text", font, color, lineHeight, lines, spacing }
  }
  const italic = card.script ? "" : "italic "
  const titleSize = card.script ? 176 : 150
  const headSize = card.script ? 112 : 96
  const blocks: Block[] = [
    text(card.eyebrow.toUpperCase(), `600 40px ${card.bodyFont}`, c.paperMuted, 60, 1, "10px"),
    { kind: "gap", height: 50 },
    text(card.title, `${card.displayWeight} ${titleSize}px ${card.displayFont}`, c.paperAccent, titleSize * 1.06, 2),
    { kind: "gap", height: 50 },
    { kind: "divider" },
    { kind: "gap", height: 70 },
    text(card.headline, `${italic}${card.displayWeight} ${headSize}px ${card.displayFont}`, c.paperInk, headSize * 1.12, 4),
    { kind: "gap", height: 60 },
    text(card.from, `${italic}400 56px ${card.bodyFont}`, c.paperMuted, 68, 2),
  ]
  const heightOf = (b: Block) => (b.kind === "text" ? b.lines.length * b.lineHeight : b.kind === "gap" ? b.height : 24)
  const total = blocks.reduce((sum, b) => sum + heightOf(b), 0)
  let y = Math.max(110, (H - total) / 2)
  for (const b of blocks) {
    if (b.kind === "text") {
      ctx.font = b.font
      ctx.fillStyle = b.color
      if (canSpace) spaced.letterSpacing = b.spacing ?? "0px"
      for (const line of b.lines) {
        ctx.fillText(line, W / 2, y + b.lineHeight / 2)
        y += b.lineHeight
      }
    } else if (b.kind === "gap") {
      y += b.height
    } else {
      const mid = y + 12
      ctx.strokeStyle = c.paperAccent
      ctx.fillStyle = c.paperAccent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(W / 2 - 180, mid)
      ctx.lineTo(W / 2 - 28, mid)
      ctx.moveTo(W / 2 + 28, mid)
      ctx.lineTo(W / 2 + 180, mid)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(W / 2, mid - 13)
      ctx.lineTo(W / 2 + 13, mid)
      ctx.lineTo(W / 2, mid + 13)
      ctx.lineTo(W / 2 - 13, mid)
      ctx.fill()
      y += 24
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = Math.min(8, maxAnisotropy)
  return tex
}

// ---------- The scene ----------

export async function createBoxScene(container: HTMLElement, opts: BoxSceneOptions): Promise<BoxScene> {
  const { mood, colors } = opts
  let disposed = false
  const intervals: ReturnType<typeof setInterval>[] = []
  const tweens = makeTweens()

  // Throws when WebGL is unavailable; the template then keeps its still drawing.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
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
  const lookAt = new THREE.Vector3(0, 0.2, 0)
  const base = new THREE.Vector3(0, 1.1, 7)
  camera.position.copy(base)
  camera.lookAt(lookAt)

  scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(colors.wrapShade), 1.8))
  const key = new THREE.DirectionalLight(0xffffff, 2.7)
  key.position.set(3, 6, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const rim = new THREE.PointLight(new THREE.Color(colors.accentSoft), 20, 20)
  rim.position.set(-4, 3, -3)
  scene.add(rim)

  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.ShadowMaterial({ opacity: 0.24 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -1
  floor.receiveShadow = true
  scene.add(floor)

  // ----- Box, card and effects -----
  const box = createBox({ mood, colors })
  const root = new THREE.Group()
  root.position.y = -0.98
  root.add(box.group)
  scene.add(root)

  // The card is drawn in the template's own faces, so wait for them briefly.
  await loadFonts(opts.card)
  const cardTex = cardTexture(opts.card, colors, renderer.capabilities.getMaxAnisotropy())
  const edge = new THREE.MeshStandardMaterial({ color: colors.paper, roughness: 0.9 })
  const face = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.85 })
  const card = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, 0.015), [edge, edge, edge, edge, face, edge])
  card.castShadow = true
  card.scale.setScalar(0.6)
  card.position.set(0, 0.62, 0)
  box.group.add(card)

  const bow = mood === "gift" ? makeBow(box.ribbonMat) : null
  if (bow) {
    bow.position.y = 0.14
    box.lid.add(bow)
  }

  const sparkleColors = [colors.accent, colors.accentSoft, colors.paper, "#fff4c2"]
  const confettiColors = [colors.accent, colors.accentSoft, colors.wrap, colors.paper, colors.paperAccent, "#f6c453"]
  const particles =
    mood === "gift"
      ? createParticles({ type: "sparkle", count: 260, colors: sparkleColors, gravity: -0.6, drag: 0.96 })
      : createParticles({ type: "confetti", count: 380, colors: confettiColors, gravity: -3, drag: 0.985 })
  scene.add(particles.mesh)

  const balloonTargets: [number, number, number][] = [
    [-2.4, 1.6, -1],
    [2.4, 1.9, -1.2],
    [-1.7, 2.5, -2],
    [1.8, 2.7, -2.2],
    [0, 3.1, -2.8],
  ]
  const balloonColors = [colors.accent, colors.accentSoft, colors.wrap, colors.paperAccent, "#f6c453"]
  const balloons =
    mood === "party"
      ? balloonTargets.map(([x, y, z], i) => {
          const b = makeBalloon(balloonColors[i % balloonColors.length])
          // Parked well below the view until the lid pops.
          b.position.set(x, -12, z)
          b.userData = { y, phase: i * 1.3, up: false }
          scene.add(b)
          return b
        })
      : []

  // ----- Idle: a slow sway, and for the party box a lid that can't keep still -----
  let idle = true
  let lidOpened = false
  let hover: { y: number } | null = null

  // ----- Sizing and pointer parallax -----
  const pointer = new THREE.Vector2()
  function resize() {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    base.z = cameraDistance(camera.aspect)
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

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
  renderer.setAnimationLoop((now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    time += dt
    tweens.update(dt)
    particles.update(dt, time)
    if (idle) {
      box.group.rotation.y = Math.sin(time * 0.7) * 0.15
      if (mood === "party" && !lidOpened) box.lidHinge.position.y = box.h + Math.max(0, Math.sin(time * 4)) * 0.04
    }
    for (const b of balloons) {
      if (!b.userData.up) continue
      b.position.y += (b.userData.y + Math.sin(time + b.userData.phase) * 0.12 - b.position.y) * 0.03
      b.rotation.z = Math.sin(time * 0.8 + b.userData.phase) * 0.1
    }
    if (hover) {
      card.position.y = hover.y + Math.sin(time * 1.2) * 0.03
    }
    camera.position.x += (base.x + pointer.x * 0.4 - camera.position.x) * 0.05
    camera.position.y += (base.y + pointer.y * 0.25 - camera.position.y) * 0.05
    camera.position.z += (base.z - camera.position.z) * 0.2
    camera.lookAt(lookAt)
    renderer.render(scene, camera)
  })

  container.appendChild(canvas)
  // Fade in over the still drawing once the first frames are up.
  requestAnimationFrame(() => requestAnimationFrame(() => (canvas.style.opacity = "1")))

  // ----- The reveal -----

  // Detach the card into world space and glide it to face the camera.
  async function presentCard(duration: number) {
    scene.attach(card)
    const p0 = card.position.clone()
    const q0 = card.quaternion.clone()
    const s0 = card.scale.x
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const p1 = new THREE.Vector3(base.x, base.y, base.z).addScaledVector(dir, presentDistance(camera.aspect))
    // Matrix4.lookAt(eye, target) turns +z towards the eye: the card's face.
    const eye = new THREE.Vector3(base.x, base.y, base.z)
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, p1, camera.up))
    await tweens.tween({
      duration,
      easing: ease.inOutCubic,
      onUpdate: (t) => {
        card.position.lerpVectors(p0, p1, t)
        card.quaternion.slerpQuaternions(q0, q1, t)
        card.scale.setScalar(lerp(s0, 1, t))
      },
    })
    hover = { y: card.position.y }
  }

  async function openGift() {
    const ry = box.group.rotation.y
    await tweens.tween({ duration: 0.4, onUpdate: (t) => (box.group.rotation.y = lerp(ry, 0, t)) })
    if (disposed) return
    // The bow unties: its loops stretch and vanish.
    if (bow) {
      await tweens.tween({
        duration: 0.45,
        onUpdate: (t) => {
          bow.scale.set(1 + t * 1.2, 1 - t, 1 - t * 0.5)
          bow.rotation.y = t * 1.5
        },
      })
      bow.visible = false
    }
    if (disposed) return
    // The lid lifts and floats away.
    const l0 = box.lidHinge.position.clone()
    void tweens.tween({
      duration: 1.3,
      onUpdate: (t) => {
        box.lidHinge.position.set(l0.x - t * 2.4, l0.y + Math.sin(t * Math.PI) * 0.8 - t * 1.1, l0.z - t * 0.5)
        box.lidHinge.rotation.set(0, t * 0.8, t * 0.5)
      },
    })
    await tweens.wait(0.35)
    if (disposed) return
    // The walls unfold like petals.
    particles.burst(new THREE.Vector3(0, -0.3, 0), { speed: 2.2, spread: 1, up: 1.3, n: 160 })
    await tweens.tween({
      duration: 0.9,
      easing: ease.outCubic,
      onUpdate: (t) => box.walls.forEach((w) => (w.rotation.x = lerp(0, Math.PI / 2 - 0.05, t))),
    })
    if (disposed) return
    // The card rises in a trail of sparkles.
    const trail = setInterval(
      () => particles.burst(card.getWorldPosition(new THREE.Vector3()), { speed: 1.2, spread: 1, up: 0.4, n: 12 }),
      90,
    )
    intervals.push(trail)
    await tweens.tween({ duration: 0.9, onUpdate: (t) => (card.position.y = lerp(0.62, 1.9, t)) })
    if (disposed) return
    await presentCard(1.1)
    clearInterval(trail)
    if (disposed) return
    particles.burst(card.position.clone().add(new THREE.Vector3(0, 0, -0.2)), { speed: 2.5, spread: 1.4, up: 0.8, n: 120 })
  }

  async function openParty() {
    lidOpened = true
    const ry = box.group.rotation.y
    // Squash.
    await tweens.tween({
      duration: 0.3,
      onUpdate: (t) => {
        box.group.scale.set(1 + t * 0.08, 1 - t * 0.12, 1 + t * 0.08)
        box.group.rotation.y = lerp(ry, 0, t)
      },
    })
    if (disposed) return
    // Pop: the lid flies off, the box springs back.
    const l0 = box.lidHinge.position.clone()
    void tweens.tween({
      duration: 1.2,
      easing: ease.outCubic,
      onUpdate: (t) => {
        box.lidHinge.position.set(l0.x + t * 1.8, l0.y + Math.sin(t * Math.PI) * 1.6 - t * 1.4, l0.z - t * 0.6)
        box.lidHinge.rotation.set(-t * 2.4, 0, -t * 3.2)
      },
    })
    void tweens.tween({
      duration: 0.45,
      easing: ease.outElastic,
      onUpdate: (t) => box.group.scale.set(1.08 - t * 0.08, 0.88 + t * 0.12, 1.08 - t * 0.08),
    })
    const top = new THREE.Vector3(0, 0.3, 0)
    particles.burst(top, { speed: 4.5, spread: 1, up: 1.4, n: 240 })
    void tweens.wait(0.6).then(() => !disposed && particles.burst(top, { speed: 3.5, spread: 1.4, up: 1.2, n: 140 }))
    // Narrow screens bring the balloons in from the sides so they stay in view.
    const spread = Math.min(1, Math.max(0.55, camera.aspect * 1.2))
    balloons.forEach((b, i) => {
      b.position.x = balloonTargets[i][0] * spread
      b.position.y = -6
      void tweens.wait(0.2 + i * 0.15).then(() => (b.userData.up = true))
    })
    // The card springs up.
    await tweens.tween({ duration: 0.9, easing: ease.outBack, onUpdate: (t) => (card.position.y = lerp(0.62, 2.0, t)) })
    if (disposed) return
    await presentCard(1.0)
  }

  let opening: Promise<void> | null = null

  return {
    open() {
      if (!opening) {
        idle = false
        opening = mood === "gift" ? openGift() : openParty()
      }
      return opening
    },
    dispose() {
      if (disposed) return
      disposed = true
      tweens.flush()
      intervals.forEach(clearInterval)
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

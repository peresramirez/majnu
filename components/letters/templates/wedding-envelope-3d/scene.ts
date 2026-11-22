// The three.js scene of the 3D wedding envelope, ported from the prototype
// archived in docs/templates/src (templates/wedding.js with core/particles.js,
// core/reveal.js, core/cardTexture.js and core/scene.js). Every shape is built
// in code and every texture is drawn on a canvas: no model files, no images,
// no fonts from other sites.
//
// Only wedding-envelope-3d/view.tsx imports this module, and only with
// import(), so three.js is a separate chunk that loads when the envelope is on
// screen and motion is allowed. No other gift page downloads it.
//
// The reveal: the wax seal cracks in two and falls away, the flap swings open,
// the card slides up out of the pocket and glides to face the camera while the
// envelope sinks back, and rose petals fall. The card shows the couple's
// names, the headline, the date and the place; never a gift code.
import * as THREE from "three"
import {
  CARD_HEIGHT,
  CARD_TUCKED_SCALE,
  CARD_WIDTH,
  ENVELOPE_HEIGHT as EH,
  ENVELOPE_WIDTH as EW,
  envelopeCameraDistance,
  FOV,
  presentDistance,
  sealHalves,
  viewHalfSize,
  wrapLines,
  type EnvelopeCardWords,
  type Point,
} from "./layout"
import { ease, lerp, makeTweens } from "./tweens"

// Palette colours as hex strings, read from the template's CSS variables.
export type EnvelopeColors = {
  paper: string
  paperInk: string
  paperMuted: string
  paperAccent: string
  wrap: string
  wrapShade: string
  accent: string
  accentSoft: string
}

// The faces the card is drawn in (CSS font lists, with next/font's real names).
export type EnvelopeFonts = {
  formal: string
  display: string
  displayWeight: string
  body: string
  // Script faces have no italic.
  script: boolean
}

export type EnvelopeSceneOptions = {
  colors: EnvelopeColors
  fonts: EnvelopeFonts
  words: EnvelopeCardWords
  // The initials pressed into the wax, e.g. "L & O".
  monogram: string
  // The visitor tapped the envelope.
  onTap: () => void
  // The GPU took the context away (a phone under memory pressure).
  onLost: () => void
}

export type EnvelopeScene = {
  // Plays the reveal; resolves when the card faces the camera.
  open: () => Promise<void>
  dispose: () => void
}

// Where the envelope floats, and where the camera looks: a little above it, so
// the envelope sits just under the middle of the screen.
const ENV_Y = 0.25
const LOOK_Y = ENV_Y + 0.12
const SEAL_RADIUS = 0.17
const SEAL_DEPTH = 0.045

// ---------- Canvas textures ----------

function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext("2d")! }
}

function toTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

// Deterministic noise, so the paper looks the same on every visit.
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

// Paper with a faint grain.
function paperTexture(color: string): THREE.CanvasTexture {
  const size = 256
  const { canvas, ctx } = canvas2d(size, size)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(7)
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)"
    ctx.fillRect(rand() * size, rand() * size, 1 + rand(), 1 + rand())
  }
  return toTexture(canvas, true)
}

// The envelope's lining: the wrap colour with a fine lattice in the accent.
function linerTexture(c: EnvelopeColors): THREE.CanvasTexture {
  const size = 256
  const { canvas, ctx } = canvas2d(size, size)
  ctx.fillStyle = c.wrap
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = c.accent
  ctx.globalAlpha = 0.28
  ctx.lineWidth = 2
  for (let x = -size; x < size * 2; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + size, size)
    ctx.moveTo(x + size, 0)
    ctx.lineTo(x, size)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const tex = toTexture(canvas, true)
  tex.repeat.set(3, 3)
  return tex
}

// The seal's face: poured wax, a pressed ring and the initials. The halves'
// caps carry seal-local UVs from -1 to 1, which repeat and offset map onto it.
function sealTexture(c: EnvelopeColors, monogram: string, fonts: EnvelopeFonts): THREE.CanvasTexture {
  const size = 256
  const { canvas, ctx } = canvas2d(size, size)
  const mid = size / 2
  const wax = new THREE.Color(c.paperAccent)
  const light = wax.clone().lerp(new THREE.Color("#ffffff"), 0.38).getStyle()
  const dark = wax.clone().lerp(new THREE.Color("#000000"), 0.42).getStyle()
  const g = ctx.createRadialGradient(size * 0.36, size * 0.3, size * 0.02, mid, mid, size * 0.72)
  g.addColorStop(0, light)
  g.addColorStop(0.48, c.paperAccent)
  g.addColorStop(1, dark)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.lineWidth = 5
  ctx.strokeStyle = dark
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.arc(mid, mid, size * 0.35, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  const px = monogram.length > 1 ? 50 : 86
  ctx.font = `${px}px ${fonts.formal}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = light
  ctx.globalAlpha = 0.85
  ctx.fillText(monogram, mid - 3, mid - 3)
  ctx.globalAlpha = 1
  ctx.fillStyle = dark
  ctx.fillText(monogram, mid, mid)
  const tex = toTexture(canvas)
  tex.repeat.set(0.5, 0.5)
  tex.offset.set(0.5, 0.5)
  return tex
}

// A soft round shadow for under the floating envelope.
function blobTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(256, 256)
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, "rgba(0,0,0,0.42)")
  g.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return toTexture(canvas)
}

// ---------- The card: names, headline, date and place ----------

async function loadFonts(f: EnvelopeFonts) {
  if (typeof document === "undefined" || !document.fonts) return
  const wanted = [`400 140px ${f.formal}`, `500 140px ${f.formal}`, `italic ${f.displayWeight} 60px ${f.display}`, `${f.displayWeight} 70px ${f.display}`, `400 40px ${f.body}`, `600 32px ${f.body}`]
  const timeout = new Promise((resolve) => setTimeout(resolve, 1500))
  await Promise.race([Promise.all(wanted.map((font) => document.fonts.load(font).catch(() => null))), timeout])
}

function cardTexture(words: EnvelopeCardWords, c: EnvelopeColors, f: EnvelopeFonts, maxAnisotropy: number): THREE.CanvasTexture {
  const W = 1024
  const H = Math.round((W * CARD_HEIGHT) / CARD_WIDTH)
  const { canvas, ctx } = canvas2d(W, H)

  ctx.fillStyle = c.paper
  ctx.fillRect(0, 0, W, H)
  const rand = seeded(11)
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.05)"
    ctx.fillRect(rand() * W, rand() * H, 1.5, 1.5)
  }
  const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W)
  vignette.addColorStop(0, "rgba(0,0,0,0)")
  vignette.addColorStop(1, "rgba(0,0,0,0.1)")
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  // A double rule, with a small diamond in each inner corner.
  ctx.strokeStyle = c.paperAccent
  ctx.fillStyle = c.paperAccent
  ctx.globalAlpha = 0.8
  ctx.lineWidth = 5
  ctx.strokeRect(44, 44, W - 88, H - 88)
  ctx.lineWidth = 1.6
  ctx.strokeRect(64, 64, W - 128, H - 128)
  for (const [x, y] of [
    [64, 64],
    [W - 64, 64],
    [64, H - 64],
    [W - 64, H - 64],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x, y - 12)
    ctx.lineTo(x + 12, y)
    ctx.lineTo(x, y + 12)
    ctx.lineTo(x - 12, y)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const maxW = W - 230
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  const canSpace = "letterSpacing" in spaced

  type Block =
    | { kind: "text"; font: string; color: string; lineHeight: number; lines: string[]; spacing?: string }
    | { kind: "gap"; height: number }
    | { kind: "divider" }
  const text = (value: string, font: string, color: string, lineHeight: number, maxLines: number, spacing?: string): Block => {
    ctx.font = font
    if (canSpace) spaced.letterSpacing = spacing ?? "0px"
    const lines = value ? wrapLines(value, maxW, (s) => ctx.measureText(s).width, maxLines) : []
    return { kind: "text", font, color, lineHeight, lines, spacing }
  }
  const italic = f.script ? "" : "italic "
  const namesSize = f.script ? 150 : 124
  const headSize = f.script ? 74 : 60
  const blocks: Block[] = [
    text(words.eyebrow.toUpperCase(), `600 34px ${f.body}`, c.paperMuted, 52, 1, "10px"),
    { kind: "gap", height: 50 },
    text(words.names, `500 ${namesSize}px ${f.formal}`, c.paperAccent, namesSize * 1.08, 2),
    { kind: "gap", height: 34 },
    text(words.headline, `${italic}${f.displayWeight} ${headSize}px ${f.display}`, c.paperInk, headSize * 1.2, 3),
    { kind: "gap", height: 54 },
    { kind: "divider" },
  ]
  if (words.date) {
    blocks.push(
      { kind: "gap", height: 56 },
      text(words.weekday.toUpperCase(), `600 32px ${f.body}`, c.paperMuted, 46, 1, "8px"),
      { kind: "gap", height: 8 },
      text(words.date, `${f.displayWeight} ${f.script ? 84 : 74}px ${f.display}`, c.paperInk, 88, 1),
      text(words.time ? `at ${words.time}` : "", `400 42px ${f.body}`, c.paperMuted, 58, 1),
      { kind: "gap", height: 40 },
      text(words.place, `${f.displayWeight} ${f.script ? 70 : 58}px ${f.display}`, c.paperInk, 70, 2),
    )
  }
  const heightOf = (b: Block) => (b.kind === "text" ? b.lines.length * b.lineHeight : b.kind === "gap" ? b.height : 26)
  const total = blocks.reduce((sum, b) => sum + heightOf(b), 0)
  let y = Math.max(120, (H - total) / 2)
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
      const mid = y + 13
      ctx.strokeStyle = c.paperAccent
      ctx.fillStyle = c.paperAccent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(W / 2 - 170, mid)
      ctx.lineTo(W / 2 - 28, mid)
      ctx.moveTo(W / 2 + 28, mid)
      ctx.lineTo(W / 2 + 170, mid)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(W / 2, mid - 12)
      ctx.lineTo(W / 2 + 12, mid)
      ctx.lineTo(W / 2, mid + 12)
      ctx.lineTo(W / 2 - 12, mid)
      ctx.fill()
      y += 26
    }
  }

  const tex = toTexture(canvas)
  tex.anisotropy = Math.min(8, maxAnisotropy)
  return tex
}

// ---------- Shapes ----------

// The pocket: the whole face, with the V where the side flaps meet cut from
// its top edge (the prototype's envelopeFrontShape).
function pocketShape() {
  const s = new THREE.Shape()
  s.moveTo(-EW / 2, -EH / 2)
  s.lineTo(EW / 2, -EH / 2)
  s.lineTo(EW / 2, EH / 2)
  s.lineTo(0, 0)
  s.lineTo(-EW / 2, EH / 2)
  s.closePath()
  return s
}

// The flap, hanging from the top edge to a soft point (the prototype's flapShape).
function flapShape() {
  const s = new THREE.Shape()
  s.moveTo(-EW / 2, 0)
  s.lineTo(EW / 2, 0)
  s.quadraticCurveTo(0.15, -0.7, 0, -0.78)
  s.quadraticCurveTo(-0.15, -0.7, -EW / 2, 0)
  return s
}

function polygonShape(points: Point[]) {
  const s = new THREE.Shape()
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  s.closePath()
  return s
}

// A rose petal, a little cupped so it catches the light as it turns.
function petalGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0, -0.07)
  s.bezierCurveTo(0.075, -0.035, 0.08, 0.06, 0, 0.085)
  s.bezierCurveTo(-0.08, 0.06, -0.075, -0.035, 0, -0.07)
  const geo = new THREE.ShapeGeometry(s, 6)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    pos.setZ(i, 2.2 * x * x + 0.6 * (y + 0.07) * (y + 0.07))
  }
  geo.computeVertexNormals()
  return geo
}

// ---------- Falling petals, instanced ----------

function createPetals(count: number, colors: string[], glow: string) {
  // A faint glow in the palette keeps petals turned away from the light from
  // going black.
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, emissive: new THREE.Color(glow), emissiveIntensity: 0.22 })
  const mesh = new THREE.InstancedMesh(petalGeometry(), material, count)
  mesh.frustumCulled = false
  const color = new THREE.Color()
  const parts = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, color.set(colors[i % colors.length]))
    return {
      pos: new THREE.Vector3(0, -100, 0),
      fall: 0,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
      phase: Math.random() * 10,
      scale: 0.9 + Math.random() * 0.6,
      alive: false,
    }
  })
  const dummy = new THREE.Object3D()
  // The region petals fall through, and where the presented card stands: set
  // from the camera on every resize.
  const bounds = { halfWidth: 3, top: 3, bottom: -3, cardZ: 2 }

  // Most petals fall behind the presented card; about one in ten falls just
  // in front of it, smaller, for depth without hiding the words for long.
  function spawn(p: (typeof parts)[number], stagger: number) {
    const front = Math.random() < 0.1
    const z = front ? bounds.cardZ + 0.15 + Math.random() * 0.35 : -2.2 + Math.random() * Math.min(4.2, bounds.cardZ + 1.9)
    p.pos.set((Math.random() * 2 - 1) * bounds.halfWidth * 1.15, bounds.top + 0.15 + stagger, z)
    p.fall = 0.8 + Math.random() * 0.55
    p.scale = (front ? 0.6 : 0.9) + Math.random() * 0.5
    p.alive = true
  }

  return {
    mesh,
    bounds,
    start() {
      parts.forEach((p, i) => spawn(p, (i / count) * 3))
    },
    update(dt: number, time: number) {
      for (let i = 0; i < count; i++) {
        const p = parts[i]
        if (p.alive) {
          p.pos.y -= p.fall * dt
          p.pos.x += Math.sin(time * 1.3 + p.phase) * 0.35 * dt
          p.pos.z += Math.cos(time * 0.9 + p.phase) * 0.12 * dt
          p.rot.x += p.spin.x * dt
          p.rot.y += p.spin.y * dt
          p.rot.z += p.spin.z * dt
          if (p.pos.y < bounds.bottom - 0.4) spawn(p, 0)
          dummy.position.copy(p.pos)
        } else {
          dummy.position.set(0, -100, 0)
        }
        dummy.rotation.copy(p.rot)
        dummy.scale.setScalar(p.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}

// ---------- The scene ----------

export async function createEnvelopeScene(container: HTMLElement, opts: EnvelopeSceneOptions): Promise<EnvelopeScene> {
  const c = opts.colors
  let disposed = false
  const tweens = makeTweens()
  const textures: THREE.Texture[] = []
  const keep = <T extends THREE.Texture>(t: T) => (textures.push(t), t)

  // Throws when WebGL is unavailable; the template then keeps its still drawing.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
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
  const lookAt = new THREE.Vector3(0, LOOK_Y, 0)
  const base = new THREE.Vector3(0, LOOK_Y + 0.35, 7)
  camera.position.copy(base)
  camera.lookAt(lookAt)

  scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(c.wrapShade), 1.6))
  const key = new THREE.DirectionalLight(0xffffff, 2.3)
  key.position.set(2.5, 4, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(new THREE.Color(c.accentSoft), 0.5)
  fill.position.set(-4, 1, 3)
  scene.add(fill)
  const rim = new THREE.PointLight(new THREE.Color(c.accent), 10, 20)
  rim.position.set(-3, 3, -3)
  scene.add(rim)

  // ----- The envelope -----
  const paperMap = keep(paperTexture(c.paper))
  const paper = new THREE.MeshStandardMaterial({ map: paperMap, roughness: 0.88 })
  const liner = new THREE.MeshStandardMaterial({ map: keep(linerTexture(c)), roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide })
  const linerBack = new THREE.MeshStandardMaterial({ map: liner.map, roughness: 0.7, metalness: 0.15, side: THREE.BackSide })
  const gold = new THREE.LineBasicMaterial({ color: c.paperAccent, transparent: true, opacity: 0.75 })
  const fold = new THREE.LineBasicMaterial({ color: c.paperAccent, transparent: true, opacity: 0.4 })

  const env = new THREE.Group()
  env.position.set(0, ENV_Y, 0)
  env.rotation.x = -0.1
  scene.add(env)

  const back = new THREE.Mesh(new THREE.PlaneGeometry(EW, EH), liner)
  back.position.z = -0.03
  env.add(back)

  const pocketGeo = new THREE.ShapeGeometry(pocketShape())
  const pocket = new THREE.Mesh(pocketGeo, paper)
  pocket.position.z = 0.03
  env.add(pocket)
  const pocketEdge = new THREE.LineSegments(new THREE.EdgesGeometry(pocketGeo), gold)
  pocketEdge.position.z = 0.032
  env.add(pocketEdge)
  const folds = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-EW / 2, -EH / 2, 0),
      new THREE.Vector3(0, -0.06, 0),
      new THREE.Vector3(EW / 2, -EH / 2, 0),
      new THREE.Vector3(0, -0.06, 0),
    ]),
    fold,
  )
  folds.position.z = 0.032
  env.add(folds)

  // The card waits inside, between the back and the pocket.
  await loadFonts(opts.fonts)
  const cardTex = keep(cardTexture(opts.words, c, opts.fonts, renderer.capabilities.getMaxAnisotropy()))
  const edge = new THREE.MeshStandardMaterial({ color: c.paper, roughness: 0.9 })
  const face = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.85 })
  const card = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, 0.015), [edge, edge, edge, edge, face, edge])
  card.scale.setScalar(CARD_TUCKED_SCALE)
  const CARD_IN_Y = -0.04
  card.position.set(0, CARD_IN_Y, 0)
  env.add(card)

  // The flap, hinged on the top edge: paper outside, lining inside.
  // It rests lifted a little off the pocket, so the light tells them apart.
  const FLAP_REST = -0.07
  const flapPivot = new THREE.Group()
  flapPivot.position.set(0, EH / 2, 0.04)
  flapPivot.rotation.x = FLAP_REST
  env.add(flapPivot)
  const flapGeo = new THREE.ShapeGeometry(flapShape(), 16)
  flapPivot.add(new THREE.Mesh(flapGeo, paper), new THREE.Mesh(flapGeo, linerBack))
  const flapEdge = new THREE.LineSegments(new THREE.EdgesGeometry(flapGeo), gold)
  flapEdge.position.z = 0.002
  flapPivot.add(flapEdge)

  // The wax seal on the flap's tip, in two halves that meet along the crack.
  const sealMap = keep(sealTexture(c, opts.monogram, opts.fonts))
  const waxFace = new THREE.MeshStandardMaterial({ map: sealMap, roughness: 0.38, metalness: 0.15, transparent: true })
  const waxSide = new THREE.MeshStandardMaterial({
    color: new THREE.Color(c.paperAccent).lerp(new THREE.Color("#000000"), 0.3),
    roughness: 0.45,
    transparent: true,
  })
  const seal = new THREE.Group()
  seal.position.set(0, -0.72, 0.004)
  const { left, right } = sealHalves()
  const halves = [left, right].map((points) => {
    const geo = new THREE.ExtrudeGeometry(polygonShape(points), { depth: SEAL_DEPTH / SEAL_RADIUS, bevelEnabled: false })
    const mesh = new THREE.Mesh(geo, [waxFace, waxSide])
    mesh.scale.setScalar(SEAL_RADIUS)
    seal.add(mesh)
    return mesh
  })
  flapPivot.add(seal)

  // A soft shadow below.
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ map: keep(blobTexture()), transparent: true, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.scale.set(1, 0.32, 1)
  blob.position.set(0, ENV_Y - 1.15, 0)
  scene.add(blob)
  const blobMat = blob.material as THREE.MeshBasicMaterial

  // ----- Petals in the palette -----
  const accentSoft = new THREE.Color(c.accentSoft)
  const petalColors = [
    c.accentSoft,
    accentSoft.clone().lerp(new THREE.Color(c.paper), 0.45).getStyle(),
    c.accent,
    accentSoft.clone().lerp(new THREE.Color(c.paper), 0.75).getStyle(),
    c.accentSoft,
  ]
  const petals = createPetals(150, petalColors, c.accentSoft)
  scene.add(petals.mesh)

  // ----- Sizing and pointer parallax -----
  const pointer = new THREE.Vector2()
  function resize() {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    base.z = envelopeCameraDistance(camera.aspect)
    camera.updateProjectionMatrix()
    const view = viewHalfSize(base.z, camera.aspect)
    petals.bounds.halfWidth = view.halfWidth
    petals.bounds.top = LOOK_Y + view.halfHeight
    petals.bounds.bottom = LOOK_Y - view.halfHeight
    petals.bounds.cardZ = base.z - presentDistance(camera.aspect)
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
  let idle = true
  let hover: { y: number } | null = null
  let last = performance.now()
  let time = 0
  renderer.setAnimationLoop((now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    time += dt
    tweens.update(dt)
    petals.update(dt, time)
    if (idle) {
      env.position.y = ENV_Y + Math.sin(time * 1.4) * 0.05
      env.rotation.y = Math.sin(time * 0.6) * 0.18
      env.rotation.z = Math.sin(time * 0.8) * 0.02
    }
    if (hover) {
      card.position.y = hover.y + Math.sin(time * 1.2) * 0.025
      card.rotation.y = Math.sin(time * 0.6) * 0.04
    }
    camera.position.x += (base.x + pointer.x * 0.35 - camera.position.x) * 0.05
    camera.position.y += (base.y + pointer.y * 0.2 - camera.position.y) * 0.05
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
    const eye = new THREE.Vector3(base.x, base.y, base.z)
    const p1 = eye.clone().addScaledVector(dir, presentDistance(camera.aspect))
    // Matrix4.lookAt(eye, target) turns +z towards the eye: the card's face.
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

  async function reveal() {
    // Settle to face the visitor.
    const ry = env.rotation.y
    const rz = env.rotation.z
    const y0 = env.position.y
    await tweens.tween({
      duration: 0.4,
      onUpdate: (t) => {
        env.rotation.y = lerp(ry, 0, t)
        env.rotation.z = lerp(rz, 0, t)
        env.position.y = lerp(y0, ENV_Y, t)
      },
    })
    if (disposed) return
    // The seal is pressed, then cracks: its halves fall apart and fade.
    await tweens.tween({ duration: 0.16, easing: ease.outCubic, onUpdate: (t) => seal.scale.setScalar(1 + t * 0.08) })
    if (disposed) return
    halves.forEach((h) => env.attach(h))
    petals.start()
    const starts = halves.map((h) => ({ p: h.position.clone(), rz: h.rotation.z }))
    void tweens.tween({
      duration: 0.95,
      easing: ease.linear,
      onUpdate: (t) => {
        halves.forEach((h, i) => {
          const side = i === 0 ? -1 : 1
          h.position.set(starts[i].p.x + side * 0.28 * t, starts[i].p.y - 1.4 * t * t + 0.1 * t, starts[i].p.z + 0.25 * t)
          h.rotation.z = starts[i].rz + side * -1.1 * t
          h.rotation.x = 0.9 * t
        })
        const fade = Math.max(0, (t - 0.4) / 0.6)
        waxFace.opacity = waxSide.opacity = 1 - fade
      },
    })
    await tweens.wait(0.2)
    if (disposed) return
    // The flap swings up and over, and tucks behind the card's path.
    await tweens.tween({
      duration: 0.95,
      easing: ease.inOutCubic,
      onUpdate: (t) => {
        flapPivot.rotation.x = lerp(FLAP_REST, -Math.PI * 1.03, t)
        flapPivot.position.z = t < 0.55 ? 0.04 : lerp(0.04, -0.05, (t - 0.55) / 0.45)
      },
    })
    halves.forEach((h) => (h.visible = false))
    if (disposed) return
    // The card slides up out of the pocket.
    await tweens.tween({ duration: 1.0, easing: ease.inOutCubic, onUpdate: (t) => (card.position.y = lerp(CARD_IN_Y, 1.32, t)) })
    if (disposed) return
    // The envelope sinks back as the card comes forward.
    const ey = env.position.y
    void tweens.tween({
      duration: 1.4,
      delay: 0.15,
      onUpdate: (t) => {
        env.position.y = lerp(ey, ENV_Y - 0.55, t)
        env.position.z = lerp(0, -1.6, t)
        blobMat.opacity = 1 - t
      },
    })
    await presentCard(1.2)
  }

  let opening: Promise<void> | null = null

  return {
    open() {
      if (!opening) {
        idle = false
        opening = reveal()
      }
      return opening
    },
    dispose() {
      if (disposed) return
      disposed = true
      tweens.flush()
      renderer.setAnimationLoop(null)
      observer.disconnect()
      container.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("click", onClick)
      canvas.removeEventListener("webglcontextlost", onLost)
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose()
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        for (const m of mats) m.dispose()
      })
      textures.forEach((t) => t.dispose())
      renderer.dispose()
      // Give the context back now: phones allow only a few.
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}

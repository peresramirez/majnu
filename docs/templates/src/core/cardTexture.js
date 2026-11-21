import * as THREE from 'three';

const STYLES = {
  wedding: { script: 'Great Vibes', body: 'Cormorant Garamond', ink: '#4a3428' },
  party: { script: 'Fredoka', body: 'Fredoka', ink: '#2a1858' },
  gift: { script: 'Great Vibes', body: 'Cormorant Garamond', ink: '#1f3a36' },
};

function wrap(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the invitation text onto a canvas and returns a texture (W:H = 0.7). */
export async function makeCardTexture(cfg, kind) {
  const s = STYLES[kind];
  await Promise.all([
    document.fonts.load(`64px "${s.script}"`),
    document.fonts.load(`32px "${s.body}"`),
    document.fonts.load(`600 32px "${s.body}"`),
  ]).catch(() => {});

  const W = 1024, H = Math.round(W / 0.7);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const { primary, accent } = cfg.colors;

  // Paper + subtle vignette
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Double border
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 60, W - 120, H - 120);

  if (kind === 'party') {
    // Confetti dots decoration
    const palette = [accent, '#ffc93c', '#3ce0ff', '#7b3cff', '#3cff9e'];
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = palette[i % palette.length];
      const x = 80 + Math.random() * (W - 160), y = 80 + Math.random() * (H - 160);
      if (x > 140 && x < W - 140 && y > 160 && y < H - 160) continue;
      ctx.beginPath();
      ctx.arc(x, y, 6 + Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxW = W - 220;
  let y = 250;

  const text = (str, font, color, lh) => {
    if (!str) return;
    ctx.font = font;
    ctx.fillStyle = color;
    for (const line of wrap(ctx, str, maxW)) {
      ctx.fillText(line, W / 2, y);
      y += lh;
    }
  };
  const divider = () => {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 160, y); ctx.lineTo(W / 2 - 20, y);
    ctx.moveTo(W / 2 + 20, y); ctx.lineTo(W / 2 + 160, y);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(W / 2, y - 10); ctx.lineTo(W / 2 + 10, y); ctx.lineTo(W / 2, y + 10); ctx.lineTo(W / 2 - 10, y);
    ctx.fill();
    y += 70;
  };

  const isScript = s.script !== s.body;
  text(cfg.heading?.toUpperCase(), `400 38px "${s.body}"`, s.ink, 56);
  y += 50;
  text(cfg.names, `${isScript ? 400 : 600} ${isScript ? 128 : 92}px "${s.script}"`, accent, isScript ? 140 : 104);
  y += 20;
  text(cfg.subheading, `italic 400 40px "${s.body}"`, s.ink, 56);
  y += 40;
  divider();
  text(cfg.date, `600 46px "${s.body}"`, s.ink, 64);
  text(cfg.time, `400 40px "${s.body}"`, s.ink, 60);
  y += 10;
  text(cfg.venue, `400 38px "${s.body}"`, s.ink, 54);
  if (cfg.message) {
    y += 30;
    divider();
    text(cfg.message, `italic 400 40px "${s.body}"`, s.ink, 56);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A thin card mesh (front face textured) sized 1.4 x 2.0. */
export function makeCardMesh(texture, paperColor) {
  const geo = new THREE.BoxGeometry(1.4, 2.0, 0.015);
  const side = new THREE.MeshStandardMaterial({ color: paperColor, roughness: 0.9 });
  const front = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 });
  const mesh = new THREE.Mesh(geo, [side, side, side, side, front, side]);
  mesh.castShadow = true;
  return mesh;
}

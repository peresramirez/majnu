// Builds Majnu's brand assets: outlined wordmark SVGs, mark SVGs, app icon,
// favicons and the link-preview image. See docs/brand.md.
//
// Not part of the app build. To regenerate after changing a colour:
//   1. Put these TrueType files (from Google Fonts, SIL Open Font License) in one folder:
//      cormorant-500.ttf (Cormorant Garamond Medium), gilda-400.ttf (Gilda Display),
//      hanken-400.ttf and hanken-600.ttf (Hanken Grotesk Regular and SemiBold).
//   2. In a scratch folder: npm i opentype.js@2.0.0 sharp@0.35.5 png-to-ico@3.0.2
//   3. node scripts/brand/build-brand.mjs <fontsDir> public/brand
//      (run with NODE_PATH pointing at the scratch folder's node_modules, or copy
//      this file into it).
import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const [fontsDir, outDir] = process.argv.slice(2);
if (!fontsDir || !outDir) throw new Error("usage: node build-brand.mjs <fontsDir> <outDir>");
fs.mkdirSync(outDir, { recursive: true });

const load = (f) => opentype.parse(fs.readFileSync(path.join(fontsDir, f)).buffer);
const cormorant = load("cormorant-500.ttf");
const gilda = load("gilda-400.ttf");
const hanken400 = load("hanken-400.ttf");
const hanken600 = load("hanken-600.ttf");

const C = {
  plum: "#1B1226", velvet: "#2A1C3A", petal: "#F5EAF1", lilac: "#BCA8C4",
  roseGold: "#EAB394", orchid: "#CD8DBD",
  // light-ground counterparts
  petalGround: "#F8F1F5", ink: "#1B1226", inkMuted: "#6B5876", roseGoldDeep: "#B9775A", orchidDeep: "#8E4C80",
};

const CRESCENT = "M27.84 10.4A22 22 0 1 0 52.86 38.98A19 19 0 1 1 27.84 10.4Z";
const r = (n) => Math.round(n * 100) / 100;

// Serialise opentype path commands ourselves; the library's printer can emit NaN.
const n2 = (v) => { if (!Number.isFinite(v)) throw new Error("non-finite coordinate"); return (Math.round(v * 100) / 100).toString(); };
function pathData(p) {
  return p.commands.map((c) => {
    switch (c.type) {
      case "M": case "L": return `${c.type}${n2(c.x)} ${n2(c.y)}`;
      case "Q": return `Q${n2(c.x1)} ${n2(c.y1)} ${n2(c.x)} ${n2(c.y)}`;
      case "C": return `C${n2(c.x1)} ${n2(c.y1)} ${n2(c.x2)} ${n2(c.y2)} ${n2(c.x)} ${n2(c.y)}`;
      case "Z": return "Z";
      default: throw new Error(`unknown path command ${c.type}`);
    }
  }).join("");
}

// Lay out text with kerning and tracking; returns path data and ink bounds.
function setText(font, text, size, { tracking = 0, x = 0, y = 0 } = {}) {
  // Plain Latin text: map characters straight to glyphs (no OpenType shaping needed).
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const parts = [], placed = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  glyphs.forEach((g, i) => {
    const p = g.getPath(cursor, y, size);
    const d = pathData(p);
    if (d) parts.push(d);
    const bb = p.getBoundingBox();
    if (Number.isFinite(bb.x1) && !(bb.x1 === 0 && bb.x2 === 0 && bb.y1 === 0 && bb.y2 === 0)) {
      minX = Math.min(minX, bb.x1); minY = Math.min(minY, bb.y1); maxX = Math.max(maxX, bb.x2); maxY = Math.max(maxY, bb.y2);
    }
    placed.push({ glyph: g, x: cursor, advance: g.advanceWidth * scale, bbox: bb });
    let step = g.advanceWidth * scale;
    if (i < glyphs.length - 1) step += (font.getKerningValue(g, glyphs[i + 1]) || 0) * scale + tracking * size;
    cursor += step;
  });
  return { d: parts.join(""), minX, minY, maxX, maxY, placed, width: cursor - x };
}

// ---------------------------------------------------------------- wordmark
const S = 100; // font size in SVG units
const wm = setText(cormorant, "MAJNU", S, { tracking: 0.3 });
const J = wm.placed[2];
const capTop = J.bbox.y1; // top of the J (negative: above baseline)
const crescentBox = 0.3 * S;
const cScale = crescentBox / 64;
const cx = J.x + J.advance / 2 - 0.02 * S;
const cy = capTop - 0.16 * S;
const crescentTransform = `translate(${r(cx)} ${r(cy)}) rotate(-18) scale(${r(cScale * 1000) / 1000}) translate(-32 -32)`;
// Visible crescent extent (outer circle 10..54 in the 64 grid), rotated, approximated generously.
const crescentTop = cy - 24 * cScale;
const pad = 2;
const vbX = Math.floor(wm.minX - pad), vbY = Math.floor(Math.min(wm.minY, crescentTop) - pad);
const vbW = Math.ceil(wm.maxX - vbX + pad), vbH = Math.ceil(wm.maxY - vbY + pad);

function wordmarkSVG({ letters, crescent, title = "Majnu" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" role="img" aria-label="${title}">
  <title>${title}</title>
  <path fill="${letters}" d="${wm.d}"/>
  <path fill="${crescent}" transform="${crescentTransform}" d="${CRESCENT}"/>
</svg>
`;
}
const write = (name, content) => fs.writeFileSync(path.join(outDir, name), content);
write("majnu-wordmark-on-dark.svg", wordmarkSVG({ letters: C.petal, crescent: C.roseGold }));
write("majnu-wordmark-on-light.svg", wordmarkSVG({ letters: C.ink, crescent: C.roseGoldDeep }));
write("majnu-wordmark-mono.svg", wordmarkSVG({ letters: "currentColor", crescent: "currentColor" }));

// ---------------------------------------------------------------- mark and icons
// Crescent nudged so its mass sits optically centred in a square.
const markInSquare = (size, fill, { pad = 0.2, nudge = [2.6, -1.4] } = {}) => {
  const inner = size * (1 - 2 * pad), s = inner / 44; // crescent spans ~44 of the 64 grid
  return `<path fill="${fill}" transform="translate(${r(size / 2)} ${r(size / 2)}) scale(${r(s * 1000) / 1000}) translate(${-32 + nudge[0]} ${-32 + nudge[1]})" d="${CRESCENT}"/>`;
};
write("majnu-mark.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Majnu"><title>Majnu</title>${markInSquare(64, C.roseGold, { pad: 0.08 })}</svg>\n`);
write("majnu-mark-mono.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Majnu"><title>Majnu</title>${markInSquare(64, "currentColor", { pad: 0.08 })}</svg>\n`);

const iconBg = (size, radius) => `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B2556"/><stop offset="1" stop-color="${C.plum}"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>`;
const appIcon = (size, radius, pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${iconBg(size, radius)}${markInSquare(size, C.roseGold, { pad })}</svg>\n`;
write("majnu-app-icon.svg", appIcon(1024, 0, 0.24)); // full square: platforms apply their own mask
write("majnu-favicon.svg", appIcon(64, 14, 0.17));

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
const icon512 = await png(appIcon(1024, 0, 0.24), 512);
const icon192 = await png(appIcon(1024, 0, 0.24), 192);
const apple180 = await png(appIcon(1024, 0, 0.24), 180);
const fav = await Promise.all([16, 32, 48].map((s) => png(appIcon(64, 14, 0.17), s)));
write("majnu-app-icon-512.png", icon512);
write("majnu-app-icon-192.png", icon192);
write("apple-touch-icon.png", apple180);
write("favicon-32.png", fav[1]);
write("favicon.ico", await pngToIco(fav));

// ---------------------------------------------------------------- link preview (1200 x 630)
const W = 1200, H = 630, left = 96;
const eyebrow = setText(hanken600, "PERSONALIZED DIGITAL GIFTING", 20, { tracking: 0.24, x: left, y: 196 });
const ogScale = 1.18; // wordmark at 118 px font size
const ogWm = { x: left - wm.minX * ogScale, y: 330 };
const headline = setText(gilda, "Give something personal.", 54, { x: left, y: 440 });
const site = setText(hanken600, "majnu.app", 22, { tracking: 0.04, x: left, y: 540 });
const moonSize = 620, moonCx = 930, moonCy = 330, ms = moonSize / 64;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="sky" cx="0.76" cy="0.32" r="0.9">
      <stop offset="0" stop-color="#46295F"/><stop offset="0.55" stop-color="${C.plum}"/><stop offset="1" stop-color="#100A17"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.roseGold}" stop-opacity="0.32"/><stop offset="1" stop-color="${C.roseGold}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="moon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FBF4F8"/><stop offset="1" stop-color="#CDB6CF"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${moonCx}" cy="${moonCy}" r="${moonSize * 0.55}" fill="url(#glow)"/>
  <path fill="url(#moon)" opacity="0.92" transform="translate(${moonCx} ${moonCy}) rotate(-18) scale(${r(ms * 100) / 100}) translate(-32 -32)" d="${CRESCENT}"/>
  <path fill="${C.lilac}" d="${eyebrow.d}"/>
  <g transform="translate(${r(ogWm.x)} ${ogWm.y}) scale(${ogScale})">
    <path fill="${C.petal}" d="${wm.d}"/>
    <path fill="${C.roseGold}" transform="${crescentTransform}" d="${CRESCENT}"/>
  </g>
  <path fill="${C.petal}" d="${headline.d}"/>
  <path fill="${C.roseGold}" d="${site.d}"/>
</svg>
`;
write("majnu-og.svg", og);
write("majnu-og.png", await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());

// ---------------------------------------------------------------- contrast report
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [
  ["petal on plum", C.petal, C.plum], ["lilac on plum", C.lilac, C.plum], ["roseGold on plum", C.roseGold, C.plum],
  ["orchid on plum", C.orchid, C.plum], ["plum on roseGold (button)", C.plum, C.roseGold], ["petal on velvet", C.petal, C.velvet],
  ["lilac on velvet", C.lilac, C.velvet],
  ["ink on petalGround", C.ink, C.petalGround], ["inkMuted on petalGround", C.inkMuted, C.petalGround],
  ["roseGoldDeep on petalGround", C.roseGoldDeep, C.petalGround], ["orchidDeep on petalGround", C.orchidDeep, C.petalGround],
  ["petalGround on ink (button)", C.petalGround, C.ink],
];
for (const [name, a, b] of pairs) console.log(`${ratio(a, b).toFixed(2).padStart(6)}  ${name}`);
console.log("wordmark viewBox", vbX, vbY, vbW, vbH, "aspect", (vbW / vbH).toFixed(3));
console.log("files:", fs.readdirSync(outDir).join(", "));

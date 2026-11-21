import { createStage } from './core/scene.js';
import { makeCardTexture, makeCardMesh } from './core/cardTexture.js';
import { buildWedding } from './templates/wedding.js';
import { buildParty } from './templates/party.js';
import { buildGift } from './templates/gift.js';

const BUILDERS = { wedding: buildWedding, party: buildParty, gift: buildGift };

async function boot() {
  const kind = new URLSearchParams(location.search).get('t') || 'wedding';
  const build = BUILDERS[kind] || buildWedding;
  const key = BUILDERS[kind] ? kind : 'wedding';

  const cfg = await fetch(`config/${key}.json`).then((r) => r.json());
  document.title = `${cfg.names} — ${cfg.heading}`;

  const stage = createStage(document.getElementById('app'), cfg.colors.background);
  const texture = await makeCardTexture(cfg, key);
  texture.anisotropy = stage.renderer.capabilities.getMaxAnisotropy();
  const card = makeCardMesh(texture, cfg.colors.primary);

  const template = build(stage, cfg, card);

  const hint = document.getElementById('hint');
  const rsvp = document.getElementById('rsvp');
  let opened = false;
  stage.onClick(async () => {
    if (opened) return;
    opened = true;
    hint.style.opacity = 0;
    hint.style.animation = 'none';
    await template.open();
    if (cfg.rsvpUrl) {
      rsvp.href = cfg.rsvpUrl;
      rsvp.textContent = cfg.rsvpLabel || 'RSVP';
      rsvp.style.background = cfg.colors.accent;
      rsvp.style.color = cfg.colors.primary;
      rsvp.classList.add('show');
    }
  });
}

boot();

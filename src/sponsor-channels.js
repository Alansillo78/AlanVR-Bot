const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const API = 'https://discord.com/api/v10';

const VR_CATEGORY = '🥽 REALIDAD VIRTUAL';
const SPONSORS_CHANNEL = '🤝・patrocinadores-del-canal';
const SPONSOR_NEWS_CHANNEL = '📢・anuncios-patrocinadores';
const SPONSOR_ROLE = 'Patrocinador';

async function request(path, options = {}) {
  const r = await fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bot ${DISCORD_TOKEN}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 500)}`);
  if (r.status === 204) return null;
  return r.json();
}

async function ensureRole(roles) {
  let role = roles.find(r => r.name === SPONSOR_ROLE);
  if (role) return role;
  return request(`/guilds/${GUILD_ID}/roles`, {
    method: 'POST',
    body: JSON.stringify({ name: SPONSOR_ROLE, color: 0x8E44AD, hoist: true, mentionable: false })
  });
}

async function ensureChannel(channels, name, categoryId, topic, overwrites) {
  let channel = channels.find(c => c.name === name && c.type === 0);
  if (channel) {
    await request(`/channels/${channel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parent_id: categoryId || channel.parent_id, topic, permission_overwrites: overwrites })
    });
    return channel;
  }
  return request(`/guilds/${GUILD_ID}/channels`, {
    method: 'POST',
    body: JSON.stringify({ name, type: 0, parent_id: categoryId, topic, permission_overwrites: overwrites })
  });
}

export async function setupSponsorChannels() {
  if (!DISCORD_TOKEN || !GUILD_ID) return;
  try {
    let channels = await request(`/guilds/${GUILD_ID}/channels`);
    const roles = await request(`/guilds/${GUILD_ID}/roles`);
    const category = channels.find(c => c.name === VR_CATEGORY && c.type === 4);
    if (!category) return console.warn(`SPONSORS: no encontré la categoría ${VR_CATEGORY}.`);

    const sponsorRole = await ensureRole(roles);
    const view = BigInt(1024);
    const send = BigInt(2048);
    const history = BigInt(65536);
    const attach = BigInt(32768);
    const embed = BigInt(16384);

    const readOnly = [
      { id: GUILD_ID, type: 0, allow: String(view | history), deny: String(send | attach | embed) }
    ];
    const sponsorPosting = [
      { id: GUILD_ID, type: 0, allow: String(view | history), deny: String(send | attach | embed) },
      { id: sponsorRole.id, type: 0, allow: String(view | history | send | attach | embed), deny: '0' }
    ];

    await ensureChannel(channels, SPONSORS_CHANNEL, category.id,
      '🤝 Marcas, estudios y proyectos que patrocinan o colaboran actualmente con AlanTorres VR. Canal informativo de solo lectura.', readOnly);
    channels = await request(`/guilds/${GUILD_ID}/channels`);
    await ensureChannel(channels, SPONSOR_NEWS_CHANNEL, category.id,
      '📢 Espacio para novedades, anuncios, actualizaciones y contenido de marcas o estudios patrocinadores. Solo el rol Patrocinador y el staff pueden publicar.', sponsorPosting);

    console.log(`🤝 Patrocinadores listos: #${SPONSORS_CHANNEL}, #${SPONSOR_NEWS_CHANNEL} y rol ${SPONSOR_ROLE}.`);
  } catch (e) {
    console.error('SPONSORS:', e.message);
  }
}

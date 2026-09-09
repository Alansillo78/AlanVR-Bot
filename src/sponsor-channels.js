const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const API = 'https://discord.com/api/v10';

const SPONSORS_CHANNEL = '🤝・patrocinadores-del-canal';
const SPONSOR_NEWS_CHANNEL = '📢・anuncios-patrocinadores';
const SPONSOR_ROLE = 'Patrocinador';

async function request(path, options = {}) {
  const r = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 500)}`);
  if (r.status === 204) return null;
  return r.json();
}

// Este módulo queda deliberadamente en modo SOLO VERIFICACIÓN.
// No crea canales, no crea roles, no cambia permisos, no borra mensajes
// y no vuelve a publicar el escaparate de patrocinadores al reiniciar.
export async function setupSponsorChannels() {
  if (!DISCORD_TOKEN || !GUILD_ID) return;

  try {
    const [channels, roles] = await Promise.all([
      request(`/guilds/${GUILD_ID}/channels`),
      request(`/guilds/${GUILD_ID}/roles`)
    ]);

    const sponsors = channels.find(c => c.name === SPONSORS_CHANNEL && c.type === 0);
    const announcements = channels.find(c => c.name === SPONSOR_NEWS_CHANNEL && c.type === 0);
    const sponsorRole = roles.find(r => r.name === SPONSOR_ROLE);

    if (!sponsors) console.warn(`SPONSORS: no encontré #${SPONSORS_CHANNEL}. No se creará automáticamente.`);
    if (!announcements) console.warn(`SPONSORS: no encontré #${SPONSOR_NEWS_CHANNEL}. No se creará automáticamente.`);
    if (!sponsorRole) console.warn(`SPONSORS: no encontré el rol ${SPONSOR_ROLE}. No se creará automáticamente.`);

    console.log('🤝 Patrocinadores en modo bloqueado: sin publicaciones, recreaciones ni sobrescrituras automáticas.');
  } catch (e) {
    console.error('SPONSORS:', e.message);
  }
}

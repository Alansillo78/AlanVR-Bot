const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const API = 'https://discord.com/api/v10';
const ROLE_NAME = '🤖 Bots';

async function req(path, options = {}) {
  const r = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 300)}`);
  if (r.status === 204) return null;
  return r.json();
}

export async function setupBotRole() {
  if (!DISCORD_TOKEN || !GUILD_ID) return;
  try {
    const [roles, members] = await Promise.all([
      req(`/guilds/${GUILD_ID}/roles`),
      req(`/guilds/${GUILD_ID}/members?limit=1000`)
    ]);

    const role = roles.find(r => r.name === ROLE_NAME);
    if (!role) {
      console.warn(`🤖 No existe el rol ${ROLE_NAME}. No se creará automáticamente.`);
      return;
    }

    let assigned = 0;
    for (const member of members) {
      if (!member.user?.bot || member.roles?.includes(role.id)) continue;
      try {
        await req(`/guilds/${GUILD_ID}/members/${member.user.id}/roles/${role.id}`, { method: 'PUT' });
        assigned++;
      } catch (e) {
        console.error(`BOT-ROLE ${member.user?.username || member.user?.id}:`, e.message);
      }
    }
    console.log(`🤖 Rol de bots encontrado. Asignado a ${assigned} bot(s) nuevos.`);
  } catch (e) {
    console.error('BOT-ROLE:', e.message);
  }
}

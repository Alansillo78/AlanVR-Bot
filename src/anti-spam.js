const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const API = 'https://discord.com/api/v10';
const CATEGORY_NAME = '🚨 SEGURIDAD';
const CHANNEL_NAME = '🚫・anti-spam-no-mandar-mensaje';
const WARNING_MARKER = 'CANAL ANTI-SPAM — NO ENVÍES MENSAJES';
const POLL_MS = 2000;

let started = false;
let antiSpamChannelId = null;
let botUserId = null;
let pollRunning = false;

async function discordRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord ${response.status}: ${text.slice(0, 500)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function safeRequest(path, options = {}) {
  try { return await discordRequest(path, options); }
  catch (error) { console.error(`ANTI-SPAM ${path}:`, error.message); return null; }
}

async function getBotUser() {
  if (botUserId) return botUserId;
  const me = await discordRequest('/users/@me');
  botUserId = me.id;
  return botUserId;
}

async function sendLog(text) {
  const channels = await safeRequest(`/guilds/${GUILD_ID}/channels`);
  if (!Array.isArray(channels)) return;
  const logChannel = channels.find(c => c.name === '🧾・logs');
  if (!logChannel) return;
  await safeRequest(`/channels/${logChannel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } })
  });
}

async function ensureWarning(channelId) {
  const messages = await safeRequest(`/channels/${channelId}/messages?limit=25`);
  const exists = Array.isArray(messages) && messages.some(message => {
    if (message.author?.id !== botUserId) return false;
    if (message.content?.includes(WARNING_MARKER)) return true;
    return Array.isArray(message.embeds) && message.embeds.some(embed => embed.title?.includes(WARNING_MARKER));
  });
  if (exists) return;

  const warning = await safeRequest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      embeds: [{
        color: 15548997,
        title: `🚨 ${WARNING_MARKER}`,
        description: '**NO ENVÍES NINGÚN MENSAJE EN ESTE CANAL.**\n\nComo medida de seguridad para evitar cuentas hackeadas o comprometidas que entran a spamear mensajes en todos los canales, este canal funciona como una **trampa anti-spam**.\n\n⛔ **Si tu cuenta envía cualquier mensaje aquí, serás baneado permanentemente del servidor de forma automática.**\n\nNo importa qué mensaje sea. Si estás leyendo esto, simplemente sal del canal y no escribas nada.',
        footer: { text: 'AlanTorres VR Latinoamérica • Sistema de seguridad anti-spam' }
      }],
      allowed_mentions: { parse: [] }
    })
  });
  if (warning?.id) await safeRequest(`/channels/${channelId}/pins/${warning.id}`, { method: 'PUT' });
}

async function findAntiSpamChannel() {
  await getBotUser();
  const channels = await discordRequest(`/guilds/${GUILD_ID}/channels`);
  const category = channels.find(c => c.type === 4 && c.name === CATEGORY_NAME);
  const channel = channels.find(c => c.type === 0 && c.name === CHANNEL_NAME && (!category || c.parent_id === category.id));

  if (!channel) {
    console.warn(`🛡️ No encontré #${CHANNEL_NAME}. No se creará ni se modificará automáticamente.`);
    return null;
  }

  antiSpamChannelId = channel.id;
  await ensureWarning(channel.id);
  console.log(`🛡️ ANTI-SPAM activo en #${CHANNEL_NAME} sin modificar canales ni categorías.`);
  return channel.id;
}

async function banForTrapMessage(message) {
  if (!message?.id || !message.author?.id) return;
  if (message.author.bot || message.webhook_id || message.author.id === botUserId) return;

  const userId = message.author.id;
  const tag = message.author.global_name || message.author.username || userId;
  const reason = 'ANTI-SPAM automático: envió un mensaje en el canal trampa de seguridad.';

  await safeRequest(`/channels/${antiSpamChannelId}/messages/${message.id}`, {
    method: 'DELETE',
    headers: { 'X-Audit-Log-Reason': encodeURIComponent(reason) }
  });

  try {
    await discordRequest(`/guilds/${GUILD_ID}/bans/${userId}`, {
      method: 'PUT',
      headers: { 'X-Audit-Log-Reason': encodeURIComponent(reason) },
      body: JSON.stringify({ delete_message_seconds: 86400 })
    });
    console.log(`🚨 ANTI-SPAM: ${tag} (${userId}) baneado permanentemente.`);
    await sendLog(`🚨 ANTI-SPAM: **${tag}** (${userId}) fue baneado permanentemente por enviar un mensaje en #${CHANNEL_NAME}.`);
  } catch (error) {
    console.error(`ANTI-SPAM BAN ${tag}:`, error.message);
    await sendLog(`⚠️ ANTI-SPAM: **${tag}** (${userId}) escribió en #${CHANNEL_NAME}, pero el bot NO pudo banearlo. Revisa el permiso **Ban Members** y la jerarquía del rol del bot.`);
  }
}

async function pollTrapChannel() {
  if (pollRunning || !antiSpamChannelId) return;
  pollRunning = true;
  try {
    const messages = await discordRequest(`/channels/${antiSpamChannelId}/messages?limit=25`);
    if (!Array.isArray(messages)) return;
    for (const message of [...messages].reverse()) {
      if (message.author?.bot || message.webhook_id || message.author?.id === botUserId) continue;
      await banForTrapMessage(message);
    }
  } catch (error) {
    console.error('ANTI-SPAM polling:', error.message);
  } finally {
    pollRunning = false;
  }
}

export async function startAntiSpam() {
  if (started) return;
  started = true;
  if (!DISCORD_TOKEN || !GUILD_ID) {
    console.error('ANTI-SPAM desactivado: faltan DISCORD_TOKEN o GUILD_ID.');
    return;
  }
  try {
    const channelId = await findAntiSpamChannel();
    if (!channelId) return;
    await pollTrapChannel();
    setInterval(pollTrapChannel, POLL_MS);
  } catch (error) {
    console.error('ANTI-SPAM no pudo iniciar:', error.message);
  }
}

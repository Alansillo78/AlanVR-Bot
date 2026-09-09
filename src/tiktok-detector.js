const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
const TIKTOK_REFRESH_TOKEN = process.env.TIKTOK_REFRESH_TOKEN || '';
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';

const CHECK_EVERY_MS = Number(process.env.TIKTOK_CHECK_INTERVAL_MS || 120000);

let accessToken = TIKTOK_ACCESS_TOKEN;
let refreshToken = TIKTOK_REFRESH_TOKEN;
let accessTokenExpiresAt = accessToken ? Date.now() + 23 * 60 * 60 * 1000 : 0;
let lastTikTokVideoId = null;
let started = false;

function configured() {
  return Boolean(accessToken || (refreshToken && TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET));
}

async function refreshAccessToken() {
  if (!refreshToken || !TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
    throw new Error('Faltan TIKTOK_REFRESH_TOKEN, TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET para renovar el token.');
  }

  const body = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    client_secret: TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache'
    },
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `HTTP ${response.status}`);
  }

  accessToken = data.access_token;
  if (data.refresh_token) refreshToken = data.refresh_token;
  accessTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 86400) - 900) * 1000;
  console.log('✅ Token de TikTok renovado.');
}

async function ensureAccessToken() {
  if (!accessToken) {
    await refreshAccessToken();
    return;
  }

  if (refreshToken && TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET && Date.now() >= accessTokenExpiresAt) {
    await refreshAccessToken();
  }
}

async function fetchLatestVideos(retry = true) {
  await ensureAccessToken();

  const fields = 'id,title,video_description,create_time,cover_image_url,share_url,duration';
  const response = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(fields)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ max_count: 5 })
  });

  const data = await response.json().catch(() => ({}));

  if ((response.status === 401 || response.status === 403) && retry && refreshToken && TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET) {
    await refreshAccessToken();
    return fetchLatestVideos(false);
  }

  if (!response.ok || (data.error?.code && data.error.code !== 'ok')) {
    throw new Error(data.error?.message || data.error?.code || `HTTP ${response.status}`);
  }

  return Array.isArray(data.data?.videos) ? data.data.videos : [];
}

async function discordRequest(path, options = {}) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord ${response.status}: ${text.slice(0, 300)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function announceTikTokVideo(video) {
  const [channels, roles] = await Promise.all([
    discordRequest(`/guilds/${GUILD_ID}/channels`),
    discordRequest(`/guilds/${GUILD_ID}/roles`)
  ]);

  const channel = channels.find(c => c.name === '🔴・directos-y-videos');
  if (!channel) throw new Error('No encontré el canal 🔴・directos-y-videos.');

  const notifyRole = roles.find(r => r.name === '🎬 Nuevos videos');
  const url = video.share_url || `https://www.tiktok.com/@alantorresvr/video/${video.id}`;
  const title = video.title || video.video_description || 'Nuevo video en TikTok';
  const description = video.video_description && video.video_description !== title
    ? video.video_description
    : '¡Alan acaba de subir un nuevo video a TikTok!';

  const payload = {
    content: `${notifyRole ? `<@&${notifyRole.id}> ` : ''}🎬 **¡Nuevo video en TikTok!**`,
    allowed_mentions: notifyRole ? { roles: [notifyRole.id] } : { parse: [] },
    embeds: [{
      title: title.slice(0, 256),
      url,
      description: description.slice(0, 4096),
      image: video.cover_image_url ? { url: video.cover_image_url } : undefined,
      footer: { text: 'AlanTorresVR • TikTok' },
      timestamp: new Date().toISOString()
    }]
  };

  await discordRequest(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  console.log(`🎬 TikTok anunciado: ${video.id}`);
}

async function checkTikTok() {
  if (!configured()) return;

  try {
    const videos = await fetchLatestVideos();
    if (!videos.length) return;

    videos.sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0));
    const newest = videos[0];

    if (!lastTikTokVideoId) {
      lastTikTokVideoId = newest.id;
      console.log(`✅ Detector TikTok listo. Video base: ${newest.id}`);
      return;
    }

    if (newest.id !== lastTikTokVideoId) {
      const previousId = lastTikTokVideoId;
      const unseen = [];
      for (const video of videos) {
        if (video.id === previousId) break;
        unseen.push(video);
      }

      for (const video of unseen.reverse()) {
        await announceTikTokVideo(video);
      }

      lastTikTokVideoId = newest.id;
    }
  } catch (error) {
    console.error('TikTok detector:', error.message);
  }
}

export function startTikTokDetector() {
  if (started) return;
  started = true;

  if (!configured()) {
    console.log('ℹ️ Detector TikTok desactivado: faltan credenciales de TikTok.');
    return;
  }

  console.log(`🎵 Detector TikTok activo. Revisión cada ${Math.round(CHECK_EVERY_MS / 1000)} s.`);
  setTimeout(checkTikTok, 15000);
  setInterval(checkTikTok, CHECK_EVERY_MS);
}

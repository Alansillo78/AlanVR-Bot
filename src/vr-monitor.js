import Parser from 'rss-parser';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const API = 'https://discord.com/api/v10';

const NEWS_CHANNEL = '📰・noticias-vr';
const DEALS_CHANNEL = '🎮・juegos-y-ofertas-vr';
const VR_CATEGORY = '🥽 REALIDAD VIRTUAL';

const NEWS_INTERVAL_MS = 30 * 60 * 1000;
const DEALS_INTERVAL_MS = 60 * 60 * 1000;
const START_DELAY_MS = 20 * 1000;
const MAX_POSTS_PER_CHECK = 3;

const parser = new Parser();
let started = false;
let newsBusy = false;
let dealsBusy = false;
const seenNews = new Set();
const seenDeals = new Set();
let newsBaselineReady = false;
let dealsBaselineReady = false;

const NEWS_FEEDS = [
  { name: 'Road to VR', url: 'https://roadtovr.com/feed/' },
  { name: 'UploadVR', url: 'https://www.uploadvr.com/feed/' }
];

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
    throw new Error(`Discord ${response.status}: ${text.slice(0, 400)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function safeDiscord(path, options = {}) {
  try { return await discordRequest(path, options); }
  catch (e) { console.error(`VR-MONITOR Discord ${path}:`, e.message); return null; }
}

function stripHtml(input = '') {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max = 350) {
  const clean = stripHtml(text || '');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

async function getGuildChannels() {
  const channels = await safeDiscord(`/guilds/${GUILD_ID}/channels`);
  return Array.isArray(channels) ? channels : [];
}

async function ensureDealsChannel() {
  const channels = await getGuildChannels();
  let ch = channels.find(c => c.name === DEALS_CHANNEL && c.type === 0);
  if (ch) return ch;

  const category = channels.find(c => c.name === VR_CATEGORY && c.type === 4);
  ch = await safeDiscord(`/guilds/${GUILD_ID}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: DEALS_CHANNEL,
      type: 0,
      parent_id: category?.id,
      topic: '🎮 Nuevos juegos VR, ofertas destacadas y juegos gratis para Meta Quest y SteamVR.',
      permission_overwrites: [
        { id: GUILD_ID, type: 0, allow: String(1024 | 65536), deny: String(2048 | 32768 | 262144) }
      ]
    })
  });
  return ch;
}

async function findChannel(name) {
  const channels = await getGuildChannels();
  return channels.find(c => c.name === name && c.type === 0) || null;
}

async function sendEmbed(channelId, embed, content = '') {
  return safeDiscord(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, embeds: [embed], allowed_mentions: { parse: [] } })
  });
}

async function checkNews() {
  if (newsBusy) return;
  newsBusy = true;
  try {
    const channel = await findChannel(NEWS_CHANNEL);
    if (!channel) return console.warn(`VR-MONITOR: no existe ${NEWS_CHANNEL}`);

    const fresh = [];
    for (const feedInfo of NEWS_FEEDS) {
      try {
        const feed = await parser.parseURL(feedInfo.url);
        for (const item of (feed.items || []).slice(0, 12)) {
          const key = item.guid || item.id || item.link || `${feedInfo.name}:${item.title}`;
          if (!key) continue;
          if (!seenNews.has(key) && newsBaselineReady) fresh.push({ ...item, source: feedInfo.name, key });
          seenNews.add(key);
        }
      } catch (e) {
        console.error(`VR-MONITOR ${feedInfo.name}:`, e.message);
      }
    }

    if (!newsBaselineReady) {
      newsBaselineReady = true;
      console.log(`📰 VR news baseline listo (${seenNews.size} elementos).`);
      return;
    }

    fresh.sort((a, b) => new Date(a.isoDate || a.pubDate || 0) - new Date(b.isoDate || b.pubDate || 0));
    for (const item of fresh.slice(-MAX_POSTS_PER_CHECK)) {
      await sendEmbed(channel.id, {
        color: 10181046,
        title: `🥽 ${truncate(item.title, 240)}`,
        url: item.link,
        description: truncate(item.contentSnippet || item.content || item.summary || 'Nueva noticia relacionada con realidad virtual.', 500),
        fields: [{ name: 'Fuente', value: item.source, inline: true }],
        footer: { text: 'AlanTorres VR Latinoamérica • Noticias VR' },
        timestamp: new Date(item.isoDate || item.pubDate || Date.now()).toISOString()
      });
    }
    if (fresh.length) console.log(`📰 Publicadas ${Math.min(fresh.length, MAX_POSTS_PER_CHECK)} noticias VR.`);
  } finally { newsBusy = false; }
}

function parseSteamSearch(html) {
  const rows = html.split(/<a[^>]+class="[^"]*search_result_row[^"]*"/i).slice(1);
  const out = [];
  for (const row of rows.slice(0, 60)) {
    const href = row.match(/href="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&');
    const appid = row.match(/data-ds-appid="([^"]+)"/i)?.[1] || href?.match(/\/app\/(\d+)/)?.[1];
    const title = stripHtml(row.match(/<span[^>]+class="title"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const discountText = stripHtml(row.match(/<div[^>]+class="[^"]*discount_pct[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const pct = Math.abs(Number(discountText.replace(/[^0-9]/g, ''))) || 0;
    const finalPrice = stripHtml(row.match(/<div[^>]+class="[^"]*discount_final_price[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const originalPrice = stripHtml(row.match(/<div[^>]+class="[^"]*discount_original_price[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    if (appid && title && href && pct >= 40) out.push({ key: `steam:${appid}:${pct}:${finalPrice}`, title, url: href, pct, finalPrice, originalPrice, platform: 'SteamVR' });
  }
  return out;
}

async function fetchSteamDeals() {
  const url = 'https://store.steampowered.com/search/?specials=1&vrsupport=402&ndl=1';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 AlanTorresVRBot/1.0', 'Accept-Language': 'es-MX,es;q=0.9,en;q=0.7' } });
  if (!r.ok) throw new Error(`Steam HTTP ${r.status}`);
  return parseSteamSearch(await r.text());
}

function parseQuestDeals(html) {
  const out = [];
  const linkRe = /<a[^>]+href="(\/app\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  const seen = new Set();
  while ((m = linkRe.exec(html)) && out.length < 40) {
    const href = m[1];
    const title = stripHtml(m[2]);
    if (!title || title.length > 120 || seen.has(href)) continue;
    const nearby = stripHtml(html.slice(Math.max(0, m.index - 450), Math.min(html.length, m.index + m[0].length + 650)));
    const pctMatch = nearby.match(/-(\d{1,2})%/);
    if (!pctMatch) continue;
    const pct = Number(pctMatch[1]);
    if (pct < 40) continue;
    const prices = [...nearby.matchAll(/\$\s?(\d+(?:\.\d{2})?)/g)].map(x => `$${x[1]}`).slice(0, 2);
    seen.add(href);
    out.push({
      key: `quest:${href}:${pct}:${prices.join(':')}`,
      title,
      url: `https://queststoredb.com${href}`,
      pct,
      finalPrice: prices[0] || 'Ver precio',
      originalPrice: prices[1] || '',
      platform: 'Meta Quest',
      sourceNote: 'Precio detectado mediante Quest Store DB; confirma el precio final en Meta Store.'
    });
  }
  return out;
}

async function fetchQuestDeals() {
  const r = await fetch('https://queststoredb.com/on_sale/?sort=-discount', { headers: { 'User-Agent': 'Mozilla/5.0 AlanTorresVRBot/1.0' } });
  if (!r.ok) throw new Error(`QuestStoreDB HTTP ${r.status}`);
  return parseQuestDeals(await r.text());
}

async function checkDeals() {
  if (dealsBusy) return;
  dealsBusy = true;
  try {
    const channel = await ensureDealsChannel();
    if (!channel) return;
    const all = [];
    try { all.push(...await fetchSteamDeals()); } catch (e) { console.error('VR-MONITOR Steam:', e.message); }
    try { all.push(...await fetchQuestDeals()); } catch (e) { console.error('VR-MONITOR QuestStoreDB:', e.message); }

    const fresh = [];
    for (const deal of all) {
      if (!seenDeals.has(deal.key) && dealsBaselineReady) fresh.push(deal);
      seenDeals.add(deal.key);
    }

    if (!dealsBaselineReady) {
      dealsBaselineReady = true;
      console.log(`🔥 VR deals baseline listo (${seenDeals.size} ofertas).`);
      return;
    }

    fresh.sort((a, b) => b.pct - a.pct);
    for (const deal of fresh.slice(0, MAX_POSTS_PER_CHECK)) {
      const prices = deal.originalPrice ? `${deal.originalPrice} → **${deal.finalPrice}**` : `**${deal.finalPrice}**`;
      await sendEmbed(channel.id, {
        color: 5763719,
        title: `🔥 ${deal.pct}% OFF • ${truncate(deal.title, 190)}`,
        url: deal.url,
        description: `🥽 **${deal.platform}**\n💰 ${prices}${deal.sourceNote ? `\n\n_${deal.sourceNote}_` : ''}`,
        footer: { text: 'AlanTorres VR Latinoamérica • Juegos y ofertas VR' },
        timestamp: new Date().toISOString()
      });
    }
    if (fresh.length) console.log(`🔥 Publicadas ${Math.min(fresh.length, MAX_POSTS_PER_CHECK)} ofertas VR.`);
  } finally { dealsBusy = false; }
}

export function startVRMonitor() {
  if (started) return;
  started = true;
  if (!DISCORD_TOKEN || !GUILD_ID) {
    console.error('VR-MONITOR: faltan DISCORD_TOKEN o GUILD_ID.');
    return;
  }
  setTimeout(async () => {
    await checkNews();
    await checkDeals();
    setInterval(checkNews, NEWS_INTERVAL_MS);
    setInterval(checkDeals, DEALS_INTERVAL_MS);
    console.log('🥽 VR-MONITOR activo: noticias cada 30 min, ofertas/juegos cada 60 min.');
  }, START_DELAY_MS);
}

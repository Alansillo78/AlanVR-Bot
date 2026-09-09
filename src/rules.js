const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const API = 'https://discord.com/api/v10';
const CHANNEL_NAME = '📜・reglas';
const MARKER = 'REGLAS OFICIALES — ALANTORRES VR LATINOAMÉRICA';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

export async function publishRules() {
  if (!DISCORD_TOKEN || !GUILD_ID) return;
  try {
    const channels = await request(`/guilds/${GUILD_ID}/channels`);
    const channel = channels.find(c => c.name === CHANNEL_NAME);
    if (!channel) {
      console.warn(`📜 No encontré ${CHANNEL_NAME}. Ejecuta /setup primero.`);
      return;
    }

    const recent = await request(`/channels/${channel.id}/messages?limit=50`);
    const me = await request('/users/@me');
    const oldRules = recent.filter(m => m.author?.id === me.id && (
      m.content?.includes(MARKER) ||
      m.embeds?.some(e => e.footer?.text?.includes(MARKER))
    ));
    for (const m of oldRules) {
      await request(`/channels/${channel.id}/messages/${m.id}`, { method: 'DELETE' }).catch(() => {});
    }

    const description = [
      '**1. 🤝 Respeto ante todo**\nNada de insultos graves, acoso, discriminación, amenazas o ataques personales.',
      '**2. 🌎 Recuerda que estás en un espacio público**\nEste servidor es una comunidad. Si tú y tus amigos se llevan pesado, se insultan de broma o tienen un humor que entre ustedes está permitido, manténganlo dentro de sus círculos o espacios privados. En los canales públicos mantén el respeto: la confianza entre amigos no se impone al resto de la comunidad.',
      '**3. 🚫 Nada de spam**\nNo hagas spam de mensajes, emojis, menciones, links, servidores, redes o contenido repetitivo.',
      '**4. 📢 No publicidad sin permiso**\nNo promociones servidores, canales, redes, productos o comunidades sin autorización del staff.',
      '**5. 🔞 Contenido apropiado**\nNada de contenido NSFW, gore extremo, contenido ilegal o material inapropiado.',
      '**6. 🔐 No estafas ni enlaces sospechosos**\nQuedan prohibidos links maliciosos, phishing, scams, archivos sospechosos o intentos de robo de cuentas.',
      '**7. 🗂️ Usa cada canal para lo que corresponde**\nMantén las conversaciones en el canal adecuado para que el servidor siga ordenado.',
      '**8. 🔔 No abuses de menciones**\nNo menciones repetidamente a Alan, moderadores, administradores, @everyone o @here sin motivo.',
      '**9. 🕵️ Respeta la privacidad**\nNo publiques información personal tuya o de otros sin consentimiento.',
      '**10. ⚠️ Nada de trampas o actividades ilegales**\nNo compartas hacks, cheats maliciosos, métodos de fraude, robo de cuentas o actividades similares.',
      '**11. 🛡️ Haz caso al staff**\nLos moderadores pueden intervenir cuando sea necesario para mantener la comunidad sana.',
      '**12. 🚨 Sistema anti-spam de seguridad**\nEl canal `🚫・anti-spam-no-mandar-mensaje` existe como medida de seguridad contra cuentas comprometidas. **Enviar cualquier mensaje ahí resultará en un baneo permanente automático.**',
      '**13. 🧠 Usa el sentido común**\nQue algo no aparezca escrito específicamente aquí no significa que esté permitido. Si una conducta perjudica a la comunidad, el staff puede actuar.'
    ].join('\n\n');

    await request(`/channels/${channel.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        embeds: [{
          color: 0x8E44AD,
          title: '📜 REGLAS — AlanTorres VR Latinoamérica',
          description,
          footer: { text: `${MARKER} • Al permanecer en el servidor aceptas estas reglas. El desconocimiento de las reglas no evita una sanción.` }
        }],
        allowed_mentions: { parse: [] }
      })
    });
    console.log('📜 Reglas publicadas en #📜・reglas.');
  } catch (e) {
    console.error('📜 Error publicando reglas:', e.message);
  }
}

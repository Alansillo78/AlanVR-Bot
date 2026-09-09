const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const API = 'https://discord.com/api/v10';

const VR_CATEGORY = '🥽 REALIDAD VIRTUAL';
const SPONSORS_CHANNEL = '🤝・patrocinadores-del-canal';
const SPONSOR_NEWS_CHANNEL = '📢・anuncios-patrocinadores';
const SPONSOR_ROLE = 'Patrocinador';
const SHOWCASE_MARKER = 'ALANVR_SPONSOR_SHOWCASE_V1';

async function request(path, options = {}) {
  const r = await fetch(`${API}${path}`, {...options, headers:{Authorization:`Bot ${DISCORD_TOKEN}`,'Content-Type':'application/json',...(options.headers||{})}});
  if(!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0,500)}`);
  if(r.status===204) return null;
  return r.json();
}
async function ensureRole(roles){let role=roles.find(r=>r.name===SPONSOR_ROLE);if(role)return role;return request(`/guilds/${GUILD_ID}/roles`,{method:'POST',body:JSON.stringify({name:SPONSOR_ROLE,color:0x8E44AD,hoist:true,mentionable:false})})}
async function ensureChannel(channels,name,categoryId,topic,overwrites){let channel=channels.find(c=>c.name===name&&c.type===0);if(channel){await request(`/channels/${channel.id}`,{method:'PATCH',body:JSON.stringify({parent_id:categoryId||channel.parent_id,topic,permission_overwrites:overwrites})});return channel}return request(`/guilds/${GUILD_ID}/channels`,{method:'POST',body:JSON.stringify({name,type:0,parent_id:categoryId,topic,permission_overwrites:overwrites})})}
async function send(channelId,payload){return request(`/channels/${channelId}/messages`,{method:'POST',body:JSON.stringify({...payload,allowed_mentions:{parse:[]}})})}

async function publishShowcase(channel){
  const recent=await request(`/channels/${channel.id}/messages?limit=50`);
  for(const msg of recent){if(msg.author?.bot && msg.content?.includes(SHOWCASE_MARKER)) await request(`/channels/${channel.id}/messages/${msg.id}`,{method:'DELETE'}).catch(()=>{});}

  await send(channel.id,{content:`${SHOWCASE_MARKER}\n# 🤝 PATROCINADORES DE ALANTORRES VR\n> Marcas que forman parte del contenido y los directos de la comunidad. 💜`,embeds:[{color:0x8E44AD,title:'🥽 PARTNERS OFICIALES',description:'Aquí encontrarás las marcas que actualmente apoyan el canal, los productos que utilizamos y las colaboraciones que forman parte del contenido de **AlanTorres VR Latinoamérica**.',footer:{text:'ALANTORRES VR • PARTNERS & COLLABORATIONS'}}]});

  await send(channel.id,{content:'## 🔫 SKOL VR',embeds:[{color:0x5865F2,title:'SKOL VR × AlanTorres VR',description:'**Equipamiento VR para llevar los shooters a otro nivel.**\n\nSKOL VR ha confiado en el canal enviándonos dos de sus gunstocks para utilizarlos en contenido y partidas reales.',fields:[{name:'🎯 SMART STOCK',value:'Gunstock recibido y utilizado dentro del contenido del canal.',inline:true},{name:'🪓 TOMAHAWK AZUL',value:'Versión azul del Tomahawk enviada por SKOL VR.',inline:true},{name:'💜 EN EL CANAL',value:'Los productos pueden aparecer en directos, videos y sesiones de shooters VR.',inline:false}],footer:{text:'PARTNER • SKOL VR × ALANTORRES VR'}}]});

  await send(channel.id,{content:'## 🥽 KKCOBVR',embeds:[{color:0x9B59B6,title:'KKCOBVR × AlanTorres VR',description:'**Accesorios pensados para mejorar la experiencia con Meta Quest.**\n\nKKCOBVR forma parte de los colaboradores del canal con su **careta K2**, que será integrada en el contenido y uso diario de VR.',fields:[{name:'🛡️ K2',value:'Careta/accesorio para Meta Quest enviado por KKCOBVR.',inline:true},{name:'🎥 PRUEBA REAL',value:'Uso dentro de sesiones reales de VR y contenido de la comunidad.',inline:true}],footer:{text:'PARTNER • KKCOBVR × ALANTORRES VR'}}]});

  await send(channel.id,{content:'### 💜 ¿ERES UNA MARCA O ESTUDIO?\nLas novedades de nuestros partners aparecerán en **📢・anuncios-patrocinadores**. Las marcas y estudios autorizados podrán compartir lanzamientos, productos, juegos, eventos y actualizaciones mediante el rol **Patrocinador**.'});
  console.log(`✨ Showcase de patrocinadores publicado en #${SPONSORS_CHANNEL}.`);
}

export async function setupSponsorChannels(){
  if(!DISCORD_TOKEN||!GUILD_ID)return;
  try{
    let channels=await request(`/guilds/${GUILD_ID}/channels`);const roles=await request(`/guilds/${GUILD_ID}/roles`);const category=channels.find(c=>c.name===VR_CATEGORY&&c.type===4);if(!category)return console.warn(`SPONSORS: no encontré la categoría ${VR_CATEGORY}.`);
    const sponsorRole=await ensureRole(roles);const view=1024n,sendMsg=2048n,history=65536n,attach=32768n,embed=16384n;
    const readOnly=[{id:GUILD_ID,type:0,allow:String(view|history),deny:String(sendMsg|attach|embed)}];
    const sponsorPosting=[{id:GUILD_ID,type:0,allow:String(view|history),deny:String(sendMsg|attach|embed)},{id:sponsorRole.id,type:0,allow:String(view|history|sendMsg|attach|embed),deny:'0'}];
    const sponsorChannel=await ensureChannel(channels,SPONSORS_CHANNEL,category.id,'🤝 Marcas, estudios y proyectos que patrocinan o colaboran actualmente con AlanTorres VR. Canal informativo de solo lectura.',readOnly);
    channels=await request(`/guilds/${GUILD_ID}/channels`);
    await ensureChannel(channels,SPONSOR_NEWS_CHANNEL,category.id,'📢 Espacio para novedades, anuncios, actualizaciones y contenido de marcas o estudios patrocinadores. Solo el rol Patrocinador y el staff pueden publicar.',sponsorPosting);
    await publishShowcase(sponsorChannel);
    console.log(`🤝 Patrocinadores listos: #${SPONSORS_CHANNEL}, #${SPONSOR_NEWS_CHANNEL} y rol ${SPONSOR_ROLE}.`);
  }catch(e){console.error('SPONSORS:',e.message)}
}

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const API = 'https://discord.com/api/v10';

const VR_CATEGORY = '🥽 REALIDAD VIRTUAL';
const SPONSORS_CHANNEL = '🤝・patrocinadores-del-canal';
const SPONSOR_NEWS_CHANNEL = '📢・anuncios-patrocinadores';
const SPONSOR_ROLE = 'Patrocinador';
const SHOWCASE_MARKER = 'ALANVR_SPONSOR_SHOWCASE_V2';
const OLD_MARKERS = ['ALANVR_SPONSOR_SHOWCASE_V1','ALANVR_SPONSOR_SHOWCASE_V2'];

const SKOL_SITE='https://skolvr.com/';
const SKOL_SMART='https://skolvr.com/collections/smartstock-best-virtual-reality-gunstock';
const SKOL_TOMAHAWK='https://skolvr.com/pages/tomahawk-vr-gunstock-questions-and-answers';
const SKOL_SMART_IMG='https://skolvr.com/cdn/shop/collections/smartstock.jpg?v=1780007952';
const SKOL_TOMAHAWK_IMG='https://skolvr.com/cdn/shop/files/best-cheap-vr-gun-sniper-rifleaim-51.jpg?v=1780438450';
const KK_SITE='https://kkcobvr.com/';
const KK_K2='https://kkcobvr.com/products/kkcobvr-k2-cooling-fan-face-cover-with-sweat-proof-cotton-interface-pad-for-oculus-meta-quest-2-accessories-relieve-lens-fogging-and-replace-quest-2-facial-cover-cushion';

async function request(path,options={}){const r=await fetch(`${API}${path}`,{...options,headers:{Authorization:`Bot ${DISCORD_TOKEN}`,'Content-Type':'application/json',...(options.headers||{})}});if(!r.ok)throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0,500)}`);if(r.status===204)return null;return r.json()}
async function ensureRole(roles){let role=roles.find(r=>r.name===SPONSOR_ROLE);if(role)return role;return request(`/guilds/${GUILD_ID}/roles`,{method:'POST',body:JSON.stringify({name:SPONSOR_ROLE,color:0x8E44AD,hoist:true,mentionable:false})})}
async function ensureChannel(channels,name,categoryId,topic,overwrites){let channel=channels.find(c=>c.name===name&&c.type===0);if(channel){await request(`/channels/${channel.id}`,{method:'PATCH',body:JSON.stringify({parent_id:categoryId||channel.parent_id,topic,permission_overwrites:overwrites})});return channel}return request(`/guilds/${GUILD_ID}/channels`,{method:'POST',body:JSON.stringify({name,type:0,parent_id:categoryId,topic,permission_overwrites:overwrites})})}
async function send(channelId,payload){return request(`/channels/${channelId}/messages`,{method:'POST',body:JSON.stringify({...payload,allowed_mentions:{parse:[]}})})}

async function publishShowcase(channel){
 const recent=await request(`/channels/${channel.id}/messages?limit=100`);
 for(const msg of recent){if(msg.author?.bot && (OLD_MARKERS.some(x=>msg.content?.includes(x)) || msg.embeds?.some(e=>e.footer?.text?.includes('PARTNER •')))) await request(`/channels/${channel.id}/messages/${msg.id}`,{method:'DELETE'}).catch(()=>{});}
 await send(channel.id,{content:`${SHOWCASE_MARKER}\n# ✨ PARTNERS DE ALANTORRES VR\n> Marcas que apoyan el contenido, los directos y el crecimiento de nuestra comunidad VR.`,embeds:[{color:0x8E44AD,title:'🤝 PATROCINADORES DEL CANAL',description:'Este espacio reúne nuestros partners actuales, qué productos nos han enviado y enlaces para conocerlos. Las imágenes son material oficial de cada marca.',footer:{text:'ALANTORRES VR LATINOAMÉRICA • PARTNERS'}}]});

 await send(channel.id,{content:`# 🔫 SKOL VR\n🌐 **Sitio oficial:** ${SKOL_SITE}`,embeds:[{color:0x5865F2,title:'SKOL VR × AlanTorres VR',url:SKOL_SITE,description:'SKOL VR nos ha enviado equipamiento para shooters VR que utilizamos dentro del contenido y en sesiones reales de juego. 💜',fields:[{name:'🎯 SMARTstock',value:`[Ver producto / colección oficial](${SKOL_SMART})\nGunstock ligero recibido de SKOL VR.`,inline:true},{name:'🪓 Tomahawk azul',value:`[Conocer Tomahawk](${SKOL_TOMAHAWK})\nNuestro Tomahawk fue enviado en **color azul**.`,inline:true}],image:{url:SKOL_TOMAHAWK_IMG},thumbnail:{url:SKOL_SMART_IMG},footer:{text:'PARTNER • SKOL VR × ALANTORRES VR'}}]});

 await send(channel.id,{content:`## 🎯 SMARTstock • SKOL VR\n🔗 ${SKOL_SMART}`,embeds:[{color:0x5865F2,title:'SMARTstock VR Gunstock',url:SKOL_SMART,description:'Uno de los productos que SKOL VR ha enviado al canal.',image:{url:SKOL_SMART_IMG},footer:{text:'Producto oficial • SKOL VR'}}]});

 await send(channel.id,{content:`# 🥽 KKCOBVR\n🌐 **Sitio oficial:** ${KK_SITE}`,embeds:[{color:0x9B59B6,title:'KKCOBVR × AlanTorres VR',url:KK_SITE,description:'KKCOBVR forma parte de los colaboradores del canal con su **K2 Cooling Fan Interface**, un accesorio para Meta Quest 2 pensado para mejorar comodidad y ayudar con el empañamiento de las lentes.',fields:[{name:'🛡️ K2 Cooling Fan Interface',value:`[Ver K2 en la tienda oficial](${KK_K2})`,inline:false},{name:'🎥 EN EL CANAL',value:'La probaremos dentro de sesiones reales de VR y contenido de la comunidad.',inline:false}],footer:{text:'PARTNER • KKCOBVR × ALANTORRES VR'}}]});

 await send(channel.id,{content:'## 📢 NOVEDADES DE NUESTROS PARTNERS\nLas marcas y estudios autorizados podrán compartir **productos, juegos, lanzamientos, eventos y actualizaciones** en **📢・anuncios-patrocinadores** mediante el rol **Patrocinador**.\n\n💜 *Gracias a las marcas que confían en AlanTorres VR Latinoamérica.*'});
 console.log(`✨ Showcase visual de patrocinadores publicado en #${SPONSORS_CHANNEL}.`);
}

export async function setupSponsorChannels(){if(!DISCORD_TOKEN||!GUILD_ID)return;try{let channels=await request(`/guilds/${GUILD_ID}/channels`);const roles=await request(`/guilds/${GUILD_ID}/roles`);const category=channels.find(c=>c.name===VR_CATEGORY&&c.type===4);if(!category)return console.warn(`SPONSORS: no encontré la categoría ${VR_CATEGORY}.`);const sponsorRole=await ensureRole(roles);const view=1024n,sendMsg=2048n,history=65536n,attach=32768n,embed=16384n;const readOnly=[{id:GUILD_ID,type:0,allow:String(view|history),deny:String(sendMsg|attach|embed)}];const sponsorPosting=[{id:GUILD_ID,type:0,allow:String(view|history),deny:String(sendMsg|attach|embed)},{id:sponsorRole.id,type:0,allow:String(view|history|sendMsg|attach|embed),deny:'0'}];const sponsorChannel=await ensureChannel(channels,SPONSORS_CHANNEL,category.id,'🤝 Partners actuales de AlanTorres VR: productos, imágenes y enlaces oficiales. Canal informativo de solo lectura.',readOnly);channels=await request(`/guilds/${GUILD_ID}/channels`);await ensureChannel(channels,SPONSOR_NEWS_CHANNEL,category.id,'📢 Novedades y anuncios de marcas y estudios patrocinadores. Solo el rol Patrocinador y el staff pueden publicar.',sponsorPosting);await publishShowcase(sponsorChannel);console.log(`🤝 Patrocinadores listos: #${SPONSORS_CHANNEL}, #${SPONSOR_NEWS_CHANNEL} y rol ${SPONSOR_ROLE}.`)}catch(e){console.error('SPONSORS:',e.message)}}

import 'dotenv/config';
import express from 'express';
import Parser from 'rss-parser';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const PORT = Number(process.env.PORT || 3000);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Faltan DISCORD_TOKEN, CLIENT_ID o GUILD_ID en .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const parser = new Parser();
let lastYoutubeVideoId = null;
const tempVoiceChannels = new Set();
const giveaways = new Map();

// Apariencia de autoroles. El color se aplica aunque el rol ya exista.
// Los iconos reales de rol solo se intentan si el servidor tiene ROLE_ICONS habilitado.
// Apariencia de roles principales.
const MAIN_ROLE_STYLE = {
  '👑 Alan':                { color: 0x8E44AD },
  '🛡️ Administrador':      { color: 0xE74C3C },
  '🔨 Moderador':           { color: 0xE67E22 },
  '🎥 Creador de contenido':{ color: 0xD354D8 },
  '🤝 Colaborador':         { color: 0x3498DB },
  '⭐ Super Fan':            { color: 0xF1C40F }
};

const AUTOROLE_STYLE = {
  country: { color: 0x95A5A6, emoji: '🌎' },
  headset: { color: 0x9B59B6, emoji: '🥽' },
  games:   { color: 0x3498DB, emoji: '🎮' },
  alerts:  { color: 0xE67E22, emoji: '🔔' }
};

// Canales donde los miembros normales NO pueden publicar enlaces.
// Fotos/clips, memes, setups/accesorios y ayuda VR sí permiten enlaces.
const LINK_BLOCKED_CHANNELS = new Set([
  '💬・general','🎮・busca-equipo','💡・sugerencias',
  '🥽・charla-vr','🎮・juegos-vr','📰・noticias-vr',
  '💬・exfilzone','🤝・busca-squad','⭐・super-fans'
]);

const ROLE_GROUPS = {
  country: {
    placeholder: '🌎 Elige tu país', min: 1, max: 1,
    roles: [
      ['🇲🇽 México','México'],['🇦🇷 Argentina','Argentina'],['🇨🇴 Colombia','Colombia'],
      ['🇨🇱 Chile','Chile'],['🇵🇪 Perú','Perú'],['🇪🇨 Ecuador','Ecuador'],
      ['🇻🇪 Venezuela','Venezuela'],['🇺🇾 Uruguay','Uruguay'],['🇵🇾 Paraguay','Paraguay'],
      ['🇧🇴 Bolivia','Bolivia'],['🇨🇷 Costa Rica','Costa Rica'],['🇬🇹 Guatemala','Guatemala'],
      ['🇸🇻 El Salvador','El Salvador'],['🇭🇳 Honduras','Honduras'],['🇵🇦 Panamá','Panamá'],
      ['🇩🇴 República Dominicana','República Dominicana'],['🇵🇷 Puerto Rico','Puerto Rico'],
      ['🇪🇸 España','España'],['🌎 Otro','Otro país']
    ]
  },
  headset: {
    placeholder: '🥽 ¿Qué visor VR tienes?', min: 0, max: 3,
    roles: [
      ['Meta Quest 3S','Quest 3S'],['Meta Quest 3','Quest 3'],['Meta Quest 2','Quest 2'],
      ['PICO','PICO'],['PS VR2','PS VR2'],['PCVR','PCVR'],['Otro VR','Otro VR'],
      ['Aún no tengo VR','Sin VR']
    ]
  },
  games: {
    placeholder: '🎮 ¿Qué juegas?', min: 0, max: 9,
    roles: [
      ['ExfilZone','ExfilZone'],['Contractors Showdown','Contractors Showdown'],
      ['Ghosts of Tabor','Ghosts of Tabor'],['Breachers','Breachers'],['Gorilla Tag','Gorilla Tag'],
      ['Beat Saber','Beat Saber'],['Juegos de terror','Terror VR'],['Sim Racing','Sim Racing'],['Otros VR','Otros VR']
    ]
  },
  alerts: {
    placeholder: '🔔 ¿Qué avisos quieres?', min: 0, max: 5,
    roles: [
      ['🔴 Directos','Directos'],['🎬 Nuevos videos','Nuevos videos'],['🎁 Sorteos','Sorteos'],
      ['🎮 Eventos','Eventos'],['🥽 Noticias VR','Noticias VR']
    ]
  }
};

const commandData = [
  new SlashCommandBuilder().setName('setup').setDescription('Crea o actualiza la estructura del servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('panelroles').setDescription('Publica el panel de autoroles.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('ticket').setDescription('Publica el panel para abrir tickets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('sorteo').setDescription('Crea un sorteo.')
    .addStringOption(o=>o.setName('premio').setDescription('Premio').setRequired(true))
    .addIntegerOption(o=>o.setName('minutos').setDescription('Duración en minutos').setRequired(true).setMinValue(1).setMaxValue(10080))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('encuesta').setDescription('Crea una encuesta rápida.')
    .addStringOption(o=>o.setName('pregunta').setDescription('Pregunta').setRequired(true))
    .addStringOption(o=>o.setName('opcion1').setDescription('Opción 1').setRequired(true))
    .addStringOption(o=>o.setName('opcion2').setDescription('Opción 2').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('publicar').setDescription('Anuncia un video/publicación.')
    .addStringOption(o=>o.setName('plataforma').setDescription('TikTok, YouTube, Instagram...').setRequired(true))
    .addStringOption(o=>o.setName('titulo').setDescription('Título').setRequired(true))
    .addStringOption(o=>o.setName('url').setDescription('Enlace').setRequired(true))
    .addStringOption(o=>o.setName('mensaje').setDescription('Texto extra').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('timeout').setDescription('Silencia temporalmente a un usuario.')
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addIntegerOption(o=>o.setName('minutos').setDescription('Minutos').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o=>o.setName('razon').setDescription('Razón').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('kick').setDescription('Expulsa a un usuario.')
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('Banea a un usuario.')
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
].map(c=>c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandData });
}

async function role(guild, name, options={}) {
  let r = guild.roles.cache.find(x=>x.name===name);
  if (!r) {
    r = await guild.roles.create({ name, ...options, reason:'AlanVR Bot setup' });
  } else if (Object.keys(options).length) {
    // Actualiza roles existentes sin borrarlos ni quitar miembros.
    await r.edit({ ...options, reason:'AlanVR Bot update' }).catch(e=>console.warn(`No pude actualizar rol ${name}:`, e.message));
  }
  return r;
}

async function category(guild, name) {
  let c = guild.channels.cache.find(x=>x.type===ChannelType.GuildCategory && x.name===name);
  if (!c) c = await guild.channels.create({ name, type:ChannelType.GuildCategory });
  return c;
}

async function channel(guild, name, type, parent, permissionOverwrites) {
  let c = guild.channels.cache.find(x=>x.name===name && x.parentId===parent.id);
  if (!c) {
    c = await guild.channels.create({ name, type, parent:parent.id, permissionOverwrites });
  } else if (permissionOverwrites) {
    // IMPORTANTE: /setup también corrige permisos de canales que ya existen.
    await c.permissionOverwrites.set(permissionOverwrites, 'AlanVR Bot permission update').catch(e=>console.warn(`No pude actualizar permisos de ${name}:`, e.message));
  }
  return c;
}

async function buildServer(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const everyone = guild.roles.everyone;

  const alan = await role(guild,'👑 Alan', MAIN_ROLE_STYLE['👑 Alan']);
  const admin = await role(guild,'🛡️ Administrador',{
    ...MAIN_ROLE_STYLE['🛡️ Administrador'],
    permissions:[PermissionFlagsBits.Administrator]
  });
  const mod = await role(guild,'🔨 Moderador',{
    ...MAIN_ROLE_STYLE['🔨 Moderador'],
    permissions:[
      PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.KickMembers, PermissionFlagsBits.ViewAuditLog
    ]
  });
  await role(guild,'🎥 Creador de contenido', MAIN_ROLE_STYLE['🎥 Creador de contenido']);
  await role(guild,'🤝 Colaborador', MAIN_ROLE_STYLE['🤝 Colaborador']);
  const superFan = await role(guild,'⭐ Super Fan', MAIN_ROLE_STYLE['⭐ Super Fan']);
  for (const [groupKey, group] of Object.entries(ROLE_GROUPS)) {
    const style = AUTOROLE_STYLE[groupKey];
    for (const [name] of group.roles) {
      const opts = { color: style.color };
      // Si Discord permite iconos de rol, usa un icono Unicode por grupo.
      if (guild.features.includes('ROLE_ICONS')) opts.unicodeEmoji = style.emoji;
      await role(guild, name, opts);
    }
  }

  const info = await category(guild,'📌 INFORMACIÓN');
  const community = await category(guild,'💬 COMUNIDAD');
  const vr = await category(guild,'🥽 REALIDAD VIRTUAL');
  const exfil = await category(guild,'🔫 EXFILZONE');
  const sf = await category(guild,'⭐ SUPER FANS');
  const voice = await category(guild,'🔊 VOZ');
  const staff = await category(guild,'🔒 STAFF');

  const readOnly = [
    {id:everyone.id,deny:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.MentionEveryone],allow:[PermissionFlagsBits.ViewChannel]},
    {id:alan.id,allow:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ViewChannel]},
    {id:admin.id,allow:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ViewChannel]},
    {id:mod.id,allow:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ViewChannel]}
  ];

  const textOnly = [
    {id:everyone.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory],deny:[PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.MentionEveryone]},
    {id:alan.id,allow:[PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:admin.id,allow:[PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:mod.id,allow:[PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]}
  ];

  const mediaAllowed = [
    {id:everyone.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks],deny:[PermissionFlagsBits.MentionEveryone]}
  ];

  const botPanel = [
    {id:everyone.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory],deny:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.MentionEveryone]},
    {id:alan.id,allow:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:admin.id,allow:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:mod.id,allow:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]}
  ];

  // Información / avisos: sorteos queda junto a anuncios y contenido.
  const infoChannels = [];
  infoChannels.push(await channel(guild,'👋・bienvenida',ChannelType.GuildText,info,readOnly));
  infoChannels.push(await channel(guild,'📜・reglas',ChannelType.GuildText,info,readOnly));
  infoChannels.push(await channel(guild,'📢・anuncios',ChannelType.GuildText,info,readOnly));
  infoChannels.push(await channel(guild,'🎁・sorteos',ChannelType.GuildText,info,botPanel));
  infoChannels.push(await channel(guild,'🔴・directos-y-videos',ChannelType.GuildText,info,readOnly));
  infoChannels.push(await channel(guild,'🎭・elige-tus-roles',ChannelType.GuildText,info,botPanel));
  for (let i=0; i<infoChannels.length; i++) {
    await infoChannels[i].setPosition(i).catch(()=>{});
  }

  // Comunidad: general/busca-equipo/sugerencias = texto; fotos/memes = multimedia.
  await channel(guild,'💬・general',ChannelType.GuildText,community,textOnly);
  await channel(guild,'📸・fotos-y-clips',ChannelType.GuildText,community,mediaAllowed);
  await channel(guild,'😂・memes',ChannelType.GuildText,community,mediaAllowed);
  await channel(guild,'🎮・busca-equipo',ChannelType.GuildText,community,textOnly);
  await channel(guild,'💡・sugerencias',ChannelType.GuildText,community,textOnly);

  // VR: ayuda y setups permiten capturas/enlaces; el resto es principalmente conversación.
  await channel(guild,'🥽・charla-vr',ChannelType.GuildText,vr,textOnly);
  await channel(guild,'❓・ayuda-vr',ChannelType.GuildText,vr,mediaAllowed);
  await channel(guild,'🎮・juegos-vr',ChannelType.GuildText,vr,textOnly);
  await channel(guild,'🛠️・setups-y-accesorios',ChannelType.GuildText,vr,mediaAllowed);
  await channel(guild,'📰・noticias-vr',ChannelType.GuildText,vr,textOnly);

  await channel(guild,'💬・exfilzone',ChannelType.GuildText,exfil,textOnly);
  await channel(guild,'🤝・busca-squad',ChannelType.GuildText,exfil,textOnly);
  await channel(guild,'📸・clips-exfil',ChannelType.GuildText,exfil,mediaAllowed);

  const sfChat = [
    {id:everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:superFan.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory],deny:[PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.MentionEveryone]},
    {id:alan.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:admin.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:mod.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]}
  ];
  const sfAnnouncement = [
    {id:everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:superFan.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory],deny:[PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:alan.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:admin.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    {id:mod.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]}
  ];
  const sfVoice = [
    {id:everyone.id,deny:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
    {id:superFan.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]},
    {id:alan.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]},
    {id:admin.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]},
    {id:mod.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]}
  ];
  await channel(guild,'⭐・super-fans',ChannelType.GuildText,sf,sfChat);
  for (const n of ['👀・adelantos','🗳️・votaciones']) await channel(guild,n,ChannelType.GuildText,sf,sfAnnouncement);
  // v3: los sorteos son generales y viven en 📌 INFORMACIÓN. Si existe el canal viejo de Super Fans, se elimina.
  const oldSuperFanGiveaway = guild.channels.cache.find(c=>c.name==='🎁・sorteos-super-fans' && c.parentId===sf.id);
  if (oldSuperFanGiveaway) await oldSuperFanGiveaway.delete('v3: sorteos movidos al canal general de avisos').catch(()=>{});
  await channel(guild,'⭐・Sala Super Fans',ChannelType.GuildVoice,sf,sfVoice);

  for (const n of ['🔊・General','🥽・Jugando VR','🔫・ExfilZone','➕・Crear sala','💤・AFK']) await channel(guild,n,ChannelType.GuildVoice,voice);

  const staffPerms = [
    {id:everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:alan.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]},
    {id:admin.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]},
    {id:mod.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]}
  ];
  for (const n of ['🛡️・staff','📋・moderación','🤝・colaboraciones','🧾・logs']) await channel(guild,n,ChannelType.GuildText,staff,staffPerms);

  const welcome = guild.channels.cache.find(c=>c.name==='👋・bienvenida');
  if (welcome) {
    const recent = await welcome.messages.fetch({limit:15}).catch(()=>null);
    if (!recent?.some(m=>m.author.id===client.user.id && m.content.includes('Bienvenido a AlanTorresVR'))) {
      await welcome.send('👋 **Bienvenido a AlanTorresVR | Comunidad VR**\n\nLee `📜・reglas`, elige tus roles en `🎭・elige-tus-roles` y pásate por `💬・general`.\n\n🥽 Tengas visor o todavía estés entrando al mundo VR, aquí eres bienvenido.');
    }
  }

  await publishRolePanel(guild,true);
  await publishTicketPanel(guild,true);
}

async function publishRolePanel(guild, onlyIfMissing=false) {
  const ch = guild.channels.cache.find(c=>c.name==='🎭・elige-tus-roles');
  if (!ch) return;
  const recent = await ch.messages.fetch({limit:25}).catch(()=>null);
  if (onlyIfMissing && recent?.some(m=>m.author.id===client.user.id && m.content.includes('PERSONALIZA TU PERFIL'))) return;

  const rows=[];
  for (const [key,group] of Object.entries(ROLE_GROUPS)) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`roles:${key}`).setPlaceholder(group.placeholder)
      .setMinValues(group.min).setMaxValues(group.max)
      .addOptions(group.roles.map(([label,desc])=>new StringSelectMenuOptionBuilder().setLabel(label).setValue(label).setDescription(desc)));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  await ch.send({content:'🎭 **PERSONALIZA TU PERFIL**\nElige país, visor, juegos y qué avisos quieres recibir. Puedes cambiarlo cuando quieras.',components:rows});
}

async function publishTicketPanel(guild, onlyIfMissing=false) {
  const ch = guild.channels.cache.find(c=>c.name==='❓・ayuda-vr');
  if (!ch) return;
  const recent = await ch.messages.fetch({limit:25}).catch(()=>null);
  if (onlyIfMissing && recent?.some(m=>m.author.id===client.user.id && m.content.includes('NECESITAS AYUDA DEL STAFF'))) return;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:create').setLabel('Abrir ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary));
  await ch.send({content:'🎫 **¿NECESITAS AYUDA DEL STAFF?**\nPulsa el botón para abrir un ticket privado.',components:[row]});
}

async function handleRoleMenu(interaction) {
  const key=interaction.customId.split(':')[1];
  const group=ROLE_GROUPS[key];
  if (!group) return;
  const member=interaction.member;
  const selected=new Set(interaction.values);
  for (const [name] of group.roles) {
    const r=interaction.guild.roles.cache.find(x=>x.name===name);
    if (!r) continue;
    if (selected.has(name) && !member.roles.cache.has(r.id)) await member.roles.add(r).catch(()=>{});
    if (!selected.has(name) && member.roles.cache.has(r.id)) await member.roles.remove(r).catch(()=>{});
  }
  await interaction.reply({content:'✅ Roles actualizados.',ephemeral:true});
}

async function createTicket(interaction) {
  const guild=interaction.guild;
  const existing=guild.channels.cache.find(c=>c.topic===`ticket:${interaction.user.id}`);
  if (existing) return interaction.reply({content:`Ya tienes un ticket abierto: ${existing}`,ephemeral:true});
  const staffCat=guild.channels.cache.find(c=>c.name==='🔒 STAFF');
  const admin=guild.roles.cache.find(r=>r.name==='🛡️ Administrador');
  const mod=guild.roles.cache.find(r=>r.name==='🔨 Moderador');
  const perms=[
    {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]}
  ];
  if(admin) perms.push({id:admin.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});
  if(mod) perms.push({id:mod.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});
  const safeName=interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,70) || interaction.user.id;
  const c=await guild.channels.create({name:`ticket-${safeName}`,type:ChannelType.GuildText,parent:staffCat?.id,topic:`ticket:${interaction.user.id}`,permissionOverwrites:perms});
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel('Cerrar ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
  await c.send({content:`🎫 Ticket de ${interaction.user}\nCuéntanos qué necesitas.`,components:[row]});
  await interaction.reply({content:`✅ Ticket creado: ${c}`,ephemeral:true});
}

async function announceContent(guild,{platform,title,url,message=''}) {
  const ch=guild.channels.cache.find(c=>c.name==='🔴・directos-y-videos');
  if(!ch) return false;
  const notifyRole=guild.roles.cache.find(r=>r.name==='🎬 Nuevos videos');
  const embed=new EmbedBuilder().setTitle(title).setURL(url).setDescription(message || `Nuevo contenido en ${platform}.`).setFooter({text:`AlanTorresVR • ${platform}`}).setTimestamp();
  await ch.send({content:`${notifyRole?`<@&${notifyRole.id}> `:''}🎬 **Nuevo contenido en ${platform}!**`,embeds:[embed]});
  return true;
}

async function checkYouTube() {
  if(!YOUTUBE_CHANNEL_ID) return;
  try {
    const feed=await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(YOUTUBE_CHANNEL_ID)}`);
    const item=feed.items?.[0];
    if(!item) return;
    const videoId=item.id || item.link;
    if(!lastYoutubeVideoId){lastYoutubeVideoId=videoId;return;}
    if(videoId!==lastYoutubeVideoId){
      lastYoutubeVideoId=videoId;
      const guild=await client.guilds.fetch(GUILD_ID);
      await guild.channels.fetch(); await guild.roles.fetch();
      await announceContent(guild,{platform:'YouTube',title:item.title || 'Nuevo video',url:item.link,message:'¡Ya hay nuevo video!'});
    }
  } catch(e){ console.error('YouTube RSS:',e.message); }
}

async function logAction(guild,text){
  const ch=guild.channels.cache.find(c=>c.name==='🧾・logs');
  if(ch) await ch.send(text).catch(()=>{});
}

client.once(Events.ClientReady,async c=>{
  console.log(`✅ ${c.user.tag} conectado.`);
  await registerCommands();
  await checkYouTube();
  setInterval(checkYouTube,3*60*1000);
});

client.on(Events.GuildMemberAdd,async member=>{
  const ch=member.guild.channels.cache.find(c=>c.name==='👋・bienvenida');
  const rolesCh=member.guild.channels.cache.find(c=>c.name==='🎭・elige-tus-roles');
  if(ch) await ch.send(`👋 ¡Bienvenido/a ${member} a **AlanTorresVR | Comunidad VR**! ${rolesCh?`Pasa por ${rolesCh} para elegir tus roles.`:''}`);
});

client.on(Events.VoiceStateUpdate,async(oldState,newState)=>{
  const guild=newState.guild;
  const create=guild.channels.cache.find(c=>c.name==='➕・Crear sala');
  if(create && newState.channelId===create.id && newState.member){
    const c=await guild.channels.create({
      name:`🔊 ${newState.member.displayName}`.slice(0,100),type:ChannelType.GuildVoice,parent:create.parentId,
      permissionOverwrites:[{id:newState.member.id,allow:[PermissionFlagsBits.ManageChannels,PermissionFlagsBits.MoveMembers]}]
    });
    tempVoiceChannels.add(c.id);
    await newState.member.voice.setChannel(c).catch(()=>{});
  }
  if(oldState.channelId && tempVoiceChannels.has(oldState.channelId)){
    const oldCh=guild.channels.cache.get(oldState.channelId);
    if(oldCh && oldCh.members.size===0){ tempVoiceChannels.delete(oldCh.id); await oldCh.delete('Sala temporal vacía').catch(()=>{}); }
  }
});

client.on(Events.InteractionCreate,async interaction=>{
  try{
    if(interaction.isStringSelectMenu() && interaction.customId.startsWith('roles:')) return handleRoleMenu(interaction);

    if(interaction.isButton()){
      if(interaction.customId==='ticket:create') return createTicket(interaction);
      if(interaction.customId==='ticket:close'){
        await interaction.reply({content:'🔒 Cerrando ticket...',ephemeral:true});
        setTimeout(()=>interaction.channel.delete('Ticket cerrado').catch(()=>{}),1200);
        return;
      }
      if(interaction.customId.startsWith('giveaway:')){
        const id=interaction.customId.split(':')[1];
        const g=giveaways.get(id);
        if(!g) return interaction.reply({content:'Este sorteo ya terminó.',ephemeral:true});
        g.participants.add(interaction.user.id);
        await interaction.reply({content:'🎉 Ya estás participando.',ephemeral:true});
        return;
      }
    }

    if(!interaction.isChatInputCommand()) return;

    if(interaction.commandName==='setup'){
      await interaction.deferReply({ephemeral:true});
      await buildServer(interaction.guild);
      return interaction.editReply('✅ Servidor creado/actualizado. El setup reutiliza lo que ya existe para evitar duplicados.');
    }
    if(interaction.commandName==='panelroles'){
      await publishRolePanel(interaction.guild,false);
      return interaction.reply({content:'✅ Panel publicado.',ephemeral:true});
    }
    if(interaction.commandName==='ticket'){
      await publishTicketPanel(interaction.guild,false);
      return interaction.reply({content:'✅ Panel de tickets publicado.',ephemeral:true});
    }
    if(interaction.commandName==='encuesta'){
      const q=interaction.options.getString('pregunta');
      const a=interaction.options.getString('opcion1');
      const b=interaction.options.getString('opcion2');
      const embed=new EmbedBuilder().setTitle(`📊 ${q}`).setDescription(`1️⃣ ${a}\n\n2️⃣ ${b}`).setTimestamp();
      const msg=await interaction.channel.send({embeds:[embed]});
      await msg.react('1️⃣'); await msg.react('2️⃣');
      return interaction.reply({content:'✅ Encuesta publicada.',ephemeral:true});
    }
    if(interaction.commandName==='publicar'){
      await announceContent(interaction.guild,{
        platform:interaction.options.getString('plataforma'),
        title:interaction.options.getString('titulo'),
        url:interaction.options.getString('url'),
        message:interaction.options.getString('mensaje') || ''
      });
      return interaction.reply({content:'✅ Publicación anunciada.',ephemeral:true});
    }
    if(interaction.commandName==='sorteo'){
      const prize=interaction.options.getString('premio');
      const minutes=interaction.options.getInteger('minutos');
      const id=Date.now().toString(36);
      const end=Date.now()+minutes*60000;
      const participants=new Set();
      giveaways.set(id,{participants});
      const embed=new EmbedBuilder().setTitle(`🎁 SORTEO: ${prize}`).setDescription(`Pulsa **Participar**.\nTermina <t:${Math.floor(end/1000)}:R>.`).setTimestamp();
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway:${id}`).setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Success));
      const msg=await interaction.channel.send({embeds:[embed],components:[row]});
      await interaction.reply({content:'✅ Sorteo creado.',ephemeral:true});
      setTimeout(async()=>{
        const g=giveaways.get(id); giveaways.delete(id);
        const ids=[...(g?.participants || [])];
        const winner=ids.length?ids[Math.floor(Math.random()*ids.length)]:null;
        const ended=EmbedBuilder.from(embed).setDescription(winner?`🏆 Ganador: <@${winner}>\nParticipantes: ${ids.length}`:'Terminó sin participantes.');
        await msg.edit({embeds:[ended],components:[]}).catch(()=>{});
      },minutes*60000);
      return;
    }
    if(['timeout','kick','ban'].includes(interaction.commandName)){
      const user=interaction.options.getUser('usuario');
      const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
      const reason=interaction.options.getString('razon') || 'Sin razón especificada';
      if(!member) return interaction.reply({content:'No encontré a ese miembro.',ephemeral:true});
      if(interaction.commandName==='timeout'){
        const min=interaction.options.getInteger('minutos');
        await member.timeout(min*60000,reason);
        await logAction(interaction.guild,`⏱️ ${user.tag} recibió timeout de ${min} min por ${interaction.user.tag}. Razón: ${reason}`);
      }else if(interaction.commandName==='kick'){
        await member.kick(reason);
        await logAction(interaction.guild,`👢 ${user.tag} fue expulsado por ${interaction.user.tag}. Razón: ${reason}`);
      }else{
        await member.ban({reason});
        await logAction(interaction.guild,`🔨 ${user.tag} fue baneado por ${interaction.user.tag}. Razón: ${reason}`);
      }
      return interaction.reply({content:'✅ Acción aplicada.',ephemeral:true});
    }
  }catch(e){
    console.error(e);
    if(interaction.isRepliable()){
      const payload={content:`❌ Error: ${e.message}`,ephemeral:true};
      if(interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(()=>{});
      else await interaction.reply(payload).catch(()=>{});
    }
  }
});

const app=express();
app.use(express.json({limit:'64kb'}));
app.get('/health',(req,res)=>res.json({ok:true,bot:client.user?.tag || 'starting'}));
app.post('/notify',async(req,res)=>{
  if(!WEBHOOK_SECRET || req.headers.authorization!==`Bearer ${WEBHOOK_SECRET}`) return res.status(401).json({ok:false,error:'Unauthorized'});
  const {platform,title,url,message}=req.body || {};
  if(!platform || !title || !url) return res.status(400).json({ok:false,error:'platform, title y url son obligatorios'});
  try{
    const guild=await client.guilds.fetch(GUILD_ID);
    await guild.channels.fetch(); await guild.roles.fetch();
    const ok=await announceContent(guild,{platform,title,url,message});
    res.json({ok});
  }catch(e){ res.status(500).json({ok:false,error:e.message}); }
});
app.listen(PORT,()=>console.log(`🌐 Webhook escuchando en puerto ${PORT}`));

client.login(TOKEN);

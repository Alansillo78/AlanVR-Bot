import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

const activeGiveaways = new Map();
const BUTTON_ID = 'giveaway_join_v1';

function formatDuration(ms) {
  const totalSeconds = Math.max(1, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, seconds && `${seconds}s`].filter(Boolean).join(' ');
}

function parseDuration(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return null;
  const re = /(\d+)\s*(d|h|m|s)/g;
  let match;
  let total = 0;
  let consumed = '';
  while ((match = re.exec(text))) {
    consumed += match[0];
    const value = Number(match[1]);
    const unit = match[2];
    total += value * ({ d: 86400000, h: 3600000, m: 60000, s: 1000 }[unit]);
  }
  const compactOriginal = text.replace(/\s+/g, '');
  const compactConsumed = consumed.replace(/\s+/g, '');
  if (!total || compactConsumed !== compactOriginal) return null;
  return total;
}

function giveawayEmbed(data, ended = false) {
  const embed = new EmbedBuilder()
    .setColor(0x8E44AD)
    .setTitle(ended ? '🎉 Sorteo finalizado' : '🎁 ¡NUEVO SORTEO!')
    .setDescription(`**Premio:** ${data.prize}`)
    .addFields(
      { name: '🏆 Ganadores', value: String(data.winners), inline: true },
      { name: '👥 Participantes', value: String(data.participants.size), inline: true },
      { name: ended ? '✅ Estado' : '⏳ Termina', value: ended ? 'Finalizado' : `<t:${Math.floor(data.endsAt / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: 'AlanTorresVR • Sorteos' })
    .setTimestamp();
  if (!ended) embed.addFields({ name: 'Cómo participar', value: 'Pulsa el botón **🎉 Participar**. Puedes volver a pulsarlo para salir del sorteo.' });
  return embed;
}

function row(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BUTTON_ID).setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Primary).setDisabled(disabled)
  );
}

function chooseWinners(participants, count) {
  const pool = [...participants];
  const picked = [];
  while (pool.length && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

async function finishGiveaway(messageId) {
  const data = activeGiveaways.get(messageId);
  if (!data || data.ended) return;
  data.ended = true;
  if (data.timer) clearTimeout(data.timer);

  const winners = chooseWinners(data.participants, data.winners);
  const message = await data.channel.messages.fetch(messageId).catch(() => null);
  if (message) await message.edit({ embeds: [giveawayEmbed(data, true)], components: [row(true)] }).catch(() => {});

  if (!winners.length) {
    await data.channel.send(`🎁 El sorteo de **${data.prize}** terminó, pero no hubo participantes.`).catch(() => {});
  } else {
    await data.channel.send(`🎉 **¡SORTEO FINALIZADO!**\nPremio: **${data.prize}**\n${winners.length === 1 ? 'Ganador' : 'Ganadores'}: ${winners.map(id => `<@${id}>`).join(', ')}`).catch(() => {});
  }
}

export function giveawayCommands(SlashCommandBuilder, PermissionFlagsBits) {
  return [
    new SlashCommandBuilder()
      .setName('sorteo')
      .setDescription('Crea un sorteo con botón para participar.')
      .addStringOption(o => o.setName('premio').setDescription('Premio del sorteo').setRequired(true).setMaxLength(200))
      .addStringOption(o => o.setName('duracion').setDescription('Ejemplos: 30m, 2h, 1d12h').setRequired(true).setMaxLength(30))
      .addIntegerOption(o => o.setName('ganadores').setDescription('Número de ganadores').setRequired(false).setMinValue(1).setMaxValue(20))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName('reroll')
      .setDescription('Elige de nuevo ganador(es) de un sorteo terminado.')
      .addStringOption(o => o.setName('mensaje_id').setDescription('ID del mensaje original del sorteo').setRequired(true))
      .addIntegerOption(o => o.setName('ganadores').setDescription('Número de nuevos ganadores').setRequired(false).setMinValue(1).setMaxValue(20))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  ];
}

export async function handleGiveawayInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === BUTTON_ID) {
    const data = activeGiveaways.get(interaction.message.id);
    if (!data || data.ended) return interaction.reply({ content: '❌ Este sorteo ya terminó.', ephemeral: true });
    const userId = interaction.user.id;
    let joined;
    if (data.participants.has(userId)) {
      data.participants.delete(userId);
      joined = false;
    } else {
      data.participants.add(userId);
      joined = true;
    }
    await interaction.update({ embeds: [giveawayEmbed(data, false)], components: [row(false)] });
    return interaction.followUp({ content: joined ? '🎉 Ya estás participando.' : '✅ Saliste del sorteo.', ephemeral: true });
  }

  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === 'sorteo') {
    const duration = parseDuration(interaction.options.getString('duracion'));
    if (!duration || duration < 10000) return interaction.reply({ content: '❌ Duración inválida. Usa algo como `30m`, `2h`, `1d12h`. Mínimo: 10 segundos.', ephemeral: true });
    if (duration > 2592000000) return interaction.reply({ content: '❌ La duración máxima es de 30 días.', ephemeral: true });

    const prize = interaction.options.getString('premio');
    const winners = interaction.options.getInteger('ganadores') || 1;
    const giveawayChannel = interaction.guild.channels.cache.find(c => c.name === '🎁・sorteos' && c.isTextBased()) || interaction.channel;
    const data = { prize, winners, participants: new Set(), endsAt: Date.now() + duration, channel: giveawayChannel, ended: false, timer: null };
    const message = await giveawayChannel.send({ embeds: [giveawayEmbed(data, false)], components: [row(false)] });
    data.timer = setTimeout(() => finishGiveaway(message.id).catch(console.error), duration);
    activeGiveaways.set(message.id, data);
    return interaction.reply({ content: `✅ Sorteo creado en ${giveawayChannel}. Duración: ${formatDuration(duration)}.\nID del sorteo: \`${message.id}\``, ephemeral: true });
  }

  if (interaction.commandName === 'reroll') {
    const messageId = interaction.options.getString('mensaje_id');
    const data = activeGiveaways.get(messageId);
    if (!data) return interaction.reply({ content: '❌ No tengo ese sorteo en memoria. `/reroll` funciona para sorteos creados desde el último reinicio del bot.', ephemeral: true });
    if (!data.ended) return interaction.reply({ content: '❌ Ese sorteo todavía no ha terminado.', ephemeral: true });
    const count = interaction.options.getInteger('ganadores') || data.winners;
    const winners = chooseWinners(data.participants, count);
    if (!winners.length) return interaction.reply({ content: '❌ Ese sorteo no tuvo participantes.', ephemeral: true });
    await data.channel.send(`🔄 **REROLL — ${data.prize}**\n${winners.length === 1 ? 'Nuevo ganador' : 'Nuevos ganadores'}: ${winners.map(id => `<@${id}>`).join(', ')}`);
    return interaction.reply({ content: '✅ Reroll realizado.', ephemeral: true });
  }

  return false;
}

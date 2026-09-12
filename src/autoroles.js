import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Events } from 'discord.js';

const CHANNEL_NAME = '🎭・elige-tus-roles';
const ROLE_NAME = '🤝 Patrocinadores';
const BUTTON_ID = 'autorole_patrocinadores';
const FOOTER_MARKER = 'AlanTorresVR • Autoroles de avisos';

export async function setupSponsorAutorole(client) {
  client.once(Events.ClientReady, async () => {
    try {
      const guildId = process.env.GUILD_ID;
      if (!guildId) return console.warn('⚠️ GUILD_ID no configurado para autoroles.');

      const guild = await client.guilds.fetch(guildId);
      await guild.roles.fetch();
      await guild.channels.fetch();

      let role = guild.roles.cache.find(r => r.name === ROLE_NAME);
      if (!role) {
        role = await guild.roles.create({
          name: ROLE_NAME,
          mentionable: true,
          reason: 'Autorol de avisos de patrocinadores solicitado por Alan'
        });
        console.log(`✅ Rol creado: ${ROLE_NAME}`);
      }

      const channel = guild.channels.cache.find(
        c => c.name === CHANNEL_NAME && c.type === ChannelType.GuildText
      );
      if (!channel) {
        console.warn(`⚠️ No encontré #${CHANNEL_NAME}; no se publicó el autorol.`);
        return;
      }

      const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      const existing = recent?.find(m =>
        m.author.id === client.user.id &&
        m.embeds.some(e => e.footer?.text === FOOTER_MARKER)
      );

      const embed = new EmbedBuilder()
        .setColor(0x8E44AD)
        .setTitle('🔔 Avisos de patrocinadores')
        .setDescription(
          'Activa este rol si quieres recibir avisos cuando haya **nuevos productos, promociones o novedades de los patrocinadores del canal**.\n\n' +
          'Puedes activarlo o quitarlo cuando quieras usando el botón de abajo.'
        )
        .setFooter({ text: FOOTER_MARKER });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(BUTTON_ID)
          .setLabel('Patrocinadores')
          .setEmoji('🤝')
          .setStyle(ButtonStyle.Secondary)
      );

      if (existing) {
        await existing.edit({ embeds: [embed], components: [row] });
        console.log('✅ Autorol de patrocinadores actualizado sin duplicar mensaje.');
      } else {
        await channel.send({ embeds: [embed], components: [row] });
        console.log('✅ Autorol de patrocinadores publicado.');
      }
    } catch (e) {
      console.error('AUTOROLES PATROCINADORES:', e.message);
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || interaction.customId !== BUTTON_ID) return;

    try {
      await interaction.guild.roles.fetch();
      const role = interaction.guild.roles.cache.find(r => r.name === ROLE_NAME);
      if (!role) {
        return interaction.reply({ content: '❌ No encontré el rol de Patrocinadores.', ephemeral: true });
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Autorol de patrocinadores desactivado por el usuario');
        return interaction.reply({ content: '🔕 Ya no recibirás avisos de patrocinadores.', ephemeral: true });
      }

      await member.roles.add(role, 'Autorol de patrocinadores activado por el usuario');
      return interaction.reply({ content: '🔔 ¡Listo! Ahora recibirás avisos de patrocinadores.', ephemeral: true });
    } catch (e) {
      console.error('AUTOROL BUTTON:', e.message);
      if (interaction.isRepliable()) {
        const payload = { content: `❌ No pude cambiar el rol: ${e.message}`, ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
    }
  });
}

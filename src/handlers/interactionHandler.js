// src/handlers/interactionHandler.js
// Routes all button clicks, select menus, and modal submits

const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder,
} = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { Tickets, Messages, Blacklist, StaffStats } = require('../utils/database');
const { isMod, isAdmin } = require('../utils/permissions');
const {
  createTicket, sendOpeningMessage, closeTicket,
  generateTranscript, archiveTicketChannel, logAction, dmUser,
} = require('../utils/ticketService');
const {
  ticketCreated, ticketClosed, ticketInfo, staffNote, logEmbed,
  errorEmbed, successEmbed, infoEmbed, modPanel, adminPanel,
  COLORS, ticketPanel, humanDuration,
} = require('../utils/embeds');

// Import help command for component handling
const helpCmd = require('../commands/help');

module.exports = async function handleInteraction(interaction, client) {
  // ── Modal submits ─────────────────────────────
  if (interaction.isModalSubmit()) {
    return handleModal(interaction, client);
  }

  // ── Button interactions ───────────────────────
  if (interaction.isButton()) {
    // Check if it's a help command button
    if (interaction.customId.startsWith('help_')) {
      return helpCmd.handleComponent(interaction, client);
    }
    return handleButton(interaction, client);
  }

  // ── String select menus ───────────────────────
  if (interaction.isStringSelectMenu()) {
    // Check if it's a help command select menu
    if (interaction.customId.startsWith('help_')) {
      return helpCmd.handleComponent(interaction, client);
    }
    return handleSelect(interaction, client);
  }
};

// ─────────────────────────────────────────────
//  MODAL HANDLER
// ─────────────────────────────────────────────

async function handleModal(interaction, client) {
  const [ns, action, ...rest] = interaction.customId.split(':');

  // Ticket open modal
  if (ns === 'ticket' && action === 'open_modal') {
    const [category, dmFlag] = rest;
    const dmMode = dmFlag === '1' || category === 'staff_report';
    const subject = interaction.fields.getTextInputValue('subject');
    const description = interaction.fields.getTextInputValue('description');

    await interaction.deferReply({ ephemeral: true });

    const { ticket, channelId, error } = await createTicket(
      interaction.guild, interaction.user,
      { category, subject, dmMode, priority: 'normal' }
    );

    if (error) {
      return interaction.editReply({ embeds: [errorEmbed(error)] });
    }

    // Save the initial description as first message
    Messages.add.run({
      ticketId: ticket.id, authorId: interaction.user.id,
      authorName: interaction.user.tag, content: description,
      isStaff: 0, isNote: 0, timestamp: Date.now(),
    });

    if (dmMode) {
      // DM flow
      await handleDMTicket(ticket, interaction.user, description, client, interaction);
    } else {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) {
        await sendOpeningMessage(channel, ticket, interaction.user, client);
        await interaction.editReply({
          embeds: [successEmbed(`Your ticket has been created! → ${channel}`)],
        });
      } else {
        await interaction.editReply({ embeds: [errorEmbed('Ticket channel could not be accessed.')] });
      }

      // Log creation
      await logAction(client, interaction.guildId, logEmbed('open', ticket, interaction.user.id, { Category: category, Subject: subject }));
    }
  }

  // Close reason modal
  if (ns === 'ticket' && action === 'close_reason_modal') {
    const ticketId = rest[0];
    const reason = interaction.fields.getTextInputValue('reason');

    await interaction.deferReply();

    const ticket = Tickets.getById.get(ticketId);
    if (!ticket) return interaction.editReply({ embeds: [errorEmbed('Ticket not found.')] });

    const msgs = Messages.getByTicket.all(ticket.id);
    const transcriptFile = await generateTranscript(ticket, msgs, interaction.guild);
    const { ticket: closed } = await closeTicket(ticket, interaction.user.id, reason, interaction.guild, client);

    await interaction.editReply({ embeds: [ticketClosed(closed, interaction.user.id)], files: [transcriptFile] });
    await dmUser(client, ticket.user_id, ticketClosed(closed, interaction.user.id));
    if (!ticket.dm_mode) await archiveTicketChannel(interaction.channel, interaction.guild);
    await logAction(client, interaction.guildId, logEmbed('close', closed, interaction.user.id, { Reason: reason }));
  }

  // Note modal
  if (ns === 'ticket' && action === 'note_modal') {
    const ticketId = rest[0];
    const content = interaction.fields.getTextInputValue('content');
    const ticket = Tickets.getById.get(ticketId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket not found.')], ephemeral: true });

    Messages.add.run({ ticketId, authorId: interaction.user.id, authorName: interaction.user.tag, content, isStaff: 1, isNote: 1, timestamp: Date.now() });
    await interaction.reply({ embeds: [staffNote(content, interaction.user)] });
  }

  // Priority select modal (uses string select instead)
  if (ns === 'ticket' && action === 'rename_modal') {
    const ticketId = rest[0];
    const name = interaction.fields.getTextInputValue('name').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const ticket = Tickets.getById.get(ticketId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket not found.')], ephemeral: true });
    if (!isMod(interaction.member, interaction.guildId)) {
      return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
    }
    try {
      await interaction.channel.setName(name);
      await interaction.reply({ embeds: [successEmbed(`Renamed to **${name}**`)] });
    } catch {
      await interaction.reply({ embeds: [errorEmbed('Failed to rename.')], ephemeral: true });
    }
  }
}

// ─────────────────────────────────────────────
//  BUTTON HANDLER
// ─────────────────────────────────────────────

async function handleButton(interaction, client) {
  const [ns, action, ticketId] = interaction.customId.split(':');

  // ── Panel buttons ─────────────────────────────
  if (ns === 'panel') {
    if (action === 'my_tickets') {
      const tickets = Tickets.getOpenByUser.all(interaction.user.id, interaction.guildId);
      if (!tickets.length) {
        return interaction.reply({ embeds: [infoEmbed('Your Tickets', 'You have no open tickets.')], ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('📋 Your Open Tickets')
        .setDescription(tickets.map(t => `\`${t.id}\` — **${t.category}** — <t:${Math.floor(t.created_at/1000)}:R>${t.channel_id ? ` — <#${t.channel_id}>` : ''}`).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Category panel button → show modal
    const category = action;
    const dmMode = category === 'staff_report';
    const catName = category.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

    const modal = new ModalBuilder()
      .setCustomId(`ticket:open_modal:${category}:${dmMode ? '1' : '0'}`)
      .setTitle(`New Ticket — ${catName}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('subject').setLabel('Subject')
          .setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)
          .setPlaceholder('Brief description of your issue…'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Details')
          .setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)
          .setPlaceholder('Provide as much detail as possible…'),
      ),
    );

    return interaction.showModal(modal);
  }

  // ── Ticket action buttons ─────────────────────
  if (ns === 'ticket') {
    // All ticket actions require mod — except close which the user can do for their own
    const ticket = ticketId ? Tickets.getById.get(ticketId) : Tickets.getByChannel.get(interaction.channelId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket not found.')], ephemeral: true });

    if (action === 'close') {
      if (!isMod(interaction.member, interaction.guildId) && interaction.user.id !== ticket.user_id) {
        return interaction.reply({ embeds: [errorEmbed('You cannot close this ticket.')], ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId(`ticket:close_reason_modal:${ticket.id}`)
        .setTitle('Close Ticket')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('Reason for closing')
            .setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false)
            .setPlaceholder('Optional reason…'),
        ));
      return interaction.showModal(modal);
    }

    if (action === 'claim') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      Tickets.updateClaimed.run(interaction.user.id, ticket.id);
      StaffStats.upsert.run({ userId: interaction.user.id, guildId: interaction.guildId, now: Date.now() });
      StaffStats.incrementClaimed.run(Date.now(), interaction.user.id, interaction.guildId);
      await interaction.reply({ embeds: [successEmbed(`Ticket claimed by <@${interaction.user.id}>`)] });
      await logAction(client, interaction.guildId, logEmbed('claim', ticket, interaction.user.id));
      return;
    }

    if (action === 'priority') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket:set_priority:${ticket.id}`)
          .setPlaceholder('Select priority…')
          .addOptions([
            { label: '🟢 Low',      value: 'low',      emoji: '🟢' },
            { label: '🔵 Normal',   value: 'normal',   emoji: '🔵' },
            { label: '🟡 High',     value: 'high',     emoji: '🟡' },
            { label: '🔴 Critical', value: 'critical', emoji: '🔴' },
          ]),
      );
      return interaction.reply({ content: 'Select a priority level:', components: [row], ephemeral: true });
    }

    if (action === 'info') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [ticketInfo(ticket, interaction.member)], ephemeral: true });
    }

    if (action === 'note') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId(`ticket:note_modal:${ticket.id}`)
        .setTitle('Add Staff Note')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('content').setLabel('Note content')
            .setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true),
        ));
      return interaction.showModal(modal);
    }

    if (action === 'adduser') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [infoEmbed('Add User', 'Use `/add-user @user` to add a participant.')], ephemeral: true });
    }

    if (action === 'removeuser') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [infoEmbed('Remove User', 'Use `/remove-user @user` to remove a participant.')], ephemeral: true });
    }

    if (action === 'transcript') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const msgs = Messages.getByTicket.all(ticket.id);
      const file = await generateTranscript(ticket, msgs, interaction.guild);
      return interaction.editReply({ content: `📄 Transcript for \`${ticket.id}\``, files: [file] });
    }

    if (action === 'tag') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const { Tags } = require('../utils/database');
      const available = Tags.getAll.all(interaction.guildId);
      if (!available.length) {
        return interaction.reply({ embeds: [infoEmbed('Tags', 'No tags configured. Admins can add them via `/settings`.')], ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket:set_tag:${ticket.id}`)
          .setPlaceholder('Select a tag…')
          .setMinValues(1).setMaxValues(Math.min(available.length, 5))
          .addOptions(available.map(t => ({ label: t.name, value: t.name }))),
      );
      return interaction.reply({ content: 'Select tags to apply:', components: [row], ephemeral: true });
    }

    if (action === 'rename') {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId(`ticket:rename_modal:${ticket.id}`)
        .setTitle('Rename Ticket Channel')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('New channel name')
            .setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)
            .setPlaceholder('e.g. fs22-seasons-crash-report'),
        ));
      return interaction.showModal(modal);
    }
  }

  // ── DM-ticket log buttons (Claim & Reply / Close) ──
  // These live on the notification posted to the staff log channel for
  // private DM tickets (e.g. staff reports). Staff-only.
  if (ns === 'dmticket') {
    if (!isMod(interaction.member, interaction.guildId)) {
      return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
    }

    const ticket = Tickets.getById.get(ticketId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket not found.')], ephemeral: true });
    if (ticket.status !== 'open') {
      return interaction.reply({ embeds: [errorEmbed('This ticket is already closed.')], ephemeral: true });
    }

    if (action === 'claim') {
      if (ticket.claimed_by && ticket.claimed_by !== interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed(`Already claimed by <@${ticket.claimed_by}>.`)], ephemeral: true });
      }

      Tickets.updateClaimed.run(interaction.user.id, ticket.id);
      StaffStats.upsert.run({ userId: interaction.user.id, guildId: interaction.guildId, now: Date.now() });
      StaffStats.incrementClaimed.run(Date.now(), interaction.user.id, interaction.guildId);

      // Mark the log message as claimed (disable claim, keep close)
      const claimedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dmticket:claim:${ticket.id}`).setLabel(`Claimed by ${interaction.user.username}`).setEmoji('✋').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`dmticket:close:${ticket.id}`).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      );
      await interaction.update({ components: [claimedRow] });

      // Tell the claimer how to actually reply (DM relay, not a slash command)
      await interaction.followUp({
        embeds: [infoEmbed(
          'Ticket Claimed',
          `You claimed \`${ticket.id}\` from <@${ticket.user_id}>.\n\n` +
          `To reply, **DM this bot** with the ticket ID followed by your message:\n` +
          `\`\`\`\n${ticket.id} your message here\n\`\`\`\n` +
          `Your reply is relayed privately to the user.`,
        )],
        ephemeral: true,
      });

      await logAction(client, interaction.guildId, logEmbed('claim', ticket, interaction.user.id));
      return;
    }

    if (action === 'close') {
      // Reuse the standard close-reason modal; its submit handler already
      // skips channel archiving for dm_mode tickets and DMs the user.
      const modal = new ModalBuilder()
        .setCustomId(`ticket:close_reason_modal:${ticket.id}`)
        .setTitle('Close DM Ticket')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('Reason for closing')
            .setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false)
            .setPlaceholder('Optional reason…'),
        ));
      return interaction.showModal(modal);
    }
  }

  // ── Mod panel buttons ─────────────────────────
  if (ns === 'modpanel') {
    if (!isMod(interaction.member, interaction.guildId)) {
      return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
    }

    if (action === 'list_open') {
      const open = Tickets.getOpen.all(interaction.guildId);
      if (!open.length) return interaction.reply({ embeds: [infoEmbed('Open Tickets', 'No open tickets! 🎉')], ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`📂 Open Tickets (${open.length})`)
        .setDescription(open.slice(0, 25).map(t =>
          `\`${t.id}\` ${t.claimed_by ? `✋<@${t.claimed_by}>` : '🔴 Unclaimed'} — **${t.category}** — <@${t.user_id}>${t.channel_id ? ` — <#${t.channel_id}>` : ''}`
        ).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === 'list_unclaimed') {
      const open = Tickets.getOpen.all(interaction.guildId).filter(t => !t.claimed_by);
      if (!open.length) return interaction.reply({ embeds: [infoEmbed('Unclaimed', 'All tickets are claimed! ✅')], ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle(`🔴 Unclaimed Tickets (${open.length})`)
        .setDescription(open.slice(0, 25).map(t =>
          `\`${t.id}\` — **${t.category}** — <@${t.user_id}>${t.channel_id ? ` — <#${t.channel_id}>` : ''}`
        ).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === 'refresh') {
      const open = Tickets.getOpen.all(interaction.guildId);
      const unclaimed = open.filter(t => !t.claimed_by).length;
      const today = Date.now() - 86400000;
      const closedToday = Tickets.getAll.all(interaction.guildId)
        .filter(t => t.status === 'closed' && t.closed_at && t.closed_at > today).length;
      await interaction.update({ embeds: [modPanel({ open: open.length, closedToday, unclaimed })] });
      return;
    }

    if (action === 'admin_stats' && isAdmin(interaction.member, interaction.guildId)) {
      const total = Tickets.countTotal.get(interaction.guildId)?.count ?? 0;
      const open  = Tickets.countOpen.get(interaction.guildId)?.count ?? 0;
      const bl    = Blacklist.getAll.all(interaction.guildId).length;
      const top   = StaffStats.getTop.all(interaction.guildId);
      return interaction.reply({
        embeds: [adminPanel({ total, open, closed: total - open, staffActive: top.length, blacklisted: bl, avgClose: 'N/A' })],
        ephemeral: true,
      });
    }

    if (action === 'staff_lb') {
      const top = StaffStats.getTop.all(interaction.guildId);
      if (!top.length) return interaction.reply({ embeds: [infoEmbed('Leaderboard', 'No data yet.')], ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('🏆 Staff Leaderboard')
        .setDescription(top.map((s, i) => `${['🥇','🥈','🥉'][i] || `${i+1}.`} <@${s.user_id}> — **${s.tickets_closed}** closed`).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === 'blacklist' && isAdmin(interaction.member, interaction.guildId)) {
      const list = Blacklist.getAll.all(interaction.guildId);
      if (!list.length) return interaction.reply({ embeds: [infoEmbed('Blacklist', 'Empty.')], ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('🚫 Blacklisted Users')
        .setDescription(list.map(b => `<@${b.user_id}> — ${b.reason || 'No reason'}`).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}

// ─────────────────────────────────────────────
//  SELECT MENU HANDLER
// ─────────────────────────────────────────────

async function handleSelect(interaction, client) {
  const [ns, action, ticketId] = interaction.customId.split(':');

  if (ns === 'ticket') {
    const ticket = ticketId ? Tickets.getById.get(ticketId) : null;

    if (action === 'set_priority' && ticket) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.update({ content: 'Staff only.', components: [] });
      }
      const level = interaction.values[0];
      Tickets.updatePriority.run(level, ticket.id);
      const emoji = { low: '🟢', normal: '🔵', high: '🟡', critical: '🔴' }[level];
      await interaction.update({ content: `Priority set to ${emoji} **${level.toUpperCase()}**`, components: [] });
      await logAction(client, interaction.guildId, logEmbed('priority', ticket, interaction.user.id, { Priority: level }));
    }

    if (action === 'set_tag' && ticket) {
      const tags = interaction.values;
      Tickets.updateTags.run(JSON.stringify(tags), ticket.id);
      await interaction.update({ content: `🏷️ Tags set: **${tags.join(', ')}**`, components: [] });
    }
  }
}

// ─────────────────────────────────────────────
//  DM TICKET FLOW
// ─────────────────────────────────────────────

async function handleDMTicket(ticket, user, description, client, interaction) {
  const { Settings } = require('../utils/database');
  const settings = Settings.get.get(ticket.guild_id) || {};
  const modRoleId = settings.mod_role;

  try {
    // DM the user
    const dmEmbed = ticketCreated(ticket, user.toString());
    await user.send({
      embeds: [dmEmbed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
        ),
      ],
    });

    // Notify mods in log channel
    const guild = await client.guilds.fetch(ticket.guild_id).catch(() => null);
    if (guild) {
      const logChannelId = settings.admin_log_channel || settings.log_channel;
      if (logChannelId) {
        const logCh = await client.channels.fetch(logChannelId).catch(() => null);
        if (logCh) {
          const notifyEmbed = new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle('📬 New DM Ticket (Private)')
            .addFields(
              { name: '🔖 Ticket ID', value: `\`${ticket.id}\``, inline: true },
              { name: '📂 Category', value: ticket.category, inline: true },
              { name: '👤 User', value: `<@${user.id}> (${user.tag})`, inline: false },
              { name: '📝 Subject', value: ticket.subject || 'N/A', inline: false },
              { name: '💬 Initial Message', value: description.slice(0, 500), inline: false },
            )
            .setFooter({ text: `DM ticket — claim below, then DM this bot: ${ticket.id} <message>` });

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dmticket:claim:${ticket.id}`).setLabel('Claim & Reply').setEmoji('✋').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`dmticket:close:${ticket.id}`).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
          );
          await logCh.send({ content: modRoleId ? `<@&${modRoleId}>` : '', embeds: [notifyEmbed], components: [row] });
        }
      }
    }

    await interaction.editReply({
      embeds: [successEmbed('Your private ticket has been created! Check your DMs.')],
    });
  } catch (err) {
    await interaction.editReply({
      embeds: [errorEmbed('Could not open DM ticket. Please ensure your DMs are open.')],
    });
  }
}

// src/commands/ticket-manage.js
// All in-ticket staff commands

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Tickets, Messages, StaffStats } = require('../utils/database');
const { isMod, isAdmin } = require('../utils/permissions');
const { closeTicket, generateTranscript, archiveTicketChannel, logAction, dmUser } = require('../utils/ticketService');
const { ticketClosed, ticketInfo, staffNote, logEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const sub = (name, desc) => new SlashCommandBuilder().setName(name).setDescription(desc);

// ── /close ────────────────────────────────────
const closeCmd = sub('close', 'Close the current ticket')
  .addStringOption(o => o.setName('reason').setDescription('Reason for closing').setRequired(false));

// ── /reopen ───────────────────────────────────
const reopenCmd = sub('reopen', 'Reopen a closed ticket');

// ── /delete ───────────────────────────────────
const deleteCmd = sub('delete', '[Admin] Delete & archive a ticket').addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false));

// ── /transcript ───────────────────────────────
const transcriptCmd = sub('transcript', 'Generate an HTML transcript of this ticket');

// ── /ticket-info ──────────────────────────────
const infoCmd = sub('ticket-info', 'View detailed info about this ticket');

// ── /claim ────────────────────────────────────
const claimCmd = sub('claim', 'Claim this ticket (assign it to yourself)');

// ── /unclaim ──────────────────────────────────
const unclaimCmd = sub('unclaim', 'Unclaim this ticket');

// ── /priority ─────────────────────────────────
const priorityCmd = sub('priority', 'Set the priority of this ticket')
  .addStringOption(o => o.setName('level').setDescription('Priority level').setRequired(true)
    .addChoices(
      { name: '🟢 Low',      value: 'low'      },
      { name: '🔵 Normal',   value: 'normal'   },
      { name: '🟡 High',     value: 'high'     },
      { name: '🔴 Critical', value: 'critical' },
    ));

// ── /add-user ─────────────────────────────────
const addUserCmd = sub('add-user', 'Add a user to this ticket')
  .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true));

// ── /remove-user ──────────────────────────────
const removeUserCmd = sub('remove-user', 'Remove a user from this ticket')
  .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true));

// ── /rename ───────────────────────────────────
const renameCmd = sub('rename', 'Rename this ticket channel')
  .addStringOption(o => o.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(80));

// ── /note ─────────────────────────────────────
const noteCmd = sub('note', 'Add a staff-only internal note')
  .addStringOption(o => o.setName('content').setDescription('Note content').setRequired(true).setMaxLength(500));

// ── Export all commands ───────────────────────
module.exports = {
  // close
  close: {
    data: closeCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('You need the Mod role to close tickets.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found in this channel.')], ephemeral: true });
      if (ticket.status !== 'open') return interaction.reply({ embeds: [errorEmbed('Ticket is already closed.')], ephemeral: true });

      await interaction.deferReply();

      const reason = interaction.options.getString('reason') || 'Closed by staff';
      const msgs = Messages.getByTicket.all(ticket.id);
      const transcriptFile = await generateTranscript(ticket, msgs, interaction.guild);

      const { ticket: closed } = await closeTicket(ticket, interaction.user.id, reason, interaction.guild, interaction.client);

      const closedEmbed = ticketClosed(closed, interaction.user.id);
      await interaction.editReply({ embeds: [closedEmbed], files: [transcriptFile] });

      // Notify user via DM
      await dmUser(interaction.client, ticket.user_id, closedEmbed);

      // Move channel to archive
      await archiveTicketChannel(interaction.channel, interaction.guild);

      // Log
      await logAction(interaction.client, interaction.guildId,
        logEmbed('close', closed, interaction.user.id, { Reason: reason }));
    },
  },

  // reopen
  reopen: {
    data: reopenCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('You need the Mod role.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });
      if (ticket.status === 'open') return interaction.reply({ embeds: [errorEmbed('Ticket is already open.')], ephemeral: true });

      Tickets.updateStatus.run('open', null, null, ticket.id);
      await interaction.reply({ embeds: [successEmbed(`Ticket \`${ticket.id}\` reopened.`)] });
      await logAction(interaction.client, interaction.guildId, logEmbed('reopen', ticket, interaction.user.id));
    },
  },

  // delete
  delete: {
    data: deleteCmd,
    async execute(interaction) {
      if (!isAdmin(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('You need the Admin role.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      await interaction.reply({ embeds: [successEmbed('Ticket will be deleted in 5 seconds...')] });

      const msgs = Messages.getByTicket.all(ticket.id);
      const transcriptFile = await generateTranscript(ticket, msgs, interaction.guild);

      await logAction(interaction.client, interaction.guildId,
        logEmbed('delete', ticket, interaction.user.id, { Reason: interaction.options.getString('reason') || 'N/A' }),
        true // admin log
      );

      // Send transcript to log
      const { Settings } = require('../utils/database');
      const settings = Settings.get.get(interaction.guildId) || {};
      const logChannelId = settings.log_channel;
      if (logChannelId) {
        const logCh = await interaction.client.channels.fetch(logChannelId).catch(() => null);
        if (logCh) await logCh.send({ content: `📄 Transcript for deleted ticket \`${ticket.id}\``, files: [transcriptFile] });
      }

      Tickets.updateStatus.run('deleted', Date.now(), interaction.options.getString('reason') || 'Deleted by admin', ticket.id);

      setTimeout(async () => {
        try { await interaction.channel.delete(); } catch {}
      }, 5000);
    },
  },

  // transcript
  transcript: {
    data: transcriptCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      const msgs = Messages.getByTicket.all(ticket.id);
      const file = await generateTranscript(ticket, msgs, interaction.guild);
      await interaction.editReply({ content: `📄 Transcript for \`${ticket.id}\``, files: [file] });
    },
  },

  // info
  ticketinfo: {
    data: infoCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });
      await interaction.reply({ embeds: [ticketInfo(ticket, interaction.member)], ephemeral: false });
    },
  },

  // claim
  claim: {
    data: claimCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      Tickets.updateClaimed.run(interaction.user.id, ticket.id);
      StaffStats.upsert.run({ userId: interaction.user.id, guildId: interaction.guildId, now: Date.now() });
      StaffStats.incrementClaimed.run(Date.now(), interaction.user.id, interaction.guildId);

      await interaction.reply({ embeds: [successEmbed(`Ticket claimed by <@${interaction.user.id}>`)] });
      await logAction(interaction.client, interaction.guildId, logEmbed('claim', ticket, interaction.user.id));
    },
  },

  // unclaim
  unclaim: {
    data: unclaimCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      Tickets.updateClaimed.run(null, ticket.id);
      await interaction.reply({ embeds: [successEmbed('Ticket unclaimed.')] });
    },
  },

  // priority
  priority: {
    data: priorityCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      const level = interaction.options.getString('level');
      Tickets.updatePriority.run(level, ticket.id);
      const emoji = { low: '🟢', normal: '🔵', high: '🟡', critical: '🔴' }[level];
      await interaction.reply({ embeds: [successEmbed(`Priority set to ${emoji} **${level.toUpperCase()}**`)] });
      // Update channel topic
      try {
        await interaction.channel.setTopic(
          (interaction.channel.topic || '').replace(/Priority: \w+/, `Priority: ${level}`)
        );
      } catch {}
      await logAction(interaction.client, interaction.guildId, logEmbed('priority', ticket, interaction.user.id, { Priority: level }));
    },
  },

  // add-user
  adduser: {
    data: addUserCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      const target = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.create(target.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
      const participants = JSON.parse(ticket.participants || '[]');
      if (!participants.includes(target.id)) participants.push(target.id);
      Tickets.updateParticipants.run(JSON.stringify(participants), ticket.id);
      await interaction.reply({ embeds: [successEmbed(`Added <@${target.id}> to the ticket.`)] });
    },
  },

  // remove-user
  removeuser: {
    data: removeUserCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      const target = interaction.options.getUser('user');
      if (target.id === ticket.user_id) {
        return interaction.reply({ embeds: [errorEmbed("You can't remove the ticket owner.")], ephemeral: true });
      }
      await interaction.channel.permissionOverwrites.delete(target.id).catch(() => {});
      const participants = JSON.parse(ticket.participants || '[]').filter(p => p !== target.id);
      Tickets.updateParticipants.run(JSON.stringify(participants), ticket.id);
      await interaction.reply({ embeds: [successEmbed(`Removed <@${target.id}> from the ticket.`)] });
    },
  },

  // rename
  rename: {
    data: renameCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      const name = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-]/g, '-');
      try {
        await interaction.channel.setName(name);
        await interaction.reply({ embeds: [successEmbed(`Channel renamed to **${name}**`)] });
      } catch {
        await interaction.reply({ embeds: [errorEmbed('Failed to rename. Check my permissions.')], ephemeral: true });
      }
    },
  },

  // note
  note: {
    data: noteCmd,
    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const ticket = Tickets.getByChannel.get(interaction.channelId);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('No ticket found.')], ephemeral: true });

      const content = interaction.options.getString('content');
      const { Messages } = require('../utils/database');
      Messages.add.run({
        ticketId: ticket.id, authorId: interaction.user.id,
        authorName: interaction.user.tag, content, isStaff: 1, isNote: 1,
        timestamp: Date.now(),
      });
      await interaction.reply({ embeds: [staffNote(content, interaction.user)] });
    },
  },
};

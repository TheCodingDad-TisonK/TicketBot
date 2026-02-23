// src/commands/admin.js
// Admin-only commands: panel creation, blacklist, stats, settings, canned responses

const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, EmbedBuilder,
} = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { Blacklist, StaffStats, Tickets, Settings, CannedResponses } = require('../utils/database');
const { isAdmin, isMod } = require('../utils/permissions');
const { ticketPanel, adminPanel, modPanel, errorEmbed, successEmbed, infoEmbed, COLORS } = require('../utils/embeds');

module.exports = {

  // ── /panel ────────────────────────────────────
  panel: {
    data: new SlashCommandBuilder()
      .setName('panel')
      .setDescription('[Admin] Post the ticket panel in a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in').setRequired(false))
      .addStringOption(o => o.setName('title').setDescription('Custom panel title').setRequired(false))
      .addStringOption(o => o.setName('description').setDescription('Custom panel description').setRequired(false)),

    async execute(interaction) {
      if (!isAdmin(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Admin only.')], ephemeral: true });
      }

      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const embed = ticketPanel({
        title: interaction.options.getString('title'),
        description: interaction.options.getString('description'),
      });

      // Row 1: category buttons
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel:bug').setLabel('Bug Report').setEmoji('🐛').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('panel:feature').setLabel('Feature Request').setEmoji('💡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('panel:support').setLabel('General Support').setEmoji('❓').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel:collab').setLabel('Collaboration').setEmoji('🤝').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('panel:testing').setLabel('Mod Testing').setEmoji('🔧').setStyle(ButtonStyle.Primary),
      );

      // Row 2: staff report (DM only) + close own ticket
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel:staff_report').setLabel('Staff Report (Private)').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel:my_tickets').setLabel('My Tickets').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      );

      await channel.send({ embeds: [embed], components: [row1, row2] });
      await interaction.reply({ embeds: [successEmbed(`Panel posted in ${channel}.`)], ephemeral: true });
    },
  },

  // ── /blacklist ────────────────────────────────
  blacklist: {
    data: new SlashCommandBuilder()
      .setName('blacklist')
      .setDescription('[Admin] Manage ticket blacklist')
      .addSubcommand(s => s.setName('add').setDescription('Add user to blacklist')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove user from blacklist')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('View all blacklisted users')),

    async execute(interaction) {
      if (!isAdmin(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Admin only.')], ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason';
        Blacklist.add.run({ userId: user.id, guildId: interaction.guildId, reason, addedBy: interaction.user.id, addedAt: Date.now() });
        return interaction.reply({ embeds: [successEmbed(`<@${user.id}> blacklisted.\n**Reason:** ${reason}`)], ephemeral: true });
      }

      if (sub === 'remove') {
        const user = interaction.options.getUser('user');
        Blacklist.remove.run(user.id, interaction.guildId);
        return interaction.reply({ embeds: [successEmbed(`<@${user.id}> removed from blacklist.`)], ephemeral: true });
      }

      if (sub === 'list') {
        const list = Blacklist.getAll.all(interaction.guildId);
        if (!list.length) return interaction.reply({ embeds: [infoEmbed('Blacklist', 'No blacklisted users.')], ephemeral: true });
        const embed = new EmbedBuilder()
          .setColor(COLORS.danger)
          .setTitle('🚫 Blacklisted Users')
          .setDescription(list.map(b => `<@${b.user_id}> — ${b.reason || 'No reason'} (by <@${b.added_by}>)`).join('\n'))
          .setFooter({ text: `${list.length} user(s)` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    },
  },

  // ── /stats ────────────────────────────────────
  stats: {
    data: new SlashCommandBuilder()
      .setName('stats')
      .setDescription('View ticket statistics')
      .addSubcommand(s => s.setName('server').setDescription('Server-wide ticket stats'))
      .addSubcommand(s => s.setName('staff').setDescription('Top staff leaderboard'))
      .addSubcommand(s => s.setName('user').setDescription("View a user's ticket history")
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(false))),

    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const sub = interaction.options.getSubcommand();

      if (sub === 'server') {
        const total = Tickets.countTotal.get(interaction.guildId)?.count ?? 0;
        const open  = Tickets.countOpen.get(interaction.guildId)?.count ?? 0;
        const bl    = Blacklist.getAll.all(interaction.guildId).length;
        const topStaff = StaffStats.getTop.all(interaction.guildId);

        const embed = adminPanel({
          total, open, closed: total - open,
          staffActive: topStaff.length, blacklisted: bl, avgClose: 'N/A',
        });
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'staff') {
        const top = StaffStats.getTop.all(interaction.guildId);
        if (!top.length) return interaction.editReply({ embeds: [infoEmbed('Staff Stats', 'No data yet.')] });
        const embed = new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle('🏆 Staff Leaderboard')
          .setDescription(top.map((s, i) => {
            const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
            return `${medal} <@${s.user_id}> — **${s.tickets_closed}** closed, **${s.tickets_claimed}** claimed`;
          }).join('\n'))
          .setFooter({ text: 'All time' });
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'user') {
        const target = interaction.options.getUser('user') || interaction.user;
        const tickets = Tickets.getByUser.all(target.id, interaction.guildId);
        const embed = new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle(`📊 Ticket History — ${target.tag}`)
          .setDescription(tickets.length
            ? tickets.slice(0, 20).map(t => `\`${t.id}\` — **${t.category}** — ${t.status} — <t:${Math.floor(t.created_at/1000)}:R>`).join('\n')
            : 'No tickets found.')
          .setFooter({ text: `${tickets.length} total ticket(s)` });
        return interaction.editReply({ embeds: [embed] });
      }
    },
  },

  // ── /settings ─────────────────────────────────
  settings: {
    data: new SlashCommandBuilder()
      .setName('settings')
      .setDescription('[Admin] Configure the ticket bot')
      .addSubcommand(s => s.setName('view').setDescription('View current settings'))
      .addSubcommand(s => s.setName('set').setDescription('Update a setting')
        .addStringOption(o => o.setName('key').setDescription('Setting name').setRequired(true)
          .addChoices(
            { name: 'Ticket Category', value: 'ticket_category' },
            { name: 'Archive Category', value: 'archive_category' },
            { name: 'Log Channel', value: 'log_channel' },
            { name: 'Admin Log Channel', value: 'admin_log_channel' },
            { name: 'Mod Role', value: 'mod_role' },
            { name: 'Admin Role', value: 'admin_role' },
            { name: 'Max Tickets Per User', value: 'max_per_user' },
            { name: 'Auto Close Hours', value: 'auto_close_hours' },
            { name: 'Auto Delete Hours', value: 'auto_delete_hours' },
            { name: 'Welcome Message', value: 'welcome_message' },
            { name: 'Close Message', value: 'close_message' },
          ))
        .addStringOption(o => o.setName('value').setDescription('Value (ID, text, or number)').setRequired(true))),

    async execute(interaction) {
      if (!isAdmin(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Admin only.')], ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();

      if (sub === 'view') {
        const s = Settings.get.get(interaction.guildId) || {};
        const embed = new EmbedBuilder()
          .setColor(COLORS.dark)
          .setTitle('⚙️ Bot Settings')
          .setDescription('Use `/settings set` to configure these values.')
          .addFields(
            { name: '📂 Ticket Category', value: s.ticket_category ? `<#${s.ticket_category}>` : '❌ Not set (required)', inline: true },
            { name: '📦 Archive Category', value: s.archive_category ? `<#${s.archive_category}>` : 'Not set', inline: true },
            { name: '📋 Log Channel', value: s.log_channel ? `<#${s.log_channel}>` : 'Not set', inline: true },
            { name: '🛡️ Admin Log Channel', value: s.admin_log_channel ? `<#${s.admin_log_channel}>` : 'Not set', inline: true },
            { name: '🔧 Mod Role', value: s.mod_role ? `<@&${s.mod_role}>` : 'Not set', inline: true },
            { name: '⚔️ Admin Role', value: s.admin_role ? `<@&${s.admin_role}>` : 'Not set', inline: true },
            { name: '👤 Max Per User', value: String(s.max_per_user ?? 3), inline: true },
            { name: '⏰ Auto Close (hrs)', value: String(s.auto_close_hours ?? 48), inline: true },
            { name: '🗑️ Auto Delete (hrs)', value: String(s.auto_delete_hours ?? 72), inline: true },
            { name: '👋 Welcome Message', value: s.welcome_message ? s.welcome_message.slice(0, 100) : 'Default', inline: false },
            { name: '🔒 Close Message', value: s.close_message ? s.close_message.slice(0, 100) : 'Default', inline: false },
          )
          .setFooter({ text: 'Run /panel to post the ticket panel after configuring settings!' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === 'set') {
        const key   = interaction.options.getString('key');
        const value = interaction.options.getString('value');
        Settings.upsert(interaction.guildId, { [key]: value });
        return interaction.reply({ embeds: [successEmbed(`Setting **${key}** updated to \`${value}\`\n\nUse /settings view to see all settings.`)], ephemeral: true });
      }
    },
  },

  // ── /canned ───────────────────────────────────
  canned: {
    data: new SlashCommandBuilder()
      .setName('canned')
      .setDescription('Manage and use canned (quick) responses')
      .addSubcommand(s => s.setName('add').setDescription('Add a canned response')
        .addStringOption(o => o.setName('name').setDescription('Short trigger name').setRequired(true).setMaxLength(30))
        .addStringOption(o => o.setName('content').setDescription('Response content').setRequired(true).setMaxLength(1000)))
      .addSubcommand(s => s.setName('use').setDescription('Send a canned response')
        .addStringOption(o => o.setName('name').setDescription('Name of the response').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all canned responses'))
      .addSubcommand(s => s.setName('delete').setDescription('Delete a canned response')
        .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))),

    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const name = interaction.options.getString('name').toLowerCase();
        const content = interaction.options.getString('content');
        CannedResponses.add.run({ id: uuidv4(), guildId: interaction.guildId, name, content, createdBy: interaction.user.id, createdAt: Date.now() });
        return interaction.reply({ embeds: [successEmbed(`Canned response **${name}** saved.`)], ephemeral: true });
      }

      if (sub === 'use') {
        const name = interaction.options.getString('name').toLowerCase();
        const cr = CannedResponses.getByName.get(interaction.guildId, name);
        if (!cr) return interaction.reply({ embeds: [errorEmbed(`No canned response named **${name}**.`)], ephemeral: true });
        await interaction.reply({ content: cr.content });
      }

      if (sub === 'list') {
        const list = CannedResponses.getAll.all(interaction.guildId);
        if (!list.length) return interaction.reply({ embeds: [infoEmbed('Canned Responses', 'None yet. Use `/canned add` to create one.')], ephemeral: true });
        const embed = new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('📋 Canned Responses')
          .setDescription(list.map(c => `\`${c.name}\` — ${c.content.slice(0,80)}${c.content.length > 80 ? '…' : ''}`).join('\n'));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name').toLowerCase();
        const cr = CannedResponses.getByName.get(interaction.guildId, name);
        if (!cr) return interaction.reply({ embeds: [errorEmbed(`Not found.`)], ephemeral: true });
        CannedResponses.remove.run(cr.id, interaction.guildId);
        return interaction.reply({ embeds: [successEmbed(`Deleted **${name}**.`)], ephemeral: true });
      }
    },
  },
};

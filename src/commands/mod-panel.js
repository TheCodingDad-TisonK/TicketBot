// src/commands/mod-panel.js
// /modpanel — live mod/admin dashboard with action buttons

const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const { Tickets, Blacklist, StaffStats } = require('../utils/database');
const { isMod, isAdmin } = require('../utils/permissions');
const { modPanel, adminPanel, errorEmbed, COLORS } = require('../utils/embeds');

module.exports = {
  modpanel: {
    data: new SlashCommandBuilder()
      .setName('modpanel')
      .setDescription('[Mod] Open the live mod panel'),

    async execute(interaction) {
      if (!isMod(interaction.member, interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Staff only.')], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const open      = Tickets.getOpen.all(interaction.guildId);
      const unclaimed = open.filter(t => !t.claimed_by).length;
      const today     = Date.now() - 86400000;
      const closedToday = Tickets.getAll.all(interaction.guildId)
        .filter(t => t.status === 'closed' && t.closed_at && t.closed_at > today).length;

      const embed = modPanel({ open: open.length, closedToday, unclaimed });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('modpanel:list_open').setLabel('Open Tickets').setEmoji('📂').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('modpanel:list_unclaimed').setLabel('Unclaimed').setEmoji('🔴').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('modpanel:refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      );

      const row2 = isAdmin(interaction.member, interaction.guildId)
        ? new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('modpanel:admin_stats').setLabel('Admin Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('modpanel:staff_lb').setLabel('Leaderboard').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('modpanel:blacklist').setLabel('Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger),
          )
        : null;

      const components = row2 ? [row1, row2] : [row1];
      await interaction.editReply({ embeds: [embed], components });
    },
  },
};

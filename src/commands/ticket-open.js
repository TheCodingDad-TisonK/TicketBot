// src/commands/ticket-open.js
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { Blacklist } = require('../utils/database');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Open a new support ticket')
    .addStringOption(opt =>
      opt.setName('category')
        .setDescription('What type of support do you need?')
        .setRequired(false)
        .addChoices(
          { name: '🐛 Bug Report',       value: 'bug'          },
          { name: '💡 Feature Request',  value: 'feature'      },
          { name: '❓ General Support',   value: 'support'      },
          { name: '🤝 Collaboration',     value: 'collab'       },
          { name: '🔧 Mod Testing',       value: 'testing'      },
          { name: '🛡️ Staff Report',      value: 'staff_report' },
        )
    )
    .addBooleanOption(opt =>
      opt.setName('dm')
        .setDescription('Handle this ticket privately via DM?')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Check blacklist
    const bl = Blacklist.check.get(interaction.user.id, interaction.guildId);
    if (bl) {
      return interaction.reply({
        embeds: [errorEmbed(`You are blacklisted from opening tickets.\n**Reason:** ${bl.reason || 'Not specified'}`)],
        ephemeral: true,
      });
    }

    const category = interaction.options.getString('category') || 'support';
    const dmMode   = interaction.options.getBoolean('dm') ?? (category === 'staff_report');

    // Show modal to collect subject & description
    const modal = new ModalBuilder()
      .setCustomId(`ticket:open_modal:${category}:${dmMode ? '1' : '0'}`)
      .setTitle(`New Ticket — ${category.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}`);

    const subjectInput = new TextInputBuilder()
      .setCustomId('subject')
      .setLabel('Subject / Title')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setPlaceholder('Short summary of your issue…')
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Describe your issue in detail')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setPlaceholder(
        category === 'bug'
          ? 'Steps to reproduce, expected vs actual behaviour, mod name & version…'
          : category === 'feature'
          ? 'Describe the feature you want and why it would be useful…'
          : 'Provide as much detail as possible so we can help you quickly…'
      )
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(subjectInput),
      new ActionRowBuilder().addComponents(descInput),
    );

    await interaction.showModal(modal);
  },
};

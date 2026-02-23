// src/events/messageCreate.js
// Records messages in ticket channels for transcript & DM relay

const { ChannelType, EmbedBuilder } = require('discord.js');
const { Tickets, Messages, Settings } = require('../utils/database');
const { isMod } = require('../utils/permissions');
const { COLORS } = require('../utils/embeds');

module.exports = async function onMessageCreate(message, client) {
  if (message.author.bot) return;
  if (!message.guild) return handleDMMessage(message, client); // DM reply from staff

  // ── In-guild: record messages in ticket channels ──
  const ticket = Tickets.getByChannel.get(message.channelId);
  if (!ticket || ticket.status !== 'open') return;

  const member = message.member;
  const isStaff = isMod(member, message.guildId);

  Messages.add.run({
    ticketId: ticket.id,
    authorId: message.author.id,
    authorName: message.author.tag,
    content: message.content || '[Attachment/Embed]',
    isStaff: isStaff ? 1 : 0,
    isNote: 0,
    timestamp: message.createdTimestamp,
  });

  Tickets.updateLastActive.run(message.createdTimestamp, ticket.id);
};

// ── DM handling for staff replies ────────────
// Staff can DM the bot to reply to a DM ticket
// Format: "TICKET_ID message here" or just chat if they have an active claim

async function handleDMMessage(message, client) {
  // Ignore DMs that aren't from staff (we can't check roles in DM context directly)
  // Staff must prefix their reply with the ticket ID
  const match = message.content.match(/^(T-[A-Z0-9]+)\s+(.+)/s);
  if (!match) {
    return message.reply({
      content: [
        '**FS25 Ticket Bot — Staff DM Reply**',
        'To reply to a ticket via DM, format your message as:',
        '```',
        'T-XXXXXXXX Your message here',
        '```',
        'Replace `T-XXXXXXXX` with the actual ticket ID.',
      ].join('\n'),
    });
  }

  const [, ticketId, content] = match;
  const ticket = require('../utils/database').Tickets.getById.get(ticketId);
  if (!ticket) return message.reply(`❌ Ticket \`${ticketId}\` not found.`);
  if (ticket.status !== 'open') return message.reply(`❌ Ticket \`${ticketId}\` is closed.`);

  // Record the staff reply
  Messages.add.run({
    ticketId: ticket.id, authorId: message.author.id,
    authorName: message.author.tag, content,
    isStaff: 1, isNote: 0, timestamp: Date.now(),
  });

  // Relay to the ticket user via DM
  try {
    const user = await client.users.fetch(ticket.user_id).catch(() => null);
    if (user) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(`📬 Reply to your ticket \`${ticket.id}\``)
        .setDescription(content)
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setFooter({ text: 'Reply back by messaging this bot' })
        .setTimestamp();
      await user.send({ embeds: [embed] });
    }
    await message.react('✅');
  } catch {
    await message.reply('⚠️ Could not relay message to the user. Their DMs may be closed.');
  }
}

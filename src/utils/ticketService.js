// src/utils/ticketService.js
// All ticket lifecycle operations live here — commands & events call this

const {
  ChannelType, PermissionFlagsBits, AttachmentBuilder
} = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { Tickets, Messages, StaffStats, Settings } = require('./database');
const Embeds = require('./embeds');

// ── Ticket categories config ──────────────────
const CATEGORIES = {
  bug:         { label: '🐛 Bug Report',        emoji: '🐛', color: 0xE74C3C },
  feature:     { label: '💡 Feature Request',   emoji: '💡', color: 0xF39C12 },
  support:     { label: '❓ General Support',    emoji: '❓', color: 0x3498DB },
  collab:      { label: '🤝 Collaboration',      emoji: '🤝', color: 0x2ECC71 },
  testing:     { label: '🔧 Mod Testing',        emoji: '🔧', color: 0x9B59B6 },
  staff_report:{ label: '🛡️ Staff Report',       emoji: '🛡️', color: 0xF1C40F },
  general:     { label: '📬 General',            emoji: '📬', color: 0x95A5A6 },
};

module.exports.CATEGORIES = CATEGORIES;

// ── Create ticket ─────────────────────────────

/**
 * Creates a ticket channel for the user.
 * If category is 'staff_report', opens via DM instead.
 */
async function createTicket(guild, user, { category = 'general', subject = null, dmMode = false, priority = 'normal' } = {}) {
  const settings = Settings.get.get(guild.id) || {};
  const maxPerUser = settings.max_per_user || 3;
  const openTickets = Tickets.getOpenByUser.all(user.id, guild.id);

  if (openTickets.length >= maxPerUser) {
    return { error: `You already have ${openTickets.length} open ticket(s). Please close existing ones first.` };
  }

  const id = `T-${uuidv4().split('-')[0].toUpperCase()}`;
  const catConfig = CATEGORIES[category] || CATEGORIES.general;
  let channelId = null;

  if (!dmMode) {
    const ticketCategoryId = settings.ticket_category;
    const modRoleId = settings.mod_role;
    const adminRoleId = settings.admin_role;

    const permOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    ];
    if (modRoleId)  permOverwrites.push({ id: modRoleId,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] });
    if (adminRoleId && adminRoleId !== modRoleId) permOverwrites.push({ id: adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] });

    try {
      const channel = await guild.channels.create({
        name: `${catConfig.emoji}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${id.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: ticketCategoryId || null,
        permissionOverwrites: permOverwrites,
        topic: `Ticket ${id} | User: ${user.tag} | Category: ${catConfig.label} | Priority: ${priority}`,
        reason: `Ticket opened by ${user.tag}`,
      });
      channelId = channel.id;
    } catch (err) {
      console.error('[TicketService] Channel create error:', err);
      return { error: 'Could not create ticket channel. Check my permissions.' };
    }
  }

  Tickets.create.run({
    id, guildId: guild.id, channelId, userId: user.id,
    category, subject, createdAt: Date.now(), dmMode: dmMode ? 1 : 0,
    participants: JSON.stringify([user.id]),
  });

  if (priority !== 'normal') {
    Tickets.updatePriority.run(priority, id);
  }

  return { ticket: Tickets.getById.get(id), channelId };
}

module.exports.createTicket = createTicket;

// ── Send opening message to ticket channel ────

async function sendOpeningMessage(channel, ticket, user, client) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket:claim:${ticket.id}`).setLabel('Claim').setEmoji('✋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket:priority:${ticket.id}`).setLabel('Priority').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:info:${ticket.id}`).setLabel('Info').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:note:${ticket.id}`).setLabel('Add Note').setEmoji('📌').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:adduser:${ticket.id}`).setLabel('Add User').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:removeuser:${ticket.id}`).setLabel('Remove User').setEmoji('➖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:transcript:${ticket.id}`).setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:tag:${ticket.id}`).setLabel('Tag').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:rename:${ticket.id}`).setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
  );

  const embed = Embeds.ticketCreated(ticket, `<@${user.id}>`);

  // Notify mod role
  const settings = Settings.get.get(ticket.guild_id) || {};
  const modRoleId = settings.mod_role;

  await channel.send({
    content: modRoleId ? `<@&${modRoleId}> — New ticket from <@${user.id}>` : `New ticket from <@${user.id}>`,
    embeds: [embed],
    components: [row, row2],
  });

  // Pin the opening message
  try {
    const msgs = await channel.messages.fetch({ limit: 1 });
    const msg = msgs.first();
    if (msg) await msg.pin().catch(() => {});
  } catch {}
}

module.exports.sendOpeningMessage = sendOpeningMessage;

// ── Close ticket ──────────────────────────────

async function closeTicket(ticket, actor, reason = 'No reason provided', guild, client) {
  if (ticket.status !== 'open') return { error: 'This ticket is already closed.' };

  const closedAt = Date.now();
  Tickets.updateStatus.run('closed', closedAt, reason, ticket.id);
  const updated = Tickets.getById.get(ticket.id);

  // Update staff stats
  if (actor) {
    StaffStats.upsert.run({ userId: actor, guildId: guild.id, now: Date.now() });
    StaffStats.incrementClosed.run(Date.now(), actor, guild.id);
  }

  return { ticket: updated };
}

module.exports.closeTicket = closeTicket;

// ── Generate HTML transcript ──────────────────

async function generateTranscript(ticket, messages, guild) {
  const html = Embeds.transcript(ticket, messages, guild.name);
  Tickets.saveTranscript.run(html, ticket.id);
  const buffer = Buffer.from(html, 'utf-8');
  return new AttachmentBuilder(buffer, { name: `transcript-${ticket.id}.html` });
}

module.exports.generateTranscript = generateTranscript;

// ── Archive / move ticket channel ─────────────

async function archiveTicketChannel(channel, guild) {
  const settings = Settings.get.get(guild.id) || {};
  const archiveCategoryId = settings.archive_category;
  if (!archiveCategoryId) return;
  try {
    await channel.setParent(archiveCategoryId, { lockPermissions: true });
    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
  } catch (err) {
    console.error('[TicketService] Archive error:', err);
  }
}

module.exports.archiveTicketChannel = archiveTicketChannel;

// ── Log to guild log channel ──────────────────

async function logAction(client, guildId, embed, isAdmin = false) {
  const settings = Settings.get.get(guildId) || {};
  const channelId = isAdmin
    ? (settings.admin_log_channel || settings.log_channel)
    : (settings.log_channel);
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] });
  } catch {}
}

module.exports.logAction = logAction;

// ── DM the ticket user ────────────────────────

async function dmUser(client, userId, embed, components = []) {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    await user.send({ embeds: [embed], components });
  } catch {}
}

module.exports.dmUser = dmUser;

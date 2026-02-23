// src/utils/embeds.js
// Centralised embed factory — keeps all bot messages visually consistent

const { EmbedBuilder } = require('discord.js');

// ── FS25 brand palette ────────────────────────
const COLORS = {
  primary:   0x2ECC71,   // green  — success / general
  info:      0x3498DB,   // blue   — informational
  warning:   0xF39C12,   // orange — warn / pending
  danger:    0xE74C3C,   // red    — error / critical
  neutral:   0x95A5A6,   // grey   — closed / neutral
  dark:      0x2C3E50,   // dark   — admin panel
  gold:      0xF1C40F,   // gold   — priority HIGH
};

const ICON = 'https://cdn.discordapp.com/emojis/1234567890.png'; // replace with your server icon
const FOOTER_TEXT = 'FS25 Modding Community • Ticket System';

// Helper: consistent footer
function footer(extra) {
  return { text: extra ? `${FOOTER_TEXT} • ${extra}` : FOOTER_TEXT };
}

// ── Ticket Embeds ─────────────────────────────

function ticketCreated(ticket, user) {
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🎫 Ticket Opened')
    .setDescription(`Hey ${user}, your ticket has been created!\n\nA member of our team will be with you shortly.\n**Please describe your issue in as much detail as possible.**`)
    .addFields(
      { name: '🔖 Ticket ID', value: `\`${ticket.id}\``, inline: true },
      { name: '📂 Category', value: ticket.category, inline: true },
      { name: '⚡ Priority', value: ticket.priority, inline: true },
      { name: '📝 Subject', value: ticket.subject || 'Not set', inline: false },
    )
    .setFooter(footer())
    .setTimestamp();
}

function ticketPanel(config = {}) {
  return new EmbedBuilder()
    .setColor(COLORS.dark)
    .setTitle(config.title || '🎫 FS25 Modding — Support Center')
    .setDescription(config.description || [
      '**Welcome to our support system!**',
      '',
      'Click the button matching your issue type to open a ticket.',
      'Our modding team will respond as soon as possible.',
      '',
      '> 🐛 **Bug Report** — issues with one of our mods',
      '> 💡 **Feature Request** — suggest new features',
      '> ❓ **General Support** — questions & help',
      '> 🤝 **Collaboration** — contribute to a mod',
      '> 🔧 **Mod Testing** — request testing assistance',
      '> 🛡️ **Staff Report** — report a staff member (handled privately via DM)',
    ].join('\n'))
    .setFooter(footer('React or click a button to get started'))
    .setTimestamp();
}

function ticketClosed(ticket, closedBy) {
  return new EmbedBuilder()
    .setColor(COLORS.neutral)
    .setTitle('🔒 Ticket Closed')
    .addFields(
      { name: '🔖 Ticket ID', value: `\`${ticket.id}\``, inline: true },
      { name: '👤 Closed By', value: closedBy ? `<@${closedBy}>` : 'System', inline: true },
      { name: '⏱️ Duration', value: humanDuration(ticket.created_at, ticket.closed_at), inline: true },
      { name: '💬 Reason', value: ticket.close_reason || 'No reason provided', inline: false },
    )
    .setFooter(footer('Transcript available • ticket will be archived'))
    .setTimestamp();
}

function ticketInfo(ticket, member) {
  const tags = JSON.parse(ticket.tags || '[]');
  const participants = JSON.parse(ticket.participants || '[]');
  return new EmbedBuilder()
    .setColor(priorityColor(ticket.priority))
    .setTitle(`📋 Ticket #${ticket.id}`)
    .addFields(
      { name: '👤 User', value: `<@${ticket.user_id}>`, inline: true },
      { name: '📂 Category', value: ticket.category, inline: true },
      { name: '⚡ Priority', value: ticket.priority.toUpperCase(), inline: true },
      { name: '📊 Status', value: statusBadge(ticket.status), inline: true },
      { name: '🧑‍💼 Claimed By', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed', inline: true },
      { name: '📅 Created', value: `<t:${Math.floor(ticket.created_at / 1000)}:R>`, inline: true },
      { name: '📝 Subject', value: ticket.subject || 'Not set', inline: false },
      { name: '🏷️ Tags', value: tags.length ? tags.join(', ') : 'None', inline: true },
      { name: '👥 Participants', value: participants.length ? participants.map(p => `<@${p}>`).join(', ') : 'None', inline: true },
    )
    .setFooter(footer())
    .setTimestamp();
}

function staffNote(content, author) {
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('📌 Staff Note')
    .setDescription(content)
    .setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() })
    .setFooter(footer('Visible to staff only'))
    .setTimestamp();
}

function transcript(ticket, messages, guildName) {
  // Returns HTML string (saved as file)
  const rows = messages.map(m => `
    <div class="message ${m.is_staff ? 'staff' : 'user'}${m.is_note ? ' note' : ''}">
      <span class="author">${escapeHtml(m.author_name || m.author_id)}</span>
      ${m.is_note ? '<span class="badge">Staff Note</span>' : ''}
      <span class="time">${new Date(m.timestamp).toLocaleString()}</span>
      <p>${escapeHtml(m.content || '').replace(/\n/g, '<br>')}</p>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ticket ${ticket.id} — ${guildName}</title>
<style>
  :root{--bg:#1a1a2e;--card:#16213e;--accent:#0f3460;--green:#2ecc71;--blue:#3498db;--gold:#f1c40f;--red:#e74c3c;--text:#ecf0f1;--muted:#95a5a6}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;padding:24px}
  header{background:var(--card);border-radius:12px;padding:24px;margin-bottom:24px;border-left:4px solid var(--green)}
  header h1{font-size:1.4rem;color:var(--green)}
  header .meta{margin-top:8px;font-size:.85rem;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap}
  .messages{display:flex;flex-direction:column;gap:8px}
  .message{background:var(--card);border-radius:8px;padding:14px 16px;border-left:3px solid var(--accent)}
  .message.staff{border-left-color:var(--blue)}
  .message.note{border-left-color:var(--gold);background:#1a1a10}
  .message.user{border-left-color:var(--green)}
  .author{font-weight:600;color:var(--blue)}
  .message.user .author{color:var(--green)}
  .message.note .author{color:var(--gold)}
  .badge{background:var(--gold);color:#000;font-size:.7rem;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;vertical-align:middle}
  .time{font-size:.75rem;color:var(--muted);margin-left:8px}
  p{margin-top:6px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
  footer{text-align:center;margin-top:24px;font-size:.75rem;color:var(--muted)}
</style>
</head>
<body>
<header>
  <h1>🎫 Ticket Transcript — ${ticket.id}</h1>
  <div class="meta">
    <span>📂 Category: <strong>${ticket.category}</strong></span>
    <span>👤 User: <strong>${ticket.user_id}</strong></span>
    <span>📊 Status: <strong>${ticket.status}</strong></span>
    <span>📅 Created: <strong>${new Date(ticket.created_at).toLocaleString()}</strong></span>
    ${ticket.closed_at ? `<span>🔒 Closed: <strong>${new Date(ticket.closed_at).toLocaleString()}</strong></span>` : ''}
    <span>⏱️ Duration: <strong>${humanDuration(ticket.created_at, ticket.closed_at || Date.now())}</strong></span>
  </div>
</header>
<div class="messages">${rows}</div>
<footer>Generated by FS25 Ticket Bot • ${guildName} • ${new Date().toLocaleString()}</footer>
</body>
</html>`;
}

// ── Mod/Admin Panel Embeds ────────────────────

function modPanel(stats) {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('🛡️ Mod Panel')
    .setDescription('Manage open tickets and community support from this panel.')
    .addFields(
      { name: '📂 Open Tickets', value: String(stats.open), inline: true },
      { name: '✅ Closed Today', value: String(stats.closedToday), inline: true },
      { name: '🔴 Unclaimed', value: String(stats.unclaimed), inline: true },
    )
    .setFooter(footer('Use slash commands or buttons below'))
    .setTimestamp();
}

function adminPanel(stats) {
  return new EmbedBuilder()
    .setColor(COLORS.dark)
    .setTitle('⚙️ Admin Control Panel')
    .addFields(
      { name: '📊 Total Tickets', value: String(stats.total), inline: true },
      { name: '📂 Open', value: String(stats.open), inline: true },
      { name: '✅ Closed', value: String(stats.closed), inline: true },
      { name: '👥 Staff Active', value: String(stats.staffActive), inline: true },
      { name: '🚫 Blacklisted', value: String(stats.blacklisted), inline: true },
      { name: '📈 Avg Close Time', value: stats.avgClose || 'N/A', inline: true },
    )
    .setFooter(footer('Admin use only'))
    .setTimestamp();
}

function logEmbed(action, ticket, actor, extra = {}) {
  const colorMap = {
    open:   COLORS.primary,
    close:  COLORS.neutral,
    reopen: COLORS.info,
    delete: COLORS.danger,
    claim:  COLORS.info,
    priority: COLORS.warning,
    blacklist: COLORS.danger,
    note:   COLORS.warning,
  };
  return new EmbedBuilder()
    .setColor(colorMap[action] || COLORS.neutral)
    .setTitle(`📋 Ticket ${action.charAt(0).toUpperCase() + action.slice(1)}`)
    .addFields(
      { name: '🔖 Ticket', value: `\`${ticket.id}\``, inline: true },
      { name: '👤 User', value: `<@${ticket.user_id}>`, inline: true },
      { name: '🧑‍💼 Actor', value: actor ? `<@${actor}>` : 'System', inline: true },
      ...Object.entries(extra).map(([k, v]) => ({ name: k, value: String(v), inline: true })),
    )
    .setFooter(footer())
    .setTimestamp();
}

function errorEmbed(msg) {
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle('❌ Error')
    .setDescription(msg)
    .setFooter(footer());
}

function successEmbed(msg) {
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('✅ Success')
    .setDescription(msg)
    .setFooter(footer());
}

function infoEmbed(title, msg) {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`ℹ️ ${title}`)
    .setDescription(msg)
    .setFooter(footer());
}

// ── Helpers ───────────────────────────────────

function humanDuration(start, end) {
  const ms = (end || Date.now()) - start;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function priorityColor(priority) {
  return { low: COLORS.primary, normal: COLORS.info, high: COLORS.warning, critical: COLORS.danger }[priority] || COLORS.info;
}

function statusBadge(status) {
  return { open: '🟢 Open', closed: '🔴 Closed', deleted: '⚫ Deleted', archived: '📦 Archived' }[status] || status;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = {
  COLORS,
  ticketCreated, ticketPanel, ticketClosed, ticketInfo, staffNote,
  modPanel, adminPanel, logEmbed, errorEmbed, successEmbed, infoEmbed,
  transcript, humanDuration,
};

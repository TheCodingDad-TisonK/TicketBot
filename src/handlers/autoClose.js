// src/handlers/autoClose.js
// Cron job: auto-close inactive tickets and auto-delete old closed tickets

const cron = require('node-cron');
const { Tickets, Messages, Settings } = require('../utils/database');
const { closeTicket, generateTranscript, archiveTicketChannel, logAction, dmUser } = require('../utils/ticketService');
const { ticketClosed, logEmbed, infoEmbed } = require('../utils/embeds');

module.exports = function startAutoClose(client) {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    const now = Date.now();
    console.log('[AutoClose] Running scheduled check…');

    // Iterate over all guilds
    for (const [guildId, guild] of client.guilds.cache) {
      const settings = Settings.get.get(guildId) || {};
      const autoCloseHours  = parseInt(settings.auto_close_hours ?? 48);
      const autoDeleteHours = parseInt(settings.auto_delete_hours ?? 72);

      // ── Auto-close inactive open tickets ─────
      if (autoCloseHours > 0) {
        const cutoff = now - autoCloseHours * 3600000;
        const inactive = Tickets.getInactive.all(guildId, cutoff);

        for (const ticket of inactive) {
          const msgs = Messages.getByTicket.all(ticket.id);
          const transcriptFile = await generateTranscript(ticket, msgs, guild);

          const { ticket: closed } = await closeTicket(
            ticket, null, `Auto-closed after ${autoCloseHours}h of inactivity`, guild, client
          );

          // Notify user
          await dmUser(client, ticket.user_id, ticketClosed(closed, null));

          // Archive the channel
          if (ticket.channel_id) {
            const ch = await client.channels.fetch(ticket.channel_id).catch(() => null);
            if (ch) {
              await ch.send({ embeds: [ticketClosed(closed, null)], files: [transcriptFile] }).catch(() => {});
              await archiveTicketChannel(ch, guild);
            }
          }

          await logAction(client, guildId, logEmbed('close', closed, null, { Reason: `Auto-close (${autoCloseHours}h inactivity)` }));
          console.log(`[AutoClose] Closed inactive ticket ${ticket.id}`);
        }
      }

      // ── Auto-delete old closed tickets ────────
      if (autoDeleteHours > 0) {
        const deleteCutoff = now - autoDeleteHours * 3600000;
        const stale = Tickets.getAll.all(guildId).filter(t =>
          t.status === 'closed' && t.closed_at && t.closed_at < deleteCutoff
        );

        for (const ticket of stale) {
          if (ticket.channel_id) {
            const ch = await client.channels.fetch(ticket.channel_id).catch(() => null);
            if (ch) {
              await ch.delete(`Auto-deleted after ${autoDeleteHours}h of being closed`).catch(() => {});
            }
          }
          Tickets.updateStatus.run('deleted', now, 'Auto-deleted', ticket.id);
          console.log(`[AutoClose] Deleted stale ticket ${ticket.id}`);
        }
      }
    }
  });

  console.log('[AutoClose] Scheduled job registered (every 30 min)');
};

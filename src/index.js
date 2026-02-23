// src/index.js
// FS25 Modding Community — Advanced Ticket Bot
// Entry point: boots client, registers events, starts cron jobs

require('dotenv').config();

const {
  Client, GatewayIntentBits, Partials, ActivityType,
} = require('discord.js');

const handleInteraction = require('./handlers/interactionHandler');
const onMessageCreate   = require('./events/messageCreate');
const startAutoClose    = require('./handlers/autoClose');
const ticketManage      = require('./commands/ticket-manage');
const adminCmds         = require('./commands/admin');
const modPanelCmds      = require('./commands/mod-panel');
const ticketOpen        = require('./commands/ticket-open');

// ── Build command map ─────────────────────────
const commands = new Map();

const allCmds = [
  { name: 'ticket',      ...ticketOpen },
  ...Object.entries(ticketManage).map(([k, v]) => ({ name: v.data.name, ...v })),
  ...Object.entries(adminCmds).map(([k, v]) => ({ name: v.data.name, ...v })),
  ...Object.entries(modPanelCmds).map(([k, v]) => ({ name: v.data.name, ...v })),
];

for (const cmd of allCmds) {
  commands.set(cmd.name, cmd);
}

// ── Discord client ────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// ── Ready ─────────────────────────────────────
client.once('ready', () => {
  console.log(`\n✅ Logged in as ${client.user.tag}`);
  console.log(`   Commands: ${commands.size}`);
  console.log(`   Guilds  : ${client.guilds.cache.size}\n`);

  client.user.setActivity('🎫 FS25 Mod Support', { type: ActivityType.Watching });

  // Notify server owners/admins to configure the bot
  for (const [guildId, guild] of client.guilds.cache) {
    const settings = require('./utils/database').Settings.get.get(guildId);
    if (!settings || !settings.ticket_category) {
      // Bot hasn't been configured yet - notify the owner
      const owner = guild.members.cache.get(guild.ownerId);
      if (owner && owner.user) {
        owner.user.send({
          content: `👋 Hi! I've been added to **${guild.name}**.\n\nTo get started, please run \`/settings set\` to configure the ticket categories and roles.\n\nUse \`/panel\` to post the ticket panel in a channel.`
        }).catch(() => {}); // Silently fail if DM is blocked
      }
      console.log(`[Setup] ${guild.name} needs configuration`);
    }
  }

  // Start auto-close cron
  startAutoClose(client);
});

// ── Slash commands ────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      console.error(`[Cmd] Error in /${interaction.commandName}:`, err);
      const errPayload = {
        content: '❌ An unexpected error occurred. Please try again.',
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errPayload).catch(() => {});
      } else {
        await interaction.reply(errPayload).catch(() => {});
      }
    }
    return;
  }

  // All other interactions (buttons, modals, selects)
  try {
    await handleInteraction(interaction, client);
  } catch (err) {
    console.error('[Interaction] Unhandled error:', err);
    const errPayload = { content: '❌ An error occurred.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errPayload).catch(() => {});
    } else {
      await interaction.reply(errPayload).catch(() => {});
    }
  }
});

// ── Messages ──────────────────────────────────
client.on('messageCreate', msg => onMessageCreate(msg, client));

// ── Error handling ────────────────────────────
client.on('error', err => console.error('[Client] Error:', err));
process.on('unhandledRejection', err => console.error('[Process] Unhandled rejection:', err));
process.on('uncaughtException',  err => console.error('[Process] Uncaught exception:', err));

// ── Login ─────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});

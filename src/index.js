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
const helpCmd          = require('./commands/help');

// ── Build command map ─────────────────────────
const commands = new Map();

const allCmds = [
  { name: 'ticket',      ...ticketOpen },
  { name: 'help',        ...helpCmd },
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

  const database = require('./utils/database');

  // ── Helper Functions ────────────────────────

  const getTotalMembers = () =>
    client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);

  const getOpenTickets = () => {
    try {
      return database.Tickets.countAllOpen.get().count || 0;
    } catch {
      return 0;
    }
  };

  const getUptime = () => {
    const totalSeconds = Math.floor(process.uptime());
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // ── Rotating Status System ──────────────────

  const statuses = [
    () => ({
      name: `/help | ${client.guilds.cache.size} servers`,
      type: ActivityType.Playing,
    }),
    () => ({
      name: `${getTotalMembers().toLocaleString()} members`,
      type: ActivityType.Watching,
    }),
    () => ({
      name: `${getOpenTickets()} open tickets`,
      type: ActivityType.Watching,
    }),
    () => ({
      name: `Uptime: ${getUptime()}`,
      type: ActivityType.Playing,
    }),
    () => ({
      name: `Use /help for commands`,
      type: ActivityType.Listening,
    }),
  ];

  let index = 0;

  const rotateStatus = () => {
    const status = statuses[index]();
    client.user.setActivity(status.name, { type: status.type });
    index = (index + 1) % statuses.length;
  };

  rotateStatus();                 // Set immediately
  setInterval(rotateStatus, 15000); // Rotate every 15s

  // ── Setup Check ─────────────────────────────

  for (const [guildId, guild] of client.guilds.cache) {
    const settings = database.Settings.get.get(guildId);
    if (!settings || !settings.ticket_category) {
      const owner = guild.members.cache.get(guild.ownerId);
      if (owner?.user) {
        owner.user.send({
          content:
            `👋 Hi! I've been added to **${guild.name}**.\n\n` +
            `To get started, run \`/settings set\` to configure ticket categories and roles.\n\n` +
            `Then use \`/panel\` to post the ticket panel.`,
        }).catch(() => {});
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

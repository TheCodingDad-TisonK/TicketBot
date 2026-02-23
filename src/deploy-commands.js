// src/deploy-commands.js
// Run: node src/deploy-commands.js
// Registers all slash commands to the guild (instant) or globally (1hr propagation)

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const ticketManage = require('./commands/ticket-manage');
const adminCmds    = require('./commands/admin');
const modPanelCmds = require('./commands/mod-panel');
const ticketOpen   = require('./commands/ticket-open');
const helpCmd      = require('./commands/help');

const commands = [
  ticketOpen.data.toJSON(),
  helpCmd.data.toJSON(),

  // Ticket management
  ...Object.values(ticketManage).map(c => c.data.toJSON()),

  // Admin commands
  ...Object.values(adminCmds).map(c => c.data.toJSON()),

  // Mod panel
  ...Object.values(modPanelCmds).map(c => c.data.toJSON()),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`[Deploy] Registering ${commands.length} slash commands…`);

    const guildId = process.env.GUILD_ID;
    const route = guildId
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    const data = await rest.put(route, { body: commands });
    console.log(`[Deploy] ✅ Successfully registered ${data.length} commands.`);
    console.log(data.map(c => `  /${c.name}`).join('\n'));
  } catch (err) {
    console.error('[Deploy] ❌ Error:', err);
  }
})();

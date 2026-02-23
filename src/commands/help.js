const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    ComponentType 
} = require('discord.js');

const helpCategories = {
    'user': {
        name: 'User Commands',
        emoji: '👤',
        description: 'Commands available to all server members',
        commands: [
            { name: '/ticket [category] [dm]', description: 'Open a support ticket' },
        ]
    },
    'staff': {
        name: 'Staff Commands',
        emoji: '🛡️',
        description: 'Commands available to staff members',
        commands: [
            { name: '/close [reason]', description: 'Close the current ticket' },
            { name: '/reopen', description: 'Reopen a closed ticket' },
            { name: '/claim', description: 'Claim ownership of a ticket' },
            { name: '/unclaim', description: 'Release ticket claim' },
            { name: '/priority <level>', description: 'Set ticket priority' },
            { name: '/add-user <user>', description: 'Add user to ticket' },
            { name: '/remove-user <user>', description: 'Remove user from ticket' },
            { name: '/rename <name>', description: 'Rename ticket channel' },
            { name: '/note <content>', description: 'Add internal staff note' },
            { name: '/transcript', description: 'Generate HTML transcript' },
            { name: '/ticket-info', description: 'View ticket information' },
            { name: '/modpanel', description: 'Open mod dashboard' },
            { name: '/canned use <name>', description: 'Send canned response' },
            { name: '/canned list', description: 'List canned responses' },
            { name: '/stats user [user]', description: 'View user ticket history' },
            { name: '/stats staff', description: 'View staff leaderboard' },
        ]
    },
    'admin': {
        name: 'Admin Commands',
        emoji: '⚙️',
        description: 'Commands available to administrators',
        commands: [
            { name: '/panel [channel]', description: 'Post ticket panel' },
            { name: '/delete [reason]', description: 'Delete a ticket' },
            { name: '/settings view', description: 'View current settings' },
            { name: '/settings set <key> <value>', description: 'Update a setting' },
            { name: '/blacklist add <user> [reason]', description: 'Blacklist a user' },
            { name: '/blacklist remove <user>', description: 'Remove from blacklist' },
            { name: '/blacklist list', description: 'View blacklisted users' },
            { name: '/stats server', description: 'View server statistics' },
            { name: '/canned add <name> <content>', description: 'Create canned response' },
            { name: '/canned delete <name>', description: 'Delete canned response' },
        ]
    },
    'info': {
        name: 'Bot Information',
        emoji: 'ℹ️',
        description: 'General bot information and links',
        commands: [
            { name: 'Ticket Categories', description: 'Bug Report, Feature Request, General Support, Collaboration, Mod Testing, Staff Report' },
            { name: 'Priority Levels', description: '🟢 Low, 🔵 Normal, 🟡 High, 🔴 Critical' },
            { name: 'Support', description: 'Join our Discord for help' },
        ]
    }
};

const categoryKeys = Object.keys(helpCategories);

async function sendHelpMessage(interaction, client, page = 0, selectedCategory = null) {
    const totalPages = categoryKeys.length;
    
    const currentCategory = selectedCategory || categoryKeys[page];
    const categoryData = helpCategories[currentCategory];

    const embed = new EmbedBuilder()
        .setTitle(`${categoryData.emoji} ${categoryData.name}`)
        .setDescription(categoryData.description)
        .setColor(0x6C5CE7)
        .setFooter({ text: `Page ${page + 1}/${totalPages} • Use the dropdown to browse categories` })
        .setTimestamp();

    // Add commands to embed
    categoryData.commands.forEach(cmd => {
        embed.addFields([
            { name: cmd.name, value: cmd.description, inline: false }
        ]);
    });

    // Create dropdown menu
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Select a category')
        .addOptions(
            categoryKeys.map((key, index) => ({
                label: helpCategories[key].name,
                value: key,
                description: helpCategories[key].description.substring(0, 50),
                emoji: helpCategories[key].emoji,
                default: key === currentCategory
            }))
        );

    // Create navigation buttons
    const prevButton = new ButtonBuilder()
        .setCustomId('help_prev')
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId('help_next')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1);

    const homeButton = new ButtonBuilder()
        .setCustomId('help_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder()
        .addComponents(selectMenu);

    const row2 = new ActionRowBuilder()
        .addComponents(prevButton, homeButton, nextButton);

    // If this is from a select menu update, reply with update
    if (interaction.isUpdateMessage()) {
        await interaction.update({ embeds: [embed], components: [row1, row2] });
    } else {
        // Send new message
        await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }

    // Create message collector for button interactions
    const message = interaction.channel?.messages.cache.last ?? 
                   (interaction.message && client.channels.cache.get(interaction.message.channelId)?.messages.cache.get(interaction.message.id));

    if (!message) {
        // Try to fetch the reply message
        try {
            const reply = await interaction.fetchReply();
            return createCollector(client, reply, page, selectedCategory);
        } catch (e) {
            return;
        }
    }

    createCollector(client, message, page, selectedCategory);
}

function createCollector(client, message, initialPage, initialCategory) {
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000 // 2 minutes
    });

    let currentPage = initialPage;
    let currentCategory = initialCategory || categoryKeys[initialPage];

    collector.on('collect', async (btnInteraction) => {
        if (!btnInteraction.user.id === btnInteraction.user.id) {
            await btnInteraction.reply({ content: 'This menu is not for you!', ephemeral: true });
            return;
        }

        await btnInteraction.deferUpdate();

        if (btnInteraction.customId === 'help_next') {
            currentPage = (currentPage + 1) % categoryKeys.length;
            currentCategory = categoryKeys[currentPage];
        } else if (btnInteraction.customId === 'help_prev') {
            currentPage = (currentPage - 1 + categoryKeys.length) % categoryKeys.length;
            currentCategory = categoryKeys[currentPage];
        } else if (btnInteraction.customId === 'help_home') {
            currentPage = 0;
            currentCategory = categoryKeys[0];
        }

        await updateHelpMessage(btnInteraction, client, currentPage, currentCategory);
    });

    // Handle select menu
    const selectCollector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120000
    });

    selectCollector.on('collect', async (selectInteraction) => {
        if (!selectInteraction.user.id === selectInteraction.user.id) {
            await selectInteraction.reply({ content: 'This menu is not for you!', ephemeral: true });
            return;
        }

        currentCategory = selectInteraction.values[0];
        currentPage = categoryKeys.indexOf(currentCategory);

        await updateHelpFromSelect(selectInteraction, client, currentPage, currentCategory);
    });
}

async function updateHelpMessage(interaction, client, page, category) {
    const categoryData = helpCategories[category];

    const embed = new EmbedBuilder()
        .setTitle(`${categoryData.emoji} ${categoryData.name}`)
        .setDescription(categoryData.description)
        .setColor(0x6C5CE7)
        .setFooter({ text: `Page ${page + 1}/${categoryKeys.length} • Use the dropdown to browse categories` })
        .setTimestamp();

    categoryData.commands.forEach(cmd => {
        embed.addFields([
            { name: cmd.name, value: cmd.description, inline: false }
        ]);
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Select a category')
        .addOptions(
            categoryKeys.map((key, index) => ({
                label: helpCategories[key].name,
                value: key,
                description: helpCategories[key].description.substring(0, 50),
                emoji: helpCategories[key].emoji,
                default: key === category
            }))
        );

    const prevButton = new ButtonBuilder()
        .setCustomId('help_prev')
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId('help_next')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === categoryKeys.length - 1);

    const homeButton = new ButtonBuilder()
        .setCustomId('help_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(prevButton, homeButton, nextButton);

    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

async function updateHelpFromSelect(interaction, client, page, category) {
    await updateHelpMessage(interaction, client, page, category);
}

module.exports = {
    name: 'help',
    description: 'Display help information about commands',
    callback: async (interaction, client) => {
        await sendHelpMessage(interaction, client, 0, null);
    }
};

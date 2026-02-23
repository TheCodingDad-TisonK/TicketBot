const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    SlashCommandBuilder 
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

function buildHelpEmbed(page = 0, category = null) {
    const currentCategory = category || categoryKeys[page];
    const categoryData = helpCategories[currentCategory];

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

    return embed;
}

function buildComponents(page = 0, category = null) {
    const currentCategory = category || categoryKeys[page];
    
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

    const prevButton = new ButtonBuilder()
        .setCustomId(`help_prev_${page}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId(`help_next_${page}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === categoryKeys.length - 1);

    const homeButton = new ButtonBuilder()
        .setCustomId('help_home_0')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(prevButton, homeButton, nextButton);

    return [row1, row2];
}

async function execute(interaction, client) {
    const page = 0;
    
    const embed = buildHelpEmbed(page);
    const components = buildComponents(page);

    await interaction.reply({ embeds: [embed], components: components, flags: 64 });
}

// Export both the slash command data and an interaction handler
module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Display help information about commands'),
    execute,
    
    // Handle button and select menu interactions
    handleComponent: async (interaction, client) => {
        const customId = interaction.customId;
        
        if (customId.startsWith('help_category_select')) {
            // Dropdown menu was used
            const category = interaction.values[0];
            const page = categoryKeys.indexOf(category);
            
            const embed = buildHelpEmbed(page, category);
            const components = buildComponents(page, category);
            
            await interaction.update({ embeds: [embed], components: components });
        } 
        else if (customId.startsWith('help_prev_')) {
            // Previous button
            const currentPage = parseInt(customId.replace('help_prev_', ''));
            const newPage = Math.max(0, currentPage - 1);
            
            const embed = buildHelpEmbed(newPage);
            const components = buildComponents(newPage);
            
            await interaction.update({ embeds: [embed], components: components });
        } 
        else if (customId.startsWith('help_next_')) {
            // Next button
            const currentPage = parseInt(customId.replace('help_next_', ''));
            const newPage = Math.min(categoryKeys.length - 1, currentPage + 1);
            
            const embed = buildHelpEmbed(newPage);
            const components = buildComponents(newPage);
            
            await interaction.update({ embeds: [embed], components: components });
        } 
        else if (customId.startsWith('help_home_')) {
            // Home button
            const embed = buildHelpEmbed(0);
            const components = buildComponents(0);
            
            await interaction.update({ embeds: [embed], components: components });
        }
    }
};

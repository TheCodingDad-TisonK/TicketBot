const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder 
} = require('discord.js');

const helpCategories = {
    'user': {
        name: 'User Commands',
        emoji: '👤',
        description: 'Commands available to all server members',
        color: 0x00D26A,
        commands: [
            { name: '/ticket [category] [dm]', description: 'Open a support ticket' },
        ]
    },
    'staff': {
        name: 'Staff Commands',
        emoji: '🛡️',
        description: 'Commands available to staff members',
        color: 0xF39C12,
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
        color: 0xE74C3C,
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
        color: 0x3498DB,
        commands: [
            { name: 'Ticket Categories', description: 'Bug Report, Feature Request, General Support, Collaboration, Mod Testing, Staff Report' },
            { name: 'Priority Levels', description: '🟢 Low, 🔵 Normal, 🟡 High, 🔴 Critical' },
            { name: 'Support', description: 'Join our Discord for help' },
        ]
    }
};

const categoryKeys = Object.keys(helpCategories);

function buildMainMenuEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('🎫 TicketBot Help')
        .setDescription('Welcome to the TicketBot command overview! Select a category below to view its commands.')
        .setColor(0x6C5CE7)
        .setFooter({ text: 'TicketBot • Use buttons to navigate' })
        .setTimestamp();

    // Add category overview
    const categoryOverview = categoryKeys.map(key => {
        const cat = helpCategories[key];
        return `\`${cat.emoji}\` **${cat.name}**\n> ${cat.description}`;
    }).join('\n\n');

    embed.addFields([
        { name: '📚 Available Categories', value: categoryOverview, inline: false }
    ]);

    return embed;
}

function buildCategoryEmbed(categoryKey) {
    const categoryData = helpCategories[categoryKey];
    
    // Build commands list with better formatting
    const commandsList = categoryData.commands.map(cmd => {
        // Wrap command name in code blocks for emphasis
        return `**\`${cmd.name}\`**\n   ↳ ${cmd.description}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle(`${categoryData.emoji} ${categoryData.name}`)
        .setDescription(`*${categoryData.description}*\n\n${commandsList}`)
        .setColor(categoryData.color)
        .setFooter({ text: 'TicketBot • Use buttons to navigate between categories' })
        .setTimestamp();

    return embed;
}

function buildMainMenuComponents() {
    const buttons = categoryKeys.map(key => {
        const cat = helpCategories[key];
        return new ButtonBuilder()
            .setCustomId(`help_cat_${key}`)
            .setLabel(cat.name)
            .setEmoji(cat.emoji)
            .setStyle(ButtonStyle.Primary);
    });

    // Split buttons into rows of 5 (Discord limit)
    const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
    const rows = [row1];
    
    if (buttons.length > 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(5, 10)));
    }

    return rows;
}

function buildCategoryComponents(currentCategory) {
    const buttons = categoryKeys.map(key => {
        const cat = helpCategories[key];
        return new ButtonBuilder()
            .setCustomId(`help_cat_${key}`)
            .setLabel(cat.name)
            .setEmoji(cat.emoji)
            .setStyle(key === currentCategory ? ButtonStyle.Success : ButtonStyle.Secondary);
    });

    const backButton = new ButtonBuilder()
        .setCustomId('help_main')
        .setEmoji('🏠')
        .setLabel('Back to Menu')
        .setStyle(ButtonStyle.Danger);

    const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
    const rows = [row1];
    
    if (buttons.length > 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(5, 10)));
    }
    
    rows.push(new ActionRowBuilder().addComponents(backButton));

    return rows;
}

async function execute(interaction, client) {
    const embed = buildMainMenuEmbed();
    const components = buildMainMenuComponents();

    await interaction.reply({ embeds: [embed], components: components, flags: 64 });
}

// Export both the slash command data and an interaction handler
module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Display help information about commands'),
    execute,
    
    // Handle button interactions
    handleComponent: async (interaction, client) => {
        const customId = interaction.customId;
        
        if (customId === 'help_main') {
            // Return to main menu
            const embed = buildMainMenuEmbed();
            const components = buildMainMenuComponents();
            
            await interaction.update({ embeds: [embed], components: components });
        }
        else if (customId.startsWith('help_cat_')) {
            // Show specific category
            const category = customId.replace('help_cat_', '');
            
            if (helpCategories[category]) {
                const embed = buildCategoryEmbed(category);
                const components = buildCategoryComponents(category);
                
                await interaction.update({ embeds: [embed], components: components });
            }
        }
    }
};

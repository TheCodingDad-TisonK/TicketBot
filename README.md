# 🎫 FS25 Modding Community — Ticket Bot

A fully self-hosted, feature-complete support ticket bot built specifically for the **FS25 Modding Community** Discord server. Inspired by the best features of Open Ticket, Ticket Tool, and Modmail — but purpose-built for modding communities.

---

## ✨ Features

### 🎫 Ticket System
| Feature | Details |
|---|---|
| **6 ticket categories** | Bug Report, Feature Request, General Support, Collaboration, Mod Testing, Staff Report |
| **Modal intake forms** | Users fill in subject + detailed description before the ticket opens |
| **Channel-based tickets** | Private channel per ticket with proper permission overwrites |
| **DM-based tickets** | Staff Report (and any ticket) can be handled fully via DM for privacy |
| **Priority levels** | 🟢 Low · 🔵 Normal · 🟡 High · 🔴 Critical |
| **Ticket claiming** | Staff can claim ownership of a ticket |
| **Participants** | Add/remove extra users to any ticket |
| **Staff notes** | Internal notes visible to staff only (not in user-facing transcript) |
| **Tags** | Apply custom labels to tickets for filtering |
| **Rename** | Rename ticket channels inline |
| **HTML Transcripts** | Beautiful styled HTML export on close or on demand |
| **Auto-close** | Closes inactive tickets after configurable hours |
| **Auto-delete** | Removes closed ticket channels after configurable hours |
| **Blacklist** | Prevent users from opening tickets |
| **Canned responses** | Predefined replies staff can trigger with one command |

### 🛡️ Staff / Mod Panel
| Feature | Details |
|---|---|
| `/modpanel` | Live dashboard showing open, unclaimed, and today's closed tickets |
| Button actions | List open tickets, list unclaimed, refresh stats, admin stats, leaderboard, blacklist |
| **In-channel button bar** | Every ticket has 10 action buttons (close, claim, priority, info, note, add/remove user, transcript, tag, rename) |
| **Canned responses** | `/canned use <name>` sends a saved reply instantly |

### ⚙️ Admin Panel
| Feature | Details |
|---|---|
| `/panel` | Posts the public ticket panel (buttons) in any channel |
| `/settings` | Configure roles, categories, channels, limits, and auto-close times |
| `/blacklist` | Add/remove/list blacklisted users |
| `/stats server` | Server-wide ticket statistics |
| `/stats staff` | Staff leaderboard (tickets closed, claimed) |
| `/stats user` | Full ticket history for any user |
| `/canned add/delete/list` | Manage quick-reply templates |

---

## 🚀 Setup

### Prerequisites
- Node.js v18+
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` with your values:
```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id
TICKET_CATEGORY_ID=category_for_ticket_channels
ARCHIVE_CATEGORY_ID=category_for_closed_tickets
LOG_CHANNEL_ID=channel_for_ticket_logs
ADMIN_LOG_CHANNEL_ID=channel_for_admin_alerts
MOD_ROLE_ID=mod_role_id
ADMIN_ROLE_ID=admin_role_id
MAX_TICKETS_PER_USER=3
AUTO_CLOSE_HOURS=48
AUTO_DELETE_HOURS=72
```

### 3. Required Bot Permissions
In the Discord Developer Portal, enable:
- **Privileged Intents**: Server Members Intent, Message Content Intent

Bot permissions needed:
- Manage Channels
- Manage Messages
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Add Reactions
- View Channels

### 4. Deploy slash commands
```bash
npm run deploy
```

### 5. Start the bot
```bash
npm start       # production
npm run dev     # development with auto-restart
```

### 6. Post the ticket panel
In your chosen support channel, use:
```
/panel
```
This posts the interactive panel with all category buttons.

---

## 📋 Commands Reference

### User Commands
| Command | Description |
|---|---|
| `/ticket [category] [dm]` | Open a ticket (shows modal form) |

### Staff Commands
| Command | Description |
|---|---|
| `/close [reason]` | Close the current ticket |
| `/reopen` | Reopen a closed ticket |
| `/claim` | Claim this ticket as yours |
| `/unclaim` | Release your claim |
| `/priority <level>` | Set priority (low/normal/high/critical) |
| `/add-user <user>` | Add a user to the ticket |
| `/remove-user <user>` | Remove a user from the ticket |
| `/rename <name>` | Rename the ticket channel |
| `/note <content>` | Add a staff-only internal note |
| `/transcript` | Generate an HTML transcript |
| `/ticket-info` | View detailed ticket information |
| `/modpanel` | Open the live mod dashboard |
| `/canned use <name>` | Send a canned (quick) response |
| `/canned list` | List all canned responses |
| `/stats user [user]` | View a user's ticket history |
| `/stats staff` | Staff leaderboard |

### Admin Commands
| Command | Description |
|---|---|
| `/panel [channel]` | Post the ticket panel |
| `/delete [reason]` | Delete a ticket (archives channel) |
| `/settings view` | View current configuration |
| `/settings set <key> <value>` | Update a setting |
| `/blacklist add <user> [reason]` | Blacklist a user |
| `/blacklist remove <user>` | Unblacklist a user |
| `/blacklist list` | View all blacklisted users |
| `/stats server` | Server-wide stats + admin panel |
| `/canned add <name> <content>` | Create a canned response |
| `/canned delete <name>` | Delete a canned response |

---

## 🏗️ Architecture

```
fs25-ticket-bot/
├── src/
│   ├── index.js                 # Entry point
│   ├── deploy-commands.js       # Slash command registration
│   ├── commands/
│   │   ├── ticket-open.js       # /ticket command + modal
│   │   ├── ticket-manage.js     # close, reopen, claim, note, etc.
│   │   ├── admin.js             # panel, blacklist, stats, settings, canned
│   │   └── mod-panel.js         # /modpanel dashboard
│   ├── handlers/
│   │   ├── interactionHandler.js # Buttons, modals, selects router
│   │   └── autoClose.js         # Cron job for auto-close/delete
│   ├── events/
│   │   └── messageCreate.js     # Message logging + DM relay
│   └── utils/
│       ├── database.js          # SQLite schema + helpers
│       ├── embeds.js            # All embed factories + HTML transcript
│       ├── permissions.js       # Role-based access helpers
│       └── ticketService.js     # Core ticket lifecycle logic
├── data/
│   └── tickets.db               # Auto-created SQLite database
├── .env.example
└── package.json
```

---

## 🔗 Integration Notes

This bot is designed to live alongside **GitBot** and **ClaudeBot** in your server:

- **GitBot** posts GitHub events → ticket bot respects those channels and won't interfere
- **ClaudeBot** handles DMs → staff report tickets use a separate private DM flow
- All three bots can coexist with unique command namespaces

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

*Built for the FS25 Modding Community — TheCodingDad-TisonK*

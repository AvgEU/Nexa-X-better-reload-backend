const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require("discord.js");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ]
});
global.discordClient = client;
global.botConnected = false;
const fs = require("fs");
const path = require("path");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const log = require("../structs/log.js");
const Users = require("../model/user.js");

client.once("clientReady", () => {
    global.botConnected = true;
    log.bot("Bot is up and running!");

    if (config.bEnableBackendStatus) {
        if (!config.bBackendStatusChannelId || config.bBackendStatusChannelId.trim() === "") {
            log.error("The channel ID has not been set in config.json for bEnableBackendStatus.");
        } else {
            const channel = client.channels.cache.get(config.bBackendStatusChannelId);
            if (!channel) {
                log.error(`Cannot find the channel with ID ${config.bBackendStatusChannelId}`);
            } else {
                const embed = new EmbedBuilder()
                    .setTitle("Backend Online")
                    .setDescription("Nexa Backend is now online")
                    .setColor(0x00FF00)
                    .setThumbnail("https://i.imgur.com/2RImwlb.png")
                    .setFooter({ text: "Nexa Backend", iconURL: "https://i.imgur.com/2RImwlb.png" })
                    .setTimestamp();
                channel.send({ embeds: [embed] }).catch(err => log.error(err));
            }
        }
    }

    if (config.discord?.bEnableInGamePlayerCount) {
        function updateBotStatus() {
            if (global.Clients && Array.isArray(global.Clients)) {
                client.user.setActivity(`${global.Clients.length} player(s)`, { type: ActivityType.Watching });
            }
        }
        updateBotStatus();
        setInterval(updateBotStatus, 10000);
    }

    let commandData = [];
    const loadCommands = (dir) => {
        fs.readdirSync(dir).forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.lstatSync(filePath).isDirectory()) {
                loadCommands(filePath);
            } else if (file.endsWith(".js")) {
                try {
                    delete require.cache[require.resolve(filePath)];
                    const command = require(filePath);
                    if (command.commandInfo) commandData.push(command.commandInfo);
                } catch (err) {
                    log.error(`Failed to load command at ${filePath}: ${err}`);
                }
            }
        });
    };

    loadCommands(path.join(__dirname, "commands"));
    client.application.commands.set(commandData)
        .then(() => log.bot("Successfully synchronized application commands."))
        .catch(err => log.error(`Failed to sync application commands: ${err}`));
});

client.on("interactionCreate", async interaction => {
    const executeCommand = (dir, commandName) => {
        const commandPath = path.join(dir, commandName + ".js");
        if (fs.existsSync(commandPath)) {
            const command = require(commandPath);
            if (interaction.isCommand()) command.execute(interaction);
            else if (interaction.isAutocomplete() && command.autocomplete) command.autocomplete(interaction);
            return true;
        }
        const subdirs = fs.readdirSync(dir).filter(s => fs.lstatSync(path.join(dir, s)).isDirectory());
        for (const sub of subdirs) {
            if (executeCommand(path.join(dir, sub), commandName)) return true;
        }
        return false;
    };
    if (interaction.isCommand() || interaction.isAutocomplete()) {
        executeCommand(path.join(__dirname, "commands"), interaction.commandName);
    }
});

client.on("guildBanAdd", async (ban) => {
    if (!config.bEnableCrossBans) return;
    const memberBan = await ban.fetch();
    if (memberBan.user.bot) return;
    const userData = await Users.findOne({ discordId: memberBan.user.id });
    if (userData && userData.banned !== true) {
        await userData.updateOne({ $set: { banned: true } });
        let rt = global.refreshTokens.findIndex(i => i.accountId == userData.accountId);
        if (rt != -1) global.refreshTokens.splice(rt, 1);
        let at = global.accessTokens.findIndex(i => i.accountId == userData.accountId);
        if (at != -1) {
            global.accessTokens.splice(at, 1);
            const xmppClient = global.Clients.find(c => c.accountId == userData.accountId);
            if (xmppClient) xmppClient.client.close();
        }
        log.debug(`User ${memberBan.user.username} cross-banned.`);
    }
});

client.on("guildBanRemove", async (ban) => {
    if (!config.bEnableCrossBans) return;
    if (ban.user.bot) return;
    const userData = await Users.findOne({ discordId: ban.user.id });
    if (userData && userData.banned === true) {
        await userData.updateOne({ $set: { banned: false } });
        log.debug(`User ${ban.user.username} unbanned.`);
    }
});

client.on("error", (err) => log.error("Discord API Error:", err));

process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("strictQuery") || msg.includes("DeprecationWarning")) return;
    log.error("Unhandled promise rejection:", msg);
});

if (!config.discord?.bot_token || config.discord.bot_token.trim() === "") {
    log.error("Discord bot token not set in config.json — bot disabled.");
    global.botConnected = false;
} else {
    client.login(config.discord.bot_token).catch(err => {
        log.error("Failed to login to Discord bot:", err.message);
        global.botConnected = false;
    });
}

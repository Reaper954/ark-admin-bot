// commands.js
// Registers slash commands for the bot (Discord.js v14).
// Run: node commands.js
// Env needed: DISCORD_TOKEN, CLIENT_ID, GUILD_ID

require("dotenv").config();
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("Missing env vars. Need DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

const commands = [
  {
    name: "setup",
    description: "Admin: posts the rules + application panels",
    default_member_permissions: "0", // admin only by permissions in server; still guarded in code
    options: [
      {
        name: "rules_channel",
        description: "Channel to post the rules panel",
        type: 7, // CHANNEL
        required: true,
      },
      {
        name: "apply_channel",
        description: "Channel to post the application panel",
        type: 7, // CHANNEL
        required: true,
      },
      {
        name: "admin_channel",
        description: "Channel to send admin review requests",
        type: 7, // CHANNEL
        required: true,
      },
      {
        name: "admin_role",
        description: "Role to ping when a whiteflag is submitted",
        type: 8, // ROLE
        required: true,
      },
      {
        name: "open_season_role",
        description: "Role to ping when an admin ends a whiteflag early",
        type: 8, // ROLE
        required: true,
      },
      {
        name: "announce_channel",
        description: "Channel to announce Open Season (early end only)",
        type: 7, // CHANNEL
        required: true,
      },
    ],
  },
  {
    name: "rules",
    description: "Show White Flag rules",
  },
];

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log("✅ Commands registered.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

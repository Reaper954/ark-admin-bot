const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure channels for Open Season + Mod Logs")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((o) =>
      o
        .setName("open_season_channel")
        .setDescription("Where Open Season announcements go")
        .setRequired(true)
    )
    .addChannelOption((o) =>
      o
        .setName("mod_log_channel")
        .setDescription("Where mod logs go")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup_roles")
    .setDescription("Set staff roles to ping per cluster")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((o) =>
      o
        .setName("role_100x")
        .setDescription("Role to ping for PVP Chaos 100x")
        .setRequired(true)
    )
    .addRoleOption((o) =>
      o
        .setName("role_25x")
        .setDescription("Role to ping for PVP 25x")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("post_whiteflag_buttons")
    .setDescription("Post White Flag registration buttons (100x + 25x)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Post the White Flag rules"),

  new SlashCommandBuilder()
    .setName("whiteflag_list")
    .setDescription("List active White Flags")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("whiteflag_end")
    .setDescription("End a tribe's White Flag early")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("tribe").setDescription("Tribe name").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason (optional)").setRequired(false)
    ),

  // Optional pings (remove if you don't want these)
  new SlashCommandBuilder()
    .setName("ping100x")
    .setDescription("Ping the 100x role")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("message").setDescription("Optional message").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ping25x")
    .setDescription("Ping the 25x role")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("message").setDescription("Optional message").setRequired(false)
    ),
].map((c) => c.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("❌ Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("✅ Commands registered.");
  } catch (err) {
    console.error("❌ Command registration error:", err);
    process.exitCode = 1;
  }
})();

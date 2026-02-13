/**
 * commands.js (discord.js v14) — matches your updated JSON index.js
 *
 * - /setup includes: open_season_channel, review_channel, mod_log_channel
 * - Supports guild deploy if GUILD_ID is set (fast)
 * - Otherwise deploys globally (production)
 *
 * Required env:
 *  DISCORD_TOKEN=...
 *  CLIENT_ID=...
 *
 * Optional:
 *  GUILD_ID=...  (recommended for testing)
 */

require("dotenv").config();
const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // optional

if (!token) {
  console.error("❌ Missing DISCORD_TOKEN in .env / environment variables");
  process.exit(1);
}
if (!clientId) {
  console.error("❌ Missing CLIENT_ID in .env / environment variables");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure Open Season + Review + Mod Log channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((o) =>
      o
        .setName("open_season_channel")
        .setDescription("Open season channel (ONLY used for early-expire announcements)")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption((o) =>
      o
        .setName("review_channel")
        .setDescription("Staff review channel for whiteflag requests")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption((o) =>
      o
        .setName("mod_log_channel")
        .setDescription("Mod log channel for approvals/denials/expirations")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup_roles")
    .setDescription("Set roles for optional pings (100x / 25x)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((o) =>
      o.setName("role_100x").setDescription("Role for 100x").setRequired(true)
    )
    .addRoleOption((o) =>
      o.setName("role_25x").setDescription("Role for 25x").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("post_whiteflag_buttons")
    .setDescription("Post whiteflag request buttons (users submit; staff reviews)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Post the White Flag rules"),

  new SlashCommandBuilder()
    .setName("whiteflag_list")
    .setDescription("List pending + active whiteflags")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("whiteflag_end")
    .setDescription("End an active whiteflag early (announced in Open Season)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("tribe").setDescription("Tribe name").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason (optional)").setRequired(false)
    ),

  // Optional pings
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

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    if (guildId) {
      console.log(`Registering ${commands.length} commands to guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log("✅ Guild commands registered.");
    } else {
      console.log(`Registering ${commands.length} commands globally...`);
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log("✅ Global commands registered. (May take time to appear everywhere)");
    }
  } catch (err) {
    console.error("❌ Command registration error:", err);
    process.exitCode = 1;
  }
})();

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require("discord.js");

// -------------------- crash protection --------------------
process.on("unhandledRejection", (err) => console.error("UnhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("UncaughtException:", err));

// -------------------- storage files --------------------
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const WHITEFLAGS_FILE = path.join(__dirname, "whiteflags.json");

// -------------------- IDs --------------------
const BTN_100X = "whiteflag_btn:100x";
const BTN_25X = "whiteflag_btn:25x";
const MODAL_PREFIX = "whiteflag_modal:"; // whiteflag_modal:100x | whiteflag_modal:25x

// -------------------- JSON helpers --------------------
function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed reading JSON: ${filePath}`, e);
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error(`Failed writing JSON: ${filePath}`, e);
  }
}

// -------------------- settings (per guild) --------------------
function loadSettings() {
  return readJsonSafe(SETTINGS_FILE, {});
}
function saveSettings(all) {
  writeJsonSafe(SETTINGS_FILE, all);
}
function getGuildSettings(guildId) {
  const all = loadSettings();
  return all[guildId] || {};
}
function setGuildSettings(guildId, patch) {
  const all = loadSettings();
  all[guildId] = { ...(all[guildId] || {}), ...patch };
  saveSettings(all);
}

// -------------------- whiteflags --------------------
function loadWhiteflags() {
  return readJsonSafe(WHITEFLAGS_FILE, []);
}
function saveWhiteflags(items) {
  writeJsonSafe(WHITEFLAGS_FILE, items);
}
function pruneExpired(items) {
  const now = Date.now();
  const kept = items.filter((x) => !x.expiresAt || x.expiresAt > now);
  if (kept.length !== items.length) saveWhiteflags(kept);
  return kept;
}

// -------------------- helpers --------------------
function isAdminMember(member) {
  return member?.permissions?.has(PermissionsBitField.Flags.Administrator);
}

async function safeReply(interaction, payload) {
  const already = interaction.deferred || interaction.replied;
  if (already) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

async function sendModLog(guild, text) {
  try {
    const s = getGuildSettings(guild.id);
    if (!s.modLogChannelId) return;

    const ch = await guild.channels.fetch(s.modLogChannelId).catch(() => null);
    if (!ch) return;

    await ch.send({ content: text });
  } catch (e) {
    console.error("sendModLog error:", e);
  }
}

// -------------------- UI builders --------------------
function buildFormButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BTN_100X).setLabel("100x").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(BTN_25X).setLabel("25x").setStyle(ButtonStyle.Primary)
  );
}

function buildWhiteflagModal(tier) {
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${tier}`)
    .setTitle(`Whiteflag Request (${tier})`);

  const tribe = new TextInputBuilder()
    .setCustomId("tribe")
    .setLabel("Tribe name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const hours = new TextInputBuilder()
    .setCustomId("hours")
    .setLabel("Duration (hours)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Example: 24");

  const notes = new TextInputBuilder()
    .setCustomId("notes")
    .setLabel("Notes / reason (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(tribe),
    new ActionRowBuilder().addComponents(hours),
    new ActionRowBuilder().addComponents(notes)
  );

  return modal;
}

// -------------------- client --------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  pruneExpired(loadWhiteflags());
});

client.on("interactionCreate", async (interaction) => {
  try {
    // ---------- MODAL SUBMIT ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_PREFIX)) {
      const tier = interaction.customId.replace(MODAL_PREFIX, "");
      const guild = interaction.guild;

      if (!guild) {
        return safeReply(interaction, { content: "❌ Must be used in a server.", ephemeral: true });
      }

      const tribe = interaction.fields.getTextInputValue("tribe").trim();
      const hoursStr = interaction.fields.getTextInputValue("hours").trim();
      const notes = (interaction.fields.getTextInputValue("notes") || "").trim();

      const hours = Number(hoursStr);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
        return safeReply(interaction, {
          content: "❌ Duration must be a number between 1 and 168 hours.",
          ephemeral: true,
        });
      }

      const s = getGuildSettings(guild.id);
      if (!s.openSeasonChannelId) {
        return safeReply(interaction, {
          content: "❌ Bot is not set up yet. Run /setup first.",
          ephemeral: true,
        });
      }

      const roleId = tier === "100x" ? s.role100xId : s.role25xId;
      if (!roleId) {
        return safeReply(interaction, {
          content: "❌ Tier roles not set. Run /setup_roles first.",
          ephemeral: true,
        });
      }

      const expiresAt = Date.now() + hours * 60 * 60 * 1000;

      let items = pruneExpired(loadWhiteflags());
      const exists = items.find(
        (x) => x.guildId === guild.id && x.tribe.toLowerCase() === tribe.toLowerCase()
      );
      if (exists) {
        return safeReply(interaction, {
          content: "❌ That tribe already has an active whiteflag.",
          ephemeral: true,
        });
      }

      const entry = {
        guildId: guild.id,
        tribe,
        tier,
        notes,
        createdBy: interaction.user.id,
        createdAt: Date.now(),
        expiresAt,
      };

      items.push(entry);
      saveWhiteflags(items);

      const ch = await guild.channels.fetch(s.openSeasonChannelId).catch(() => null);
      if (ch) {
        const embed = new EmbedBuilder()
          .setTitle("🏳️ Whiteflag Active")
          .addFields(
            { name: "Tribe", value: tribe, inline: true },
            { name: "Tier", value: tier, inline: true },
            { name: "Duration", value: `${hours}h`, inline: true },
            { name: "Expires", value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true }
          );

        if (notes) embed.addFields({ name: "Notes", value: notes });

        await ch.send({
          content: `<@&${roleId}>`,
          embeds: [embed],
          allowedMentions: { parse: ["roles"] },
        });
      }

      await sendModLog(
        guild,
        `✅ Whiteflag started: **${tribe}** (${tier}) by <@${interaction.user.id}> for ${hours}h`
      );

      return safeReply(interaction, {
        content: `✅ Whiteflag started for **${tribe}** (${tier}) for **${hours}h**.`,
        ephemeral: true,
      });
    }

    // ---------- BUTTON ----------
    if (interaction.isButton()) {
      const guild = interaction.guild;
      if (!guild) {
        return safeReply(interaction, { content: "❌ Must be used in a server.", ephemeral: true });
      }

      // Restrict button usage to configured open-season channel (if set)
      const s = getGuildSettings(guild.id);
      if (s.openSeasonChannelId && interaction.channelId !== s.openSeasonChannelId) {
        return safeReply(interaction, {
          content: "❌ Please use this in the open-season channel.",
          ephemeral: true,
        });
      }

      if (interaction.customId === BTN_100X) return interaction.showModal(buildWhiteflagModal("100x"));
      if (interaction.customId === BTN_25X) return interaction.showModal(buildWhiteflagModal("25x"));
      return;
    }

    // ---------- SLASH COMMAND ----------
    if (!interaction.isChatInputCommand()) return;

    const guild = interaction.guild;
    if (!guild) {
      return safeReply(interaction, { content: "❌ Must be used in a server.", ephemeral: true });
    }

    const cmd = interaction.commandName;
    const isAdmin = isAdminMember(interaction.member);

    // ---- /setup ----
    if (cmd === "setup") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const openSeasonChannel = interaction.options.getChannel("open_season_channel", true);
      const modLogChannel = interaction.options.getChannel("mod_log_channel", true);

      setGuildSettings(guild.id, {
        openSeasonChannelId: openSeasonChannel.id,
        modLogChannelId: modLogChannel.id,
      });

      return safeReply(interaction, {
        content: `✅ Setup complete.\n- Open season: <#${openSeasonChannel.id}>\n- Mod log: <#${modLogChannel.id}>`,
        ephemeral: true,
      });
    }

    // ---- /setup_roles ----
    if (cmd === "setup_roles") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const role100x = interaction.options.getRole("role_100x", true);
      const role25x = interaction.options.getRole("role_25x", true);

      setGuildSettings(guild.id, { role100xId: role100x.id, role25xId: role25x.id });

      return safeReply(interaction, {
        content: `✅ Roles saved.\n- 100x: <@&${role100x.id}>\n- 25x: <@&${role25x.id}>`,
        ephemeral: true,
      });
    }

    // ---- /post_whiteflag_buttons ----
    if (cmd === "post_whiteflag_buttons") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const s = getGuildSettings(guild.id);
      if (!s.openSeasonChannelId) {
        return safeReply(interaction, {
          content: "❌ Run /setup first (open season channel not set).",
          ephemeral: true,
        });
      }

      const ch = await guild.channels.fetch(s.openSeasonChannelId).catch(() => null);
      if (!ch) {
        return safeReply(interaction, { content: "❌ Open season channel missing.", ephemeral: true });
      }

      await ch.send({
        content: "Select a tier to submit a whiteflag request:",
        components: [buildFormButtons()],
      });

      return safeReply(interaction, { content: "✅ Buttons posted.", ephemeral: true });
    }

    // ---- /rules ----
    if (cmd === "rules") {
      const rulesText =
        "**🏳️ White Flag Rules**\n" +
        "• Do not raid tribes with an active white flag.\n" +
        "• White flag applies for the approved duration.\n" +
        "• Any abuse may result in removal and punishment.\n" +
        "• Staff decision is final.\n";

      const channel = interaction.channel;
      if (!channel) {
        return safeReply(interaction, { content: "❌ Can't find a channel.", ephemeral: true });
      }

      await channel.send({ content: rulesText });
      return safeReply(interaction, { content: "✅ Rules posted.", ephemeral: true });
    }

    // ---- /whiteflag_list ----
    if (cmd === "whiteflag_list") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      let items = pruneExpired(loadWhiteflags()).filter((x) => x.guildId === guild.id);
      if (!items.length) return safeReply(interaction, { content: "No active whiteflags.", ephemeral: true });

      const lines = items
        .sort((a, b) => a.expiresAt - b.expiresAt)
        .map((x) => {
          const exp = x.expiresAt ? `<t:${Math.floor(x.expiresAt / 1000)}:R>` : "N/A";
          return `• **${x.tribe}** (${x.tier}) expires ${exp}`;
        });

      return safeReply(interaction, {
        content: `**Active whiteflags:**\n${lines.join("\n")}`,
        ephemeral: true,
      });
    }

    // ---- /whiteflag_end ----
    if (cmd === "whiteflag_end") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const tribeInput = interaction.options.getString("tribe", true);
      const reason = interaction.options.getString("reason") || "No reason provided";

      let items = pruneExpired(loadWhiteflags());
      const idx = items.findIndex(
        (x) => x.guildId === guild.id && x.tribe.toLowerCase() === tribeInput.toLowerCase()
      );

      if (idx === -1) {
        return safeReply(interaction, {
          content: "❌ No active whiteflag found for that tribe.",
          ephemeral: true,
        });
      }

      const ended = items[idx];
      items.splice(idx, 1);
      saveWhiteflags(items);

      await sendModLog(
        guild,
        `🛑 Whiteflag ended: **${ended.tribe}** (${ended.tier}) by <@${interaction.user.id}> — Reason: ${reason}`
      );

      return safeReply(interaction, {
        content: `✅ Ended whiteflag for **${ended.tribe}** (${ended.tier}).`,
        ephemeral: true,
      });
    }

    // ---- /ping100x and /ping25x ----
    if (cmd === "ping100x" || cmd === "ping25x") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const s = getGuildSettings(guild.id);
      const roleId = cmd === "ping100x" ? s.role100xId : s.role25xId;
      const tierName = cmd === "ping100x" ? "100x" : "25x";

      if (!roleId) {
        return safeReply(interaction, { content: "❌ Run /setup_roles first.", ephemeral: true });
      }

      const msg = interaction.options.getString("message") || `Ping for ${tierName}`;

      const channel = interaction.channel;
      if (!channel) {
        return safeReply(interaction, {
          content: "❌ Can't find a channel to send the ping.",
          ephemeral: true,
        });
      }

      await channel.send({
        content: `<@&${roleId}> ${msg}`,
        allowedMentions: { parse: ["roles"] },
      });

      return safeReply(interaction, { content: "✅ Ping sent.", ephemeral: true });
    }

    // fallback
    return safeReply(interaction, { content: "❓ Unknown command.", ephemeral: true });
  } catch (err) {
    console.error("interactionCreate error:", err);
    if (interaction.isRepliable()) {
      await safeReply(interaction, { content: "❌ Something went wrong.", ephemeral: true });
    }
  }
});

// -------------------- login --------------------
const token = process.env.TOKEN;
if (!token) {
  console.error("❌ Missing TOKEN in .env");
  process.exit(1);
}
client.login(token);

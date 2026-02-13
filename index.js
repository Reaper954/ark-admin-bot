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
  ChannelType,
} = require("discord.js");

// ==================== CONFIG ====================
const FIXED_DURATION_HOURS = 168; // 7 days
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const WHITEFLAGS_FILE = path.join(__dirname, "whiteflags.json");

// Custom IDs
const BTN_100X = "whiteflag_btn:100x";
const BTN_25X = "whiteflag_btn:25x";
const USER_MODAL_PREFIX = "whiteflag_modal:"; // whiteflag_modal:100x | whiteflag_modal:25x

const REVIEW_PREFIX = "wf_review:"; // wf_review:approve:<id> | wf_review:deny:<id>
const STAFF_APPROVE_MODAL_PREFIX = "wf_staff_approve:"; // wf_staff_approve:<id>

// -------------------- crash protection --------------------
process.on("unhandledRejection", (err) => console.error("UnhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("UncaughtException:", err));

// ==================== JSON helpers ====================
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

// ==================== Settings (per guild) ====================
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
function assertSetup(guildId) {
  const s = getGuildSettings(guildId);
  const missing = [];
  if (!s.openSeasonChannelId) missing.push("open season channel");
  if (!s.reviewChannelId) missing.push("review channel");
  if (!s.modLogChannelId) missing.push("mod log channel");
  // roles are optional now since duration fixed; keep if you still want /ping commands
  // if (!s.role100xId) missing.push("100x role");
  // if (!s.role25xId) missing.push("25x role");
  return { ok: missing.length === 0, missing, s };
}

// ==================== Whiteflags (JSON array) ====================
function loadWhiteflags() {
  return readJsonSafe(WHITEFLAGS_FILE, []);
}
function saveWhiteflags(items) {
  writeJsonSafe(WHITEFLAGS_FILE, items);
}
function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function normalizeTier(tier) {
  return tier === "100x" ? "100x" : "25x";
}
function pruneExpiredWithReport(items) {
  const now = Date.now();
  const expired = [];
  const kept = [];

  for (const x of items) {
    if (x.status === "active" && x.expiresAt && x.expiresAt <= now) expired.push(x);
    else kept.push(x);
  }

  if (kept.length !== items.length) saveWhiteflags(kept);
  return { kept, expired };
}

// ==================== Helpers ====================
function isAdminMember(member) {
  return member?.permissions?.has(PermissionsBitField.Flags.Administrator);
}

async function safeReply(interaction, payload) {
  const already = interaction.deferred || interaction.replied;
  if (already) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

async function sendToChannelId(guild, channelId, payload) {
  if (!channelId) return null;
  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (!ch) return null;
  return ch.send(payload).catch(() => null);
}

async function sendModLog(guild, text) {
  const s = getGuildSettings(guild.id);
  return sendToChannelId(guild, s.modLogChannelId, { content: text });
}

async function sendOpenSeason(guild, payload) {
  const s = getGuildSettings(guild.id);
  return sendToChannelId(guild, s.openSeasonChannelId, payload);
}

async function sendReview(guild, payload) {
  const s = getGuildSettings(guild.id);
  return sendToChannelId(guild, s.reviewChannelId, payload);
}

async function tryDM(client, userId, payload) {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return false;
    await user.send(payload).catch(() => null);
    return true;
  } catch {
    return false;
  }
}

// ==================== UI builders ====================
function buildFormButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BTN_100X).setLabel("100x").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(BTN_25X).setLabel("25x").setStyle(ButtonStyle.Primary)
  );
}

// USER REQUEST MODAL (your requested fields)
function buildUserRequestModal(tier) {
  const modal = new ModalBuilder()
    .setCustomId(`${USER_MODAL_PREFIX}${tier}`)
    .setTitle(`Whiteflag Request (${tier})`);

  const ign = new TextInputBuilder()
    .setCustomId("ign")
    .setLabel("IGN")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(32)
    .setPlaceholder("Example: Cookm");

  const tribe = new TextInputBuilder()
    .setCustomId("tribe")
    .setLabel("Tribe")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(40)
    .setPlaceholder("Example: The Bloodhounds");

  const map = new TextInputBuilder()
    .setCustomId("map")
    .setLabel("Map")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(40)
    .setPlaceholder("Example: The Island / Fjordur / Center");

  const tribemates = new TextInputBuilder()
    .setCustomId("tribemates")
    .setLabel("Tribemates (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(300)
    .setPlaceholder("Example: Player1, Player2, Player3");

  modal.addComponents(
    new ActionRowBuilder().addComponents(ign),
    new ActionRowBuilder().addComponents(tribe),
    new ActionRowBuilder().addComponents(map),
    new ActionRowBuilder().addComponents(tribemates)
  );

  return modal;
}

function buildReviewButtons(requestId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${REVIEW_PREFIX}approve:${requestId}`)
      .setLabel("Approve (7 days)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${REVIEW_PREFIX}deny:${requestId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
  );
}

// Optional staff note modal (NO duration input)
function buildStaffApproveModal(requestId, entry) {
  const modal = new ModalBuilder()
    .setCustomId(`${STAFF_APPROVE_MODAL_PREFIX}${requestId}`)
    .setTitle(`Approve: ${entry.tribe} (${entry.tier})`);

  const staffNote = new TextInputBuilder()
    .setCustomId("staff_note")
    .setLabel("Staff note (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(300)
    .setPlaceholder("Optional note for logs/DM");

  modal.addComponents(new ActionRowBuilder().addComponents(staffNote));
  return modal;
}

function buildReviewEmbed(entry) {
  const embed = new EmbedBuilder()
    .setTitle("📝 Whiteflag Request (Pending Staff Review)")
    .addFields(
      { name: "Tier", value: `**${entry.tier}**`, inline: true },
      { name: "IGN", value: `**${entry.ign}**`, inline: true },
      { name: "Tribe", value: `**${entry.tribe}**`, inline: true },
      { name: "Map", value: entry.map, inline: true },
      { name: "Requested By", value: `<@${entry.requestedBy}>`, inline: true },
      { name: "Request ID", value: `\`${entry.id}\``, inline: false }
    );

  if (entry.tribemates) embed.addFields({ name: "Tribemates", value: entry.tribemates, inline: false });

  return embed;
}

// ==================== Discord client ====================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// v14 uses "ready"; v15 uses "clientReady" (safe to listen to both)
let ranReady = false;
function onReady() {
  if (ranReady) return;
  ranReady = true;

  console.log(`✅ Logged in as ${client.user.tag}`);

  // Auto-expire loop: log + DM only (NO open-season announcements)
  setInterval(async () => {
    try {
      const all = loadWhiteflags();
      const { expired } = pruneExpiredWithReport(all);
      if (!expired.length) return;

      const byGuild = new Map();
      for (const e of expired) {
        if (!byGuild.has(e.guildId)) byGuild.set(e.guildId, []);
        byGuild.get(e.guildId).push(e);
      }

      for (const [guildId, entries] of byGuild) {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        for (const e of entries) {
          await sendModLog(
            guild,
            `⏱️ Whiteflag expired: **${e.tribe}** (${e.tier}) (requested by <@${e.requestedBy}>)`
          );

          await tryDM(client, e.requestedBy, {
            content: `⏱️ Your whiteflag expired in **${guild.name}**.\nTribe: **${e.tribe}** (${e.tier})`,
          });
        }
      }
    } catch (err) {
      console.error("auto-expire loop error:", err);
    }
  }, 60_000);
}
client.once("ready", onReady);
client.once("clientReady", onReady);

client.on("interactionCreate", async (interaction) => {
  try {
    // ===================== STAFF APPROVE MODAL SUBMIT =====================
    if (interaction.isModalSubmit() && interaction.customId.startsWith(STAFF_APPROVE_MODAL_PREFIX)) {
      const guild = interaction.guild;
      if (!guild) return safeReply(interaction, { content: "❌ Must be used in a server.", ephemeral: true });
      if (!isAdminMember(interaction.member)) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const requestId = interaction.customId.replace(STAFF_APPROVE_MODAL_PREFIX, "").trim();
      const staffNote = (interaction.fields.getTextInputValue("staff_note") || "").trim();

      const { ok, missing } = assertSetup(guild.id);
      if (!ok) return safeReply(interaction, { content: `❌ Missing setup: ${missing.join(", ")}`, ephemeral: true });

      // prune expired before actions
      const { kept } = pruneExpiredWithReport(loadWhiteflags());
      let items = kept;

      const idx = items.findIndex((x) => x.guildId === guild.id && x.id === requestId);
      if (idx === -1) return safeReply(interaction, { content: "❌ Request not found.", ephemeral: true });

      const entry = items[idx];
      if (entry.status !== "pending") return safeReply(interaction, { content: `❌ Request already **${entry.status}**.`, ephemeral: true });

      // Approve fixed duration
      entry.status = "active";
      entry.durationHours = FIXED_DURATION_HOURS;
      entry.approvedBy = interaction.user.id;
      entry.approvedAt = Date.now();
      entry.expiresAt = Date.now() + FIXED_DURATION_HOURS * 60 * 60 * 1000;
      if (staffNote) entry.staffNote = staffNote;

      items[idx] = entry;
      saveWhiteflags(items);

      // disable review buttons on the review message
      await interaction.message?.edit({ components: [] }).catch(() => null);

      await sendModLog(
        guild,
        `✅ Whiteflag approved: **${entry.tribe}** (${entry.tier}) by <@${interaction.user.id}> — Duration: 7 days — Expires <t:${Math.floor(entry.expiresAt / 1000)}:R>` +
          (staffNote ? ` — Note: ${staffNote}` : "")
      );

      await tryDM(client, entry.requestedBy, {
        content:
          `✅ Your whiteflag was approved in **${guild.name}**.\n` +
          `Tribe: **${entry.tribe}** (${entry.tier})\n` +
          `Duration: **7 days**\n` +
          `Expires: <t:${Math.floor(entry.expiresAt / 1000)}:R>` +
          (staffNote ? `\nStaff note: ${staffNote}` : ""),
      });

      return safeReply(interaction, { content: "✅ Approved for 7 days.", ephemeral: true });
    }

    // ===================== REVIEW BUTTONS =====================
    if (interaction.isButton() && interaction.customId.startsWith(REVIEW_PREFIX)) {
      const guild = interaction.guild;
      if (!guild) return safeReply(interaction, { content: "❌ Must be used in a server.", ephemeral: true });
      if (!isAdminMember(interaction.member)) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const [, action, requestId] = interaction.customId.split(":");
      if (!action || !requestId) return safeReply(interaction, { content: "❌ Invalid action.", ephemeral: true });

      const { ok, missing } = assertSetup(guild.id);
      if (!ok) return safeReply(interaction, { content: `❌ Missing setup: ${missing.join(", ")}`, ephemeral: true });

      const { kept } = pruneExpiredWithReport(loadWhiteflags());
      let items = kept;

      const idx = items.findIndex((x) => x.guildId === guild.id && x.id === requestId);
      if (idx === -1) return safeReply(interaction, { content: "❌ Request not found.", ephemeral: true });

      const entry = items[idx];
      if (entry.status !== "pending") return safeReply(interaction, { content: `❌ Request already **${entry.status}**.`, ephemeral: true });

      if (action === "deny") {
        items.splice(idx, 1);
        saveWhiteflags(items);

        await interaction.message?.edit({ components: [] }).catch(() => null);

        await sendModLog(
          guild,
          `❌ Whiteflag denied: **${entry.tribe}** (${entry.tier}) by <@${interaction.user.id}> (requested by <@${entry.requestedBy}>)`
        );

        await tryDM(client, entry.requestedBy, {
          content:
            `❌ Your whiteflag request was denied in **${guild.name}**.\n` +
            `Tribe: **${entry.tribe}** (${entry.tier})`,
        });

        return safeReply(interaction, { content: "✅ Denied.", ephemeral: true });
      }

      if (action === "approve") {
        // open staff note modal (duration fixed, so no hours asked)
        return interaction.showModal(buildStaffApproveModal(requestId, entry));
      }

      return safeReply(interaction, { content: "❌ Unknown action.", ephemeral: true });
    }

    // ===================== USER MODAL SUBMIT (REQUEST) =====================
    if (interaction.isModalSubmit() && interaction.customId.startsWith(USER_MODAL_PREFIX)) {
      const guild = interaction.guild;
      if (!guild) return safeReply(interaction, { content: "❌ Must be used in a server.", ephemeral: true });

      const tier = normalizeTier(interaction.customId.replace(USER_MODAL_PREFIX, ""));

      const ign = interaction.fields.getTextInputValue("ign").trim();
      const tribe = interaction.fields.getTextInputValue("tribe").trim();
      const map = interaction.fields.getTextInputValue("map").trim();
      const tribemates = (interaction.fields.getTextInputValue("tribemates") || "").trim();

      if (ign.length < 2) return safeReply(interaction, { content: "❌ IGN is too short.", ephemeral: true });
      if (tribe.length < 2) return safeReply(interaction, { content: "❌ Tribe is too short.", ephemeral: true });
      if (map.length < 2) return safeReply(interaction, { content: "❌ Map is too short.", ephemeral: true });

      const { ok, missing } = assertSetup(guild.id);
      if (!ok) return safeReply(interaction, { content: `❌ Missing setup: ${missing.join(", ")}`, ephemeral: true });

      // prune expired then check duplicates
      const { kept } = pruneExpiredWithReport(loadWhiteflags());
      let items = kept;

      const dup = items.find(
        (x) =>
          x.guildId === guild.id &&
          x.tribe.toLowerCase() === tribe.toLowerCase() &&
          (x.status === "pending" || x.status === "active")
      );
      if (dup) {
        return safeReply(interaction, { content: "❌ That tribe already has a pending/active whiteflag.", ephemeral: true });
      }

      const entry = {
        id: makeId(),
        guildId: guild.id,
        tier,
        ign,
        tribe,
        map,
        tribemates: tribemates || null,
        status: "pending",
        requestedBy: interaction.user.id,
        requestedAt: Date.now(),
      };

      items.push(entry);
      saveWhiteflags(items);

      const reviewMsg = await sendReview(guild, {
        embeds: [buildReviewEmbed(entry)],
        components: [buildReviewButtons(entry.id)],
      });

      if (!reviewMsg) {
        // rollback if review channel missing
        const after = loadWhiteflags().filter((x) => x.id !== entry.id);
        saveWhiteflags(after);
        return safeReply(interaction, { content: "❌ Review channel missing. Ask staff to run /setup.", ephemeral: true });
      }

      await sendModLog(
        guild,
        `📝 Whiteflag requested: **${tribe}** (${tier}) by <@${interaction.user.id}> — Pending staff review.`
      );

      return safeReply(interaction, { content: "✅ Request submitted! Staff will review it.", ephemeral: true });
    }

    // ===================== USER BUTTONS (OPEN MODAL) =====================
    if (interaction.isButton()) {
      const guild = interaction.guild;
      if (!guild) return safeReply(interaction, { content: "❌ Must be used in a server.", ephemeral: true });

      const s = getGuildSettings(guild.id);
      if (s.openSeasonChannelId && interaction.channelId !== s.openSeasonChannelId) {
        return safeReply(interaction, { content: "❌ Please use this in the open-season channel.", ephemeral: true });
      }

      if (interaction.customId === BTN_100X) return interaction.showModal(buildUserRequestModal("100x"));
      if (interaction.customId === BTN_25X) return interaction.showModal(buildUserRequestModal("25x"));
      return;
    }

    // ===================== SLASH COMMANDS =====================
    if (!interaction.isChatInputCommand()) return;

    const guild = interaction.guild;
    if (!guild) return safeReply(interaction, { content: "❌ Must be used in a server.", ephemeral: true });

    const cmd = interaction.commandName;
    const isAdmin = isAdminMember(interaction.member);

    if (cmd === "setup") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const openSeasonChannel = interaction.options.getChannel("open_season_channel", true);
      const reviewChannel = interaction.options.getChannel("review_channel", true);
      const modLogChannel = interaction.options.getChannel("mod_log_channel", true);

      if (openSeasonChannel.type !== ChannelType.GuildText) {
        return safeReply(interaction, { content: "❌ Open season must be a text channel.", ephemeral: true });
      }
      if (reviewChannel.type !== ChannelType.GuildText) {
        return safeReply(interaction, { content: "❌ Review must be a text channel.", ephemeral: true });
      }
      if (modLogChannel.type !== ChannelType.GuildText) {
        return safeReply(interaction, { content: "❌ Mod log must be a text channel.", ephemeral: true });
      }

      setGuildSettings(guild.id, {
        openSeasonChannelId: openSeasonChannel.id,
        reviewChannelId: reviewChannel.id,
        modLogChannelId: modLogChannel.id,
      });

      return safeReply(interaction, {
        content:
          `✅ Setup complete.\n` +
          `- Open season: <#${openSeasonChannel.id}> (ONLY early-expire announcements)\n` +
          `- Review: <#${reviewChannel.id}>\n` +
          `- Mod log: <#${modLogChannel.id}>`,
        ephemeral: true,
      });
    }

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

    if (cmd === "post_whiteflag_buttons") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const s = getGuildSettings(guild.id);
      if (!s.openSeasonChannelId) return safeReply(interaction, { content: "❌ Run /setup first.", ephemeral: true });

      const ch = await guild.channels.fetch(s.openSeasonChannelId).catch(() => null);
      if (!ch) return safeReply(interaction, { content: "❌ Open season channel missing.", ephemeral: true });

      await ch.send({
        content: "Select a tier to submit a whiteflag request (staff approval required):",
        components: [buildFormButtons()],
      });

      return safeReply(interaction, { content: "✅ Buttons posted.", ephemeral: true });
    }

    if (cmd === "rules") {
      const rulesText =
        "**🏳️ White Flag Rules**\n" +
        "• Do not raid tribes with an active white flag.\n" +
        "• White flag lasts **7 days** once approved.\n" +
        "• Any abuse may result in removal and punishment.\n" +
        "• Staff decision is final.\n";

      await interaction.channel?.send({ content: rulesText }).catch(() => null);
      return safeReply(interaction, { content: "✅ Rules posted.", ephemeral: true });
    }

    if (cmd === "whiteflag_list") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const { kept } = pruneExpiredWithReport(loadWhiteflags());
      const pending = kept.filter((x) => x.guildId === guild.id && x.status === "pending");
      const active = kept.filter((x) => x.guildId === guild.id && x.status === "active");

      if (!pending.length && !active.length) {
        return safeReply(interaction, { content: "No pending or active whiteflags.", ephemeral: true });
      }

      const lines = [];
      if (pending.length) {
        lines.push("**Pending:**");
        for (const x of pending.sort((a, b) => a.requestedAt - b.requestedAt)) {
          lines.push(`• **${x.tribe}** (${x.tier}) — IGN: ${x.ign} — Map: ${x.map}`);
        }
      }
      if (active.length) {
        lines.push("", "**Active:**");
        for (const x of active.sort((a, b) => a.expiresAt - b.expiresAt)) {
          lines.push(`• **${x.tribe}** (${x.tier}) expires <t:${Math.floor(x.expiresAt / 1000)}:R>`);
        }
      }

      return safeReply(interaction, { content: lines.join("\n"), ephemeral: true });
    }

    // ✅ ONLY open-season announcement happens here
    if (cmd === "whiteflag_end") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const tribeInput = interaction.options.getString("tribe", true);
      const reason = interaction.options.getString("reason") || "No reason provided";

      const { kept } = pruneExpiredWithReport(loadWhiteflags());
      let items = kept;

      const idx = items.findIndex(
        (x) =>
          x.guildId === guild.id &&
          x.status === "active" &&
          x.tribe.toLowerCase() === tribeInput.toLowerCase()
      );

      if (idx === -1) {
        return safeReply(interaction, { content: "❌ No active whiteflag found for that tribe.", ephemeral: true });
      }

      const ended = items[idx];
      items.splice(idx, 1);
      saveWhiteflags(items);

      await sendModLog(
        guild,
        `🛑 Whiteflag ended early: **${ended.tribe}** (${ended.tier}) by <@${interaction.user.id}> — Reason: ${reason}`
      );

      await sendOpenSeason(guild, {
        embeds: [
          new EmbedBuilder()
            .setTitle("🛑 Whiteflag Ended Early")
            .addFields(
              { name: "Tribe", value: ended.tribe, inline: true },
              { name: "Tier", value: ended.tier, inline: true },
              { name: "Reason", value: reason, inline: false }
            ),
        ],
      });

      await tryDM(client, ended.requestedBy, {
        content:
          `🛑 Your active whiteflag was ended early in **${guild.name}**.\n` +
          `Tribe: **${ended.tribe}** (${ended.tier})\nReason: ${reason}`,
      });

      return safeReply(interaction, { content: `✅ Ended whiteflag for **${ended.tribe}**.`, ephemeral: true });
    }

    // Optional pings
    if (cmd === "ping100x" || cmd === "ping25x") {
      if (!isAdmin) return safeReply(interaction, { content: "❌ No permission.", ephemeral: true });

      const s = getGuildSettings(guild.id);
      const roleId = cmd === "ping100x" ? s.role100xId : s.role25xId;
      const tierName = cmd === "ping100x" ? "100x" : "25x";

      if (!roleId) return safeReply(interaction, { content: "❌ Run /setup_roles first.", ephemeral: true });

      const msg = interaction.options.getString("message") || `Ping for ${tierName}`;
      await interaction.channel?.send({
        content: `<@&${roleId}> ${msg}`,
        allowedMentions: { parse: ["roles"] },
      }).catch(() => null);

      return safeReply(interaction, { content: "✅ Ping sent.", ephemeral: true });
    }

    return safeReply(interaction, { content: "❓ Unknown command.", ephemeral: true });
  } catch (err) {
    console.error("interactionCreate error:", err);
    if (interaction.isRepliable()) {
      await safeReply(interaction, { content: "❌ Something went wrong.", ephemeral: true });
    }
  }
});

// -------------------- login --------------------
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ Missing DISCORD_TOKEN in env.");
  process.exit(1);
}
client.login(token);

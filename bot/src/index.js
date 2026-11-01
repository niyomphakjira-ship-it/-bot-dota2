import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  InviteTargetType,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder,
} from 'discord.js';
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import * as googleTTS from 'google-tts-api';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import { DOTA_HEROES, SOUNDBOARD_ITEMS, findHeroCounter } from './dota-data.js';
import {
  linkPlayer,
  getLinkedAccountId,
  parseAccountId,
  getPlayerStats,
  getLastMatch,
  getMatchById,
  setWatchChannel,
  startMatchWatcher,
} from './opendota.js';
import {
  analyzeDraft,
  askDotaCoach,
  analyzeSituationalBuild,
  analyzeHeroMetaGuide,
  analyzeRoleMetaOverview,
  runAutonomousAgent,
} from './ai-coach.js';
import { generateMatchBanner } from './match-image.js';
import { startMultiplayerServer } from './multiplayer-server.js';

dotenv.config();
if (ffmpegPath && fs.existsSync(ffmpegPath)) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const { DISCORD_TOKEN: RAW_DISCORD_TOKEN, CLIENT_ID, PORT } = process.env;
const tokenMatch = String(RAW_DISCORD_TOKEN || '').match(
  /([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,})/
);
const DISCORD_TOKEN = tokenMatch ? tokenMatch[1] : (RAW_DISCORD_TOKEN || '').trim();
let lastBotError = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Start Real-Time Multiplayer WebSocket + Activity Web Server
startMultiplayerServer(Number(PORT) || 3000, () => ({
  botOnline: client.isReady(),
  botTag: client.user?.tag || null,
  hasToken: Boolean(DISCORD_TOKEN),
  hasGeminiKey: Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY
  ),
  detectedEnvKeys: Object.keys(process.env).filter((k) => /gemini|google/i.test(k)),
  hasStratzToken: Boolean(process.env.STRATZ_TOKEN),
  botError: lastBotError,
}));

process.on('unhandledRejection', (err) => console.error('⚠️ Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught Exception:', err));
client.on('error', (err) => console.error('⚠️ Client Error:', err));

const THEME = {
  dark: 0x2B2D31,
  accent: 0xB93524,
  win: 0x3BA55D,
  loss: 0xC23C2A,
};

const guildPlayers = new Map();

function getOrCreatePlayer(guildId) {
  if (!guildPlayers.has(guildId)) {
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    player.on('error', (err) => console.error('AudioPlayer Error:', err.message));
    guildPlayers.set(guildId, player);
  }
  return guildPlayers.get(guildId);
}

async function playVoiceTTS(voiceChannel, text, lang = 'th') {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  const player = getOrCreatePlayer(voiceChannel.guild.id);
  connection.subscribe(player);

  const base64Audio = await googleTTS.getAudioBase64(text.slice(0, 190), {
    lang,
    slow: false,
    host: 'https://translate.google.com',
  });

  const stream = Readable.from(Buffer.from(base64Audio, 'base64'));
  player.play(createAudioResource(stream));
  return connection;
}

async function deferIfNeeded(replyTarget) {
  if (replyTarget.isInteraction) {
    try {
      await replyTarget.deferReply();
    } catch {}
  }
}

async function sendReply(replyTarget, payload) {
  return replyTarget.isInteraction ? replyTarget.editReply(payload) : replyTarget.reply(payload);
}

// 1. Voice Join / Leave / Soundboard
async function handleJoinVoice(voiceChannel, replyTarget) {
  if (!voiceChannel) {
    const msg = '⚠️ เข้าห้องเสียงก่อนใช้งาน';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }

  await deferIfNeeded(replyTarget);
  try {
    await playVoiceTTS(voiceChannel, 'สวัสดี โดต้า ทู พร้อมแล้ว', 'th');
    const embed = new EmbedBuilder()
      .setColor(THEME.dark)
      .setDescription(`Connected · **${voiceChannel.name}**`);
    return sendReply(replyTarget, { embeds: [embed] });
  } catch (error) {
    return sendReply(replyTarget, { content: `Error: ${error.message}` });
  }
}

async function handleLeaveVoice(guildId, replyTarget) {
  const connection = getVoiceConnection(guildId);
  if (!connection) {
    const msg = 'บอทไม่ได้อยู่ในห้องเสียง';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }
  connection.destroy();
  guildPlayers.delete(guildId);
  return replyTarget.reply({ content: 'Disconnected.' });
}

async function handleSoundboard(replyTarget) {
  const embed = new EmbedBuilder().setColor(THEME.dark).setTitle('Soundboard');
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  SOUNDBOARD_ITEMS.forEach((item, index) => {
    const btn = new ButtonBuilder()
      .setCustomId(item.id)
      .setLabel(item.label)
      .setStyle(ButtonStyle.Secondary);
    if (index < 3) row1.addComponents(btn);
    else row2.addComponents(btn);
  });

  const components = [row1];
  if (row2.components.length > 0) components.push(row2);
  return replyTarget.reply({ embeds: [embed], components });
}

// 2. Counter-Pick
function buildHeroSelectMenu() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('select_dota_counter')
    .setPlaceholder('Select Hero...')
    .addOptions(
      Object.entries(DOTA_HEROES).map(([key, hero]) => ({
        label: hero.name,
        description: hero.role,
        value: key,
      }))
    );
  return new ActionRowBuilder().addComponents(select);
}

function buildHeroCounterMessage(heroData) {
  const embed = new EmbedBuilder()
    .setColor(THEME.accent)
    .setTitle(heroData.name)
    .setDescription(`\`${heroData.role}\``)
    .addFields(
      { name: 'Counters', value: heroData.counters.join('\n') },
      { name: 'Key Items', value: heroData.items.join('\n') },
      { name: 'Strategy', value: `> ${heroData.tips}` }
    );

  const ttsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tts_hero_${heroData.aliases[0]}`)
      .setLabel('Play Voice Tip')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [buildHeroSelectMenu(), ttsRow] };
}

async function handleCounterCommand(query, replyTarget) {
  if (!query || query.trim() === '') {
    const embed = new EmbedBuilder().setColor(THEME.dark).setTitle('Counter-Pick');
    return replyTarget.reply({ embeds: [embed], components: [buildHeroSelectMenu()] });
  }

  const found = findHeroCounter(query);
  if (found) return replyTarget.reply(buildHeroCounterMessage(found));

  // หากไม่อยู่ในรายการด่วน ให้ส่งต่อไปวิเคราะห์ผ่าน Live OpenDota / AI Draft ทันที
  return handleDraftCommand(query, null, replyTarget);
}

// 3. OpenDota Live Stats & Match History
function resolveTargetAccount(discordUserId, rawArg) {
  if (rawArg && rawArg.trim()) {
    const mentionMatch = rawArg.match(/<@!?(\d+)>/);
    if (mentionMatch) return getLinkedAccountId(mentionMatch[1]);
    return parseAccountId(rawArg);
  }
  return getLinkedAccountId(discordUserId);
}

async function handleLinkCommand(authorUser, rawArg, replyTarget, mentionedUser = null) {
  let targetUser = authorUser;
  let textToParse = rawArg;

  if (mentionedUser) {
    targetUser = mentionedUser;
    textToParse = rawArg.replace(/<@!?\d+>/g, '').trim();
  } else {
    const mentionMatch = rawArg.match(/<@!?(\d+)>/);
    if (mentionMatch) {
      const foundUser = client.users.cache.get(mentionMatch[1]);
      if (foundUser) {
        targetUser = foundUser;
      } else {
        targetUser = { id: mentionMatch[1], username: `<@${mentionMatch[1]}>` };
      }
      textToParse = rawArg.replace(mentionMatch[0], '').trim();
    }
  }

  const accountId = linkPlayer(targetUser.id, textToParse, targetUser.username || targetUser.tag);
  if (!accountId) {
    const msg = 'ระบุ Steam ID / Friend ID ที่ถูกต้อง เช่น `!link @เพื่อน 123456789`';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }
  const embed = new EmbedBuilder()
    .setColor(THEME.dark)
    .setDescription(`Linked · <@${targetUser.id}> → \`${accountId}\``);
  return replyTarget.reply({ embeds: [embed] });
}

async function handleStatCommand(discordUserId, rawArg, replyTarget) {
  const accountId = resolveTargetAccount(discordUserId, rawArg);
  if (!accountId) {
    const msg = 'ยังไม่ได้ผูกไอดี (`!link <friend_id>`)';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }

  await deferIfNeeded(replyTarget);
  try {
    const stats = await getPlayerStats(accountId);
    const embed = new EmbedBuilder()
      .setColor(THEME.dark)
      .setTitle(stats.name)
      .setDescription(`\`${stats.rank}\` · **${stats.winrate}%** (${stats.win}W – ${stats.lose}L)`)
      .addFields({
        name: 'Signature Heroes',
        value: stats.topHeroes.length > 0 ? stats.topHeroes.join('\n') : '—',
      });
    if (stats.avatar) embed.setThumbnail(stats.avatar);
    return sendReply(replyTarget, { embeds: [embed] });
  } catch (err) {
    return sendReply(replyTarget, { content: err.message });
  }
}

function buildMatchEmbed(titlePrefix, match) {
  return new EmbedBuilder()
    .setColor(match.won ? THEME.win : THEME.loss)
    .setTitle(`${titlePrefix}${match.won ? 'VICTORY' : 'DEFEAT'} · ${match.hero}`)
    .setDescription(
      `KDA **${match.kills}/${match.deaths}/${match.assists}** · ` +
      `GPM **${match.gpm}** · XPM **${match.xpm}**\n` +
      `DMG \`${match.heroDamage}\` · Time \`${match.duration}\` · ID \`${match.matchId}\``
    );
}

async function handleLastMatchCommand(discordUserId, rawArg, replyTarget) {
  const accountId = resolveTargetAccount(discordUserId, rawArg);
  if (!accountId) {
    const msg = 'ยังไม่ได้ผูกไอดี (`!link <friend_id>`)';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }

  await deferIfNeeded(replyTarget);
  try {
    const match = await getLastMatch(accountId);
    return sendReply(replyTarget, { embeds: [buildMatchEmbed('', match)] });
  } catch (err) {
    return sendReply(replyTarget, { content: err.message });
  }
}

function buildMatchCardEmbed(data, targetQuery, hasBanner = false) {
  const winTeam = data.radiantWin ? 'Radiant Victory' : 'Dire Victory';
  const scoreText = `Radiant **${data.radiantScore}** — **${data.direScore}** Dire · ${data.duration}`;

  const q = (targetQuery || '').toLowerCase().trim();
  let highlightedPlayer = null;
  if (q) {
    highlightedPlayer = data.players.find(
      (p) =>
        (p.hero && q.includes(p.hero.toLowerCase())) ||
        (p.name && q.includes(p.name.toLowerCase())) ||
        p.hero.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
    );

    if (!highlightedPlayer && (q.includes('กลาง') || q.includes('mid'))) {
      highlightedPlayer = data.players.find(
        (p) => p.lane === 'MID_LANE' || p.role === 'MID'
      );
    }
  }

  let highlightText = '';
  if (highlightedPlayer) {
    const outcome = highlightedPlayer.won ? '🏆 ชนะ' : '💀 แพ้';
    const stratzLine =
      (highlightedPlayer.lane ? `• **เลน:** ${highlightedPlayer.lane}\n` : '') +
      (highlightedPlayer.networth ? `• **Networth:** \`${highlightedPlayer.networth.toLocaleString()}\` · **GPM:** \`${highlightedPlayer.gpm}\`\n` : '') +
      (highlightedPlayer.lastHits ? `• **CS (Creep Score):** \`${highlightedPlayer.lastHits}/${highlightedPlayer.denies}\`\n` : '') +
      (highlightedPlayer.imp !== null ? `• **STRATZ IMP:** \`${highlightedPlayer.imp > 0 ? '+' : ''}${highlightedPlayer.imp}\` (${highlightedPlayer.impComment})\n` : '');

    const supportLine =
      (highlightedPlayer.role ? `• **ตำแหน่ง (Role):** \`${highlightedPlayer.role}\`\n` : '') +
      (highlightedPlayer.obsPlaced || highlightedPlayer.dewards || highlightedPlayer.campsStacked
        ? `• **วิชั่น & ซัพพอร์ต:** ปัก Obs \`${highlightedPlayer.obsPlaced || 0}\` / Sen \`${highlightedPlayer.senPlaced || 0}\` · แก้หวอด \`${highlightedPlayer.dewards || 0}\` · สแต็ก \`${highlightedPlayer.campsStacked || 0}\` กอง\n`
        : '') +
      (highlightedPlayer.heroHealing > 0 ? `• **ฮีลเพื่อน:** \`${highlightedPlayer.heroHealing.toLocaleString()}\` HP\n` : '');

    highlightText =
      `\n**ผู้เล่นที่ตรวจสอบ (${highlightedPlayer.name}):**\n` +
      `• ฮีโร่: **${highlightedPlayer.hero}** (${highlightedPlayer.team})\n` +
      `• ผลการแข่งขัน: **${outcome}**\n` +
      `• KDA: \`${highlightedPlayer.kda}\` · Hero Damage: \`${(highlightedPlayer.heroDamage || 0).toLocaleString()}\`\n` +
      stratzLine +
      supportLine;
  }

  const topDamagers = [...data.players]
    .sort((a, b) => b.heroDamage - a.heroDamage)
    .slice(0, 4)
    .map(
      (p) =>
        `• **${p.name}** (${p.hero}): \`${p.kda}\` · Dmg \`${(p.heroDamage || 0).toLocaleString()}\`` +
        (p.imp !== null ? ` (IMP \`${p.imp > 0 ? '+' : ''}${p.imp}\`)` : '')
    )
    .join('\n');

  let visionWarText = '';
  if (data.radiantVision && data.direVision) {
    visionWarText =
      `\n**👁️ สงครามวิชั่น (Vision War):**\n` +
      `• Radiant: ปัก Obs \`${data.radiantVision.obsPlaced}\` · Sen \`${data.radiantVision.senPlaced}\` · แก้ได้ \`${data.radiantVision.dewards}\` · สแต็ก \`${data.radiantVision.campsStacked}\` กอง\n` +
      `• Dire: ปัก Obs \`${data.direVision.obsPlaced}\` · Sen \`${data.direVision.senPlaced}\` · แก้ได้ \`${data.direVision.dewards}\` · สแต็ก \`${data.direVision.campsStacked}\` กอง`;
  }

  const embed = new EmbedBuilder()
    .setColor(data.radiantWin ? THEME.win : THEME.loss)
    .setTitle(`Match #${data.matchId} · ${winTeam}`)
    .setDescription(
      `${scoreText}\n` +
      `${highlightText}\n` +
      `**Top Performers (Damage):**\n${topDamagers}\n` +
      `${visionWarText}`
    )
    .setFooter({ text: data.hasStratz ? 'Powered by OpenDota + STRATZ Analytics' : 'Powered by OpenDota' });

  if (hasBanner) {
    embed.setImage('attachment://match-banner.png');
  }

  return embed;
}

async function fetchMatchWithRetry(matchId, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const data = await getMatchById(matchId);
      if (data) return data;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return null;
}

async function handleInspectMatchCommand(matchId, targetQuery, replyTarget) {
  const cleanId = String(matchId || '').match(/\d{8,12}/)?.[0];
  if (!cleanId) return;

  await deferIfNeeded(replyTarget);
  try {
    const data = await getMatchById(cleanId);
    const bannerBuffer = await generateMatchBanner(data, targetQuery).catch(() => null);
    const embed = buildMatchCardEmbed(data, targetQuery, Boolean(bannerBuffer));
    const payload = { embeds: [embed] };
    if (bannerBuffer) {
      payload.files = [new AttachmentBuilder(bannerBuffer, { name: 'match-banner.png' })];
    }
    return sendReply(replyTarget, payload);
  } catch (err) {
    return sendReply(replyTarget, { content: `⚠️ ตรวจสอบแมตช์ #${cleanId} ไม่สำเร็จ: ${err.message}` });
  }
}

async function handleBuildCommand(heroText, enemiesText, allyText, replyTarget) {
  if (!heroText || !heroText.trim()) {
    const msg = 'ระบุชื่อฮีโร่ เช่น `!build slark vs doom bloodseeker` หรือ `!combo juggernaut with cm`';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }

  await deferIfNeeded(replyTarget);
  try {
    const res = await analyzeSituationalBuild(heroText, enemiesText, allyText);
    const embed = new EmbedBuilder()
      .setColor(THEME.accent)
      .setTitle(`⚔️ Situational Build & Combo Guide · ${res.hero}`)
      .setDescription(res.text.slice(0, 3900))
      .setFooter({ text: 'SleepKnight AI Coach · Live Situational Itemization' });

    return sendReply(replyTarget, { embeds: [embed] });
  } catch (err) {
    return sendReply(replyTarget, { content: `Error: ${err.message}` });
  }
}

async function handleMetaCommand(query, replyTarget) {
  const clean = String(query || '').trim();
  if (!clean) {
    const msg = 'ระบุชื่อฮีโร่ หรือตำแหน่ง เช่น `/meta query:pa` หรือ `!meta carry` หรือ `!meta mid`';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }

  await deferIfNeeded(replyTarget);
  try {
    const isRole = /^(carry|mid|offlane|pos1|pos2|pos3|pos4|pos5|support|แครี่|เลนกลาง|มิด|ออฟเลน|ซัพ|ซัพพอร์ต)$/i.test(clean);
    const res = isRole
      ? await analyzeRoleMetaOverview(clean)
      : await analyzeHeroMetaGuide(clean);

    const title = res.hero
      ? `⚔️ Meta & Facet Guide · ${res.hero} (${res.stats?.divineWinrate ? `${res.stats.divineWinrate}% Winrate` : 'Live Meta'})`
      : `👑 Meta Rankings & Role Guide · ${res.roleTitle || clean.toUpperCase()}`;

    const text = res.text || '';
    if (text.length <= 3900) {
      const embed = new EmbedBuilder()
        .setColor(THEME.accent)
        .setTitle(title)
        .setDescription(text)
        .setFooter({ text: 'SleepKnight AI Coach · Live OpenDota & High-MMR Meta' });

      return sendReply(replyTarget, { embeds: [embed] });
    }

    // ข้อความยาวเกิน 3,900 ตัวอักษร ให้ตัดแบ่งเป็น 2 ตอนตามหัวข้อ markdown เพื่อไม่ให้ตกหล่น
    let splitIdx = text.lastIndexOf('\n### ', 3700);
    if (splitIdx < 1500) splitIdx = text.lastIndexOf('\n\n', 3700);
    if (splitIdx < 1000) splitIdx = 3700;

    const part1 = text.slice(0, splitIdx).trim();
    const part2 = text.slice(splitIdx).trim();

    const embed1 = new EmbedBuilder()
      .setColor(THEME.accent)
      .setTitle(`${title} (ตอนที่ 1/2)`)
      .setDescription(part1);

    const embed2 = new EmbedBuilder()
      .setColor(THEME.accent)
      .setTitle(`${title} (ตอนที่ 2/2)`)
      .setDescription(part2.slice(0, 3950))
      .setFooter({ text: 'SleepKnight AI Coach · Live OpenDota & High-MMR Meta' });

    await sendReply(replyTarget, { embeds: [embed1] });
    if (replyTarget.isInteraction && replyTarget.followUp) {
      await replyTarget.followUp({ embeds: [embed2] }).catch(() => {});
    } else if (replyTarget.channel?.send) {
      await replyTarget.channel.send({ embeds: [embed2] }).catch(() => {});
    }
    return;
  } catch (err) {
    return sendReply(replyTarget, { content: `⚠️ ดึงข้อมูลเมต้าไม่สำเร็จ: ${err.message}` });
  }
}

// 4. AI Draft & Coach (Gemini 3.8 Flash + OpenDota Statistical Matchups)
async function handleDraftCommand(enemiesText, discordUserId, replyTarget) {
  if (!enemiesText || !enemiesText.trim()) {
    const msg = 'ระบุฮีโร่ฝั่งตรงข้าม';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }

  await deferIfNeeded(replyTarget);
  try {
    const res = await analyzeDraft(enemiesText, discordUserId);
    const embed = new EmbedBuilder()
      .setColor(THEME.accent)
      .setTitle(`Draft Analysis · ${res.enemies.join(', ')}`)
      .setDescription(res.text.slice(0, 3900));
    return sendReply(replyTarget, { embeds: [embed] });
  } catch (err) {
    return sendReply(replyTarget, { content: `Error: ${err.message}` });
  }
}

async function handleAskCommand(question, discordUserId, replyTarget) {
  if (!question || !question.trim()) return;
  await deferIfNeeded(replyTarget);
  try {
    const res = await askDotaCoach(question, discordUserId);
    const embed = new EmbedBuilder()
      .setColor(THEME.dark)
      .setTitle('AI Coach')
      .setDescription(res.text.slice(0, 3900));
    return sendReply(replyTarget, { embeds: [embed] });
  } catch (err) {
    return sendReply(replyTarget, { content: `Error: ${err.message}` });
  }
}

// 5. Activity Invite
async function handleActivityInvite(voiceChannel, replyTarget) {
  if (!voiceChannel) {
    const msg = '⚠️ เข้าห้องเสียงก่อนเปิด Activity';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }

  await deferIfNeeded(replyTarget);
  try {
    const invite = await voiceChannel.createInvite({
      targetType: InviteTargetType.EmbeddedApplication,
      targetApplication: CLIENT_ID,
      maxAge: 3600,
    });

    const embed = new EmbedBuilder()
      .setColor(THEME.dark)
      .setTitle('Dota 2 Arena')
      .setDescription(`Channel · **${voiceChannel.name}**`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Launch Arena ↗')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.gg/${invite.code}`)
    );

    return sendReply(replyTarget, { embeds: [embed], components: [row] });
  } catch {
    return sendReply(replyTarget, { content: 'Activity invite failed.' });
  }
}

function buildInfoEmbed() {
  return new EmbedBuilder()
    .setColor(THEME.dark)
    .setTitle('💙 SleepKnight Dota 2 Bot & AI Coach')
    .setDescription(
      '`!meta <hero|role>` · คู่มือเมต้าเจาะลึก & วิเคราะห์ Facet / Innate\n' +
      '`!build <hero> vs <enemy>` · ไอเทมแก้ทางตามสถานการณ์จริง\n' +
      '`!combo <hero> with <ally>` · คอมโบเลนคู่และทีมไฟต์\n' +
      '`!stat` · `!lastmatch` · `!match <id>` · `!watch`\n' +
      '`!counter [hero]` · `!draft <enemies>` · `!ask <q>`\n' +
      '`!link <steamId>` · `!join` · `!leave` · `!sound` · `!activity`'
    );
}

client.once('ready', async () => {
  console.log(`🤖 Logged in as: ${client.user.tag}`);

  // Start Automatic Match Alert Poller with STRATZ deep card & savage AI roast
  startMatchWatcher(client, async (channel, discordUserId, match) => {
    try {
      console.log(`[AUTO MATCH ALERT] Triggered for user ${discordUserId}, match #${match.matchId}`);

      // 1. Fetch full match details with STRATZ analytics and banner image
      const matchData = await getMatchById(match.matchId).catch(() => null);

      let cardEmbed = null;
      let extraStats = '';
      let bannerFile = null;

      if (matchData) {
        const bannerBuffer = await generateMatchBanner(matchData, match.hero).catch(() => null);
        if (bannerBuffer) {
          bannerFile = new AttachmentBuilder(bannerBuffer, { name: 'match-banner.png' });
        }
        cardEmbed = buildMatchCardEmbed(matchData, match.hero, Boolean(bannerBuffer));
        const player = matchData.players?.find((p) => p.hero.toLowerCase() === match.hero.toLowerCase());
        if (player) {
          const supDetails = (player.obsPlaced || player.dewards || player.campsStacked || player.role?.includes('SUPPORT'))
            ? ` · Wards: ปัก Obs ${player.obsPlaced || 0} / Sen ${player.senPlaced || 0}, แก้หวอด ${player.dewards || 0}, สแต็ก ${player.campsStacked || 0} กอง, ฮีล ${(player.heroHealing || 0).toLocaleString()} HP`
            : '';
          extraStats = `\nสถิติของผู้เล่น: ฮีโร่ ${player.hero}, Role=${player.role || 'N/A'}, ผล=${player.won ? 'ชนะ' : 'แพ้'}, KDA=${player.kda}, Damage=${(player.heroDamage || 0).toLocaleString()}, NW=${(player.networth || 0).toLocaleString()}, GPM=${player.gpm || 0}, CS=${player.lastHits || 0}/${player.denies || 0}, STRATZ IMP=${player.imp !== null ? player.imp : 'N/A'}${supDetails}`;
        }
      } else {
        cardEmbed = buildMatchEmbed('🚨 ', match);
      }

      // 2. Generate a savage AI roast from Gemini
      const isDiscordUser = /^\d{17,20}$/.test(String(discordUserId));
      const playerName = matchData?.players?.find((p) => p.hero.toLowerCase() === match.hero.toLowerCase())?.name || 'เพื่อนในตี้';
      const playerTag = isDiscordUser ? `<@${discordUserId}>` : `**${playerName}**`;

      let roastText = `🚨 **จบแมตช์ใหม่สดๆ ร้อนๆ!** ${playerTag} เพิ่งเล่น **${match.hero}** จบในแมตช์ \`#${match.matchId}\` (${match.won ? '🏆 ชนะ' : '💀 แพ้'})!`;

      try {
        const aiPrompt =
          `[เหตุการณ์]: ผู้เล่น ${playerTag} เพิ่งเล่นแมตช์ Dota 2 จบสดๆ ร้อนๆ!\n` +
          `แมตช์ #${match.matchId}\n` +
          `ฮีโร่: ${match.hero}\n` +
          `ผลการแข่งขัน: ${match.won ? 'ชนะ (Victory)' : 'แพ้ (Defeat)'}\n` +
          `KDA: ${match.kills}/${match.deaths}/${match.assists}\n` +
          `GPM: ${match.gpm}, XPM: ${match.xpm}, ดาเมจ: ${match.heroDamage}\n` +
          `${extraStats}\n\n` +
          `[คำสั่ง]: ในฐานะโค้ช AI Dota 2 อัจฉริยะประจำกิลด์ SleepKnight Gaming ให้เขียนข้อความสรุปผลงาน 2-3 ประโยคเป็นภาษาไทยแบบมืออาชีพ สุภาพ เป็นกันเอง ชี้จุดเด่น/สิ่งที่ควรปรับเพื่อพัฒนาการเล่น และให้กำลังใจผู้เล่นคนนี้อย่างอบอุ่น (ไม่ต้องยาวเกินไป)`;

        const res = await askDotaCoach(aiPrompt, isDiscordUser ? discordUserId : 'general');
        if (res?.text && !res.text.includes('ระบบ AI')) {
          roastText = `🚨 ${playerTag}\n${res.text}`;
        }
      } catch (_aiErr) {}

      // 3. Send message to channel with both roast commentary and STRATZ embed card + banner image
      await channel.send({
        content: roastText.slice(0, 1990),
        embeds: cardEmbed ? [cardEmbed] : [],
        files: bannerFile ? [bannerFile] : [],
      });
    } catch (alertErr) {
      console.error('[AUTO MATCH ALERT ERROR]:', alertErr);
    }
  });

  const slashCommands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check latency'),
    new SlashCommandBuilder().setName('join').setDescription('Join voice channel'),
    new SlashCommandBuilder().setName('leave').setDescription('Leave voice channel'),
    new SlashCommandBuilder().setName('sound').setDescription('Soundboard'),
    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Voice TTS')
      .addStringOption((o) => o.setName('text').setDescription('Text').setRequired(true)),
    new SlashCommandBuilder()
      .setName('counter')
      .setDescription('Counter-pick lookup')
      .addStringOption((o) => o.setName('hero').setDescription('Hero').setRequired(false)),
    new SlashCommandBuilder()
      .setName('draft')
      .setDescription('AI & OpenDota draft counter analysis')
      .addStringOption((o) => o.setName('heroes').setDescription('Enemy heroes').setRequired(true)),
    new SlashCommandBuilder()
      .setName('ask')
      .setDescription('Ask AI Dota 2 Coach')
      .addStringOption((o) => o.setName('question').setDescription('Question').setRequired(true)),
    new SlashCommandBuilder()
      .setName('link')
      .setDescription('Link Dota 2 Friend ID / Steam ID')
      .addStringOption((o) => o.setName('id').setDescription('Friend ID or Steam ID').setRequired(true))
      .addUserOption((o) => o.setName('user').setDescription('Target friend to link for (optional)').setRequired(false)),
    new SlashCommandBuilder()
      .setName('stat')
      .setDescription('Live OpenDota player profile')
      .addStringOption((o) => o.setName('id').setDescription('Optional ID').setRequired(false)),
    new SlashCommandBuilder()
      .setName('lastmatch')
      .setDescription('Latest Dota 2 match summary')
      .addStringOption((o) => o.setName('id').setDescription('Optional ID').setRequired(false)),
    new SlashCommandBuilder()
      .setName('match')
      .setDescription('Inspect Dota 2 match by Match ID')
      .addStringOption((o) => o.setName('id').setDescription('Match ID (10 digits)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('watch')
      .setDescription('Set current channel for auto match alerts'),
    new SlashCommandBuilder()
      .setName('build')
      .setDescription('AI Situational Item Build & Counter Guide')
      .addStringOption((o) => o.setName('hero').setDescription('ฮีโร่ที่เราเล่น เช่น slark, pa, juggernaut').setRequired(true))
      .addStringOption((o) => o.setName('vs').setDescription('ฮีโร่ศัตรูที่ต้องแก้ทาง เช่น doom bloodseeker').setRequired(false))
      .addStringOption((o) => o.setName('ally').setDescription('ฮีโร่เพื่อนร่วมทีมที่ต้องการหาคอมโบด้วย').setRequired(false)),
    new SlashCommandBuilder()
      .setName('combo')
      .setDescription('AI Hero Combo & Lane Partner Guide')
      .addStringOption((o) => o.setName('hero').setDescription('ฮีโร่ที่เราเล่น เช่น juggernaut, magnus').setRequired(true))
      .addStringOption((o) => o.setName('ally').setDescription('ฮีโร่เพื่อนร่วมทีม (ถ้ามี)').setRequired(false)),
    new SlashCommandBuilder()
      .setName('meta')
      .setDescription('วิเคราะห์เมต้าแพตช์ปัจจุบันและแนะนำ Facet/Innate เจาะลึกสำหรับฮีโร่หรือตำแหน่ง')
      .addStringOption((o) =>
        o
          .setName('query')
          .setDescription('ชื่อฮีโร่ (เช่น pa, axe, slark) หรือตำแหน่ง (เช่น carry, mid, offlane, support)')
          .setRequired(true)
      ),
    new SlashCommandBuilder().setName('activity').setDescription('Launch Multiplayer Dota 2 Arena'),
    new SlashCommandBuilder().setName('info').setDescription('Commands'),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
    } catch (err) {
      console.error(`Commands sync error in ${guild.name}:`, err.message);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: '⚠️ เข้าห้องเสียงก่อนใช้งาน', flags: 64 });
    }

    const soundItem = SOUNDBOARD_ITEMS.find((item) => item.id === interaction.customId);
    if (soundItem) {
      await interaction.deferReply({ flags: 64 });
      try {
        await playVoiceTTS(voiceChannel, soundItem.text, soundItem.lang);
        await interaction.editReply({ content: `Playing · **${soundItem.label}**` });
      } catch (err) {
        await interaction.editReply({ content: `Error: ${err.message}` });
      }
      return;
    }

    if (interaction.customId.startsWith('tts_hero_')) {
      const heroKey = interaction.customId.replace('tts_hero_', '');
      const hero = DOTA_HEROES[heroKey] || findHeroCounter(heroKey);
      if (hero) {
        await interaction.deferReply({ flags: 64 });
        try {
          await playVoiceTTS(voiceChannel, `วิธีแก้ทาง ${hero.name}. ${hero.tips}`, 'th');
          await interaction.editReply({ content: `Speaking · **${hero.name}**` });
        } catch (err) {
          await interaction.editReply({ content: `Error: ${err.message}` });
        }
      }
      return;
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'select_dota_counter') {
    const heroData = DOTA_HEROES[interaction.values[0]];
    if (heroData) await interaction.update(buildHeroCounterMessage(heroData));
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const replyTarget = {
    isInteraction: true,
    channel: interaction.channel,
    followUp: interaction.followUp ? interaction.followUp.bind(interaction) : null,
    reply: interaction.reply.bind(interaction),
    editReply: interaction.editReply.bind(interaction),
    deferReply: interaction.deferReply.bind(interaction),
  };

  if (commandName === 'ping') {
    const sent = await interaction.reply({ content: '...', fetchReply: true });
    return interaction.editReply(`\`${sent.createdTimestamp - interaction.createdTimestamp}ms\` (ws: \`${client.ws.ping}ms\`)`);
  }
  if (commandName === 'join') return handleJoinVoice(interaction.member?.voice?.channel, replyTarget);
  if (commandName === 'leave') return handleLeaveVoice(interaction.guildId, replyTarget);
  if (commandName === 'sound') return handleSoundboard(replyTarget);
  if (commandName === 'say') {
    const text = interaction.options.getString('text');
    const vc = interaction.member?.voice?.channel;
    if (!vc) return interaction.reply({ content: '⚠️ เข้าห้องเสียงก่อน', flags: 64 });
    await interaction.deferReply();
    try {
      await playVoiceTTS(vc, text, 'th');
      await interaction.editReply(`Speaking: "${text}"`);
    } catch (e) {
      await interaction.editReply(`Error: ${e.message}`);
    }
    return;
  }
  if (commandName === 'counter') return handleCounterCommand(interaction.options.getString('hero') || '', replyTarget);
  if (commandName === 'draft') return handleDraftCommand(interaction.options.getString('heroes'), interaction.user.id, replyTarget);
  if (commandName === 'build') {
    return handleBuildCommand(
      interaction.options.getString('hero'),
      interaction.options.getString('vs') || '',
      interaction.options.getString('ally') || '',
      replyTarget
    );
  }
  if (commandName === 'combo') {
    return handleBuildCommand(
      interaction.options.getString('hero'),
      '',
      interaction.options.getString('ally') || '',
      replyTarget
    );
  }
  if (commandName === 'meta') return handleMetaCommand(interaction.options.getString('query') || '', replyTarget);
  if (commandName === 'ask') return handleAskCommand(interaction.options.getString('question'), interaction.user.id, replyTarget);
  if (commandName === 'link') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    return handleLinkCommand(interaction.user, interaction.options.getString('id'), replyTarget, targetUser);
  }
  if (commandName === 'stat') return handleStatCommand(interaction.user.id, interaction.options.getString('id') || '', replyTarget);
  if (commandName === 'lastmatch') return handleLastMatchCommand(interaction.user.id, interaction.options.getString('id') || '', replyTarget);
  if (commandName === 'match') return handleInspectMatchCommand(interaction.options.getString('id') || '', '', replyTarget);
  if (commandName === 'watch') {
    setWatchChannel(interaction.guildId, interaction.channelId);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.dark).setDescription(`Match Alerts · <#${interaction.channelId}>`)],
    });
  }
  if (commandName === 'activity') return handleActivityInvite(interaction.member?.voice?.channel, replyTarget);
  if (commandName === 'info') return interaction.reply({ embeds: [buildInfoEmbed()] });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const raw = message.content?.trim() || '';
  const lower = raw.toLowerCase();
  const replyTarget = { isInteraction: false, channel: message.channel, reply: message.reply.bind(message) };

  console.log(`[MSG] from="${message.author.tag}" in="${message.channel?.name || 'DM'}" content=${JSON.stringify(raw)}`);
  if (!raw) {
    console.warn('⚠️ [EMPTY CONTENT] Message received with empty content! Please enable "MESSAGE CONTENT INTENT" in Discord Developer Portal.');
  }

  if (lower === '!join' || lower === '/join') return handleJoinVoice(message.member?.voice?.channel, replyTarget);
  if (lower === '!leave' || lower === '/leave') return handleLeaveVoice(message.guildId, replyTarget);
  if (lower === '!sound' || lower === '/sound') return handleSoundboard(replyTarget);

  if (lower.startsWith('!say ') || lower.startsWith('/say ')) {
    const textToSay = raw.slice(5).trim();
    const vc = message.member?.voice?.channel;
    if (!vc) return message.reply('⚠️ เข้าห้องเสียงก่อน');
    if (!textToSay) return;
    try {
      await playVoiceTTS(vc, textToSay, 'th');
      return message.reply(`Speaking: "${textToSay}"`);
    } catch (err) {
      return message.reply(`Error: ${err.message}`);
    }
  }

  if (lower === '!counter' || lower === '/counter' || lower.startsWith('!counter ') || lower.startsWith('/counter ')) {
    return handleCounterCommand(raw.replace(/^(!|\/)counter\s*/i, ''), replyTarget);
  }

  if (lower.startsWith('!draft ') || lower.startsWith('/draft ')) {
    return handleDraftCommand(raw.replace(/^(!|\/)draft\s*/i, ''), message.author.id, replyTarget);
  }

  if (lower.startsWith('!build ') || lower.startsWith('/build ')) {
    const rawArgs = raw.replace(/^(!|\/)build\s*/i, '').trim();
    const parts = rawArgs.split(/\s+(vs|แก้ทาง|เจอ)\s+/i);
    const hero = parts[0]?.trim();
    const vs = parts[2]?.trim() || '';
    return handleBuildCommand(hero, vs, '', replyTarget);
  }

  if (lower.startsWith('!combo ') || lower.startsWith('/combo ')) {
    const rawArgs = raw.replace(/^(!|\/)combo\s*/i, '').trim();
    const parts = rawArgs.split(/\s+(with|คู่กับ|กับ)\s+/i);
    const hero = parts[0]?.trim();
    const ally = parts[2]?.trim() || '';
    return handleBuildCommand(hero, '', ally, replyTarget);
  }

  if (lower === '!meta' || lower === '/meta' || lower.startsWith('!meta ') || lower.startsWith('/meta ')) {
    return handleMetaCommand(raw.replace(/^(!|\/)meta\s*/i, ''), replyTarget);
  }

  if (lower.startsWith('!ask ') || lower.startsWith('/ask ')) {
    return handleAskCommand(raw.replace(/^(!|\/)ask\s*/i, ''), message.author.id, replyTarget);
  }

  if (lower.startsWith('!link ') || lower.startsWith('/link ')) {
    const firstMention = message.mentions.users.first();
    return handleLinkCommand(message.author, raw.replace(/^(!|\/)link\s*/i, ''), replyTarget, firstMention);
  }

  if (lower === '!stat' || lower === '/stat' || lower.startsWith('!stat ') || lower.startsWith('/stat ')) {
    return handleStatCommand(message.author.id, raw.replace(/^(!|\/)stat\s*/i, ''), replyTarget);
  }

  if (lower === '!lastmatch' || lower === '/lastmatch' || lower.startsWith('!lastmatch ') || lower.startsWith('/lastmatch ')) {
    return handleLastMatchCommand(message.author.id, raw.replace(/^(!|\/)lastmatch\s*/i, ''), replyTarget);
  }

  if (lower.startsWith('!match ') || lower.startsWith('/match ')) {
    return handleInspectMatchCommand(raw.replace(/^(!|\/)match\s*/i, ''), raw, replyTarget);
  }

  if (lower === '!watch' || lower === '/watch') {
    setWatchChannel(message.guildId, message.channelId);
    return message.reply({
      embeds: [new EmbedBuilder().setColor(THEME.dark).setDescription(`Match Alerts · <#${message.channelId}>`)],
    });
  }

  if (lower === '!activity' || lower === '/activity') {
    return handleActivityInvite(message.member?.voice?.channel, replyTarget);
  }

  if (lower === '!ping' || lower === '/ping') return message.reply(`\`${client.ws.ping}ms\``);
  if (lower === '!info' || lower === '/info' || lower === '!help') {
    return message.reply({ embeds: [buildInfoEmbed()] });
  }

  // 3. Autonomous AI Agent (โต้ตอบภาษาไทยธรรมชาติอัตโนมัติด้วย Gemini 3.5 Flash Lite + บริบทแชทย้อนหลัง)
  const isMentioned = message.mentions.has(client.user);
  const isReply =
    message.reference?.messageId &&
    (await message.channel.messages.fetch(message.reference.messageId).catch(() => null))?.author?.id ===
      client.user.id;
  const startsWithBot =
    /^(บอท|bot|เห้ยบอท|ไอ้บอท|พี่บอท|น้องบอท)/i.test(raw) ||
    lower.startsWith('บอท') ||
    lower.startsWith('bot');

  const matchIdMatch = raw.match(/\b(\d{10})\b/);
  const hasIntentOrMatch =
    Boolean(matchIdMatch) ||
    /^(วิเคราะห์|ส่อง|เช็ค|ดูฟอร์ม|แก้ทาง|ช่วย|ขอ|บอกหน่อย|สอน|ออกของ|บิลด์|build|combo|คอมโบ|meta|เมต้า|facet|แพตช์|patch)/i.test(raw);

  if (isMentioned || isReply || startsWithBot || hasIntentOrMatch || message.channel.isDMBased()) {
    let cleanPrompt = raw
      .replace(/<@!?&?\d+>/g, '')
      .replace(/^(นายโตต้า|ทนายโตต้า|โตต้า|บอท|bot|เห้ยบอท|ไอ้บอท|พี่บอท|น้องบอท)[,\s:]*/i, '')
      .trim();

    if (!cleanPrompt) cleanPrompt = 'สวัสดี';
    console.log(`[AI TRIGGER] user="${message.author.tag}" prompt=${JSON.stringify(cleanPrompt)}`);

    // ดึงประวัติแชทย้อนหลัง 6-8 ข้อความในห้อง เพื่อให้ AI จำบทสนทนาและเข้าใจบริบท
    let chatHistory = [];
    try {
      const prev = await message.channel.messages.fetch({ limit: 8 });
      chatHistory = [...prev.values()]
        .filter((m) => m.id !== message.id && m.content)
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => `${m.author.displayName || m.author.username}: ${m.content.slice(0, 300)}`);
    } catch (_histErr) {}

    try {
      await message.channel.sendTyping().catch(() => {});
      let extraContext = '';
      let matchCardEmbed = null;
      let bannerFile = null;

      const actions = {
        onJoinVoice: async () => handleJoinVoice(message.member?.voice?.channel, replyTarget),
        onLeaveVoice: async () => handleLeaveVoice(message.guildId, replyTarget),
        onPlaySound: async (soundId) => {
          const item = SOUNDBOARD_ITEMS.find((s) => s.id === soundId || s.id.includes(soundId));
          if (item && message.member?.voice?.channel) {
            await playVoiceTTS(message.member.voice.channel, item.text, item.lang);
          }
        },
        onSayTTS: async (text) => {
          if (message.member?.voice?.channel && text) {
            await playVoiceTTS(message.member.voice.channel, text, 'th');
          }
        },
        onCounterHero: async (hero) => handleCounterCommand(hero, replyTarget),
        onDraftAnalysis: async (heroes) => handleDraftCommand(heroes, message.author.id, replyTarget),
        onRecommendBuild: async (hero, enemies, allies) => handleBuildCommand(hero, enemies, allies, replyTarget),
        onMetaGuide: async (query) => handleMetaCommand(query, replyTarget),
        onLinkPlayer: async (accId, target) => {
          const targetMention = target ? String(target).match(/\d{17,20}/)?.[0] : null;
          const targetUser = targetMention
            ? (client.users.cache.get(targetMention) || { id: targetMention, username: `<@${targetMention}>` })
            : message.author;
          return handleLinkCommand(message.author, accId, replyTarget, targetUser);
        },
        onGetStats: async (target) => handleStatCommand(message.author.id, target || '', replyTarget),
        onGetLastMatch: async (target) => handleLastMatchCommand(message.author.id, target || '', replyTarget),
        onInspectMatch: async (mId, hero) => {
          if (!matchCardEmbed) {
            return handleInspectMatchCommand(mId, hero, replyTarget);
          }
        },
        onInspectMatchData: async (mId, hero) => {
          try {
            const data = await fetchMatchWithRetry(mId);
            if (!data) return null;
            if (!bannerFile) {
              const bannerBuffer = await generateMatchBanner(data, hero || cleanPrompt).catch(() => null);
              if (bannerBuffer) {
                bannerFile = new AttachmentBuilder(bannerBuffer, { name: 'match-banner.png' });
              }
            }
            if (!matchCardEmbed) {
              matchCardEmbed = buildMatchCardEmbed(data, hero || cleanPrompt, Boolean(bannerFile));
            }
            const pSummary = (data.players || []).map((p) => {
              const impStr = p.imp !== null ? `${p.imp > 0 ? '+' : ''}${p.imp} (${p.impComment || ''})` : 'N/A';
              const supStr = `Role=${p.role || 'N/A'}, Wards(Obs=${p.obsPlaced || 0}, Sen=${p.senPlaced || 0}), Dewards=${p.dewards || 0}, Stacks=${p.campsStacked || 0}, Heal=${(p.heroHealing || 0).toLocaleString()}`;
              return `- [${p.team}] ${p.hero} (ผู้เล่น: ${p.name || 'นิรนาม'}): เลน=${p.lane || 'N/A'}, ผล=${p.won ? 'ชนะ' : 'แพ้'}, KDA=${p.kda}, Damage=${(p.heroDamage || 0).toLocaleString()}, Networth=${(p.networth || 0).toLocaleString()}, GPM=${p.gpm || 0}, CS=${p.lastHits || 0}/${p.denies || 0}, STRATZ IMP=${impStr}, ${supStr}`;
            }).join('\n');
            let vSummary = '';
            if (data.radiantVision && data.direVision) {
              vSummary =
                `[สงครามวิชั่น & การทำงานของซัพพอร์ต (Vision War)]:\n` +
                `- Radiant: ปัก Obs ${data.radiantVision.obsPlaced} อัน, Sentry ${data.radiantVision.senPlaced} อัน, แก้หวอดศัตรูได้ ${data.radiantVision.dewards} อัน, สแต็กครีป ${data.radiantVision.campsStacked} กอง, ฮีลรวม ${data.radiantVision.healing.toLocaleString()} HP\n` +
                `- Dire: ปัก Obs ${data.direVision.obsPlaced} อัน, Sentry ${data.direVision.senPlaced} อัน, แก้หวอดศัตรูได้ ${data.direVision.dewards} อัน, สแต็กครีป ${data.direVision.campsStacked} กอง, ฮีลรวม ${data.direVision.healing.toLocaleString()} HP\n\n`;
            }
            return {
              data,
              summary: `ผลการแข่งขัน: ${data.radiantWin ? 'Radiant ชนะ' : 'Dire ชนะ'} (${data.duration}), Score: Radiant ${data.radiantScore} - ${data.direScore} Dire\n${vSummary}สถิติผู้เล่น:\n${pSummary}`,
            };
          } catch {
            return null;
          }
        },
        onLaunchArena: async () => handleActivityInvite(message.member?.voice?.channel, replyTarget),
      };

      // ถ้าในข้อความมีรหัสแมตช์ 10 หลักชัดเจน ให้ดึงสถิติ OpenDota + STRATZ มารอไว้ล่วงหน้า
      if (matchIdMatch && !raw.startsWith('!match') && !raw.startsWith('/match')) {
        try {
          const matchData = await fetchMatchWithRetry(matchIdMatch[1]);
          if (matchData) {
            const bannerBuffer = await generateMatchBanner(matchData, raw).catch(() => null);
            if (bannerBuffer) {
              bannerFile = new AttachmentBuilder(bannerBuffer, { name: 'match-banner.png' });
            }
            matchCardEmbed = buildMatchCardEmbed(matchData, raw, Boolean(bannerBuffer));

            const playerSummaries = (matchData.players || []).map((p) => {
              const impStr = p.imp !== null ? `${p.imp > 0 ? '+' : ''}${p.imp} (${p.impComment || ''})` : 'N/A';
              const supStr = `Role=${p.role || 'N/A'}, Wards(Obs=${p.obsPlaced || 0}, Sen=${p.senPlaced || 0}), Dewards=${p.dewards || 0}, Stacks=${p.campsStacked || 0}, Heal=${(p.heroHealing || 0).toLocaleString()}`;
              return `- [${p.team}] ${p.hero} (ผู้เล่น: ${p.name || 'นิรนาม'}): เลน=${p.lane || 'N/A'}, ผล=${p.won ? 'ชนะ' : 'แพ้'}, KDA=${p.kda}, Damage=${(p.heroDamage || 0).toLocaleString()}, Networth=${(p.networth || 0).toLocaleString()}, GPM=${p.gpm || 0}, CS=${p.lastHits || 0}/${p.denies || 0}, STRATZ IMP=${impStr}, ${supStr}`;
            }).join('\n');

            let visionSummary = '';
            if (matchData.radiantVision && matchData.direVision) {
              visionSummary =
                `[สงครามวิชั่น & การทำงานของซัพพอร์ต (Vision War)]:\n` +
                `- Radiant: ปัก Obs ${matchData.radiantVision.obsPlaced} อัน, Sentry ${matchData.radiantVision.senPlaced} อัน, แก้หวอดศัตรูได้ ${matchData.radiantVision.dewards} อัน, สแต็กครีป ${matchData.radiantVision.campsStacked} กอง, ฮีลรวม ${matchData.radiantVision.healing.toLocaleString()} HP\n` +
                `- Dire: ปัก Obs ${matchData.direVision.obsPlaced} อัน, Sentry ${matchData.direVision.senPlaced} อัน, แก้หวอดศัตรูได้ ${matchData.direVision.dewards} อัน, สแต็กครีป ${matchData.direVision.campsStacked} กอง, ฮีลรวม ${matchData.direVision.healing.toLocaleString()} HP\n\n`;
            }

            extraContext =
              `[ข้อมูลสถิติแมตช์ #${matchData.matchId} จาก OpenDota & STRATZ Analytics]:\n` +
              `ผลการแข่งขัน: ${matchData.radiantWin ? 'Radiant ชนะ' : 'Dire ชนะ'} (ความยาวเกม ${matchData.duration})\n` +
              `สกอร์คิลรวม: Radiant ${matchData.radiantScore} - ${matchData.direScore} Dire\n\n` +
              `${visionSummary}` +
              `สถิติผู้เล่นทุกคนในเกม:\n${playerSummaries}\n\n` +
              `[แนวทางการวิเคราะห์ของ AI Coach]:\n` +
              `- ดึงข้อมูลแมตช์ให้เรียบร้อยแล้ว ห้ามเรียก Tool inspect_match ซ้ำอีกเด็ดขาด ให้เขียนบทวิเคราะห์เชิงลึกทันที\n` +
              `- หากผู้ใช้ระบุเจาะจงเลน ฮีโร่ หรือผู้เล่น (เช่น เลนกลาง/มิด, ซัพพอร์ต, แครี่, ออฟเลน, หรือชื่อฮีโร่/ผู้เล่น): ให้โฟกัสเจาะลึกวิเคราะห์เปรียบเทียบฟอร์มของเลน/ตัวละครนั้นเป็นพิเศษอันดับแรก (CS, GPM, KDA, Networth, ไทมิ่งไอเทม, ดาเมจในไฟต์, ข้อผิดพลาดหรือจุดเด่น) ก่อนสรุปภาพรวมและสงครามวิชั่น\n` +
              `- หากผู้ใช้ถามภาพรวมแมตช์ (ไม่ได้เจาะจงเลน): ให้วิเคราะห์ครบทั้ง 5 ตำแหน่งอย่างสมดุล (1. Overview -> 2. ฟอร์ม Cores Pos 1-3 -> 3. ฟอร์ม Supports Pos 4-5 & Vision War -> 4. ข้อแนะนำเชิงพัฒนา)\n` +
              `- น้ำเสียง: สุภาพ ไพเราะ ให้เกียรติ เป็นกันเอง ให้กำลังใจเพื่อนร่วมทีมอย่างอบอุ่น (อย่าว่าน้องเยอะ ชี้จุดที่ควรปรับอย่างสุภาพและให้กำลังใจ) ไม่ดูถูกหรือซ้ำเติม\n` +
              `- ตอบเป็นภาษาไทย มีระดับ คมคาย และเป็นประโยชน์ต่อการพัฒนาการเล่นจริง`;
          }
        } catch (mErr) {
          console.warn('[PREFETCH MATCH ERROR]:', mErr.message);
        }
      }

      const aiReply = await runAutonomousAgent(cleanPrompt, message.author.id, actions, chatHistory, extraContext);
      console.log(`[AI REPLY READY] length=${aiReply?.length}`);
      if (aiReply) {
        const replyPayload = { content: aiReply.slice(0, 1990) };
        if (matchCardEmbed) {
          replyPayload.embeds = [matchCardEmbed];
        }
        if (bannerFile) {
          replyPayload.files = [bannerFile];
        }
        return message.reply(replyPayload).catch(async (replyErr) => {
          console.error('[REPLY ERROR, FALLBACK TO SEND]', replyErr.message);
          return message.channel.send(replyPayload).catch((sendErr) => {
            console.error('[SEND ERROR TOO]', sendErr.message);
          });
        });
      }
    } catch (agentErr) {
      console.error('Autonomous Agent Handler Error:', agentErr);
      return message.channel.send(`⚠️ บอททำงานขัดข้อง: ${agentErr.message}`).catch(() => {});
    }
  }
});

if (DISCORD_TOKEN) {
  client.login(DISCORD_TOKEN).catch((err) => {
    lastBotError = err.message;
    console.error('❌ Discord login failed:', err.message);
  });
} else {
  lastBotError = 'DISCORD_TOKEN is empty in Environment Variables';
  console.warn('⚠️ DISCORD_TOKEN is not set yet. Set DISCORD_TOKEN in Environment Variables.');
}

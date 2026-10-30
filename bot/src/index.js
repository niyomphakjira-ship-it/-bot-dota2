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
  setWatchChannel,
  startMatchWatcher,
} from './opendota.js';
import { analyzeDraft, askDotaCoach } from './ai-coach.js';
import { startMultiplayerServer } from './multiplayer-server.js';

dotenv.config();
if (ffmpegPath && fs.existsSync(ffmpegPath)) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const { DISCORD_TOKEN, CLIENT_ID, PORT } = process.env;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN not found in .env');
  process.exit(1);
}

// Start Real-Time Multiplayer WebSocket + Activity Web Server
startMultiplayerServer(Number(PORT) || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

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

async function handleLinkCommand(discordUser, rawId, replyTarget) {
  const accountId = linkPlayer(discordUser.id, rawId, discordUser.username);
  if (!accountId) {
    const msg = 'ระบุ Steam ID / Friend ID ที่ถูกต้อง';
    return replyTarget.isInteraction
      ? replyTarget.reply({ content: msg, flags: 64 })
      : replyTarget.reply(msg);
  }
  const embed = new EmbedBuilder()
    .setColor(THEME.dark)
    .setDescription(`Linked · **${discordUser.username}** → \`${accountId}\``);
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
    .setTitle('Dota 2 Bot')
    .setDescription(
      '`!join` · `!leave` · `!sound` · `!say <text>`\n' +
      '`!link <id>` · `!stat` · `!lastmatch` · `!watch`\n' +
      '`!counter [hero]` · `!draft <heroes>` · `!ask <q>`\n' +
      '`!activity`'
    );
}

client.once('ready', async () => {
  console.log(`🤖 Logged in as: ${client.user.tag}`);

  // Start Automatic Match Alert Poller
  startMatchWatcher(client, (discordUserId, match) => {
    const embed = buildMatchEmbed('', match);
    embed.setDescription(`<@${discordUserId}>\n` + embed.data.description);
    return embed;
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
      .addStringOption((o) => o.setName('id').setDescription('Friend ID or Steam ID').setRequired(true)),
    new SlashCommandBuilder()
      .setName('stat')
      .setDescription('Live OpenDota player profile')
      .addStringOption((o) => o.setName('id').setDescription('Optional ID').setRequired(false)),
    new SlashCommandBuilder()
      .setName('lastmatch')
      .setDescription('Latest Dota 2 match summary')
      .addStringOption((o) => o.setName('id').setDescription('Optional ID').setRequired(false)),
    new SlashCommandBuilder()
      .setName('watch')
      .setDescription('Set current channel for auto match alerts'),
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
  if (commandName === 'ask') return handleAskCommand(interaction.options.getString('question'), interaction.user.id, replyTarget);
  if (commandName === 'link') return handleLinkCommand(interaction.user, interaction.options.getString('id'), replyTarget);
  if (commandName === 'stat') return handleStatCommand(interaction.user.id, interaction.options.getString('id') || '', replyTarget);
  if (commandName === 'lastmatch') return handleLastMatchCommand(interaction.user.id, interaction.options.getString('id') || '', replyTarget);
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

  const raw = message.content.trim();
  const lower = raw.toLowerCase();
  const replyTarget = { isInteraction: false, reply: message.reply.bind(message) };

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

  if (lower.startsWith('!ask ') || lower.startsWith('/ask ')) {
    return handleAskCommand(raw.replace(/^(!|\/)ask\s*/i, ''), message.author.id, replyTarget);
  }

  if (lower.startsWith('!link ') || lower.startsWith('/link ')) {
    return handleLinkCommand(message.author, raw.replace(/^(!|\/)link\s*/i, ''), replyTarget);
  }

  if (lower === '!stat' || lower === '/stat' || lower.startsWith('!stat ') || lower.startsWith('/stat ')) {
    return handleStatCommand(message.author.id, raw.replace(/^(!|\/)stat\s*/i, ''), replyTarget);
  }

  if (lower === '!lastmatch' || lower === '/lastmatch' || lower.startsWith('!lastmatch ') || lower.startsWith('/lastmatch ')) {
    return handleLastMatchCommand(message.author.id, raw.replace(/^(!|\/)lastmatch\s*/i, ''), replyTarget);
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
});

client.login(DISCORD_TOKEN);

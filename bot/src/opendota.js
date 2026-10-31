import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStratzMatch } from './stratz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const OPENDOTA_BASE = 'https://api.opendota.com/api';
const STEAM64_BASE = 76561197960265728n;

export const DEFAULT_SEEDED_PLAYERS = {
  '647785506121449473': { accountId: '947857860', discordTag: 'tee2147' },
  '1319873624856985733': { accountId: '1204317380', discordTag: 'SleepfrozeN' },
};

export const DEFAULT_WATCH_CHANNELS = {
  '1498540558954795251': process.env.DEFAULT_WATCH_CHANNEL_ID || '1498542847106875492', // SleepKnight Gaming -> #chat-all
};

// Ensure data directory & store exist with defaults
function loadStore() {
  let store = { players: {}, watchChannels: {} };
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    }
  } catch {
    store = { players: {}, watchChannels: {} };
  }

  if (!store.players) store.players = {};
  if (!store.watchChannels) store.watchChannels = {};

  // Seed default players if not already recorded
  for (const [dId, pData] of Object.entries(DEFAULT_SEEDED_PLAYERS)) {
    if (!store.players[dId]) {
      store.players[dId] = {
        accountId: pData.accountId,
        discordTag: pData.discordTag,
        lastMatchId: null,
      };
    }
  }

  // Seed default watch channel if none is set
  if (Object.keys(store.watchChannels).length === 0) {
    store.watchChannels = { ...DEFAULT_WATCH_CHANNELS };
  }

  return store;
}

function saveStore(store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

// Parse Steam32, Steam64, or Dotabuff/OpenDota profile URL
export function parseAccountId(input) {
  if (!input) return null;
  const match = String(input).trim().match(/(\d{5,20})/);
  if (!match) return null;
  const raw = BigInt(match[1]);
  if (raw > STEAM64_BASE) {
    return String(raw - STEAM64_BASE);
  }
  return String(raw);
}

// Link Discord user to Dota 2 Account ID
export function linkPlayer(discordUserId, rawInput, discordTag = '') {
  const accountId = parseAccountId(rawInput);
  if (!accountId) return null;
  const store = loadStore();
  store.players[discordUserId] = {
    accountId,
    discordTag,
    lastMatchId: store.players[discordUserId]?.lastMatchId || null,
  };
  saveStore(store);
  return accountId;
}

export function getLinkedAccountId(discordUserId) {
  const store = loadStore();
  return store.players[discordUserId]?.accountId || null;
}

export function setWatchChannel(guildId, channelId) {
  const store = loadStore();
  if (!channelId) {
    delete store.watchChannels[guildId];
  } else {
    store.watchChannels[guildId] = channelId;
  }
  saveStore(store);
}

// Hero Cache from OpenDota
let heroesCache = null;
let heroesById = new Map();

export async function ensureHeroesLoaded() {
  if (heroesCache && heroesById.size > 0) return heroesCache;
  const res = await fetch(`${OPENDOTA_BASE}/heroes`);
  if (!res.ok) throw new Error(`OpenDota API ${res.status}`);
  const list = await res.json();
  heroesCache = list;
  heroesById = new Map(list.map((h) => [h.id, h]));
  return list;
}

export function getHeroName(heroId) {
  return heroesById.get(heroId)?.localized_name || `Hero #${heroId}`;
}

// Common hero shorthand aliases
const SHORTHAND = {
  pa: 'Phantom Assassin',
  am: 'Anti-Mage',
  bb: 'Bristleback',
  jugg: 'Juggernaut',
  lc: 'Legion Commander',
  sf: 'Shadow Fiend',
  pl: 'Phantom Lancer',
  od: 'Outworld Destroyer',
  sd: 'Shadow Demon',
  wd: 'Witch Doctor',
  cm: 'Crystal Maiden',
  mk: 'Monkey King',
  fv: 'Faceless Void',
  void: 'Faceless Void',
  np: "Nature's Prophet",
  qop: 'Queen of Pain',
  ta: 'Templar Assassin',
  tb: 'Terrorblade',
  ck: 'Chaos Knight',
  dk: 'Dragon Knight',
  sk: 'Sand King',
  wk: 'Wraith King',
  aa: 'Ancient Apparition',
  es: 'Earthshaker',
  sb: 'Spirit Breaker',
  bara: 'Spirit Breaker',
  necro: 'Necrophos',
  veno: 'Venomancer',
  voker: 'Invoker',
};

export async function resolveHeroByQuery(q) {
  await ensureHeroesLoaded();
  const clean = q.trim().toLowerCase();
  if (!clean) return null;

  const targetName = (SHORTHAND[clean] || clean).toLowerCase();
  return (
    heroesCache.find((h) => h.localized_name.toLowerCase() === targetName) ||
    heroesCache.find((h) => h.localized_name.toLowerCase().includes(targetName)) ||
    null
  );
}

// Format Rank Tier (e.g. 54 -> Legend 4, 80 -> Immortal)
export function formatRankTier(rankTier, leaderboardRank) {
  if (!rankTier) return 'Uncalibrated';
  const tier = Math.floor(rankTier / 10);
  const stars = rankTier % 10;
  const names = {
    1: 'Herald',
    2: 'Guardian',
    3: 'Crusader',
    4: 'Archon',
    5: 'Legend',
    6: 'Ancient',
    7: 'Divine',
    8: 'Immortal',
  };
  const base = names[tier] || 'Uncalibrated';
  if (tier === 8) return leaderboardRank ? `Immortal #${leaderboardRank}` : 'Immortal';
  return stars ? `${base} ${stars}` : base;
}

// Fetch Player Profile, Win/Loss, Top Heroes
export async function getPlayerStats(accountId) {
  await ensureHeroesLoaded();
  const [profileRes, wlRes, heroesRes] = await Promise.all([
    fetch(`${OPENDOTA_BASE}/players/${accountId}`),
    fetch(`${OPENDOTA_BASE}/players/${accountId}/wl`),
    fetch(`${OPENDOTA_BASE}/players/${accountId}/heroes`),
  ]);

  if (!profileRes.ok) throw new Error('ไม่พบข้อมูลผู้เล่นจาก OpenDota');
  const profile = await profileRes.json();
  if (!profile?.profile) {
    throw new Error('ไม่พบโปรไฟล์ (ตรวจสอบ Account ID หรือเปิด Expose Public Match Data ใน Dota 2)');
  }

  const wl = wlRes.ok ? await wlRes.json() : { win: 0, lose: 0 };
  const heroStats = heroesRes.ok ? await heroesRes.json() : [];

  const total = (wl.win || 0) + (wl.lose || 0);
  const winrate = total > 0 ? ((wl.win / total) * 100).toFixed(1) : '0.0';

  const topHeroes = heroStats
    .filter((h) => h.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, 3)
    .map((h) => {
      const wr = ((h.win / h.games) * 100).toFixed(0);
      return `**${getHeroName(Number(h.hero_id))}** — \`${h.games}\` games (\`${wr}%\`)`;
    });

  return {
    name: profile.profile.personaname || `Player ${accountId}`,
    avatar: profile.profile.avatarfull || null,
    rank: formatRankTier(profile.rank_tier, profile.leaderboard_rank),
    win: wl.win || 0,
    lose: wl.lose || 0,
    winrate,
    topHeroes,
  };
}

// Fetch Latest Match
export async function getLastMatch(accountId) {
  await ensureHeroesLoaded();
  const res = await fetch(`${OPENDOTA_BASE}/players/${accountId}/recentMatches`);
  if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลแมตช์ล่าสุดได้');
  const matches = await res.json();
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error('ไม่พบประวัติแมตช์ (ตรวจสอบว่าเปิด Expose Public Match Data แล้ว)');
  }

  const m = matches[0];
  const isRadiant = m.player_slot < 128;
  const won = (isRadiant && m.radiant_win) || (!isRadiant && !m.radiant_win);
  const mins = Math.floor(m.duration / 60);
  const secs = String(m.duration % 60).padStart(2, '0');

  return {
    matchId: m.match_id,
    won,
    hero: getHeroName(m.hero_id),
    kills: m.kills,
    deaths: m.deaths,
    assists: m.assists,
    gpm: m.gold_per_min,
    xpm: m.xp_per_min,
    heroDamage: (m.hero_damage || 0).toLocaleString(),
    duration: `${mins}:${secs}`,
    endedAt: m.start_time + m.duration,
  };
}

// Fetch Specific Match Details by Match ID (OpenDota + STRATZ Deep Stats)
export async function getMatchById(matchId) {
  await ensureHeroesLoaded();
  const [openDotaRes, stratzData] = await Promise.all([
    fetch(`${OPENDOTA_BASE}/matches/${matchId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    getStratzMatch(matchId).catch(() => null),
  ]);

  if (!openDotaRes) throw new Error(`ไม่พบข้อมูลแมตช์ไอดี ${matchId} ในระบบ`);
  const data = openDotaRes;

  const mins = Math.floor(data.duration / 60);
  const secs = String(data.duration % 60).padStart(2, '0');

  const players = (data.players || []).map((p) => {
    const isRadiant = p.player_slot < 128;
    const won = (isRadiant && data.radiant_win) || (!isRadiant && !data.radiant_win);

    const s = stratzData?.players?.find((sp) => sp.heroId === p.hero_id);

    return {
      name: p.personaname || `Player (Slot ${p.player_slot})`,
      heroId: p.hero_id,
      hero: getHeroName(p.hero_id),
      kills: p.kills ?? 0,
      deaths: p.deaths ?? 0,
      assists: p.assists ?? 0,
      kda: `${p.kills ?? 0}/${p.deaths ?? 0}/${p.assists ?? 0}`,
      heroDamage: p.hero_damage || 0,
      won,
      isRadiant,
      team: isRadiant ? 'Radiant' : 'Dire',
      lane: s?.lane ?? null,
      gpm: s?.gpm ?? p.gold_per_min ?? null,
      networth: s?.networth ?? p.net_worth ?? null,
      lastHits: s?.lastHits ?? p.last_hits ?? null,
      denies: s?.denies ?? p.denies ?? null,
      imp: s?.imp ?? null,
      impComment: s?.impComment ?? null,
      award: s?.award ?? null,
    };
  });

  return {
    matchId: data.match_id,
    duration: `${mins}:${secs}`,
    radiantWin: data.radiant_win,
    radiantScore: data.radiant_score ?? 0,
    direScore: data.dire_score ?? 0,
    players,
    hasStratz: Boolean(stratzData),
  };
}

// Statistical Draft Counter Calculator using OpenDota Matchups API
export async function getStatisticalDraftCounters(enemyTokens) {
  await ensureHeroesLoaded();
  const resolvedEnemies = [];
  for (const token of enemyTokens) {
    const hero = await resolveHeroByQuery(token);
    if (hero && !resolvedEnemies.some((e) => e.id === hero.id)) {
      resolvedEnemies.push(hero);
    }
  }
  if (resolvedEnemies.length === 0) return null;

  const enemyIds = new Set(resolvedEnemies.map((h) => h.id));
  const scores = new Map();

  await Promise.all(
    resolvedEnemies.map(async (enemy) => {
      const res = await fetch(`${OPENDOTA_BASE}/heroes/${enemy.id}/matchups`);
      if (!res.ok) return;
      const matchups = await res.json();
      for (const m of matchups) {
        if (enemyIds.has(m.hero_id) || m.games_played < 15) continue;
        // m.wins = enemy's wins against m.hero_id -> counter winrate is 1 - (m.wins / m.games_played)
        const counterWr = 1 - m.wins / m.games_played;
        const prev = scores.get(m.hero_id) || { sumWr: 0, count: 0 };
        prev.sumWr += counterWr;
        prev.count += 1;
        scores.set(m.hero_id, prev);
      }
    })
  );

  const ranked = [...scores.entries()]
    .filter(([, v]) => v.count === resolvedEnemies.length)
    .map(([heroId, v]) => ({
      hero: getHeroName(heroId),
      avgWinrate: ((v.sumWr / v.count) * 100).toFixed(1),
    }))
    .sort((a, b) => Number(b.avgWinrate) - Number(a.avgWinrate))
    .slice(0, 5);

  return {
    enemies: resolvedEnemies.map((h) => h.localized_name),
    topCounters: ranked,
  };
}

// Background Match Poller (Auto Match Alerts - checks every 90 seconds)
export function startMatchWatcher(client, onNewMatch) {
  console.log('[WATCHER] Background Match Poller initialized (Interval: 90s)');

  setInterval(async () => {
    try {
      const store = loadStore();
      const guildChannelEntries = Object.entries(store.watchChannels);
      if (guildChannelEntries.length === 0) return;

      let dirty = false;
      for (const [discordUserId, playerInfo] of Object.entries(store.players)) {
        if (!playerInfo.accountId) continue;
        try {
          const match = await getLastMatch(playerInfo.accountId);
          if (!match?.matchId) continue;

          // First run for this player: cache the latest match ID so we don't spam old matches
          if (!playerInfo.lastMatchId) {
            playerInfo.lastMatchId = match.matchId;
            dirty = true;
            console.log(`[WATCHER INIT] user=${discordUserId} account=${playerInfo.accountId} lastMatchId=${match.matchId}`);
            continue;
          }

          // New match detected!
          if (String(match.matchId) !== String(playerInfo.lastMatchId)) {
            console.log(`[WATCHER NEW MATCH] user=${discordUserId} newMatchId=${match.matchId} (old=${playerInfo.lastMatchId})`);
            playerInfo.lastMatchId = match.matchId;
            dirty = true;

            for (const [, channelId] of guildChannelEntries) {
              const ch = await client.channels.fetch(channelId).catch(() => null);
              if (ch && ch.isTextBased()) {
                if (typeof onNewMatch === 'function') {
                  const res = await onNewMatch(ch, discordUserId, match).catch((e) => {
                    console.error('[WATCHER HANDLER ERROR]:', e.message);
                  });
                  // Fallback if onNewMatch returned an embed directly
                  if (res && res.data) {
                    await ch.send({ embeds: [res] }).catch(() => {});
                  }
                }
              }
            }
          }
        } catch {
          // ignore transient OpenDota rate limits or connection blips
        }
      }
      if (dirty) saveStore(store);
    } catch (err) {
      console.error('MatchWatcher error:', err.message);
    }
  }, 90_000); // Check every 90 seconds
}

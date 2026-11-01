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
  '234952562145492993': { accountId: '829655620', discordTag: 'JimheeTSMA618' },
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

export function resolvePlayerAccount(query, defaultDiscordUserId) {
  const store = loadStore();
  const clean = String(query || '').trim();

  if (clean) {
    const mentionMatch = clean.match(/\d{17,20}/);
    if (mentionMatch && store.players[mentionMatch[0]]?.accountId) {
      return {
        accountId: store.players[mentionMatch[0]].accountId,
        tag: store.players[mentionMatch[0]].discordTag || `<@${mentionMatch[0]}>`,
      };
    }

    const parsed = parseAccountId(clean);
    if (parsed) {
      return { accountId: parsed, tag: null };
    }

    const lower = clean.toLowerCase();
    for (const [dId, p] of Object.entries(store.players)) {
      if (p.discordTag && p.discordTag.toLowerCase().includes(lower)) {
        return { accountId: p.accountId, tag: p.discordTag };
      }
    }
  }

  if (defaultDiscordUserId && store.players[defaultDiscordUserId]?.accountId) {
    return {
      accountId: store.players[defaultDiscordUserId].accountId,
      tag: store.players[defaultDiscordUserId].discordTag || null,
    };
  }

  return null;
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

// Fetch 20 Recent Matches & Calculate Comprehensive Performance Data for Report Card
export async function getPlayerRecentPerformance(accountId, limit = 20) {
  await ensureHeroesLoaded();
  const [profileRes, matchesRes] = await Promise.all([
    fetch(`${OPENDOTA_BASE}/players/${accountId}`),
    fetch(`${OPENDOTA_BASE}/players/${accountId}/recentMatches`),
  ]);

  if (!profileRes.ok) throw new Error('ไม่สามารถดึงข้อมูลโปรไฟล์ได้');
  const profile = await profileRes.json();
  if (!profile?.profile) {
    throw new Error('ไม่พบโปรไฟล์ผู้เล่น (ตรวจสอบ Account ID หรือเปิด Expose Public Match Data ใน Dota 2)');
  }

  const rawMatches = matchesRes.ok ? await matchesRes.json() : [];
  if (!Array.isArray(rawMatches) || rawMatches.length === 0) {
    throw new Error('ไม่พบประวัติการเล่นล่าสุด 20 แมตช์ (โปรดตรวจสอบว่าเปิดการแชร์ข้อมูลสาธารณะในเกม)');
  }

  const matches = rawMatches.slice(0, limit);
  let wins = 0;
  let totalKills = 0,
    totalDeaths = 0,
    totalAssists = 0;
  let totalGpm = 0,
    totalXpm = 0,
    totalDamage = 0,
    totalLastHits = 0,
    totalHealing = 0;

  const heroMap = new Map();
  const laneCounts = { mid: 0, safe: 0, off: 0, other: 0 };

  for (const m of matches) {
    const isRadiant = m.player_slot < 128;
    const won = (isRadiant && m.radiant_win) || (!isRadiant && !m.radiant_win);
    if (won) wins++;

    totalKills += m.kills ?? 0;
    totalDeaths += m.deaths ?? 0;
    totalAssists += m.assists ?? 0;
    totalGpm += m.gold_per_min || 0;
    totalXpm += m.xp_per_min || 0;
    totalDamage += m.hero_damage || 0;
    totalLastHits += m.last_hits || 0;
    totalHealing += m.hero_healing || 0;

    if (m.lane === 1) laneCounts.safe++;
    else if (m.lane === 2) laneCounts.mid++;
    else if (m.lane === 3) laneCounts.off++;
    else laneCounts.other++;

    const prev = heroMap.get(m.hero_id) || {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
    };
    prev.games++;
    if (won) prev.wins++;
    prev.kills += m.kills ?? 0;
    prev.deaths += m.deaths ?? 0;
    prev.assists += m.assists ?? 0;
    prev.damage += m.hero_damage || 0;
    heroMap.set(m.hero_id, prev);
  }

  const count = matches.length || 1;
  const winrate = Number(((wins / count) * 100).toFixed(1));
  const avgKills = Number((totalKills / count).toFixed(1));
  const avgDeaths = Number((totalDeaths / count).toFixed(1));
  const avgAssists = Number((totalAssists / count).toFixed(1));
  const kdaRatio =
    totalDeaths > 0
      ? Number(((totalKills + totalAssists) / totalDeaths).toFixed(2))
      : Number((totalKills + totalAssists).toFixed(2));
  const avgGpm = Math.round(totalGpm / count);
  const avgXpm = Math.round(totalXpm / count);
  const avgDamage = Math.round(totalDamage / count);
  const avgLastHits = Math.round(totalLastHits / count);
  const avgHealing = Math.round(totalHealing / count);

  const heroList = [...heroMap.entries()]
    .map(([id, h]) => ({
      hero: getHeroName(id),
      games: h.games,
      wins: h.wins,
      losses: h.games - h.wins,
      winrate: Math.round((h.wins / h.games) * 100),
      avgKda: `${(h.kills / h.games).toFixed(1)}/${(h.deaths / h.games).toFixed(1)}/${(h.assists / h.games).toFixed(1)}`,
      avgDamage: Math.round(h.damage / h.games),
    }))
    .sort((a, b) => b.games - a.games || b.winrate - a.winrate);

  const signatureHeroes = heroList.filter((h) => h.games >= 2 && h.winrate >= 50).slice(0, 3);
  const trapHeroes = heroList.filter((h) => h.games >= 2 && h.winrate < 40).slice(0, 2);

  // Sub-Grades
  let ecoGrade = 'C';
  if (avgGpm >= 560 || avgLastHits >= 220) ecoGrade = 'S';
  else if (avgGpm >= 480 || avgLastHits >= 170) ecoGrade = 'A';
  else if (avgGpm >= 380 || avgLastHits >= 120) ecoGrade = 'B';

  let fightGrade = 'C';
  if (avgDamage >= 24000) fightGrade = 'S';
  else if (avgDamage >= 18000) fightGrade = 'A';
  else if (avgDamage >= 12000) fightGrade = 'B';

  let survivalGrade = 'C';
  if (avgDeaths <= 4.5) survivalGrade = 'S';
  else if (avgDeaths <= 6.5) survivalGrade = 'A';
  else if (avgDeaths <= 8.5) survivalGrade = 'B';

  let teamGrade = 'C';
  if (avgAssists >= 14 || avgHealing >= 3000) teamGrade = 'S';
  else if (avgAssists >= 10 || avgHealing >= 1500) teamGrade = 'A';
  else if (avgAssists >= 7) teamGrade = 'B';

  // Overall Grade
  let overallGrade = 'GRADE B (มาตรฐานแน่น)';
  if (winrate >= 65 && kdaRatio >= 3.5) overallGrade = 'GRADE S (ระดับพระกาฬ / แบกทีมเต็มสูบ)';
  else if (winrate >= 55 || (winrate >= 50 && kdaRatio >= 3.0))
    overallGrade = 'GRADE A (ตัวตึงประจำทีม)';
  else if (winrate >= 45) overallGrade = 'GRADE B (มาตรฐานแน่น)';
  else overallGrade = 'GRADE C (ช่วงเก็บเลเวล / ฟอร์มวิกฤต)';

  const isSpicyEligible = overallGrade.includes('GRADE C') || winrate < 45 || avgDeaths >= 8.0;

  return {
    accountId,
    name: profile.profile.personaname || `Player ${accountId}`,
    avatar: profile.profile.avatarfull || null,
    rank: formatRankTier(profile.rank_tier, profile.leaderboard_rank),
    gamesCount: count,
    wins,
    losses: count - wins,
    winrate,
    avgKills,
    avgDeaths,
    avgAssists,
    kdaRatio,
    avgGpm,
    avgXpm,
    avgDamage,
    avgLastHits,
    avgHealing,
    heroList,
    signatureHeroes,
    trapHeroes,
    laneCounts,
    isSpicyEligible,
    grades: {
      overall: overallGrade,
      economy: ecoGrade,
      fight: fightGrade,
      survival: survivalGrade,
      teamplay: teamGrade,
    },
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

  const rawPlayers = data.players || [];
  let radDmg = 0, radNw = 0, radKills = 0;
  let direDmg = 0, direNw = 0, direKills = 0;

  for (const p of rawPlayers) {
    const isRadiant = p.player_slot < 128;
    const dmg = p.hero_damage || 0;
    const nw = p.net_worth || 0;
    const k = p.kills || 0;
    if (isRadiant) {
      radDmg += dmg;
      radNw += nw;
      radKills += k;
    } else {
      direDmg += dmg;
      direNw += nw;
      direKills += k;
    }
  }

  const players = rawPlayers.map((p) => {
    const isRadiant = p.player_slot < 128;
    const won = (isRadiant && data.radiant_win) || (!isRadiant && !data.radiant_win);

    const s = stratzData?.players?.find((sp) => sp.heroId === p.hero_id);

    const teamDmg = isRadiant ? radDmg : direDmg;
    const teamNw = isRadiant ? radNw : direNw;
    const teamKills = isRadiant ? radKills : direKills;

    const dmg = p.hero_damage || 0;
    const nw = s?.networth ?? p.net_worth ?? 0;
    const k = p.kills ?? 0;
    const d = p.deaths ?? 0;
    const a = p.assists ?? 0;

    const dmgShare = teamDmg > 0 ? Number(((dmg / teamDmg) * 100).toFixed(1)) : 0;
    const nwShare = teamNw > 0 ? Number(((nw / teamNw) * 100).toFixed(1)) : 0;
    const der = nwShare > 0 ? Number((dmgShare / nwShare).toFixed(2)) : 1.0;
    const kp = teamKills > 0 ? Number((((k + a) / teamKills) * 100).toFixed(1)) : 0;

    const impVal = s?.imp ?? 0;
    const isSupport = s?.role === 'Support' || s?.role === 'HardSupport' || (p.obs_placed || 0) + (p.sen_placed || 0) >= 8;

    let archetype = '🛡️ Solid (ฟอร์มมาตรฐาน)';
    if (won) {
      if ((der >= 1.25 && kp >= 50) || impVal >= 20) {
        archetype = '👑 True Carry / MVP (แบกทีมตัวจริง)';
      } else if (!isSupport && (der <= 0.65 || (kp < 35 && d >= 6) || (d >= 8 && k <= 3))) {
        archetype = '🎒 Carried Passenger (ชนะเพราะโดนเพื่อนแบกหลังหัก)';
      } else if (impVal <= -15) {
        archetype = '🎒 Carried / Low Impact (ชนะแต่ฟอร์มส่วนตัวหลุด)';
      }
    } else {
      if (impVal >= 15 || der >= 1.25 || (isSupport && (p.sen_placed || 0) >= 12)) {
        archetype = '💔 Unlucky Ace (แพ้แต่เล่นระดับพระเจ้า / แบกสุดตัว)';
      } else if (impVal <= -15 || der <= 0.6 || d >= 9) {
        archetype = '⚠️ Rough Game / แจกยับ (ฟอร์มหลุด / จุดอ่อนของทีม)';
      }
    }

    return {
      name: p.personaname || `Player (Slot ${p.player_slot})`,
      heroId: p.hero_id,
      hero: getHeroName(p.hero_id),
      kills: k,
      deaths: d,
      assists: a,
      kda: `${k}/${d}/${a}`,
      heroDamage: dmg,
      won,
      isRadiant,
      team: isRadiant ? 'Radiant' : 'Dire',
      lane: s?.lane ?? null,
      gpm: s?.gpm ?? p.gold_per_min ?? null,
      networth: nw,
      lastHits: s?.lastHits ?? p.last_hits ?? null,
      denies: s?.denies ?? p.denies ?? null,
      imp: s?.imp ?? null,
      impComment: s?.impComment ?? null,
      award: s?.award ?? null,
      role: s?.role ?? null,
      heroHealing: s?.heroHealing ?? p.hero_healing ?? 0,
      obsPlaced: s?.obsPlaced ?? p.obs_placed ?? 0,
      senPlaced: s?.senPlaced ?? p.sen_placed ?? 0,
      dewards: s?.dewards ?? (p.observer_kills || 0) + (p.sentry_kills || 0),
      campsStacked: s?.campsStacked ?? p.camps_stacked ?? 0,
      dmgShare,
      nwShare,
      der,
      kp,
      archetype,
    };
  });

  return {
    matchId: data.match_id,
    duration: `${mins}:${secs}`,
    radiantWin: data.radiant_win,
    radiantScore: data.radiant_score ?? 0,
    direScore: data.dire_score ?? 0,
    players,
    radiantVision: stratzData?.radiantVision ?? null,
    direVision: stratzData?.direVision ?? null,
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

// Live Hero Meta & Stats Cache from OpenDota /heroStats
let heroStatsCache = null;
let heroStatsCacheTime = 0;

export async function fetchAllHeroStats() {
  const now = Date.now();
  if (heroStatsCache && now - heroStatsCacheTime < 10 * 60 * 1000) {
    return heroStatsCache;
  }
  const res = await fetch(`${OPENDOTA_BASE}/heroStats`);
  if (!res.ok) throw new Error(`OpenDota heroStats ${res.status}`);
  heroStatsCache = await res.json();
  heroStatsCacheTime = now;
  return heroStatsCache;
}

export async function getHeroMetaStats(heroQuery) {
  const hero = await resolveHeroByQuery(heroQuery);
  if (!hero) return null;

  const allStats = await fetchAllHeroStats();
  const s = allStats.find((h) => h.id === hero.id);
  if (!s) return null;

  const divWins = s['7_win'] || 0;
  const divPicks = s['7_pick'] || 1;
  const divWinrate = ((divWins / divPicks) * 100).toFixed(2);

  const pubWins =
    (s['1_win'] || 0) +
    (s['2_win'] || 0) +
    (s['3_win'] || 0) +
    (s['4_win'] || 0) +
    (s['5_win'] || 0) +
    (s['6_win'] || 0) +
    (s['7_win'] || 0) +
    (s['8_win'] || 0);
  const pubPicks =
    (s['1_pick'] || 0) +
    (s['2_pick'] || 0) +
    (s['3_pick'] || 0) +
    (s['4_pick'] || 0) +
    (s['5_pick'] || 0) +
    (s['6_pick'] || 0) +
    (s['7_pick'] || 0) +
    (s['8_pick'] || 0);
  const pubWinrate = pubPicks > 0 ? ((pubWins / pubPicks) * 100).toFixed(2) : 'N/A';

  const proPicks = s.pro_pick || 0;
  const proWins = s.pro_win || 0;
  const proWr = proPicks > 0 ? ((proWins / proPicks) * 100).toFixed(1) : 'N/A';

  return {
    hero: s.localized_name,
    heroId: s.id,
    primaryAttr: s.primary_attr?.toUpperCase() || 'N/A',
    attackType: s.attack_type,
    roles: s.roles || [],
    divineWinrate: divWinrate,
    divinePicks: divPicks,
    overallWinrate: pubWinrate,
    overallPicks: pubPicks,
    proPicks,
    proWins,
    proWinrate: proWr,
    proBans: s.pro_ban || 0,
  };
}

export async function getRoleMetaRankings(roleQuery) {
  const allStats = await fetchAllHeroStats();
  const q = String(roleQuery || '').trim().toLowerCase();

  let targetRole = 'Carry';
  let roleTitle = 'Position 1 · Carry (Safe Lane)';

  if (/mid|pos2|เลนกลาง|มิด/i.test(q)) {
    targetRole = 'Mid';
    roleTitle = 'Position 2 · Mid Lane';
  } else if (/offlane|pos3|ออฟเลน|ออฟ/i.test(q)) {
    targetRole = 'Offlane';
    roleTitle = 'Position 3 · Offlane';
  } else if (/pos4|soft support|ซัพ4|โรม/i.test(q)) {
    targetRole = 'Pos4';
    roleTitle = 'Position 4 · Soft Support (Roamer)';
  } else if (/pos5|hard support|ซัพ5|ซัพ/i.test(q)) {
    targetRole = 'Support';
    roleTitle = 'Position 5 · Hard Support';
  }

  const filtered = allStats.filter((h) => {
    const roles = (h.roles || []).map((r) => r.toLowerCase());
    const divPicks = h['7_pick'] || 0;
    if (divPicks < 1500) return false;

    if (targetRole === 'Carry') return roles.includes('carry');
    if (targetRole === 'Mid') return roles.includes('nuker') || roles.includes('escape') || roles.includes('carry');
    if (targetRole === 'Offlane') return roles.includes('initiator') || roles.includes('durable');
    if (targetRole === 'Pos4') return roles.includes('support') || roles.includes('disabler');
    return roles.includes('support');
  });

  const ranked = filtered
    .map((h) => {
      const wins = h['7_win'] || 0;
      const picks = h['7_pick'] || 1;
      const wr = (wins / picks) * 100;
      return {
        name: h.localized_name,
        primaryAttr: h.primary_attr?.toUpperCase(),
        winrate: wr.toFixed(2),
        picks: picks,
        proPicks: h.pro_pick || 0,
      };
    })
    .sort((a, b) => Number(b.winrate) - Number(a.winrate))
    .slice(0, 8);

  return {
    role: targetRole,
    roleTitle,
    heroes: ranked,
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

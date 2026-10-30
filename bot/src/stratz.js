const STRATZ_GRAPHQL = 'https://api.stratz.com/graphql';

function getStratzToken() {
  const token = process.env.STRATZ_TOKEN || process.env.STRATZ_API_KEY || '';
  return token.trim();
}

export function hasStratzToken() {
  return Boolean(getStratzToken());
}

/**
 * ดึงข้อมูลการแข่งขันเชิงลึกจาก STRATZ GraphQL API
 * รวมค่า IMP, Lane, Role, GPM, Networth, Last Hits/Denies
 */
export async function getStratzMatch(matchId) {
  const token = getStratzToken();
  if (!token) return null;

  const query = `
    query GetMatchDetails($matchId: Long!) {
      match(id: $matchId) {
        id
        didRadiantWin
        durationSeconds
        players {
          steamAccountId
          heroId
          isRadiant
          lane
          role
          imp
          award
          numLastHits
          numDenies
          goldPerMinute
          networth
          heroDamage
          kills
          deaths
          assists
        }
      }
    }
  `;

  try {
    const res = await fetch(STRATZ_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'STRATZ_API',
      },
      body: JSON.stringify({
        query,
        variables: { matchId: Number(matchId) },
      }),
    });

    if (!res.ok) {
      console.warn(`STRATZ API returned status ${res.status}`);
      return null;
    }

    const json = await res.json();
    const match = json.data?.match;
    if (!match) return null;

    const parseLane = (lane) => {
      if (lane === 'MID_LANE') return 'เลนกลาง (Mid Lane) 🎯';
      if (lane === 'SAFE_LANE') return 'เซฟเลน (Safe Lane)';
      if (lane === 'OFF_LANE') return 'ออฟเลน (Off Lane)';
      if (lane === 'JUNGLE') return 'ฟาร์มป่า (Jungle)';
      return lane || 'ไม่ระบุ';
    };

    const players = (match.players || []).map((p) => {
      let impComment = 'ฟอร์มทั่วไป';
      if (typeof p.imp === 'number') {
        if (p.imp >= 25) impComment = 'ตัวแบกเกมนรกแตก (Godlike)';
        else if (p.imp >= 10) impComment = 'เล่นดี แบกทีม';
        else if (p.imp <= -25) impComment = 'ตัวถ่วงระดับหายนะ (Mega Thrower)';
        else if (p.imp <= -10) impComment = 'แจกยับ ฟอร์มตก';
      }

      return {
        steamId: p.steamAccountId,
        heroId: p.heroId,
        isRadiant: p.isRadiant,
        imp: p.imp,
        impComment,
        lane: parseLane(p.lane),
        rawLane: p.lane,
        role: p.role,
        award: p.award,
        lastHits: p.numLastHits ?? 0,
        denies: p.numDenies ?? 0,
        gpm: p.goldPerMinute ?? 0,
        networth: p.networth ?? 0,
        heroDamage: p.heroDamage ?? 0,
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        assists: p.assists ?? 0,
      };
    });

    return {
      matchId: match.id,
      didRadiantWin: match.didRadiantWin,
      duration: `${Math.floor(match.durationSeconds / 60)}:${String(match.durationSeconds % 60).padStart(2, '0')}`,
      players,
    };
  } catch (err) {
    console.error('STRATZ GraphQL fetch error:', err.message);
    return null;
  }
}

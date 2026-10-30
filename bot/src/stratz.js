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
 * รวมค่า IMP (คะแนนวัดตัวแบก/ตัวถ่วง), Lane Outcome (แพ้/ชนะเลน), และ Award
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
        radiantScore
        direScore
        players {
          steamAccountId
          heroId
          isRadiant
          imp
          kills
          deaths
          assists
          networth
          heroDamage
          lane
          laneOutcome
          award
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
        'User-Agent': 'STRATZ_DOTA2_DISCORD_BOT',
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

    // แปลงผล Lane Outcome ให้เข้าใจง่าย
    // 1 = Win, 2 = Loss, 3 = Even
    const parseLaneOutcome = (val) => {
      if (val === 1 || val === 'WON') return 'ชนะเลนขาดลอย 🔥';
      if (val === 2 || val === 'LOST') return 'แพ้เลนยับเยิน 💀';
      if (val === 3 || val === 'DRAW') return 'เสมอเลน สูสี';
      return 'ไม่ระบุ';
    };

    const players = (match.players || []).map((p) => {
      let impComment = 'ปกติ';
      if (p.imp >= 25) impComment = 'ตัวแบกเกมนรกแตก (Godlike)';
      else if (p.imp >= 10) impComment = 'เล่นดี แบกทีม';
      else if (p.imp <= -25) impComment = 'ตัวถ่วงระดับหายนะ (Mega Thrower)';
      else if (p.imp <= -10) impComment = 'แจกยับ ฟอร์มตก';

      return {
        steamId: p.steamAccountId,
        heroId: p.heroId,
        isRadiant: p.isRadiant,
        imp: p.imp ?? 0,
        impComment,
        laneOutcome: parseLaneOutcome(p.laneOutcome),
        award: p.award || null,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        networth: p.networth,
        heroDamage: p.heroDamage,
      };
    });

    return {
      matchId: match.id,
      didRadiantWin: match.didRadiantWin,
      duration: `${Math.floor(match.durationSeconds / 60)}:${String(match.durationSeconds % 60).padStart(2, '0')}`,
      radiantScore: match.radiantScore,
      direScore: match.direScore,
      players,
    };
  } catch (err) {
    console.error('STRATZ GraphQL fetch error:', err.message);
    return null;
  }
}

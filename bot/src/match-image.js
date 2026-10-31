import sharp from 'sharp';

// Escape XML special characters for SVG text
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function generateMatchBanner(matchData, highlightedHeroOrName = '') {
  const width = 1100;
  const height = 660;

  const isRadiantWin = Boolean(matchData.radiantWin);
  const winTeamName = isRadiantWin ? 'RADIANT VICTORY' : 'DIRE VICTORY';
  const winColor = isRadiantWin ? '#00e676' : '#ff5252';
  const winBg = isRadiantWin ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 82, 82, 0.12)';

  const q = String(highlightedHeroOrName || '').toLowerCase().trim();

  const radiantPlayers = (matchData.players || []).filter((p) => p.isRadiant);
  const direPlayers = (matchData.players || []).filter((p) => !p.isRadiant);

  // Find MVP (Highest STRATZ IMP or Highest Damage)
  const allPlayers = [...(matchData.players || [])];
  const mvpPlayer = [...allPlayers].sort((a, b) => (b.imp ?? -999) - (a.imp ?? -999))[0] ||
                    [...allPlayers].sort((a, b) => (b.heroDamage || 0) - (a.heroDamage || 0))[0];

  function renderPlayerRow(p, x, y, w, h) {
    const isHighlighted =
      q &&
      ((p.hero && q.includes(p.hero.toLowerCase())) ||
        (p.name && q.includes(p.name.toLowerCase())) ||
        p.hero.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q));

    const rowBg = isHighlighted
      ? 'rgba(255, 215, 0, 0.15)'
      : 'rgba(255, 255, 255, 0.03)';
    const borderColor = isHighlighted ? '#ffd700' : 'rgba(255, 255, 255, 0.06)';

    const isMvp = mvpPlayer && mvpPlayer.hero === p.hero && mvpPlayer.name === p.name;

    const impValue = p.imp !== null ? p.imp : null;
    const impColor = impValue !== null ? (impValue >= 0 ? '#00e676' : '#ff5252') : '#888';
    const impText = impValue !== null ? `${impValue > 0 ? '+' : ''}${impValue} IMP` : '—';

    const dmgText = `${((p.heroDamage || 0) / 1000).toFixed(1)}k DMG`;
    const nwText = p.networth ? `${(p.networth / 1000).toFixed(1)}k NW` : '';
    const csText = p.lastHits !== null ? `${p.lastHits}/${p.denies || 0} CS` : '';
    const laneText = p.lane ? p.lane.replace('_LANE', '') : '';
    const isSupport = p.role?.includes('SUPPORT') || (p.obsPlaced > 0 && p.dewards > 0);
    const subText = isSupport
      ? `👁️ Obs ${p.obsPlaced || 0}/Sen ${p.senPlaced || 0} · Dewards ${p.dewards || 0}`
      : `${laneText || ''} ${p.campsStacked ? `· Stacks ${p.campsStacked}` : ''}`.trim();

    return `
      <g transform="translate(${x}, ${y})">
        <!-- Row Background -->
        <rect width="${w}" height="${h}" rx="8" fill="${rowBg}" stroke="${borderColor}" stroke-width="${isHighlighted ? 1.5 : 1}"/>
        
        <!-- Hero Badge -->
        <rect x="10" y="8" width="130" height="34" rx="6" fill="#1e293b"/>
        <text x="75" y="30" fill="#f8fafc" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">
          ${escapeXml(p.hero)}
        </text>

        <!-- Player Name & MVP Chip -->
        <text x="150" y="24" fill="${isHighlighted ? '#ffd700' : '#e2e8f0'}" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600">
          ${escapeXml((p.name || 'Anonymous').slice(0, 16))}
        </text>
        ${isMvp ? `<rect x="270" y="12" width="46" height="18" rx="4" fill="#f59e0b"/><text x="293" y="25" fill="#000" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">MVP</text>` : ''}
        ${subText ? `<text x="150" y="40" fill="${isSupport ? '#38bdf8' : '#64748b'}" font-family="sans-serif" font-size="10.5">${escapeXml(subText)}</text>` : ''}

        <!-- KDA -->
        <text x="360" y="30" fill="#f1f5f9" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">
          ${escapeXml(p.kda)}
        </text>

        <!-- Stats (NW / CS) -->
        <text x="430" y="23" fill="#cbd5e1" font-family="sans-serif" font-size="11" text-anchor="middle">${nwText}</text>
        <text x="430" y="38" fill="#64748b" font-family="sans-serif" font-size="10" text-anchor="middle">${csText}</text>

        <!-- Hero Damage -->
        <text x="485" y="30" fill="#e2e8f0" font-family="sans-serif" font-size="12" font-weight="600" text-anchor="end">
          ${dmgText}
        </text>

        <!-- STRATZ IMP Score Badge -->
        <rect x="495" y="14" width="56" height="22" rx="5" fill="rgba(0,0,0,0.4)" stroke="${impColor}" stroke-width="1"/>
        <text x="523" y="29" fill="${impColor}" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">
          ${impText}
        </text>
      </g>
    `;
  }

  const radiantRows = radiantPlayers.map((p, idx) => renderPlayerRow(p, 40, 150 + idx * 54, 500, 48)).join('\n');
  const direRows = direPlayers.map((p, idx) => renderPlayerRow(p, 560, 150 + idx * 54, 500, 48)).join('\n');

  const mvpSummary = mvpPlayer
    ? `🏆 Top Performer: ${escapeXml(mvpPlayer.name)} (${escapeXml(mvpPlayer.hero)}) · KDA ${escapeXml(mvpPlayer.kda)} · Damage ${(mvpPlayer.heroDamage || 0).toLocaleString()} · IMP ${mvpPlayer.imp !== null ? (mvpPlayer.imp > 0 ? '+' : '') + mvpPlayer.imp : 'N/A'}`
    : '';

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Background Gradient -->
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a0f18"/>
          <stop offset="50%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>

        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${winBg}"/>
          <stop offset="50%" stop-color="rgba(30, 41, 59, 0.4)"/>
          <stop offset="100%" stop-color="transparent"/>
        </linearGradient>
      </defs>

      <!-- Background Canvas -->
      <rect width="${width}" height="${height}" rx="16" fill="url(#bgGrad)" stroke="#334155" stroke-width="1.5"/>

      <!-- Header Banner Box -->
      <rect x="30" y="24" width="1040" height="85" rx="12" fill="url(#headerGrad)" stroke="${winColor}" stroke-width="1.2" stroke-opacity="0.5"/>

      <!-- Top Label -->
      <text x="50" y="52" fill="#94a3b8" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" letter-spacing="1">
        DOTA 2 ARENA · MATCH #${escapeXml(matchData.matchId)} · ${escapeXml(matchData.duration)}
      </text>

      <!-- Victory Title -->
      <text x="50" y="86" fill="${winColor}" font-family="'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="900" letter-spacing="1">
        ${winTeamName}
      </text>

      <!-- Scoreboard in Header -->
      <g transform="translate(620, 40)">
        <text x="0" y="32" fill="#00e676" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="end">${matchData.radiantScore}</text>
        <text x="25" y="30" fill="#64748b" font-family="sans-serif" font-size="20" font-weight="normal" text-anchor="middle">—</text>
        <text x="50" y="32" fill="#ff5252" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="start">${matchData.direScore}</text>
      </g>

      <!-- Guild Tag -->
      <text x="1040" y="55" fill="#38bdf8" font-family="'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="bold" text-anchor="end">
        ⚔️ SleepKnight Gaming
      </text>
      <text x="1040" y="75" fill="#64748b" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" text-anchor="end">
        Analytics &amp; AI Coach
      </text>

      <!-- Column Headers -->
      <!-- Radiant Header -->
      <g transform="translate(40, 120)">
        <rect width="500" height="24" rx="4" fill="rgba(0, 230, 118, 0.08)"/>
        <text x="15" y="17" fill="#00e676" font-family="sans-serif" font-size="12" font-weight="bold">THE RADIANT</text>
        <text x="360" y="17" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">K / D / A</text>
        <text x="430" y="17" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">NW / CS</text>
        <text x="525" y="17" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">IMP</text>
      </g>

      <!-- Dire Header -->
      <g transform="translate(560, 120)">
        <rect width="500" height="24" rx="4" fill="rgba(255, 82, 82, 0.08)"/>
        <text x="15" y="17" fill="#ff5252" font-family="sans-serif" font-size="12" font-weight="bold">THE DIRE</text>
        <text x="360" y="17" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">K / D / A</text>
        <text x="430" y="17" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">NW / CS</text>
        <text x="525" y="17" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">IMP</text>
      </g>

      <!-- Player Rows -->
      ${radiantRows}
      ${direRows}

      <!-- Bottom MVP Bar -->
      <g transform="translate(30, 440)">
        <rect width="1040" height="42" rx="8" fill="rgba(30, 41, 59, 0.7)" stroke="#334155" stroke-width="1"/>
        <text x="20" y="26" fill="#fbbf24" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600">
          ${mvpSummary}
        </text>
      </g>

      <!-- Footer Info -->
      <text x="50" y="640" fill="#64748b" font-family="sans-serif" font-size="11">
        Powered by STRATZ GraphQL &amp; OpenDota API · Rendered with SleepKnight Engine
      </text>
      <text x="1050" y="640" fill="#64748b" font-family="sans-serif" font-size="11" text-anchor="end">
        Dota 2 Discord Bot &amp; Activity
      </text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

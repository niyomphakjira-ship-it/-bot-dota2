import { GoogleGenAI } from '@google/genai';
import { getStatisticalDraftCounters } from './opendota.js';

const SYSTEM_INSTRUCTION =
  'คุณคือโค้ช Dota 2 ระดับ Immortal ตอบเป็นภาษาไทยสไตล์ Minimal กระชับ ตรงประเด็น ไม่เกริ่นนำ ไม่สอนวิธีใช้บอท ' +
  'แบ่งหัวข้อสั้นๆ ด้วย bullet points (เช่น จุดอ่อนดราฟต์, ฮีโร่แก้ทาง 3 ตัว, ไอเทมสำคัญ, แผนเดินเกม) ความยาวไม่เกิน 900 ตัวอักษร';

// เก็บ previous_interaction_id แยกรายผู้ใช้ เพื่อให้คุยต่อเนื่องได้ (Stateful Conversation)
const userInteractions = new Map();

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

export async function analyzeDraft(enemyInput, discordUserId) {
  const tokens = enemyInput
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // ดึงสถิติ Winrate จริงจาก OpenDota Matchups API ควบคู่ไปด้วยเสมอ
  const stats = await getStatisticalDraftCounters(tokens).catch(() => null);
  const client = getClient();

  if (client) {
    const statContext = stats
      ? `\nข้อมูลสถิติ OpenDota ฮีโร่ที่ชนะทางทีมนี้สูงสุด: ${stats.topCounters
          .map((c) => `${c.hero} (${c.avgWinrate}%)`)
          .join(', ')}`
      : '';

    const interaction = await client.interactions.create({
      model: 'gemini-3.8-flash',
      input: `วิเคราะห์การแก้ทางดราฟต์ฝั่งตรงข้าม: ${
        stats ? stats.enemies.join(', ') : enemyInput
      }${statContext}`,
      system_instruction: SYSTEM_INSTRUCTION,
    });

    if (discordUserId && interaction?.id) {
      userInteractions.set(discordUserId, interaction.id);
    }

    return {
      mode: 'gemini-3.8-flash',
      enemies: stats?.enemies || tokens,
      text: interaction.output_text || 'ไม่สามารถวิเคราะห์ได้ในขณะนี้',
      stats: stats?.topCounters || [],
    };
  }

  // Fallback อัจฉริยะด้วยสถิติจริงจาก OpenDota เมื่อยังไม่ได้ใส่ GEMINI_API_KEY
  if (stats && stats.topCounters.length > 0) {
    const counterLines = stats.topCounters
      .map((c, idx) => `${idx + 1}. **${c.hero}** — Winrate เฉลี่ย \`${c.avgWinrate}%\``)
      .join('\n');

    return {
      mode: 'opendota-stats',
      enemies: stats.enemies,
      text:
        `**Best Statistical Picks (OpenDota Live)**\n${counterLines}\n\n` +
        `**Key Team Items**\n• \`Black King Bar\` · \`Silver Edge\` · \`Spirit Vessel\` · \`Force Staff\``,
      stats: stats.topCounters,
    };
  }

  return {
    mode: 'fallback',
    enemies: tokens,
    text: 'ไม่พบชื่อฮีโร่ที่ระบุ (ลองพิมพ์ชื่อภาษาอังกฤษ เช่น `pa axe invoker`)',
    stats: [],
  };
}

export async function askDotaCoach(question, discordUserId) {
  const client = getClient();

  if (client) {
    const prevId = discordUserId ? userInteractions.get(discordUserId) : undefined;
    const params = {
      model: 'gemini-3.8-flash',
      input: question,
      system_instruction: SYSTEM_INSTRUCTION,
    };
    if (prevId) params.previous_interaction_id = prevId;

    const interaction = await client.interactions.create(params);
    if (discordUserId && interaction?.id) {
      userInteractions.set(discordUserId, interaction.id);
    }

    return {
      mode: 'gemini-3.8-flash',
      text: interaction.output_text || 'ไม่มีคำตอบจากระบบ',
    };
  }

  // Fallback เมื่อยังไม่ได้ตั้งค่า GEMINI_API_KEY
  return {
    mode: 'offline',
    text:
      'ใส่ `GEMINI_API_KEY` ในไฟล์ `.env` เพื่อเปิดใช้งาน AI Coach (`gemini-3.8-flash`)\n' +
      '*(คำสั่งวิเคราะห์ดราฟต์ `!draft <ชื่อฮีโร่>` ใช้งานผ่านสถิติสด OpenDota ได้ทันทีโดยไม่ต้องใช้คีย์)*',
  };
}

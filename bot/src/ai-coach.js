import { GoogleGenAI } from '@google/genai';
import { getStatisticalDraftCounters } from './opendota.js';

const SYSTEM_INSTRUCTION =
  'คุณคือบอท AI Dota 2 อัจฉริยะประจำเซิร์ฟเวอร์ Discord "SleepKnight Gaming" ' +
  'บุคลิก: เท่ ฉลาด ปากแซ่บ จอมขยี้ตัวตึง สุภาพแต่เป็นกันเอง สไตล์เกมเมอร์ Dota 2 ตอบเป็นภาษาไทยกระชับ คมคาย ตรงประเด็น ' +
  'เมื่อพูดถึงผลงานผู้เล่นหรือแมตช์: ' +
  '- ถ้าคะแนน IMP ติดลบ หรือแพ้เลน ให้ขยี้เรื่องเป็นตัวถ่วง/แจกแต้ม/ยืนเลนเละ ' +
  '- ถ้าทำดาเมจเยอะหรือ IMP บวกสูง ให้แซวว่าแบกหลังหักแต่เพื่อนไม่เอา ' +
  'ถ้าผู้ใช้สั่งการหรือมีเจตนาที่ตรงกับเครื่องมือ (Tools) เช่น สั่งเข้าห้องเสียง, ออกจากห้อง, เล่นเสียง, ดูตัวแก้ทาง, วิเคราะห์ดราฟต์, ดูสถิติ, แมตช์ล่าสุด, ดูรหัสแมตช์ หรือเปิดเกม ให้เรียกใช้เครื่องมือที่เกี่ยวข้องทันที ' +
  'ถ้าผู้ใช้แค่พูดคุย ปรึกษา ถามคำถาม ทักทาย หรือชวนคุยเรื่องเกม ให้ตอบกลับอย่างมีอรรถรสและเป็นธรรมชาติ';

function getClient() {
  const rawKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY ||
    '';
  const match = String(rawKey).match(/(AQ\.[A-Za-z0-9_-]+|AIzaSy[A-Za-z0-9_-]{33}|[A-Za-z0-9_-]{35,})/);
  const apiKey = match ? match[0] : rawKey.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export const AGENT_TOOLS = [
  {
    name: 'join_voice',
    description: 'สั่งให้บอทกระโดดเข้าร่วมห้องเสียง (Voice Channel) ที่ผู้ใช้อยู่',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'leave_voice',
    description: 'สั่งให้บอทออกจากห้องเสียง (Voice Channel)',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'play_sound',
    description: 'เล่นเสียงซาวด์เอฟเฟกต์ Dota 2 ในห้องเสียง',
    parameters: {
      type: 'object',
      properties: {
        sound_id: {
          type: 'string',
          enum: ['sound_welcome', 'sound_lakad', 'sound_rampage', 'sound_gank', 'sound_roshan'],
          description:
            'ไอดีเสียง: sound_welcome (ต้อนรับ), sound_lakad (Lakad Matatag), sound_rampage (Rampage), sound_gank (ระวังโดนแก๊ง), sound_roshan (ไปตี Roshan)',
        },
      },
      required: ['sound_id'],
    },
  },
  {
    name: 'say_tts',
    description: 'สั่งให้บอทพูดข้อความที่ต้องการเข้าไปในห้องเสียง',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'ข้อความภาษาไทยหรืออังกฤษที่ต้องการให้บอทพูดในห้องเสียง' },
      },
      required: ['text'],
    },
  },
  {
    name: 'counter_hero',
    description: 'ค้นหาตัวแก้ทางและไอเทมสำคัญสำหรับรับมือฮีโร่ Dota 2',
    parameters: {
      type: 'object',
      properties: {
        hero: { type: 'string', description: 'ชื่อฮีโร่ เช่น pa, axe, pudge, sniper, invoker' },
      },
      required: ['hero'],
    },
  },
  {
    name: 'draft_analysis',
    description: 'วิเคราะห์ดราฟต์ฮีโร่ศัตรูหลายตัวเพื่อหาฮีโร่แก้ทางทั้งทีม',
    parameters: {
      type: 'object',
      properties: {
        heroes: { type: 'string', description: 'รายชื่อฮีโร่ฝั่งตรงข้าม เช่น "pa axe invoker" หรือ "sniper lion"' },
      },
      required: ['heroes'],
    },
  },
  {
    name: 'get_player_stats',
    description: 'เช็คสถิติโปรไฟล์ Rank และ Winrate ของผู้ใช้หรือเพื่อน',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'ไอดี Steam หรือชื่อ/แท็กเพื่อน (ถ้าไม่ระบุหมายถึงตัวผู้ส่งเอง)' },
      },
    },
  },
  {
    name: 'get_last_match',
    description: 'เช็คสรุปผลการแข่งขันแมตช์ล่าสุด (KDA, ชนะ/แพ้, ดาเมจ) ของผู้ใช้หรือเพื่อน',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'ไอดี Steam หรือชื่อ/แท็กเพื่อน (ถ้าไม่ระบุหมายถึงตัวผู้ส่งเอง)' },
      },
    },
  },
  {
    name: 'launch_arena',
    description: 'สร้างปุ่มเปิดมินิเกม Dota 2 Arena (ตี Roshan, แข่งตอบ Trivia) ในห้องเสียง',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'inspect_match',
    description: 'ดูรายละเอียดและสถิติของผู้เล่นทุกคนในแมตช์ Dota 2 จาก Match ID (รหัสแมตช์ตัวเลข 10 หลัก เช่น 9067295186) พร้อมระบุฮีโร่หรือชื่อผู้เล่นที่ต้องการตรวจ',
    parameters: {
      type: 'object',
      properties: {
        match_id: { type: 'string', description: 'รหัสแมตช์ Dota 2 (ตัวเลข 10 หลัก เช่น 9067295186)' },
        target_hero: { type: 'string', description: 'ชื่อฮีโร่หรือชื่อผู้เล่นที่ต้องการตรวจดู เช่น zeus, sleepknight' },
      },
      required: ['match_id'],
    },
  },
];

async function generateWithFallback({ prompt, systemInstruction, tools }) {
  const client = getClient();
  if (!client) return null;

  const config = {
    systemInstruction: systemInstruction || SYSTEM_INSTRUCTION,
  };
  if (tools && tools.length > 0) {
    config.tools = [{ functionDeclarations: tools }];
  }

  const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let lastErr = null;

  for (const model of models) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: prompt,
        config,
      });
      return { res, model };
    } catch (err) {
      lastErr = err;
      console.warn(`[GEMINI WARN] Model ${model} failed (${err.message}), trying next...`);
    }
  }
  throw lastErr;
}

export async function analyzeDraft(enemyInput, discordUserId) {
  const tokens = enemyInput
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const stats = await getStatisticalDraftCounters(tokens).catch(() => null);
  const client = getClient();

  if (client) {
    const statContext = stats
      ? `\nข้อมูลสถิติ OpenDota ฮีโร่ที่ชนะทางทีมนี้สูงสุด: ${stats.topCounters
          .map((c) => `${c.hero} (${c.avgWinrate}%)`)
          .join(', ')}`
      : '';

    try {
      const { res, model } = await generateWithFallback({
        prompt: `วิเคราะห์การแก้ทางดราฟต์ฝั่งตรงข้าม: ${
          stats ? stats.enemies.join(', ') : enemyInput
        }${statContext}`,
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      return {
        mode: model,
        enemies: stats?.enemies || tokens,
        text: res.text || 'ไม่สามารถวิเคราะห์ได้ในขณะนี้',
        stats: stats?.topCounters || [],
      };
    } catch (err) {
      console.error('analyzeDraft Gemini error:', err.message);
    }
  }

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
  if (!client) {
    return {
      mode: 'offline',
      text: 'ระบบ AI พร้อมใช้งานเมื่อใส่ GEMINI_API_KEY ใน Render Dashboard',
    };
  }

  try {
    const { res, model } = await generateWithFallback({
      prompt: question,
      systemInstruction: SYSTEM_INSTRUCTION,
    });
    return {
      mode: model,
      text: res.text || 'ไม่มีคำตอบจากระบบ',
    };
  } catch (err) {
    return {
      mode: 'error',
      text: `⚠️ ระบบ AI ขัดข้อง: ${err.message}`,
    };
  }
}

// ระบบ Autonomous AI Agent: รองรับ Function Calling + บริบทแชทย้อนหลัง + บริบทสถิติสด + บทสนทนาตอบกลับทันใจ (< 2 วินาที)
export async function runAutonomousAgent(userInput, discordUserId, actions, chatHistory = [], extraContext = '') {
  const client = getClient();
  if (!client) {
    return '⚠️ ระบบ AI ยังไม่พร้อมใช้งาน: กรุณาใส่ `GEMINI_API_KEY` ใน Render Dashboard (Environment Variables) ครับ';
  }

  try {
    let promptText = '';
    if (chatHistory && chatHistory.length > 0) {
      promptText += `[บริบทการสนทนาล่าสุดในห้อง Discord]:\n${chatHistory.join('\n')}\n\n`;
    }
    if (extraContext) {
      promptText += `${extraContext}\n\n`;
    }
    promptText += `[ข้อความล่าสุดของผู้ใช้]:\n${userInput || 'สวัสดี'}`;

    // ถ้ามี extraContext (เช่น มีข้อมูลสถิติแมตช์ที่ดึงมาล่วงหน้าแล้ว) ให้ตัด inspect_match ออก เพื่อให้ Gemini สร้างข้อความวิเคราะห์ละเอียด แทนการเรียก Tool เปล่าๆ
    const tools = extraContext
      ? AGENT_TOOLS.filter((t) => t.name !== 'inspect_match')
      : AGENT_TOOLS;

    const { res } = await generateWithFallback({
      prompt: promptText,
      systemInstruction: SYSTEM_INSTRUCTION,
      tools,
    });

    const functionCalls = res.functionCalls || [];
    let toolActionSummary = null;

    if (functionCalls.length > 0) {
      for (const call of functionCalls) {
        const { name, args } = call;
        if (name === 'join_voice') {
          await actions.onJoinVoice();
          toolActionSummary = '🔊 เข้าห้องเสียงเรียบร้อยครับ';
        } else if (name === 'leave_voice') {
          await actions.onLeaveVoice();
          toolActionSummary = '👋 ออกจากห้องเสียงแล้วครับ';
        } else if (name === 'play_sound') {
          await actions.onPlaySound(args?.sound_id);
          toolActionSummary = `🎵 เล่นเสียงซาวด์เอฟเฟกต์แล้วครับ`;
        } else if (name === 'say_tts') {
          await actions.onSayTTS(args?.text);
          toolActionSummary = `🗣️ พูดข้อความในห้องเสียงแล้วครับ`;
        } else if (name === 'counter_hero') {
          await actions.onCounterHero(args?.hero);
        } else if (name === 'draft_analysis') {
          await actions.onDraftAnalysis(args?.heroes);
        } else if (name === 'get_player_stats') {
          await actions.onGetStats(args?.target);
        } else if (name === 'get_last_match') {
          await actions.onGetLastMatch(args?.target);
        } else if (name === 'launch_arena') {
          await actions.onLaunchArena();
        } else if (name === 'inspect_match') {
          await actions.onInspectMatch(args?.match_id, args?.target_hero);
          toolActionSummary = `🔍 ดึงข้อมูลแมตช์ ${args?.match_id} ให้เรียบร้อยครับ`;
        }
      }
    }

    const text = res.text?.trim() || null;
    return text || toolActionSummary || 'สวัสดีครับ มีอะไรให้ผมช่วยเกี่ยวกับ Dota 2 หรือสั่งการบอทบอกได้เลยครับ!';
  } catch (err) {
    console.error('Autonomous Agent Error:', err);
    return `⚠️ ระบบ AI ขัดข้อง: ${err.message}`;
  }
}

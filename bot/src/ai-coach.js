import { GoogleGenAI } from '@google/genai';
import { getStatisticalDraftCounters } from './opendota.js';

const SYSTEM_INSTRUCTION =
  'คุณคือบอท AI Dota 2 อัจฉริยะประจำเซิร์ฟเวอร์ Discord "SleepKnight Gaming" ' +
  'บุคลิก: เท่ ฉลาด สุภาพแต่เป็นกันเอง สไตล์เกมเมอร์ Dota 2 ตอบเป็นภาษาไทยกระชับ ไม่เยิ่นเย้อ ' +
  'ถ้าผู้ใช้สั่งการหรือมีเจตนาที่ตรงกับเครื่องมือ (Tools) เช่น สั่งเข้าห้องเสียง, ออกจากห้อง, เล่นเสียง, ดูตัวแก้ทาง, วิเคราะห์ดราฟต์, ดูสถิติ, แมตช์ล่าสุด, หรือเปิดเกม ให้เรียกใช้เครื่องมือที่เกี่ยวข้องทันที ' +
  'ถ้าผู้ใช้แค่พูดคุย ปรึกษา ถามคำถาม ทักทาย หรือชวนคุยเรื่องเกม ให้ตอบกลับอย่างเป็นธรรมชาติและมีประโยชน์';

const userInteractions = new Map();

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

export const AGENT_TOOLS = [
  {
    type: 'function',
    name: 'join_voice',
    description: 'สั่งให้บอทกระโดดเข้าร่วมห้องเสียง (Voice Channel) ที่ผู้ใช้อยู่',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'leave_voice',
    description: 'สั่งให้บอทออกจากห้องเสียง (Voice Channel)',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
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
    type: 'function',
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
    type: 'function',
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
    type: 'function',
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
    type: 'function',
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
    type: 'function',
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
    type: 'function',
    name: 'launch_arena',
    description: 'สร้างปุ่มเปิดมินิเกม Dota 2 Arena (ตี Roshan, แข่งตอบ Trivia) ในห้องเสียง',
    parameters: { type: 'object', properties: {} },
  },
];

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
      text: 'ระบบ AI พร้อมใช้งานเมื่อใส่ GEMINI_API_KEY',
    };
  }

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

// ระบบ Agent อัจฉริยะ: ตีความภาษาไทยธรรมชาติและเรียกใช้งานฟังก์ชันอัตโนมัติ
export async function runAutonomousAgent(userInput, discordUserId, actions) {
  const client = getClient();
  if (!client) {
    return '⚠️ ระบบ AI ยังไม่พร้อมใช้งาน: กรุณาใส่ `GEMINI_API_KEY` ใน Render Dashboard (Environment Variables) ครับ';
  }

  try {
    const prevId = discordUserId ? userInteractions.get(discordUserId) : undefined;
    const params = {
      model: 'gemini-3.8-flash',
      input: userInput || 'สวัสดี',
      tools: AGENT_TOOLS,
      system_instruction: SYSTEM_INSTRUCTION,
    };
    if (prevId) params.previous_interaction_id = prevId;

    const res = await client.interactions.create(params);
    if (discordUserId && res?.id) {
      userInteractions.set(discordUserId, res.id);
    }

    const toolCalls = res.steps?.filter((s) => s.type === 'function_call') || [];
    let toolActionSummary = null;

    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const { name, arguments: args } = call;
        if (name === 'join_voice') {
          await actions.onJoinVoice();
          toolActionSummary = ' เข้าห้องเสียงเรียบร้อยครับ';
        } else if (name === 'leave_voice') {
          await actions.onLeaveVoice();
          toolActionSummary = ' ออกจากห้องเสียงแล้วครับ';
        } else if (name === 'play_sound') {
          await actions.onPlaySound(args?.sound_id);
          toolActionSummary = ` เล่นเสียง ${args?.sound_id || ''} แล้วครับ`;
        } else if (name === 'say_tts') {
          await actions.onSayTTS(args?.text);
          toolActionSummary = ` พูดข้อความในห้องเสียงแล้วครับ`;
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
        }
      }
    }

    let text = res.output_text || null;
    if (!text && Array.isArray(res.steps)) {
      const texts = [];
      for (const step of res.steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          for (const item of step.content) {
            if (item?.type === 'text' && item?.text) texts.push(item.text);
            else if (typeof item === 'string') texts.push(item);
          }
        }
      }
      if (texts.length > 0) text = texts.join('\n');
    }

    return text || toolActionSummary || 'สวัสดีครับ มีอะไรให้ผมรับใช้เกี่ยวกับ Dota 2 หรือสั่งการบอทบอกได้เลยครับ!';
  } catch (err) {
    console.error('Autonomous Agent Error:', err);
    return `⚠️ ระบบ AI ขัดข้อง: ${err.message}`;
  }
}

// ข้อมูล Dota 2 Counter-Pick, Items และ Soundboard (ฉบับ Minimal & Concise)

export const DOTA_HEROES = {
  pa: {
    aliases: ['pa', 'phantom assassin', 'phantom', 'มอร์ทเรด', 'พีเอ'],
    name: 'Phantom Assassin',
    role: 'Pos 1 · Hard Carry',
    counters: [
      '**Axe** — Call ทะลุ Blur + Blade Mail สะท้อนคริ',
      '**Lina / Lion** — เบิร์สต์เวทชุดเดียวก่อน PA ได้ BKB',
      '**Viper** — Nethertoxin ปิด Passive (Break) ไร้คริ/หลบหลีก',
      '**Razor** — Static Link ดูดดาเมจทะลุ BKB',
    ],
    items: [
      '**MKB** — ตีทะลุหลบหลีก 80%',
      '**Ghost Scepter** — กันสับกายภาพ',
      '**Blade Mail** — สะท้อนคริติคอล',
      '**Silver Edge** — ตีเปิดปิด Passive (Break)',
    ],
    tips: 'กดดันช่วงต้นเกมอย่าให้ฟาร์ม BF สบาย ซัพพอร์ตควรออก Ghost หรือ Force Staff พกไว้เสมอ',
  },
  axe: {
    aliases: ['axe', 'แอ็กซ์', 'ขวาน'],
    name: 'Axe',
    role: 'Pos 3 · Offlane Initiator',
    counters: [
      '**Viper / Veno** — พิษสโลว์ตัด Blink Dagger',
      '**Ursa / MK** — สู้ระยะประชิดในเลนเก่งกว่า',
      '**Necro / Lifestealer** — ละลายแทงค์ตาม % เลือด',
      '**OD / SD** — ขังช่วยเพื่อนจังหวะโดน Call',
    ],
    items: [
      '**Eul\'s Scepter** — ยก Axe ตอน Call ตัดคอมโบ Blade Mail',
      '**Spirit Vessel** — ลดการฟื้นฟูเลือดและเกราะ',
      '**Silver Edge** — ปิดสกิลหมุน Counter Helix',
      '**Force Staff** — ดันเพื่อนหนีจังหวะโดนจับ',
    ],
    tips: 'อย่ายืนเกาะกลุ่มเวลาดันป้อม และปัก Ward ดักจุดซุ่ม Blink',
  },
  pudge: {
    aliases: ['pudge', 'พัดจ์', 'อ้วน', 'ฮุค'],
    name: 'Pudge',
    role: 'Pos 3/4 · Tank Roamer',
    counters: [
      '**Lifestealer** — Feast กัดตามเลือดเยอะ ดูดยิ่งแรง',
      '**Timbersaw** — ตัด Stat Strength โดยตรง',
      '**Ursa** — ดึงมาโดนตบตายเอง',
      '**Necrophos** — สกิลและอัลติฆ่าแทงค์เลือดเยอะ',
    ],
    items: [
      '**Spirit Vessel** — ตัดรีเจนเลือดและดูดเลือด Dismember',
      '**Lotus / Linken** — สะท้อนหรือกัน Dismember',
      '**Force Staff** — ดันเพื่อนออกจากจังหวะโดน Hook',
      '**Mage Slayer** — ลดดาเมจเวท Rot และ Dismember',
    ],
    tips: 'ยืนหลังแนวครีปในเลน และปัก Ward ตามมุมมืดเสมอ',
  },
  invoker: {
    aliases: ['invoker', 'อินโวคเกอร์', 'อินโวค', 'voker'],
    name: 'Invoker',
    role: 'Pos 2 · Midlane Caster',
    counters: [
      '**Silencer / Doom** — ใบ้ตัดการร่ายคอมโบสกิล',
      '**Anti-Mage / Nyx** — เผามานาและสะท้อน AOE',
      '**Brood / Lycan** — กดดันเลนกลางไว',
      '**Storm / Void Spirit** — พุ่งล้วงถึงตัวแนวหลัง',
    ],
    items: [
      '**BKB** — ป้องกันคอมโบ Tornado + Meteor',
      '**Dust / Sentry** — จับตัวตอน Ghost Walk',
      '**Orchid / Bloodthorn** — ใบ้ก่อนทันกดสกิลหนี',
      '**Force Staff** — ดันออกจาก EMP / Ice Wall',
    ],
    tips: 'พก Dust เสมอ และรีบรวมทีมแก๊งกลางก่อนเขาได้ Aghanim/Midas',
  },
  sniper: {
    aliases: ['sniper', 'สไนเปอร์', 'สไน', 'คนแคระ'],
    name: 'Sniper',
    role: 'Pos 1/2 · Ranged DPS',
    counters: [
      '**Spectre** — อัลติพุ่งเข้าถึงตัวทุกไฟต์',
      '**Storm / Spirit Breaker** — ชาร์จล้วงระยะไกล',
      '**Clockwerk** — Hookshot ขังใน Cogs',
      '**PA / Riki** — กระโดดประกบตัวด้านหลัง',
    ],
    items: [
      '**Blink Dagger** — โดดประชิดตัวทันที',
      '**Blade Mail** — สะท้อนตอน Sniper ยิงฟรี',
      '**Smoke of Deceit** — อ้อมไฟต์ไปจับแนวหลัง',
      '**Heaven\'s Halberd** — ปลดอาวุธห้ามยิง',
    ],
    tips: 'ห้ามสู้หน้าตรงโดยไม่ถึงตัว ให้อ้อมหลังหรือรอตำแหน่งหลุดค่อยล้วง',
  },
  juggernaut: {
    aliases: ['juggernaut', 'jugg', 'จั๊ก', 'จั๊กเกอร์นอท'],
    name: 'Juggernaut',
    role: 'Pos 1 · Carry',
    counters: [
      '**Axe** — Call ทะลุการปั่น Blade Fury',
      '**Ursa / Slardar** — ดาเมจกายภาพหนักทะลุปั่น',
      '**Muerta / Necro** — มีร่าง Ghost ตีไม่โดน',
      '**Centaur** — ถึกพอทน Omnislash',
    ],
    items: [
      '**Ghost Scepter** — กดทันทีที่โดน Omnislash',
      '**Lotus Orb** — สะท้อน Omnislash กลับ',
      '**Force Staff** — ดันหนีระยะ Blade Fury',
      '**ตีเสาฮีล** — รีบตี Healing Ward ทิ้งทันทีในไฟต์ (ตี 1 ครั้งแตก)',
    ],
    tips: 'เมื่อโดน Omnislash ให้เดินเข้าหากลุ่มครีปหรือเพื่อนเพื่อแชร์ดาเมจ',
  },
  bristleback: {
    aliases: ['bristleback', 'bb', 'บีบี', 'เม่น'],
    name: 'Bristleback',
    role: 'Pos 3 · Offlane Tank',
    counters: [
      '**Viper** — Nethertoxin ปิดแผ่นหลัง (Break)',
      '**Timbersaw / Slark** — ตัดสเตตัสและเลือดจริง',
      '**Legion Commander** — Duel บังคับหันหน้ามารับดาเมจ',
      '**Ancient Apparition** — อัลติตัดการฮีล 100%',
    ],
    items: [
      '**Silver Edge** — ตีเปิดปิด Passive แผ่นหลัง',
      '**Spirit Vessel** — ตัดการดูดเลือด Spell Lifesteal',
      '**Magic Wand** — สะสมชาร์จจากสกิลสะบัดหนาม',
    ],
    tips: 'ห้ามวิ่งไล่ตีข้างหลัง ให้ตีด้านหน้าหรือรอ Break ก่อนค่อยเทดาเมจ',
  },
  antimage: {
    aliases: ['antimage', 'am', 'แอนตี้เมจ', 'เอเอ็ม', 'anti-mage'],
    name: 'Anti-Mage',
    role: 'Pos 1 · Hard Carry',
    counters: [
      '**Bloodseeker** — Rupture ห้าม Blink หนี',
      '**Legion / Axe** — ล็อกตัวทันทีก่อน AM กด Blink',
      '**Slardar / PA** — ดาเมจกายภาพล้วน เกราะเวทกันไม่ได้',
      '**Meepo / Troll** — รูทติดพื้นและจบเกมไว',
    ],
    items: [
      '**Orchid / Scythe of Vyse** — ใบ้/เสกหมูก่อนกด Counterspell',
      '**Rod of Atos** — รูทไม่ให้ Blink หนี',
      '**Ghost Scepter** — ป้องกันโดนเบิร์นมานา',
    ],
    tips: 'กดดันป้อมและยึดป่าก่อนนาที 20 เพื่อชะลอ Manta / Battle Fury',
  },
  slark: {
    aliases: ['slark', 'สลาร์ค', 'ปลา'],
    name: 'Slark',
    role: 'Pos 1 · Carry Ganker',
    counters: [
      '**Bloodseeker** — Thirst ตัดการรีเจนเลือดในเงา',
      '**Leshrac / Disruptor** — ดาเมจ AOE ลงพื้นทะลุควันดำ',
      '**Axe / Void** — Call หรือกาง Chro โดนในควันดำ',
      '**AA** — อัลติตัดการเด้งเลือด',
    ],
    items: [
      '**Force Staff** — ดันตัวเองหลุดจากเชือก Pounce ทันที',
      '**Ghost Scepter** — ป้องกันไม่ให้ตีขโมย Agility',
      '**Orchid / Hex** — ล็อกตายก่อนกด Dark Pact ล้าง',
    ],
    tips: 'จำไว้เสมอว่า Force Staff ใช้ดันให้หลุดจากเชือก Pounce ได้ทันที',
  },
};

export const SOUNDBOARD_ITEMS = [
  {
    id: 'sound_welcome',
    label: 'Welcome',
    lang: 'th',
    text: 'สวัสดีชาว สลีปไนท์ เกมมิ่ง ยินดีต้อนรับเข้าสู่สมรภูมิ โดต้า ทู เตรียมพร้อมลุยกันได้เลย',
  },
  {
    id: 'sound_lakad',
    label: 'Lakad Matatag',
    lang: 'en',
    text: 'Lakad Matatag! Normalin, Normalin!',
  },
  {
    id: 'sound_rampage',
    label: 'Rampage',
    lang: 'en',
    text: 'Rampage! Unstoppable! Godlike!',
  },
  {
    id: 'sound_gank',
    label: 'Gank Alert',
    lang: 'th',
    text: 'ระวังด้วยครับทุกคน ศัตรูหายไปจากแผนที่ ถอยกลับเข้าป้อมด่วน เดี๋ยวโดนแก๊ง',
  },
  {
    id: 'sound_roshan',
    label: 'Roshan Call',
    lang: 'th',
    text: 'ทุกคนรวมตัวกันด่วน ไปตี โรชาน เอา เอจิส ไปขึ้นบ้านกันเถอะ',
  },
];

export function findHeroCounter(query) {
  const clean = query.trim().toLowerCase();
  for (const key of Object.keys(DOTA_HEROES)) {
    const hero = DOTA_HEROES[key];
    if (hero.aliases.some((alias) => clean.includes(alias) || alias.includes(clean))) {
      return hero;
    }
  }
  return null;
}

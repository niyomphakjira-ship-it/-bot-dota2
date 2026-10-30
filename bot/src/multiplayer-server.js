import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '..', '..', 'activity-client', 'dist');

export const TRIVIA_BANK = [
  {
    q: 'ไอเทมใดใช้ตีเปิดเพื่อปิด Passive (Break) ของ Bristleback และ PA?',
    options: ['Shadow Blade', 'Silver Edge', 'Monkey King Bar', 'Daedalus'],
    answer: 1,
    explain: 'Silver Edge มีเอฟเฟกต์ Break ปิดสกิลติดตัวชั่วคราว',
  },
  {
    q: 'โดน Slark กระโดด Pounce ผูกเชือก ไอเทมใดกดดันให้เชือกขาดได้ทันที?',
    options: ['Blink Dagger', 'Force Staff', 'Phase Boots', 'Glimmer Cape'],
    answer: 1,
    explain: 'Force Staff / Hurricane Pike ดันตัวหลุดจากเชือก Pounce ได้ทันที',
  },
  {
    q: 'สังหาร Roshan ครั้งแรก ไอเทมหลักชิ้นใดดรอปเสมอ?',
    options: ['Cheese', 'Refresher Shard', 'Aegis of the Immortal', 'Aghanim Blessing'],
    answer: 2,
    explain: 'Aegis of the Immortal ดรอปจาก Roshan ทุกครั้งเพื่อชุบชีวิต 1 ครั้ง',
  },
  {
    q: 'สกิลใดของ Axe บังคับศัตรูรอบตัวโจมตีใส่ตัวเองทะลุ BKB?',
    options: ['Battle Hunger', 'Counter Helix', "Berserker's Call", 'Culling Blade'],
    answer: 2,
    explain: "Berserker's Call ทะลุสถานะ Debuff Immunity (BKB)",
  },
  {
    q: 'ไอเทมใดป้องกันดาเมจกายภาพ 100% จาก Omnislash ของ Juggernaut?',
    options: ['Ghost Scepter', 'Pipe of Insight', 'Eternal Shroud', 'Vanguard'],
    answer: 0,
    explain: 'Ghost Scepter เปลี่ยนร่างเป็น Ethereal ทำให้ไม่โดนฟันกายภาพ',
  },
  {
    q: 'อัลติเมท "Reaper\'s Scythe" ที่คำนวณดาเมจตามเลือดที่หายไป เป็นของฮีโร่ใด?',
    options: ['Lich', 'Death Prophet', 'Necrophos', 'Pugna'],
    answer: 2,
    explain: 'Necrophos ใช้เคียว Reaper\'s Scythe สตันและสังหารตามเลือดที่หายไป',
  },
  {
    q: 'สกิลใดของ Bloodseeker ที่ทำให้ Anti-Mage ไม่กล้ากด Blink หนี?',
    options: ['Bloodrage', 'Blood Rite', 'Thirst', 'Rupture'],
    answer: 3,
    explain: 'Rupture สร้างความเสียหาย Pure ตามระยะทางที่เคลื่อนที่',
  },
  {
    q: 'ไอเทมใดช่วยลดการฟื้นฟูเลือดและดูดเลือดของ Pudge / Huskar / Morphling ได้ดีที่สุด?',
    options: ['Spirit Vessel', 'Solar Crest', 'Vladmir Offering', 'aether Lens'],
    answer: 0,
    explain: 'Spirit Vessel ลดอัตราการฟื้นฟูเลือดและการฮีลของเป้าหมายอย่างหนัก',
  },
];

const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      roshanLevel: 1,
      maxHp: 1500,
      currentHp: 1500,
      aegisCount: 0,
      quizIndex: 0,
      firstBloodWinner: null,
      answeredSockets: new Set(),
      players: new Map(),
    });
  }
  return rooms.get(roomId);
}

function serializeRoom(room) {
  const q = TRIVIA_BANK[room.quizIndex % TRIVIA_BANK.length];
  const players = [...room.players.values()].sort(
    (a, b) => b.totalDamage + b.quizScore * 10 - (a.totalDamage + a.quizScore * 10)
  );
  return {
    roomId: room.roomId,
    roshanLevel: room.roshanLevel,
    maxHp: room.maxHp,
    currentHp: room.currentHp,
    aegisCount: room.aegisCount,
    quizIndex: room.quizIndex,
    question: {
      index: (room.quizIndex % TRIVIA_BANK.length) + 1,
      total: TRIVIA_BANK.length,
      q: q.q,
      options: q.options,
    },
    firstBloodWinner: room.firstBloodWinner,
    players,
  };
}

export function startMultiplayerServer(port = process.env.PORT || 3000, getBotStatus = () => ({})) {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      rooms: rooms.size,
      uptime: Math.floor(process.uptime()),
      ...getBotStatus(),
    });
  });

  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  io.on('connection', (socket) => {
    let currentRoomId = 'lobby';

    socket.on('room:join', ({ roomId, name, avatar }) => {
      currentRoomId = roomId || 'lobby';
      socket.join(currentRoomId);

      const room = getOrCreateRoom(currentRoomId);
      room.players.set(socket.id, {
        id: socket.id,
        name: name || `Player ${socket.id.slice(0, 4)}`,
        avatar: avatar || 'https://cdn.discordapp.com/embed/avatars/0.png',
        totalDamage: 0,
        quizScore: 0,
      });

      io.to(currentRoomId).emit('room:state', serializeRoom(room));
    });

    socket.on('roshan:attack', ({ damage }) => {
      const room = getOrCreateRoom(currentRoomId);
      const player = room.players.get(socket.id);
      const dmg = Math.max(1, Math.min(Number(damage) || 15, 5000));

      room.currentHp = Math.max(0, room.currentHp - dmg);
      if (player) player.totalDamage += dmg;

      io.to(currentRoomId).emit('roshan:hit', {
        attacker: player?.name || 'Warrior',
        damage: dmg,
      });

      if (room.currentHp === 0) {
        room.aegisCount += 1;
        room.roshanLevel += 1;
        room.maxHp = Math.floor(room.maxHp * 1.75);
        room.currentHp = room.maxHp;

        io.to(currentRoomId).emit('roshan:slain', {
          killer: player?.name || 'Warrior',
          newLevel: room.roshanLevel,
          aegisCount: room.aegisCount,
        });
      }

      io.to(currentRoomId).emit('room:state', serializeRoom(room));
    });

    socket.on('quiz:answer', ({ selectedIndex }) => {
      const room = getOrCreateRoom(currentRoomId);
      if (room.answeredSockets.has(socket.id)) return;
      room.answeredSockets.add(socket.id);

      const player = room.players.get(socket.id);
      const q = TRIVIA_BANK[room.quizIndex % TRIVIA_BANK.length];
      const correct = Number(selectedIndex) === q.answer;
      let pointsEarned = 0;
      let isFirstBlood = false;

      if (correct) {
        if (!room.firstBloodWinner) {
          room.firstBloodWinner = player?.name || 'Player';
          pointsEarned = 150;
          isFirstBlood = true;
        } else {
          pointsEarned = 80;
        }
        if (player) player.quizScore += pointsEarned;
      }

      socket.emit('quiz:result', {
        correct,
        correctAnswer: q.answer,
        explain: q.explain,
        pointsEarned,
        isFirstBlood,
      });

      io.to(currentRoomId).emit('room:state', serializeRoom(room));
    });

    socket.on('quiz:next', () => {
      const room = getOrCreateRoom(currentRoomId);
      room.quizIndex += 1;
      room.firstBloodWinner = null;
      room.answeredSockets.clear();
      io.to(currentRoomId).emit('quiz:new_round');
      io.to(currentRoomId).emit('room:state', serializeRoom(room));
    });

    socket.on('disconnect', () => {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.players.delete(socket.id);
        if (room.players.size === 0) {
          rooms.delete(currentRoomId);
        } else {
          io.to(currentRoomId).emit('room:state', serializeRoom(room));
        }
      }
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Multiplayer Activity Server listening on http://localhost:${port}`);
  });

  // Auto Keep-Alive สำหรับคลาวด์ (ป้องกันโหมดประหยัดพลังงาน 15 นาทีของ Render Free Tier)
  const externalUrl = process.env.RENDER_EXTERNAL_URL || 'https://dota2-discord-bot-arena.onrender.com';
  setInterval(() => {
    fetch(`${externalUrl}/health`).catch(() => {});
  }, 10 * 60 * 1000);

  return { app, server, io };
}

import { DiscordSDK } from '@discord/embedded-app-sdk';
import { io } from 'socket.io-client';
import confetti from 'canvas-confetti';

// Header & Tabs
const statusPill = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const roomTag = document.getElementById('room-tag');
const tabRoshan = document.getElementById('tab-roshan');
const tabQuiz = document.getElementById('tab-quiz');
const viewRoshan = document.getElementById('view-roshan');
const viewQuiz = document.getElementById('view-quiz');

// Roshan UI
const roshanLevelEl = document.getElementById('roshan-level');
const aegisCountEl = document.getElementById('aegis-count');
const hpBarFill = document.getElementById('hp-bar-fill');
const hpText = document.getElementById('hp-text');
const hitFeed = document.getElementById('hit-feed');
const goldDisplay = document.getElementById('gold-display');
const dmgDisplay = document.getElementById('dmg-display');
const comboDisplay = document.getElementById('combo-display');
const attackBtn = document.getElementById('attack-btn');
const shopButtons = document.querySelectorAll('.shop-item');

// Quiz UI
const questionNumberEl = document.getElementById('question-number');
const firstBloodTag = document.getElementById('first-blood-tag');
const questionTextEl = document.getElementById('question-text');
const optionsListEl = document.getElementById('options-list');
const quizFeedbackEl = document.getElementById('quiz-feedback');
const nextQuestionBtn = document.getElementById('next-question-btn');

// Leaderboard UI
const onlineCountEl = document.getElementById('online-count');
const leaderboardList = document.getElementById('leaderboard-list');

// Local Player Upgrade State
let gold = 0;
let baseDmg = 15;
let combo = 1;
let lastAttackTime = 0;
let renderedQuizIndex = -1;
let hasAnsweredCurrent = false;

let playerProfile = {
  roomId: 'sleepknight',
  name: `Warrior-${Math.floor(100 + Math.random() * 900)}`,
  avatar: `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`,
};

// 1. Setup Discord SDK (or Browser Lobby)
async function initDiscordContext() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('frame_id')) {
    try {
      const clientId = params.get('client_id') || '1565361212299022376';
      const discordSdk = new DiscordSDK(clientId);
      await discordSdk.ready();
      if (discordSdk.channelId) {
        playerProfile.roomId = `vc-${discordSdk.channelId.slice(-6)}`;
      }
    } catch {
      // Fallback to shared lobby
    }
  } else if (params.get('name')) {
    playerProfile.name = params.get('name');
  }
  roomTag.textContent = playerProfile.roomId.toUpperCase();
}

// 2. Connect Real-Time Socket.io
const socket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', async () => {
  await initDiscordContext();
  statusPill.classList.add('live');
  statusText.textContent = 'Live';
  socket.emit('room:join', playerProfile);
});

socket.on('disconnect', () => {
  statusPill.classList.remove('live');
  statusText.textContent = 'Offline';
});

socket.on('room:state', (state) => {
  // Update Shared Roshan State
  const pct = Math.max(0, (state.currentHp / state.maxHp) * 100);
  hpBarFill.style.width = `${pct}%`;
  hpText.textContent = `${state.currentHp.toLocaleString()} / ${state.maxHp.toLocaleString()}`;
  roshanLevelEl.textContent = `LV. ${state.roshanLevel}`;
  aegisCountEl.textContent = state.aegisCount;

  // Update Shared Quiz State
  firstBloodTag.textContent = state.firstBloodWinner
    ? `First Blood: ${state.firstBloodWinner}`
    : 'First Blood: —';

  if (state.quizIndex !== renderedQuizIndex && state.question) {
    renderedQuizIndex = state.quizIndex;
    hasAnsweredCurrent = false;
    renderQuestion(state.question);
  }

  // Update Live Leaderboard
  onlineCountEl.textContent = `${state.players.length} Online`;
  leaderboardList.innerHTML = state.players
    .map(
      (p, i) => `
      <div class="lb-row">
        <div class="lb-user">
          <span>#${i + 1}</span>
          <img src="${p.avatar}" class="lb-avatar" alt="" />
          <strong>${p.name}</strong>
        </div>
        <div class="lb-metrics">
          DMG <strong>${p.totalDamage.toLocaleString()}</strong> · QUIZ <strong>${p.quizScore}</strong>
        </div>
      </div>
    `
    )
    .join('');
});

socket.on('roshan:hit', ({ attacker, damage }) => {
  hitFeed.textContent = `${attacker} -${damage.toLocaleString()} HP`;
});

socket.on('roshan:slain', ({ killer }) => {
  gold += 200;
  hitFeed.textContent = `Aegis claimed by ${killer}! (+200g)`;
  updateLocalStats();
  fireConfetti();
});

socket.on('quiz:result', ({ correct, correctAnswer, explain, pointsEarned, isFirstBlood }) => {
  const buttons = optionsListEl.querySelectorAll('.option-btn');
  buttons.forEach((b, idx) => {
    b.disabled = true;
    if (idx === correctAnswer) b.classList.add('correct');
  });

  if (correct) {
    quizFeedbackEl.textContent = `${isFirstBlood ? 'FIRST BLOOD! ' : ''}+${pointsEarned} pts · ${explain}`;
    fireConfetti();
  } else {
    quizFeedbackEl.textContent = explain;
  }

  quizFeedbackEl.classList.remove('hidden');
  nextQuestionBtn.classList.remove('hidden');
});

socket.on('quiz:new_round', () => {
  quizFeedbackEl.classList.add('hidden');
  nextQuestionBtn.classList.add('hidden');
});

// 3. UI Actions
tabRoshan.addEventListener('click', () => {
  tabRoshan.classList.add('active');
  tabQuiz.classList.remove('active');
  viewRoshan.classList.remove('hidden');
  viewQuiz.classList.add('hidden');
});

tabQuiz.addEventListener('click', () => {
  tabQuiz.classList.add('active');
  tabRoshan.classList.remove('active');
  viewQuiz.classList.remove('hidden');
  viewRoshan.classList.add('hidden');
});

function updateLocalStats() {
  goldDisplay.textContent = gold.toLocaleString();
  dmgDisplay.textContent = baseDmg.toLocaleString();
  comboDisplay.textContent = `x${combo}`;

  shopButtons.forEach((btn) => {
    btn.disabled = gold < Number(btn.dataset.cost);
  });
}

attackBtn.addEventListener('click', () => {
  const now = Date.now();
  combo = now - lastAttackTime < 450 ? Math.min(combo + 1, 5) : 1;
  lastAttackTime = now;

  const damage = baseDmg * combo;
  gold += Math.ceil(damage * 0.25);
  updateLocalStats();

  socket.emit('roshan:attack', { damage });
});

shopButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const cost = Number(btn.dataset.cost);
    const dmgBonus = Number(btn.dataset.dmg);
    if (gold >= cost) {
      gold -= cost;
      baseDmg += dmgBonus;
      const nextCost = Math.floor(cost * 1.45);
      btn.dataset.cost = nextCost;
      btn.querySelector('.cost').textContent = `${nextCost}g`;
      updateLocalStats();
    }
  });
});

function renderQuestion(qObj) {
  questionNumberEl.textContent = `Q${qObj.index}/${qObj.total}`;
  questionTextEl.textContent = qObj.q;
  quizFeedbackEl.classList.add('hidden');
  nextQuestionBtn.classList.add('hidden');

  optionsListEl.innerHTML = '';
  qObj.options.forEach((optText, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = optText;
    btn.addEventListener('click', () => {
      if (hasAnsweredCurrent) return;
      hasAnsweredCurrent = true;
      btn.classList.add('wrong'); // overridden to green if correct
      socket.emit('quiz:answer', { selectedIndex: idx });
    });
    optionsListEl.appendChild(btn);
  });
}

nextQuestionBtn.addEventListener('click', () => {
  socket.emit('quiz:next');
});

function fireConfetti() {
  confetti({
    particleCount: 50,
    spread: 65,
    origin: { y: 0.72 },
    colors: ['#c23c2a', '#e5b84b', '#4ade80'],
  });
}

updateLocalStats();

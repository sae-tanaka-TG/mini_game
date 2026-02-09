(function () {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  let audioContext = null;
  let bgmIntervalId = null;
  const BGM_NOTES = [262, 330, 392];
  let bgmNoteIndex = 0;

  function initAudio() {
    if (audioContext) return;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {}
  }
  const finalScoreEl = document.getElementById('finalScore');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');

  const GAME_WIDTH = canvas.width;
  const GAME_HEIGHT = canvas.height;

  // プレイヤー（果物と同じくらいのサイズ）
  const PLAYER_WIDTH = 52;
  const PLAYER_HEIGHT = 52;
  const PLAYER_SPEED = 4;
  const GROUND_Y = GAME_HEIGHT - PLAYER_HEIGHT - 20;
  const GRAVITY = 0.35;
  const JUMP_POWER = -10;

  // 落下物
  const FALL_SPEED_MIN = 2;
  const FALL_SPEED_MAX = 5;
  const SPAWN_INTERVAL = 1200;
  const ITEM_SIZE = 56;

  const FRUITS = [
    { emoji: '🍒', points: 5 },
    { emoji: '🍓', points: 8 },
    { emoji: '🍇', points: 10 },
    { emoji: '🍎', points: 12 },
    { emoji: '🍊', points: 15 },
    { emoji: '🍋', points: 18 },
    { emoji: '🍑', points: 22 },
    { emoji: '🍌', points: 25 },
    { emoji: '🍉', points: 30 },
    { emoji: '🍍', points: 35 },
    { emoji: '🥝', points: 40 },
    { emoji: '🍈', points: 50 },
  ];

  // 岩の見た目バリエーション（トゲの数・色）
  const ROCK_STYLES = [
    { spikes: 6, fill: '#4a5568', stroke: '#2d3748' },
    { spikes: 8, fill: '#5d6d7e', stroke: '#34495e' },
    { spikes: 5, fill: '#4b5d6b', stroke: '#2c3e50' },
    { spikes: 10, fill: '#3d4f5c', stroke: '#1a252f' },
  ];

  let gameState = {
    running: false,
    score: 0,
    playerX: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
    playerY: GAME_HEIGHT - PLAYER_HEIGHT - 20,
    playerVy: 0,
    keys: {},
    items: [],
    lastSpawn: 0,
    animationId: null,
    expression: 'normal',
    expressionUntil: 0,
    exploding: false,
    explodeStart: 0,
    explodeX: 0,
    explodeY: 0,
    explodeParticles: [],
    floatingPoints: [],
    craters: [],
    falling: false,
    fallStart: 0,
  };

  const FLOATING_POINTS_DURATION = 1000;
  const GROUND_HEIGHT = 28;
  const GROUND_TOP = GAME_HEIGHT - GROUND_HEIGHT;
  const GOLDEN_FRUIT_CHANCE = 0.08;
  const GOLDEN_FRUIT_POINTS = 25;
  const CRATER_REPAIR_AMOUNT = 18;
  const FALL_DURATION = 1400;

  function getDifficulty(score) {
    // 最初はゆっくり（0.85倍速）、スコアが増えるほど緩やかに上昇（約1200点で最大2倍）
    const speedMult = Math.min(2, 0.85 + score / 800);
    // 最初は出現間隔を長め（1500ms）、緩やかに短く（約6000点で最小550ms）
    const spawnInterval = Math.max(550, 1500 - score / 6);
    // 揺れは80点以降から始まり、緩やかに強くなる（約440点で最大）
    const wobbleAmplitude = score < 80 ? 0 : Math.min(3, (score - 80) / 120);
    return { speedMult, spawnInterval, wobbleAmplitude };
  }

  function getCraterUnderPlayer() {
    if (gameState.exploding) return null;
    if (gameState.playerY < GROUND_Y - 2 || gameState.playerVy < -0.5) return null;
    const px = gameState.playerX;
    const pw = PLAYER_WIDTH;
    for (let i = 0; i < gameState.craters.length; i++) {
      const c = gameState.craters[i];
      if (px < c.right && px + pw > c.left) return c;
    }
    return null;
  }

  function repairOneCrater() {
    const craters = gameState.craters;
    if (craters.length === 0) return;
    let best = 0;
    for (let i = 1; i < craters.length; i++) {
      if (craters[i].right - craters[i].left > craters[best].right - craters[best].left) best = i;
    }
    const c = craters[best];
    c.left += CRATER_REPAIR_AMOUNT;
    c.right -= CRATER_REPAIR_AMOUNT;
    if (c.left >= c.right) craters.splice(best, 1);
  }

  function drawFallingPlayer() {
    const x = gameState.playerX;
    const y = gameState.playerY;
    const cx = x + PLAYER_WIDTH / 2;
    const cy = y + PLAYER_HEIGHT / 2;
    const r = Math.min(PLAYER_WIDTH, PLAYER_HEIGHT) / 2 - 4;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((Date.now() - gameState.fallStart) * 0.003);
    ctx.translate(-cx, -cy);

    ctx.fillStyle = '#F4A460';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx - 8, cy - 5, 4, 0, Math.PI * 2);
    ctx.arc(cx + 8, cy - 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy + 6, 6, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    if (gameState.exploding) {
      drawExplosion();
      return;
    }
    if (gameState.falling) {
      drawFallingPlayer();
      return;
    }

    const x = gameState.playerX;
    const y = gameState.playerY;
    const cx = x + PLAYER_WIDTH / 2;
    const cy = y + PLAYER_HEIGHT / 2;
    const r = Math.min(PLAYER_WIDTH, PLAYER_HEIGHT) / 2 - 4;

    // 体：ひとつの丸（縁取りなし）
    ctx.fillStyle = '#F4A460';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 1.5;

    // 通常：丸目、にっこり口（サイズに合わせて小さく）
    ctx.beginPath();
    ctx.arc(cx - 8, cy - 5, 4, 0, Math.PI * 2);
    ctx.arc(cx + 8, cy - 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy + 6, 6, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  function drawFloatingPoints() {
    const now = Date.now();
    const list = gameState.floatingPoints;

    for (let i = list.length - 1; i >= 0; i--) {
      const fp = list[i];
      const elapsed = now - fp.startTime;
      if (elapsed >= FLOATING_POINTS_DURATION) {
        list.splice(i, 1);
        continue;
      }

      const yOffset = elapsed * 0.08;
      const x = fp.x;
      const y = fp.y - yOffset;
      const alpha = 1 - elapsed / FLOATING_POINTS_DURATION;
      const text = '+' + fp.points;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#ffd93d';
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  }

  function drawExplosion() {
    const particles = gameState.explodeParticles;
    if (!particles.length) return;

    const ex = gameState.explodeX;
    const ey = gameState.explodeY;

    ctx.fillStyle = '#F4A460';
    ctx.strokeStyle = '#D2691E';
    ctx.lineWidth = 1;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;

      ctx.globalAlpha = Math.max(0, 1 - (Date.now() - gameState.explodeStart) / 800);
      ctx.beginPath();
      ctx.arc(ex + p.x, ey + p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFruit(item) {
    const fruit = FRUITS[item.variant];
    const cx = item.x + ITEM_SIZE / 2;
    const cy = item.y + ITEM_SIZE / 2;
    const emojiSize = 46;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(cx, cy);
    ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 白い縁を描いてから絵文字を描く
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeText(fruit.emoji, 0, 0);
    ctx.fillText(fruit.emoji, 0, 0);
    ctx.restore();
  }

  function drawGoldenFruit(item) {
    const cx = item.x + ITEM_SIZE / 2;
    const cy = item.y + ITEM_SIZE / 2;
    const emojiSize = 46;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(cx, cy);
    const pulse = 0.3 + 0.15 * Math.sin(Date.now() / 120);
    for (let r = emojiSize / 2 + 8; r > emojiSize / 2; r -= 3) {
      ctx.globalAlpha = 0.15 * (1 - (r - emojiSize / 2) / 8);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(0, 0, r + pulse * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 5;
    ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('🍎', 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText('🍎', 0, 0);
    ctx.restore();
  }

  function drawRock(item) {
    const style = ROCK_STYLES[item.rockVariant ?? 0];
    const cx = item.x + ITEM_SIZE / 2;
    const cy = item.y + ITEM_SIZE / 2;
    const baseR = ITEM_SIZE / 2 - 2;
    const spikeCount = style.spikes;

    ctx.save();
    ctx.translate(cx, cy);

    // トゲトゲした多角形を描く
    ctx.beginPath();
    for (let i = 0; i < spikeCount * 2; i++) {
      const r = i % 2 === 0 ? baseR : baseR * 0.5;
      const angle = (i * Math.PI) / spikeCount - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  function spawnItem() {
    const now = Date.now();
    const diff = getDifficulty(gameState.score);
    if (now - gameState.lastSpawn < diff.spawnInterval) return;
    gameState.lastSpawn = now;

    const isRock = Math.random() < 0.3;
    const x = Math.random() * (GAME_WIDTH - ITEM_SIZE);
    const speedMult = diff.speedMult;
    const baseSpeed = (FALL_SPEED_MIN + Math.random() * (FALL_SPEED_MAX - FALL_SPEED_MIN)) * speedMult;
    const wobbleAmp = diff.wobbleAmplitude;
    const wobblePhase = Math.random() * Math.PI * 2;

    if (isRock) {
      gameState.items.push({
        type: 'rock',
        rockVariant: Math.floor(Math.random() * ROCK_STYLES.length),
        x,
        y: -ITEM_SIZE,
        speed: baseSpeed,
        wobblePhase: wobblePhase,
        wobbleAmplitude: wobbleAmp,
      });
    } else if (Math.random() < GOLDEN_FRUIT_CHANCE) {
      gameState.items.push({
        type: 'goldenFruit',
        x,
        y: -ITEM_SIZE,
        speed: baseSpeed,
        wobblePhase: wobblePhase,
        wobbleAmplitude: wobbleAmp,
      });
    } else {
      const variant = Math.floor(Math.random() * FRUITS.length);
      gameState.items.push({
        type: 'fruit',
        variant,
        x,
        y: -ITEM_SIZE,
        speed: baseSpeed,
        wobblePhase: wobblePhase,
        wobbleAmplitude: wobbleAmp,
      });
    }
  }

  function updatePlayer() {
    if (gameState.exploding) return;

    if (gameState.falling) {
      gameState.playerVy += 0.7;
      gameState.playerY += gameState.playerVy;
      return;
    }

    if (gameState.keys['ArrowLeft'] || gameState.keys['KeyA']) {
      gameState.playerX = Math.max(0, gameState.playerX - PLAYER_SPEED);
    }
    if (gameState.keys['ArrowRight'] || gameState.keys['KeyD']) {
      gameState.playerX = Math.min(GAME_WIDTH - PLAYER_WIDTH, gameState.playerX + PLAYER_SPEED);
    }

    // ジャンプ
    if (gameState.playerY >= GROUND_Y - 1 && (gameState.keys['Space'] || gameState.keys['ArrowUp'] || gameState.keys['KeyW'])) {
      gameState.playerVy = JUMP_POWER;
    }
    gameState.playerVy += GRAVITY;
    gameState.playerY += gameState.playerVy;
    if (gameState.playerY >= GROUND_Y) {
      gameState.playerY = GROUND_Y;
      gameState.playerVy = 0;
    }
  }

  function rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updateItems() {
    if (gameState.falling) {
      for (let i = gameState.items.length - 1; i >= 0; i--) {
        const item = gameState.items[i];
        item.y += item.speed;
        if (item.wobbleAmplitude) {
          item.x += Math.sin(item.wobblePhase) * item.wobbleAmplitude;
          item.wobblePhase += 0.12;
          item.x = Math.max(0, Math.min(GAME_WIDTH - ITEM_SIZE, item.x));
        }
        if (item.y > GAME_HEIGHT) {
          if (item.type === 'rock') {
            gameState.craters.push({ left: item.x, right: item.x + ITEM_SIZE });
          }
          gameState.items.splice(i, 1);
        }
      }
      return;
    }

    const playerRect = {
      x: gameState.playerX + 6,
      y: gameState.playerY + 6,
      w: PLAYER_WIDTH - 12,
      h: PLAYER_HEIGHT - 12,
    };

    for (let i = gameState.items.length - 1; i >= 0; i--) {
      const item = gameState.items[i];
      item.y += item.speed;
      if (item.wobbleAmplitude) {
        item.x += Math.sin(item.wobblePhase) * item.wobbleAmplitude;
        item.wobblePhase += 0.12;
        item.x = Math.max(0, Math.min(GAME_WIDTH - ITEM_SIZE, item.x));
      }

      if (item.y > GAME_HEIGHT) {
        if (item.type === 'rock') {
          gameState.craters.push({ left: item.x, right: item.x + ITEM_SIZE });
        }
        gameState.items.splice(i, 1);
        continue;
      }

      const itemRect = {
        x: item.x + 4,
        y: item.y + 4,
        w: ITEM_SIZE - 8,
        h: ITEM_SIZE - 8,
      };

      if (rectOverlap(playerRect, itemRect)) {
        if (item.type === 'rock') {
          gameState.items.splice(i, 1);
          gameState.exploding = true;
          gameState.explodeStart = Date.now();
          gameState.explodeX = gameState.playerX + PLAYER_WIDTH / 2;
          gameState.explodeY = gameState.playerY + PLAYER_HEIGHT / 2;
          gameState.explodeParticles = [];
          for (let k = 0; k < 14; k++) {
            const angle = (k / 14) * Math.PI * 2 + (Math.random() - 0.5);
            const speed = 5 + Math.random() * 8;
            gameState.explodeParticles.push({
              x: 0,
              y: 0,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 2,
              size: 6 + Math.random() * 10,
            });
          }
          playGameOverSound();
          setTimeout(gameOver, 800);
          return;
        }
        if (item.type === 'goldenFruit') {
          gameState.score += GOLDEN_FRUIT_POINTS;
          scoreEl.textContent = gameState.score;
          gameState.items.splice(i, 1);
          repairOneCrater();
          gameState.floatingPoints.push({
            x: gameState.playerX + PLAYER_WIDTH / 2,
            y: gameState.playerY + PLAYER_HEIGHT / 2 - 20,
            points: GOLDEN_FRUIT_POINTS,
            startTime: Date.now(),
          });
          continue;
        }
        const points = FRUITS[item.variant].points;
        gameState.score += points;
        scoreEl.textContent = gameState.score;
        gameState.items.splice(i, 1);
        gameState.floatingPoints.push({
          x: gameState.playerX + PLAYER_WIDTH / 2,
          y: gameState.playerY + PLAYER_HEIGHT / 2 - 20,
          points,
          startTime: Date.now(),
        });
      }
    }
  }

  function playGameOverSound() {
    if (!audioContext) return;
    const play = () => {
      try {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.5);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } catch (_) {}
    };
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(play).catch(() => {});
    } else {
      play();
    }
  }

  function playBGMNote() {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(BGM_NOTES[bgmNoteIndex], now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
      bgmNoteIndex = (bgmNoteIndex + 1) % BGM_NOTES.length;
    } catch (_) {}
  }

  function startBGM() {
    if (!audioContext) return;
    stopBGM();
    const scheduleNext = () => {
      if (!gameState.running) return;
      playBGMNote();
      bgmIntervalId = setTimeout(scheduleNext, 1600);
    };
    const startLoop = () => {
      playBGMNote();
      bgmIntervalId = setTimeout(scheduleNext, 1600);
    };
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(startLoop).catch(() => {});
    } else {
      startLoop();
    }
  }

  function stopBGM() {
    if (bgmIntervalId) {
      clearTimeout(bgmIntervalId);
      bgmIntervalId = null;
    }
  }

  function gameOver() {
    stopBGM();
    gameState.running = false;
    if (gameState.animationId) cancelAnimationFrame(gameState.animationId);
    finalScoreEl.textContent = gameState.score;
    gameOverScreen.classList.remove('hidden');
  }

  function drawGround() {
    const y = GROUND_TOP;
    const h = GROUND_HEIGHT;
    const craters = gameState.craters.slice().sort((a, b) => a.left - b.left);

    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    let x = 0;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      if (x < c.left) {
        ctx.rect(x, y, c.left - x, h);
      }
      x = Math.max(x, c.right);
    }
    if (x < GAME_WIDTH) {
      ctx.rect(x, y, GAME_WIDTH - x, h);
    }
    ctx.fill();

    ctx.fillStyle = '#6B5344';
    ctx.lineWidth = 0;
    ctx.beginPath();
    x = 0;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      if (x < c.left) {
        ctx.rect(x, y + h - 4, c.left - x, 4);
      }
      x = Math.max(x, c.right);
    }
    if (x < GAME_WIDTH) {
      ctx.rect(x, y + h - 4, GAME_WIDTH - x, 4);
    }
    ctx.fill();

    ctx.fillStyle = '#9B8B6B';
    ctx.beginPath();
    x = 0;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      if (x < c.left) {
        ctx.rect(x, y, c.left - x, 3);
      }
      x = Math.max(x, c.right);
    }
    if (x < GAME_WIDTH) {
      ctx.rect(x, y, GAME_WIDTH - x, 3);
    }
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    drawGround();

    gameState.items.forEach((item) => {
      if (item.type === 'rock') drawRock(item);
    });

    gameState.items.forEach((item) => {
      if (item.type === 'fruit') drawFruit(item);
      else if (item.type === 'goldenFruit') drawGoldenFruit(item);
    });

    drawPlayer();
    drawFloatingPoints();
  }

  function gameLoop() {
    if (!gameState.running) return;

    spawnItem();
    updatePlayer();

    if (gameState.falling) {
      if (Date.now() - gameState.fallStart >= FALL_DURATION) {
        gameOver();
        return;
      }
    } else {
      const crater = getCraterUnderPlayer();
      if (crater) {
        gameState.falling = true;
        gameState.fallStart = Date.now();
        gameState.playerVy = 0;
        playGameOverSound();
        const holeCenter = (crater.left + crater.right) / 2;
        gameState.playerX = Math.max(crater.left, Math.min(crater.right - PLAYER_WIDTH, holeCenter - PLAYER_WIDTH / 2));
      }
    }

    updateItems();
    draw();

    gameState.animationId = requestAnimationFrame(gameLoop);
  }

  function startGame() {
    initAudio();
    gameState = {
      running: true,
      score: 0,
      playerX: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
      playerY: GROUND_Y,
      playerVy: 0,
      keys: {},
      items: [],
      lastSpawn: 0,
      animationId: null,
      expression: 'normal',
      expressionUntil: 0,
      exploding: false,
      explodeStart: 0,
      explodeX: 0,
      explodeY: 0,
      explodeParticles: [],
      floatingPoints: [],
      craters: [],
      falling: false,
      fallStart: 0,
    };
    scoreEl.textContent = '0';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(() => { startBGM(); });
    } else {
      startBGM();
    }
    gameLoop();
  }

  document.addEventListener('keydown', (e) => {
    gameState.keys[e.code] = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyW'].includes(e.code)) e.preventDefault();
  });

  document.addEventListener('keyup', (e) => {
    gameState.keys[e.code] = false;
  });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  // 初期表示
  draw();
})();

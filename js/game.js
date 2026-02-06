(function () {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const finalScoreEl = document.getElementById('finalScore');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');

  const GAME_WIDTH = canvas.width;
  const GAME_HEIGHT = canvas.height;

  // プレイヤー（猿キャラ・大きめ）
  const PLAYER_WIDTH = 90;
  const PLAYER_HEIGHT = 85;
  const PLAYER_SPEED = 7;

  // 落下物
  const FALL_SPEED_MIN = 2;
  const FALL_SPEED_MAX = 5;
  const SPAWN_INTERVAL = 1200;
  const ITEM_SIZE = 46;

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
    keys: {},
    items: [],
    lastSpawn: 0,
    animationId: null,
  };

  function drawPlayer() {
    const x = gameState.playerX;
    const y = gameState.playerY;
    const cx = x + PLAYER_WIDTH / 2;
    const cy = y + PLAYER_HEIGHT / 2;
    const r = Math.min(PLAYER_WIDTH, PLAYER_HEIGHT) / 2 - 4;

    // 体：ひとつの丸（シンプル）
    ctx.fillStyle = '#F4A460';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#D2691E';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 目：小さな丸2つ
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(cx - 12, cy - 8, 6, 0, Math.PI * 2);
    ctx.arc(cx + 12, cy - 8, 6, 0, Math.PI * 2);
    ctx.fill();

    // 口：にっこり曲線
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + 8, 10, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  function drawFruit(item) {
    const fruit = FRUITS[item.variant];
    const cx = item.x + ITEM_SIZE / 2;
    const cy = item.y + ITEM_SIZE / 2;
    const emojiSize = 38;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.font = `${emojiSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fruit.emoji, 0, 0);
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
    if (now - gameState.lastSpawn < SPAWN_INTERVAL) return;
    gameState.lastSpawn = now;

    const isRock = Math.random() < 0.3;
    const x = Math.random() * (GAME_WIDTH - ITEM_SIZE);

    if (isRock) {
      gameState.items.push({
        type: 'rock',
        rockVariant: Math.floor(Math.random() * ROCK_STYLES.length),
        x,
        y: -ITEM_SIZE,
        speed: FALL_SPEED_MIN + Math.random() * (FALL_SPEED_MAX - FALL_SPEED_MIN),
      });
    } else {
      const variant = Math.floor(Math.random() * FRUITS.length);
      gameState.items.push({
        type: 'fruit',
        variant,
        x,
        y: -ITEM_SIZE,
        speed: FALL_SPEED_MIN + Math.random() * (FALL_SPEED_MAX - FALL_SPEED_MIN),
      });
    }
  }

  function updatePlayer() {
    if (gameState.keys['ArrowLeft'] || gameState.keys['KeyA']) {
      gameState.playerX = Math.max(0, gameState.playerX - PLAYER_SPEED);
    }
    if (gameState.keys['ArrowRight'] || gameState.keys['KeyD']) {
      gameState.playerX = Math.min(GAME_WIDTH - PLAYER_WIDTH, gameState.playerX + PLAYER_SPEED);
    }
  }

  function rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updateItems() {
    const playerRect = {
      x: gameState.playerX + 12,
      y: gameState.playerY + 12,
      w: PLAYER_WIDTH - 24,
      h: PLAYER_HEIGHT - 24,
    };

    for (let i = gameState.items.length - 1; i >= 0; i--) {
      const item = gameState.items[i];
      item.y += item.speed;

      if (item.y > GAME_HEIGHT) {
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
          gameOver();
          return;
        }
        gameState.score += FRUITS[item.variant].points;
        scoreEl.textContent = gameState.score;
        gameState.items.splice(i, 1);
      }
    }
  }

  function gameOver() {
    gameState.running = false;
    if (gameState.animationId) cancelAnimationFrame(gameState.animationId);
    finalScoreEl.textContent = gameState.score;
    gameOverScreen.classList.remove('hidden');
  }

  function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 雲（装飾）
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(80, 50, 25, 0, Math.PI * 2);
    ctx.arc(110, 45, 30, 0, Math.PI * 2);
    ctx.arc(140, 50, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(400, 70, 20, 0, Math.PI * 2);
    ctx.arc(430, 65, 28, 0, Math.PI * 2);
    ctx.arc(460, 72, 22, 0, Math.PI * 2);
    ctx.fill();

    gameState.items.forEach((item) => {
      if (item.type === 'fruit') drawFruit(item);
      else drawRock(item);
    });

    drawPlayer();
  }

  function gameLoop() {
    if (!gameState.running) return;

    spawnItem();
    updatePlayer();
    updateItems();
    draw();

    gameState.animationId = requestAnimationFrame(gameLoop);
  }

  function startGame() {
    gameState = {
      running: true,
      score: 0,
      playerX: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
      playerY: GAME_HEIGHT - PLAYER_HEIGHT - 20,
      keys: {},
      items: [],
      lastSpawn: 0,
      animationId: null,
    };
    scoreEl.textContent = '0';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    gameLoop();
  }

  document.addEventListener('keydown', (e) => {
    gameState.keys[e.code] = true;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
  });

  document.addEventListener('keyup', (e) => {
    gameState.keys[e.code] = false;
  });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  // 初期表示
  draw();
})();

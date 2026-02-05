const canvas = document.getElementById("board");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restart");
const undoBtn = document.getElementById("undo");
const aiFirstToggle = document.getElementById("aiFirst");
const hardModeToggle = document.getElementById("hardMode");
const ctx = canvas.getContext("2d");

const size = 15;
const padding = 20;
const gridSize = (canvas.width - padding * 2) / (size - 1);
const human = 1;
const ai = 2;

let board = [];
let currentPlayer = human;
let gameOver = false;
let lastMove = null;
let moveCount = 0;
let transposition = new Map();
let history = [];
let aiTimer = null;
let killerMoves = {};
let zobristHuman = [];
let zobristAi = [];
let currentHash = 0;
let historyScores = { 1: [], 2: [] };
let searchDeadline = 0;
let aiToken = 0;
let nodeBudget = 0;

const scoreMap = {
  "5": 10000000,
  "4:2": 140000,
  "4:1": 15000,
  "3:2": 45000,
  "3:1": 2500,
  "2:2": 3000,
  "2:1": 240,
  "1:2": 120,
  "1:1": 20,
};

function initZobrist() {
  zobristHuman = Array.from({ length: size * size }, () =>
    Math.floor(Math.random() * 0xffffffff)
  );
  zobristAi = Array.from({ length: size * size }, () =>
    Math.floor(Math.random() * 0xffffffff)
  );
}

function resetBoard() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
  initZobrist();
  currentHash = 0;
  board = Array.from({ length: size }, () => Array(size).fill(0));
  currentPlayer = aiFirstToggle.checked ? ai : human;
  gameOver = false;
  lastMove = null;
  moveCount = 0;
  transposition = new Map();
  history = [];
  killerMoves = {};
  historyScores = {
    [human]: Array(size * size).fill(0),
    [ai]: Array(size * size).fill(0),
  };
  draw();
  if (currentPlayer === ai) {
    setStatus("AI 思考中");
    scheduleAiMove();
  } else {
    setStatus("你的回合");
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.2)";
  for (let i = 0; i < size; i += 1) {
    const pos = padding + i * gridSize;
    ctx.beginPath();
    ctx.moveTo(padding, pos);
    ctx.lineTo(canvas.width - padding, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, padding);
    ctx.lineTo(pos, canvas.height - padding);
    ctx.stroke();
  }

  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const value = board[x][y];
      if (value !== 0) {
        const isLast = lastMove && lastMove.x === x && lastMove.y === y;
        drawStone(x, y, value, isLast);
      }
    }
  }
}

function drawStone(x, y, player, highlight) {
  const cx = padding + x * gridSize;
  const cy = padding + y * gridSize;
  const radius = gridSize * 0.42;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  const gradient = ctx.createRadialGradient(cx - 6, cy - 6, 4, cx, cy, radius);
  if (player === human) {
    gradient.addColorStop(0, "#1f2937");
    gradient.addColorStop(1, "#0b0f19");
  } else {
    gradient.addColorStop(0, "#f8fafc");
    gradient.addColorStop(1, "#cbd5f5");
  }
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 10;
  ctx.fill();
  if (highlight) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = player === human ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function placeStone(x, y, player) {
  applyMove(x, y, player);
  lastMove = { x, y, player };
  moveCount += 1;
  history.push({ x, y, player });
  draw();
}

function isInside(x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function toggleHash(x, y, player) {
  const idx = y * size + x;
  currentHash ^=
    player === human ? zobristHuman[idx] : zobristAi[idx];
}

function applyMove(x, y, player) {
  board[x][y] = player;
  toggleHash(x, y, player);
}

function revertMove(x, y, player) {
  board[x][y] = 0;
  toggleHash(x, y, player);
}

function checkWinFrom(x, y, player) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dx, dy] of directions) {
    let count = 1;
    let nx = x + dx;
    let ny = y + dy;
    while (isInside(nx, ny) && board[nx][ny] === player) {
      count += 1;
      nx += dx;
      ny += dy;
    }
    nx = x - dx;
    ny = y - dy;
    while (isInside(nx, ny) && board[nx][ny] === player) {
      count += 1;
      nx -= dx;
      ny -= dy;
    }
    if (count >= 5) {
      return true;
    }
  }
  return false;
}

function evaluatePosition(x, y, player) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  let score = 0;
  for (const [dx, dy] of directions) {
    let count1 = 0;
    let nx = x + dx;
    let ny = y + dy;
    while (isInside(nx, ny) && board[nx][ny] === player) {
      count1 += 1;
      nx += dx;
      ny += dy;
    }
    let open1 = isInside(nx, ny) && board[nx][ny] === 0 ? 1 : 0;
    let count2 = 0;
    nx = x - dx;
    ny = y - dy;
    while (isInside(nx, ny) && board[nx][ny] === player) {
      count2 += 1;
      nx -= dx;
      ny -= dy;
    }
    let open2 = isInside(nx, ny) && board[nx][ny] === 0 ? 1 : 0;
    const total = count1 + count2 + 1;
    const open = open1 + open2;
    if (total >= 5) {
      score += scoreMap["5"];
    } else {
      const key = `${total}:${open}`;
      score += scoreMap[key] || 0;
    }
  }
  return score;
}

function evaluatePlayer(player) {
  let score = 0;
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (board[x][y] !== player) continue;
      for (const [dx, dy] of directions) {
        const px = x - dx;
        const py = y - dy;
        if (isInside(px, py) && board[px][py] === player) continue;
        let count = 0;
        let nx = x;
        let ny = y;
        while (isInside(nx, ny) && board[nx][ny] === player) {
          count += 1;
          nx += dx;
          ny += dy;
        }
        let open1 = isInside(nx, ny) && board[nx][ny] === 0 ? 1 : 0;
        let open2 = 0;
        const bx = x - dx;
        const by = y - dy;
        if (isInside(bx, by) && board[bx][by] === 0) open2 = 1;
        const totalOpen = open1 + open2;
        if (count >= 5) {
          score += scoreMap["5"];
        } else {
          const key = `${count}:${totalOpen}`;
          score += scoreMap[key] || 0;
        }
      }
    }
  }
  return score;
}

function evaluateBoard() {
  const aiScore = evaluatePlayer(ai);
  const humanScore = evaluatePlayer(human);
  return aiScore - humanScore;
}

function getCandidateMoves(limit) {
  if (moveCount === 0) {
    return [{ x: Math.floor(size / 2), y: Math.floor(size / 2), score: 0 }];
  }
  const candidates = new Map();
  const center = Math.floor(size / 2);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (board[x][y] === 0) continue;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (!isInside(nx, ny)) continue;
          if (board[nx][ny] !== 0) continue;
          const key = `${nx},${ny}`;
          if (!candidates.has(key)) {
            const attack = evaluatePosition(nx, ny, ai);
            const defend = evaluatePosition(nx, ny, human);
            const centerBias = 8 - Math.abs(nx - center) - Math.abs(ny - center);
            let adjBias = 0;
            if (lastMove) {
              const d = Math.abs(nx - lastMove.x) + Math.abs(ny - lastMove.y);
              adjBias = Math.max(0, 6 - d) * 10;
            }
            const score =
              Math.max(attack, defend * 0.95) + centerBias * 12 + adjBias;
            candidates.set(key, { x: nx, y: ny, score });
          }
        }
      }
    }
  }
  const list = Array.from(candidates.values());
  list.sort((a, b) => b.score - a.score);
  const threatCount = hardModeToggle.checked ? Math.min(12, list.length) : 0;
  for (let i = 0; i < threatCount; i += 1) {
    const move = list[i];
    const aiThreat = analyzeMove(move.x, move.y, ai);
    const humanThreat = analyzeMove(move.x, move.y, human);
    const threatScore =
      aiThreat.openFour * 240000 +
      aiThreat.blockedFour * 32000 +
      aiThreat.openThree * 18000 +
      (humanThreat.openFour * 220000 +
        humanThreat.blockedFour * 30000 +
        humanThreat.openThree * 16000) *
        0.95;
    move.score += threatScore;
  }
  if (threatCount > 0) {
    list.sort((a, b) => b.score - a.score);
  }
  return list.slice(0, limit);
}

function computeKey(player) {
  return `${player}|${currentHash}`;
}

function isWinningMove(x, y, player) {
  applyMove(x, y, player);
  const win = checkWinFrom(x, y, player);
  revertMove(x, y, player);
  return win;
}

function analyzeMove(x, y, player) {
  applyMove(x, y, player);
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  let openFour = 0;
  let blockedFour = 0;
  let openThree = 0;
  for (const [dx, dy] of directions) {
    let count1 = 0;
    let nx = x + dx;
    let ny = y + dy;
    while (isInside(nx, ny) && board[nx][ny] === player) {
      count1 += 1;
      nx += dx;
      ny += dy;
    }
    let open1 = isInside(nx, ny) && board[nx][ny] === 0 ? 1 : 0;
    let count2 = 0;
    nx = x - dx;
    ny = y - dy;
    while (isInside(nx, ny) && board[nx][ny] === player) {
      count2 += 1;
      nx -= dx;
      ny -= dy;
    }
    let open2 = isInside(nx, ny) && board[nx][ny] === 0 ? 1 : 0;
    const total = count1 + count2 + 1;
    const open = open1 + open2;
    if (total === 4 && open === 2) openFour += 1;
    if (total === 4 && open === 1) blockedFour += 1;
    if (total === 3 && open === 2) openThree += 1;
  }
  revertMove(x, y, player);
  return { openFour, blockedFour, openThree };
}

function getCandidateLimit(depth) {
  if (hardModeToggle.checked) {
    return depth >= 3 ? 14 : 22;
  }
  return depth >= 3 ? 10 : 16;
}

function moveToFront(moves, target) {
  if (!target) return moves;
  const idx = moves.findIndex((m) => m.x === target.x && m.y === target.y);
  if (idx > 0) {
    const m = moves.splice(idx, 1)[0];
    moves.unshift(m);
  }
  return moves;
}

function orderMovesWithKiller(moves, depth, ttMove, player) {
  moveToFront(moves, ttMove);
  const km = killerMoves[depth];
  moveToFront(moves, km);
  if (!hardModeToggle.checked || moves.length <= 1) {
    return moves;
  }
  const preferred = new Set();
  if (ttMove) preferred.add(`${ttMove.x},${ttMove.y}`);
  if (km) preferred.add(`${km.x},${km.y}`);
  moves.sort((a, b) => {
    const ia = a.y * size + a.x;
    const ib = b.y * size + b.x;
    const pa = preferred.has(`${a.x},${a.y}`) ? 1000000000 : 0;
    const pb = preferred.has(`${b.x},${b.y}`) ? 1000000000 : 0;
    return (
      b.score +
      pb +
      historyScores[player][ib] -
      (a.score + pa + historyScores[player][ia])
    );
  });
  return moves;
}

function search(depth, alpha, beta, player, last) {
  if (nodeBudget <= 0) {
    return { score: evaluateBoard() };
  }
  nodeBudget -= 1;
  if (searchDeadline && performance.now() > searchDeadline) {
    return { score: evaluateBoard() };
  }
  if (last && checkWinFrom(last.x, last.y, last.player)) {
    if (last.player === ai) return { score: 100000000 + depth };
    return { score: -100000000 - depth };
  }
  if (depth === 0) {
    if (hardModeToggle.checked && last) {
      const info = analyzeMove(last.x, last.y, last.player);
      if (info.openFour > 0 || info.openThree >= 2 || info.blockedFour > 0) {
        depth = 1;
      }
    }
  }
  if (depth === 0) {
    return { score: evaluateBoard() };
  }
  const key = computeKey(player);
  const cached = transposition.get(key);
  if (cached && cached.depth >= depth) {
    if (cached.flag === "exact") {
      return { score: cached.score, move: cached.move };
    }
    if (cached.flag === "lower") {
      alpha = Math.max(alpha, cached.score);
    } else if (cached.flag === "upper") {
      beta = Math.min(beta, cached.score);
    }
    if (alpha >= beta) {
      return { score: cached.score, move: cached.move };
    }
  }
  const originalAlpha = alpha;
  const originalBeta = beta;
  const maximizing = player === ai;
  const limit = getCandidateLimit(depth);
  const moves = orderMovesWithKiller(
    getCandidateMoves(limit),
    depth,
    cached ? cached.move : null,
    player
  );
  let best = { score: maximizing ? -Infinity : Infinity, move: null };
  for (const move of moves) {
    applyMove(move.x, move.y, player);
    const result = search(
      depth - 1,
      alpha,
      beta,
      player === ai ? human : ai,
      { x: move.x, y: move.y, player }
    );
    revertMove(move.x, move.y, player);
    if (maximizing) {
      if (result.score > best.score) {
        best = { score: result.score, move };
      }
      alpha = Math.max(alpha, result.score);
    } else {
      if (result.score < best.score) {
        best = { score: result.score, move };
      }
      beta = Math.min(beta, result.score);
    }
    if (beta <= alpha) {
      const idx = move.y * size + move.x;
      historyScores[player][idx] += depth * depth * 20;
      killerMoves[depth] = move;
      break;
    }
  }
  let flag = "exact";
  if (best.score <= originalAlpha) {
    flag = "upper";
  } else if (best.score >= originalBeta) {
    flag = "lower";
  }
  transposition.set(key, { ...best, depth, flag });
  return best;
}

function getSearchDepth() {
  if (hardModeToggle.checked) {
    if (moveCount < 6) return 4;
    if (moveCount < 18) return 3;
    return 2;
  }
  if (moveCount < 6) return 3;
  return 2;
}

function getTimeBudget() {
  if (hardModeToggle.checked) {
    if (moveCount < 6) return 260;
    if (moveCount < 18) return 200;
    return 160;
  }
  if (moveCount < 6) return 140;
  if (moveCount < 18) return 110;
  return 90;
}

function findBlockingMoves(candidates) {
  const blocks = [];
  for (const move of candidates) {
    if (isWinningMove(move.x, move.y, human)) {
      blocks.push(move);
    }
  }
  return blocks;
}

function chooseBestBlock(blocks) {
  let best = blocks[0];
  let bestScore = -Infinity;
  for (const move of blocks) {
    const score =
      evaluatePosition(move.x, move.y, ai) -
      evaluatePosition(move.x, move.y, human);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function pickImmediateMove(depth) {
  const candidates = getCandidateMoves(getCandidateLimit(depth));
  for (const move of candidates) {
    if (isWinningMove(move.x, move.y, ai)) return move;
  }
  const blocks = findBlockingMoves(candidates);
  if (blocks.length > 0) return chooseBestBlock(blocks);
  let bestOpenFour = null;
  for (const move of candidates) {
    const info = analyzeMove(move.x, move.y, ai);
    if (info.openFour > 0) {
      bestOpenFour = move;
      break;
    }
  }
  if (bestOpenFour) return bestOpenFour;
  let bestBlockOpenFour = null;
  for (const move of candidates) {
    const info = analyzeMove(move.x, move.y, human);
    if (info.openFour > 0) {
      bestBlockOpenFour = move;
      break;
    }
  }
  if (bestBlockOpenFour) return bestBlockOpenFour;
  let bestDoubleThree = null;
  for (const move of candidates) {
    const info = analyzeMove(move.x, move.y, ai);
    if (info.openThree >= 2) {
      bestDoubleThree = move;
      break;
    }
  }
  if (bestDoubleThree) return bestDoubleThree;
  let bestBlockDoubleThree = null;
  for (const move of candidates) {
    const info = analyzeMove(move.x, move.y, human);
    if (info.openThree >= 2) {
      bestBlockDoubleThree = move;
      break;
    }
  }
  if (bestBlockDoubleThree) return bestBlockDoubleThree;
  return null;
}

function findBestMoveIterative(maxDepth, timeMs) {
  const immediate = pickImmediateMove(maxDepth);
  if (immediate) return immediate;
  const start = performance.now();
  searchDeadline = start + timeMs;
  let best = null;
  for (let d = 1; d <= maxDepth; d += 1) {
    const res = search(d, -Infinity, Infinity, ai, lastMove);
    if (res.move) best = res.move;
    if (performance.now() - start > timeMs) break;
  }
  searchDeadline = 0;
  if (best) return best;
  const fallbackList = getCandidateMoves(1);
  if (fallbackList.length === 0) return null;
  return fallbackList[0];
}

function aiMove() {
  if (gameOver) return;
  if (!hardModeToggle.checked) {
    const move = pickImmediateMove(2) || getCandidateMoves(1)[0];
    if (!move) {
      gameOver = true;
      setStatus("平局");
      return;
    }
    placeStone(move.x, move.y, ai);
    if (checkWinFrom(move.x, move.y, ai)) {
      gameOver = true;
      setStatus("AI 获胜");
      return;
    }
    if (moveCount >= size * size) {
      gameOver = true;
      setStatus("平局");
      return;
    }
    currentPlayer = human;
    setStatus("你的回合");
    return;
  }
  const depth = moveCount < 6 ? 2 : 3;
  const budget = moveCount < 6 ? 120 : 180;
  const token = ++aiToken;
  let currentDepth = 1;
  let best = null;
  const start = performance.now();
  const step = () => {
    if (gameOver || token !== aiToken) return;
    searchDeadline = performance.now() + 70;
    nodeBudget = moveCount < 6 ? 2000 : 4000;
    const res = search(currentDepth, -Infinity, Infinity, ai, lastMove);
    if (res.move) best = res.move;
    currentDepth += 1;
    if (currentDepth > depth || performance.now() - start > budget) {
      searchDeadline = 0;
      const move =
        best ||
        pickImmediateMove(depth) ||
        getCandidateMoves(1)[0];
      if (!move) {
        gameOver = true;
        setStatus("平局");
        return;
      }
      placeStone(move.x, move.y, ai);
      if (checkWinFrom(move.x, move.y, ai)) {
        gameOver = true;
        setStatus("AI 获胜");
        return;
      }
      if (moveCount >= size * size) {
        gameOver = true;
        setStatus("平局");
        return;
      }
      currentPlayer = human;
      setStatus("你的回合");
      return;
    }
    setTimeout(step, 0);
  };
  step();
}

function scheduleAiMove() {
  if (aiTimer) clearTimeout(aiTimer);
  aiToken += 1;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    aiMove();
  }, 60);
}

function undoMove() {
  if (moveCount === 0) return;
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
  aiToken += 1;
  gameOver = false;
  let steps = currentPlayer === ai ? 1 : 2;
  if (moveCount < steps) steps = moveCount;
  for (let i = 0; i < steps; i += 1) {
    const last = history.pop();
    if (last) {
      revertMove(last.x, last.y, last.player);
    }
  }
  moveCount = history.length;
  lastMove = history.length ? history[history.length - 1] : null;
  if (history.length === 0) {
    currentPlayer = aiFirstToggle.checked ? ai : human;
  } else {
    currentPlayer = history[history.length - 1].player === human ? ai : human;
  }
  draw();
  if (currentPlayer === ai) {
    setStatus("AI 思考中");
    scheduleAiMove();
  } else {
    setStatus("你的回合");
  }
}

function handleClick(event) {
  if (gameOver || currentPlayer !== human) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.round((event.clientX - rect.left - padding) / gridSize);
  const y = Math.round((event.clientY - rect.top - padding) / gridSize);
  if (!isInside(x, y)) return;
  if (board[x][y] !== 0) return;
  placeStone(x, y, human);
  if (checkWinFrom(x, y, human)) {
    gameOver = true;
    setStatus("你获胜");
    return;
  }
  if (moveCount >= size * size) {
    gameOver = true;
    setStatus("平局");
    return;
  }
  currentPlayer = ai;
  setStatus("AI 思考中");
  scheduleAiMove();
}

canvas.addEventListener("click", handleClick);
restartBtn.addEventListener("click", resetBoard);
undoBtn.addEventListener("click", undoMove);
aiFirstToggle.addEventListener("change", resetBoard);
hardModeToggle.addEventListener("change", resetBoard);

resetBoard();

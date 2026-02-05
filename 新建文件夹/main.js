const canvas = document.getElementById("board");
const statusEl = document.getElementById("status");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const roomCodeInput = document.getElementById("roomCodeInput");
const copyCodeBtn = document.getElementById("copyCode");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const ctx = canvas.getContext("2d");

const size = 15;
const padding = 20;
const gridSize = (canvas.width - padding * 2) / (size - 1);

let board = [];
let currentPlayer = 1;
let gameOver = false;
let lastMove = null;
let moveCount = 0;
let roomCode = null;
let playerId = null;
let playerNumber = null;
let started = false;
let winner = 0;
let pollTimer = null;

function initBoard() {
  board = Array.from({ length: size }, () => Array(size).fill(0));
  currentPlayer = 1;
  gameOver = false;
  lastMove = null;
  moveCount = 0;
  winner = 0;
  draw();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function updateStatus() {
  if (!roomCode) {
    setStatus("创建或加入房间");
    return;
  }
  if (!started) {
    setStatus("等待对手加入");
    return;
  }
  if (gameOver) {
    if (winner === -1) {
      setStatus("平局");
    } else if (winner === playerNumber) {
      setStatus("你获胜");
    } else {
      setStatus("对手获胜");
    }
    return;
  }
  if (currentPlayer === playerNumber) {
    setStatus("你的回合");
  } else {
    setStatus("对手回合");
  }
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
  if (player === 1) {
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
    ctx.strokeStyle = player === 1 ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function isInside(x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function countMoves() {
  let count = 0;
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (board[x][y] !== 0) count += 1;
    }
  }
  return count;
}

function applyState(state) {
  board = state.board;
  currentPlayer = state.currentPlayer;
  lastMove = state.lastMove;
  started = state.started;
  winner = state.winner || 0;
  gameOver = winner !== 0;
  moveCount = countMoves();
  draw();
  updateStatus();
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchState, 800);
}

async function fetchJson(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "请求失败");
  }
  return res.json();
}

async function createRoom() {
  const data = await fetchJson("/api/room/create", {});
  roomCode = data.code;
  playerId = data.playerId;
  playerNumber = data.player;
  roomCodeDisplay.textContent = `房间码：${roomCode}`;
  localStorage.setItem(
    "gomoku-room",
    JSON.stringify({ roomCode, playerId, playerNumber })
  );
  started = false;
  updateStatus();
  startPolling();
  await fetchState();
}

async function joinRoom() {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) return;
  const data = await fetchJson("/api/room/join", { code });
  roomCode = data.code;
  playerId = data.playerId;
  playerNumber = data.player;
  roomCodeDisplay.textContent = `房间码：${roomCode}`;
  localStorage.setItem(
    "gomoku-room",
    JSON.stringify({ roomCode, playerId, playerNumber })
  );
  started = data.started;
  updateStatus();
  startPolling();
  await fetchState();
}

async function fetchState() {
  if (!roomCode || !playerId) return;
  try {
    const data = await fetchJson("/api/room/state", { code: roomCode, playerId });
    applyState(data);
  } catch (err) {
    setStatus("房间不可用");
  }
}

async function sendMove(x, y) {
  if (!roomCode || !playerId) return;
  const data = await fetchJson("/api/room/move", {
    code: roomCode,
    playerId,
    x,
    y,
  });
  applyState(data);
}

function handleClick(event) {
  if (!started || gameOver) return;
  if (currentPlayer !== playerNumber) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.round((event.clientX - rect.left - padding) / gridSize);
  const y = Math.round((event.clientY - rect.top - padding) / gridSize);
  if (!isInside(x, y)) return;
  if (board[x][y] !== 0) return;
  sendMove(x, y);
}

async function copyRoomCode() {
  if (!roomCode) return;
  try {
    await navigator.clipboard.writeText(roomCode);
    setStatus("房间码已复制");
  } catch (err) {
    setStatus("复制失败");
  }
}

function restoreSession() {
  const cached = localStorage.getItem("gomoku-room");
  if (!cached) return;
  try {
    const data = JSON.parse(cached);
    roomCode = data.roomCode;
    playerId = data.playerId;
    playerNumber = data.playerNumber;
    if (roomCode) {
      roomCodeDisplay.textContent = `房间码：${roomCode}`;
      startPolling();
      fetchState();
    }
  } catch (err) {
    localStorage.removeItem("gomoku-room");
  }
}

canvas.addEventListener("click", handleClick);
createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
copyCodeBtn.addEventListener("click", copyRoomCode);

initBoard();
updateStatus();
restoreSession();

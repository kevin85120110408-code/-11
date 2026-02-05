const size = 15;
const ttlMs = 2 * 60 * 60 * 1000;

const rooms = globalThis.__rooms || (globalThis.__rooms = new Map());

function now() {
  return Date.now();
}

function cleanupRooms() {
  const cutoff = now() - ttlMs;
  for (const [code, room] of rooms.entries()) {
    if (room.updatedAt < cutoff) {
      rooms.delete(code);
    }
  }
}

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createPlayerId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createBoard() {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function createRoom() {
  let code = randomCode();
  while (rooms.has(code)) {
    code = randomCode();
  }
  const room = {
    code,
    players: {},
    board: createBoard(),
    currentPlayer: 1,
    started: false,
    winner: 0,
    lastMove: null,
    createdAt: now(),
    updatedAt: now(),
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(code);
}

function touch(room) {
  room.updatedAt = now();
}

function getPlayerNumber(room, playerId) {
  if (room.players[1] === playerId) return 1;
  if (room.players[2] === playerId) return 2;
  return null;
}

function checkWin(board, x, y, player) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dx, dy] of dirs) {
    let count = 1;
    let nx = x + dx;
    let ny = y + dy;
    while (nx >= 0 && ny >= 0 && nx < size && ny < size && board[nx][ny] === player) {
      count += 1;
      nx += dx;
      ny += dy;
    }
    nx = x - dx;
    ny = y - dy;
    while (nx >= 0 && ny >= 0 && nx < size && ny < size && board[nx][ny] === player) {
      count += 1;
      nx -= dx;
      ny -= dy;
    }
    if (count >= 5) return true;
  }
  return false;
}

function isDraw(board) {
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (board[x][y] === 0) return false;
    }
  }
  return true;
}

module.exports = {
  size,
  cleanupRooms,
  createRoom,
  createPlayerId,
  getRoom,
  touch,
  getPlayerNumber,
  checkWin,
  isDraw,
};

const {
  cleanupRooms,
  getRoom,
  touch,
  getPlayerNumber,
} = require("./store");

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }
  cleanupRooms();
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const code = (body.code || "").toString().trim().toUpperCase();
  const playerId = (body.playerId || "").toString();
  if (!code || !playerId) {
    res.statusCode = 400;
    res.end("参数缺失");
    return;
  }
  const room = getRoom(code);
  if (!room) {
    res.statusCode = 404;
    res.end("房间不存在");
    return;
  }
  const playerNumber = getPlayerNumber(room, playerId);
  if (!playerNumber) {
    res.statusCode = 403;
    res.end("无权限");
    return;
  }
  touch(room);
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      code: room.code,
      board: room.board,
      currentPlayer: room.currentPlayer,
      started: room.started,
      winner: room.winner,
      lastMove: room.lastMove,
    })
  );
};

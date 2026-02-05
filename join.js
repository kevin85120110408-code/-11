const {
  cleanupRooms,
  getRoom,
  createPlayerId,
  touch,
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
  if (!code) {
    res.statusCode = 400;
    res.end("缺少房间码");
    return;
  }
  const room = getRoom(code);
  if (!room) {
    res.statusCode = 404;
    res.end("房间不存在");
    return;
  }
  if (room.players[2]) {
    res.statusCode = 409;
    res.end("房间已满");
    return;
  }
  const playerId = createPlayerId();
  room.players[2] = playerId;
  room.started = true;
  touch(room);
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      code: room.code,
      playerId,
      player: 2,
      started: true,
    })
  );
};

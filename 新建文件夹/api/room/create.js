const {
  cleanupRooms,
  createRoom,
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
  const room = createRoom();
  const playerId = createPlayerId();
  room.players[1] = playerId;
  touch(room);
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      code: room.code,
      playerId,
      player: 1,
      started: false,
    })
  );
};

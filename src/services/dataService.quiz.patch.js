
// Add this export to dataService.js

export async function getGameById(gameId) {
  if (!gameId) return null;

  const snapshot = await get(
    ref(database, `games/${gameId}`)
  );

  if (!snapshot.exists()) return null;

  return {
    id: gameId,
    type: "game",
    ...snapshot.val(),
  };
}

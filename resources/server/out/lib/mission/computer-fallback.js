"use strict";
// Fallback computer — returns DB-stored progress for unhandled categories
Object.defineProperty(exports, "__esModule", { value: true });
exports.FallbackComputer = void 0;
const player_1 = require("../../data/domains/player");
function buildMinimal(playerId) {
    const player = (0, player_1.getPlayerSync)(playerId);
    return {
        playerId,
        player,
        questProgress: {},
        totalQuestClears: 0,
        totalStories: 0,
        rankCounts: {},
    };
}
exports.FallbackComputer = {
    name: "Fallback",
    buildContext(playerId, _category) {
        return buildMinimal(playerId);
    },
    compute(_missionId, _ctx, dbProgress) {
        return dbProgress;
    },
};

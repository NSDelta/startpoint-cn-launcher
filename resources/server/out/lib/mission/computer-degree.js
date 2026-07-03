"use strict";
// Degree mission computer (category 5)
Object.defineProperty(exports, "__esModule", { value: true });
exports.DegreeComputer = exports.getTargetDegree = void 0;
const player_1 = require("../../data/domains/player");
const stamina_1 = require("../stamina");
// Degree mission target lookup
const degreeTargetMap = {};
{
    // Note: this import is resolved at module load time via the patterns file's data
    // but we use the same degreeDefs. For simplicity, inline the regex.
    const degreeDefs = require("../../../assets/mission_degree.json");
    const descRegex = /玩家(?:达到|级别达到)\s*(\d+)/;
    for (const [mid, rows] of Object.entries(degreeDefs)) {
        const row = rows[0];
        if (!row || !row[2])
            continue;
        const match = descRegex.exec(String(row[2]));
        if (match)
            degreeTargetMap[parseInt(mid)] = parseInt(match[1]);
    }
}
function getTargetDegree(missionId) {
    return degreeTargetMap[missionId];
}
exports.getTargetDegree = getTargetDegree;
function buildStats(playerId) {
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
exports.DegreeComputer = {
    name: "Degree",
    buildContext(playerId, _category) {
        return buildStats(playerId);
    },
    compute(missionId, ctx, dbProgress) {
        const targetDeg = getTargetDegree(missionId);
        if (targetDeg !== undefined)
            return (0, stamina_1.getRankDegree)(ctx.player.rankPoint);
        return dbProgress;
    },
};

"use strict";
// Regular & Daily mission computer (categories 1, 2)
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegularComputer = void 0;
const quest_1 = require("../../data/domains/quest");
const player_1 = require("../../data/domains/player");
const patterns_1 = require("./patterns");
const snapshot_1 = require("./snapshot");
function buildStats(playerId, category) {
    const player = (0, player_1.getPlayerSync)(playerId);
    const questProgressRaw = (0, quest_1.getPlayerQuestProgressSync)(playerId);
    let totalQuestClears = 0, ssClears = 0, sClears = 0, aClears = 0, bClears = 0, totalStories = 0;
    const questProgress = {};
    for (const [section, quests] of Object.entries(questProgressRaw)) {
        const list = [];
        for (const qp of quests) {
            list.push({ questId: qp.questId, finished: qp.finished, clearRank: qp.clearRank, bestElapsedTimeMs: qp.bestElapsedTimeMs, leaderCharacterId: qp.leaderCharacterId, multiClearCount: qp.multiClearCount });
            if (qp.finished) {
                totalQuestClears++;
                if (section === '3')
                    totalStories++;
                if (qp.clearRank === 6)
                    ssClears++;
                else if (qp.clearRank === 5)
                    sClears++;
                else if (qp.clearRank === 4)
                    aClears++;
                else if (qp.clearRank === 3)
                    bClears++;
            }
        }
        questProgress[section] = list;
    }
    // Load periodic snapshot for daily/weekly categories
    let snapshot = null;
    if (category === 2)
        snapshot = (0, snapshot_1.getSnapshot)(playerId, 'daily');
    if (category === 10)
        snapshot = (0, snapshot_1.getSnapshot)(playerId, 'weekly');
    return {
        playerId,
        player,
        questProgress,
        totalQuestClears,
        totalStories,
        rankCounts: { rank_ss: ssClears, rank_s: sClears, rank_a: aClears, rank_b: bClears },
        snapshot,
    };
}
exports.RegularComputer = {
    name: "Regular",
    buildContext(playerId, category) {
        return buildStats(playerId, category);
    },
    compute(missionId, ctx, dbProgress) {
        var _a, _b, _c;
        const { snapshot } = ctx;
        const baseClears = snapshot ? (ctx.totalQuestClears - snapshot.questClears) : ctx.totalQuestClears;
        const baseStamina = snapshot ? (((_a = ctx.player.totalStaminaUsed) !== null && _a !== void 0 ? _a : 0) - snapshot.staminaUsed) : (_b = ctx.player.totalStaminaUsed) !== null && _b !== void 0 ? _b : 0;
        const categories = [1, 2]; // handled by this computer
        for (const cat of categories) {
            const pattern = (0, patterns_1.getMissionPattern)(cat, missionId);
            if (pattern && (0, patterns_1.isComputablePattern)(pattern)) {
                if (pattern.startsWith('single_battle_play') || pattern.startsWith('single_battle_clear_count'))
                    return baseClears;
                if (pattern.includes('stamina_use'))
                    return baseStamina;
                if (ctx.rankCounts[pattern] !== undefined) {
                    const baseRank = snapshot
                        ? (ctx.rankCounts[pattern] - ((_c = snapshot[rankToSnapshotKey(pattern)]) !== null && _c !== void 0 ? _c : 0))
                        : ctx.rankCounts[pattern];
                    return baseRank;
                }
            }
        }
        return dbProgress;
    },
};
function rankToSnapshotKey(pattern) {
    if (pattern.includes('rank_ss'))
        return 'rankSs';
    if (pattern.includes('rank_s'))
        return 'rankS';
    if (pattern.includes('rank_a'))
        return 'rankA';
    if (pattern.includes('rank_b'))
        return 'rankB';
    return '';
}

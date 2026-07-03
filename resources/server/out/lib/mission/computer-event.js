"use strict";
// Event mission computer (category 3)
// Uses pre-generated mission_event_quest_map.json for O(1) pattern→quest lookup
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventComputer = void 0;
const quest_1 = require("../../data/domains/quest");
const player_1 = require("../../data/domains/player");
const patterns_1 = require("./patterns");
const mission_event_quest_map_json_1 = __importDefault(require("../../../assets/mission_event_quest_map.json"));
function buildContext(playerId, _category) {
    const player = (0, player_1.getPlayerSync)(playerId);
    const questProgressRaw = (0, quest_1.getPlayerQuestProgressSync)(playerId);
    let totalQuestClears = 0, ssClears = 0, sClears = 0, aClears = 0, bClears = 0, totalStories = 0;
    const questProgress = {};
    for (const [section, quests] of Object.entries(questProgressRaw)) {
        const list = [];
        for (const qp of quests) {
            list.push({
                questId: qp.questId, finished: qp.finished,
                clearRank: qp.clearRank, bestElapsedTimeMs: qp.bestElapsedTimeMs,
                leaderCharacterId: qp.leaderCharacterId,
                multiClearCount: qp.multiClearCount,
            });
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
    return {
        playerId, player, questProgress,
        totalQuestClears, totalStories,
        rankCounts: { rank_ss: ssClears, rank_s: sClears, rank_a: aClears, rank_b: bClears },
    };
}
exports.EventComputer = {
    name: "Event",
    buildContext(playerId, category) {
        return buildContext(playerId, category);
    },
    compute(missionId, ctx, dbProgress) {
        var _a;
        const pattern = (0, patterns_1.getMissionPattern)(3, missionId);
        if (!pattern)
            return dbProgress;
        const mapping = mission_event_quest_map_json_1.default[pattern];
        if (!mapping)
            return dbProgress;
        const isMulti = mapping.countMode === "multi";
        let count = 0;
        for (const cat of mapping.categories) {
            const progress = ctx.questProgress[String(cat)];
            if (!progress)
                continue;
            for (const q of progress) {
                if (!mapping.questIds.includes(q.questId))
                    continue;
                if (isMulti) {
                    count += (_a = q.multiClearCount) !== null && _a !== void 0 ? _a : (q.finished ? 1 : 0);
                }
                else {
                    if (q.finished)
                        count++;
                }
            }
        }
        return count;
    },
};

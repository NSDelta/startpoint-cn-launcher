"use strict";
// Character awakening mission computer (category 9)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwakeComputer = void 0;
const character_clear_1 = require("../../data/domains/character_clear");
const character_1 = require("../../data/domains/character");
const quest_1 = require("../../data/domains/quest");
const player_1 = require("../../data/domains/player");
const db_1 = require("../../data/db");
const character_queries_1 = require("./character-queries");
const mission_char_awake_json_1 = __importDefault(require("../../../assets/mission_char_awake.json"));
// Slot 1 missions that count story reading (not party clears)
const STORY_MISSION_IDS = new Set(Object.entries(mission_char_awake_json_1.default)
    .filter(([, rows]) => /阅读|剧情/.test(rows[0][3]))
    .map(([mid]) => Number(mid)));
const QUEST_CLEAR_MAP = new Map([
    [1110013, { category: 2, questIds: [1028004], leaderCharId: 111001 }],
    [1310052, { category: 15, questIds: [96], leaderCharId: 131005 }],
    [1410032, { category: 2, questIds: [1020003] }],
    [2110013, { category: 2, questIds: [1028004], leaderCharId: 211001 }],
    [2310013, { category: 2, questIds: [1010004], timeLimitMs: 90000, leaderCharId: 231001 }],
    [2510032, { category: 13, questIds: [1020, 1023, 1026, 1029, 1032, 1035, 1038], leaderCharId: 251003 }],
    [2510033, { category: 13, questIds: [1020, 1023, 1026, 1029, 1032, 1035, 1038], timeLimitMs: 180000, leaderCharId: 251003 }],
    [2630023, { category: 19, questIds: [100100004, 100401004], leaderCharId: 151006 }],
]);
const BOND_TOKEN_MISSION_IDS = new Set([1410033, 2210043, 2510043, 2610073]);
const LEADER_REQUIRED_IDS = new Set([1510062, 1610022, 1610023, 2610072]);
const COOP_MISSION_IDS = new Set([1310053, 1510063]);
const COMBO_MISSION_IDS = new Set([1210013]);
const POWERFLIP_CHAR_IDS = new Set([1210012]);
/** Mission 2310012: 人+龙+魔 race composition */
const RACE_MISSION_IDS = new Map([
    [2310012, "Beast+Dragon+Human"], // 人(Human)+龙(Dragon)+魔(Beast) — tentative mapping
]);
// Multi-character party missions: mission_id → required character IDs (from col[24])
const MULTI_CHAR_MISSIONS = new Map([
    [2110012, [211001, 231001]],
    [2210042, [10, 221004]],
    [2410632, [241063, 243007]],
    [2410633, [241063, 243007, 361009]],
    [2510042, [251004, 1]],
    [3310032, [331003, 1]],
    [3310033, [331003, 10]],
]);
// ─── Computer ───
function coClearKey(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
}
function buildAwakeContext(playerId) {
    const player = (0, player_1.getPlayerSync)(playerId);
    const questProgressRaw = (0, quest_1.getPlayerQuestProgressSync)(playerId);
    const allChars = (0, character_1.getPlayerCharactersSync)(playerId);
    let totalQuestClears = 0, ssClears = 0, sClears = 0, aClears = 0, bClears = 0, totalStories = 0;
    const questProgress = {};
    for (const [section, quests] of Object.entries(questProgressRaw)) {
        const list = [];
        for (const qp of quests) {
            list.push({
                questId: qp.questId, finished: qp.finished, clearRank: qp.clearRank,
                bestElapsedTimeMs: qp.bestElapsedTimeMs, leaderCharacterId: qp.leaderCharacterId,
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
    const charClears = new Map();
    const leaderClears = new Map();
    const multiClears = new Map();
    const leaderMultiClears = new Map();
    const leaderPowerflips = new Map();
    const charData = new Map();
    for (const [cid, char] of Object.entries(allChars)) {
        charData.set(cid, char);
        const row = (0, character_clear_1.getPlayerCharacterClearSync)(playerId, Number(cid));
        charClears.set(cid, row.clear_count);
        leaderClears.set(cid, row.leader_clear_count);
        multiClears.set(cid, row.multi_count);
        leaderMultiClears.set(cid, row.leader_multi_count);
        leaderPowerflips.set(cid, row.leader_power_flip_count);
    }
    // Pre-fetch co-clear counts for multi-char missions
    const coClears = new Map();
    const rows = (0, db_1.getDb)().prepare(`
    SELECT char_id_a, char_id_b, co_clear_count FROM players_party_member_co_clears
    WHERE player_id = ?
    `).all(playerId);
    for (const r of rows) {
        coClears.set(coClearKey(r.char_id_a, r.char_id_b), r.co_clear_count);
    }
    // Pre-fetch race clears for race-composition missions
    const raceClears = new Map();
    const raceRows = (0, db_1.getDb)().prepare(`
    SELECT race_key, clear_count FROM players_party_race_clears
    WHERE player_id = ?
    `).all(playerId);
    for (const r of raceRows) {
        raceClears.set(r.race_key, r.clear_count);
    }
    return {
        playerId, player, questProgress,
        totalQuestClears, totalStories,
        rankCounts: { rank_ss: ssClears, rank_s: sClears, rank_a: aClears, rank_b: bClears },
        charClears, leaderClears, multiClears, leaderMultiClears,
        leaderPowerflips, coClears, raceClears, charData,
    };
}
exports.AwakeComputer = {
    name: "Awake",
    buildContext(playerId, _category) {
        return buildAwakeContext(playerId);
    },
    compute(missionId, ctx, dbProgress) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const actx = ctx;
        const charId = (0, character_queries_1.getCharacterIdFromMission)(missionId);
        const lastDigit = missionId % 10;
        // Quest-clear missions (checked first, independent of lastDigit)
        const qc = QUEST_CLEAR_MAP.get(missionId);
        if (qc) {
            const progress = ctx.questProgress[String(qc.category)];
            if (!progress)
                return 0;
            const matches = progress.filter(q => qc.questIds.includes(q.questId) && q.finished);
            if (matches.length === 0)
                return 0;
            if (qc.timeLimitMs) {
                const limit = qc.timeLimitMs;
                if (!matches.some(q => { var _a; return ((_a = q.bestElapsedTimeMs) !== null && _a !== void 0 ? _a : Infinity) <= limit; }))
                    return 0;
            }
            if (qc.leaderCharId) {
                if (!matches.some(q => q.leaderCharacterId === qc.leaderCharId))
                    return 0;
            }
            return 1;
        }
        // Race-composition missions (e.g., 人+龙+魔)
        const raceKey = RACE_MISSION_IDS.get(missionId);
        if (raceKey) {
            return (_a = actx.raceClears.get(raceKey)) !== null && _a !== void 0 ? _a : 0;
        }
        // Multi-character party missions
        const reqChars = MULTI_CHAR_MISSIONS.get(missionId);
        if (reqChars) {
            // Check min co_clear_count across all pairs
            let minCo = Infinity;
            for (let i = 0; i < reqChars.length - 1; i++) {
                for (let j = i + 1; j < reqChars.length; j++) {
                    const count = (_b = actx.coClears.get(coClearKey(reqChars[i], reqChars[j]))) !== null && _b !== void 0 ? _b : 0;
                    if (count < minCo)
                        minCo = count;
                }
            }
            return minCo === Infinity ? 0 : minCo;
        }
        const isLeaderRequired = LEADER_REQUIRED_IDS.has(missionId);
        switch (lastDigit) {
            case AwakeType.STORY_READ:
                return computeStoryOrParty(missionId, actx, charId);
            case AwakeType.PARTY_OR_SPECIAL:
                if (charId === '1')
                    return ctx.totalStories;
                if (charId === '263002')
                    return (_c = ctx.player.totalManaObtained) !== null && _c !== void 0 ? _c : 0;
                if (POWERFLIP_CHAR_IDS.has(missionId))
                    return (_d = actx.leaderPowerflips.get(charId)) !== null && _d !== void 0 ? _d : 0;
                return isLeaderRequired
                    ? (_e = actx.leaderClears.get(charId)) !== null && _e !== void 0 ? _e : 0
                    : (_f = actx.charClears.get(charId)) !== null && _f !== void 0 ? _f : 0;
            case AwakeType.SPECIAL:
                if (charId === '1')
                    return (_g = ctx.player.totalPowerflips) !== null && _g !== void 0 ? _g : 0;
                if (BOND_TOKEN_MISSION_IDS.has(missionId)) {
                    const char = actx.charData.get(charId);
                    return (char === null || char === void 0 ? void 0 : char.bondTokenList.every(bt => bt.status >= 2)) ? 1 : 0;
                }
                if (COOP_MISSION_IDS.has(missionId)) {
                    return (_h = actx.leaderMultiClears.get(charId)) !== null && _h !== void 0 ? _h : 0;
                }
                if (COMBO_MISSION_IDS.has(missionId)) {
                    return (_j = ctx.player.maxComboAchieved) !== null && _j !== void 0 ? _j : 0;
                }
                return isLeaderRequired
                    ? (_k = actx.leaderClears.get(charId)) !== null && _k !== void 0 ? _k : 0
                    : (_l = actx.charClears.get(charId)) !== null && _l !== void 0 ? _l : 0;
            case AwakeType.ALL_COMPLETE: {
                const s1 = exports.AwakeComputer.compute(missionId - 3, ctx, dbProgress);
                const s2 = exports.AwakeComputer.compute(missionId - 2, ctx, dbProgress);
                const s3 = exports.AwakeComputer.compute(missionId - 1, ctx, dbProgress);
                return (s1 >= 1 ? 1 : 0) + (s2 >= 1 ? 1 : 0) + (s3 >= 1 ? 1 : 0);
            }
        }
        return dbProgress;
    },
};
var AwakeType;
(function (AwakeType) {
    AwakeType[AwakeType["STORY_READ"] = 1] = "STORY_READ";
    AwakeType[AwakeType["PARTY_OR_SPECIAL"] = 2] = "PARTY_OR_SPECIAL";
    AwakeType[AwakeType["SPECIAL"] = 3] = "SPECIAL";
    AwakeType[AwakeType["ALL_COMPLETE"] = 4] = "ALL_COMPLETE";
})(AwakeType || (AwakeType = {}));
function computeStoryOrParty(missionId, actx, charId) {
    var _a, _b, _c;
    if (STORY_MISSION_IDS.has(missionId)) {
        const storyIds = (0, character_queries_1.getCharacterStoryQuestIds)(charId);
        let count = 0;
        for (const qid of storyIds) {
            if ((_b = (_a = actx.questProgress['3']) === null || _a === void 0 ? void 0 : _a.find(q => q.questId === qid)) === null || _b === void 0 ? void 0 : _b.finished)
                count++;
        }
        return count;
    }
    return (_c = actx.charClears.get(charId)) !== null && _c !== void 0 ? _c : 0;
}

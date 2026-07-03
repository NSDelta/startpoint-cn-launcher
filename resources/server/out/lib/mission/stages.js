"use strict";
// Stage threshold data — from CDN reward tables
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMissionStageIds = exports.getCompletedStageNumbers = exports.getCurrentStage = exports.getMissionIdsByCategory = void 0;
const mission_regular_reward_json_1 = __importDefault(require("../../../assets/mission_regular_reward.json"));
const mission_daily_reward_json_1 = __importDefault(require("../../../assets/mission_daily_reward.json"));
const mission_event_reward_json_1 = __importDefault(require("../../../assets/mission_event_reward.json"));
const mission_degree_reward_json_1 = __importDefault(require("../../../assets/mission_degree_reward.json"));
const mission_collect_item_reward_json_1 = __importDefault(require("../../../assets/mission_collect_item_reward.json"));
const mission_weekly_reward_json_1 = __importDefault(require("../../../assets/mission_weekly_reward.json"));
const mission_char_awake_reward_json_1 = __importDefault(require("../../../assets/mission_char_awake_reward.json"));
function buildLookup(rewardTable) {
    const result = {};
    for (const [missionId, stages] of Object.entries(rewardTable)) {
        const list = [];
        for (const [stageStr, rows] of Object.entries(stages)) {
            const row = rows[0];
            const targetProgress = parseInt(row[5] || row[1] || "0");
            const stage = parseInt(stageStr);
            list.push({ stage, targetProgress });
        }
        list.sort((a, b) => a.targetProgress - b.targetProgress);
        result[missionId] = list;
    }
    return result;
}
const missionStageLookup = {
    1: buildLookup(mission_regular_reward_json_1.default),
    2: buildLookup(mission_daily_reward_json_1.default),
    3: buildLookup(mission_event_reward_json_1.default),
    4: buildLookup(mission_collect_item_reward_json_1.default),
    5: buildLookup(mission_degree_reward_json_1.default),
    9: buildLookup(mission_char_awake_reward_json_1.default),
    10: buildLookup(mission_weekly_reward_json_1.default),
};
function getMissionIdsByCategory(category) {
    const lookup = missionStageLookup[category];
    if (!lookup)
        return [];
    return Object.keys(lookup).map(Number);
}
exports.getMissionIdsByCategory = getMissionIdsByCategory;
function getCurrentStage(category, missionId, progress) {
    var _a;
    const stages = (_a = missionStageLookup[category]) === null || _a === void 0 ? void 0 : _a[String(missionId)];
    if (!stages || stages.length === 0)
        return 1;
    let current = stages[stages.length - 1].stage;
    for (const s of stages) {
        if (progress < s.targetProgress) {
            current = s.stage;
            break;
        }
    }
    return current;
}
exports.getCurrentStage = getCurrentStage;
function getCompletedStageNumbers(category, missionId, progress) {
    var _a;
    const stages = (_a = missionStageLookup[category]) === null || _a === void 0 ? void 0 : _a[String(missionId)];
    if (!stages)
        return [];
    return stages.filter(s => progress >= s.targetProgress).map(s => s.stage);
}
exports.getCompletedStageNumbers = getCompletedStageNumbers;
function getMissionStageIds(category, missionId) {
    var _a;
    const stages = (_a = missionStageLookup[category]) === null || _a === void 0 ? void 0 : _a[String(missionId)];
    if (!stages)
        return [];
    return stages.map(s => s.stage);
}
exports.getMissionStageIds = getMissionStageIds;

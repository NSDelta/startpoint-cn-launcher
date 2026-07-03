"use strict";
// Mission reward parsers — from CDN reward tables
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventMissionRewards = exports.getAwakeMissionRewards = exports.getActiveMissionRewards = void 0;
const mission_active_reward_json_1 = __importDefault(require("../../../assets/mission_active_reward.json"));
const mission_event_reward_json_1 = __importDefault(require("../../../assets/mission_event_reward.json"));
const mission_char_awake_reward_json_1 = __importDefault(require("../../../assets/mission_char_awake_reward.json"));
function getActiveMissionRewards(missionId, stage) {
    const mission = mission_active_reward_json_1.default[String(missionId)];
    if (!mission)
        return [];
    const stageData = mission[String(stage)];
    if (!stageData || !stageData[0])
        return [];
    const row = stageData[0];
    const result = [];
    for (let slot = 0; slot < 4; slot++) {
        const base = 7 + slot * 6;
        const kind = parseInt(row[base]) || 0;
        if (kind === 0)
            continue;
        const amount = parseInt(row[base + 1]) || 0;
        if (amount === 0)
            continue;
        const itemId = row[base + 2] ? parseInt(row[base + 2]) : undefined;
        const charId = row[base + 3] ? parseInt(row[base + 3]) : undefined;
        const equipId = row[base + 4] ? parseInt(row[base + 4]) : undefined;
        // Skip item/equipment rewards with missing IDs (prevents SQL NOT NULL crash)
        if (kind === 1 && !itemId)
            continue;
        if (kind === 2 && !equipId)
            continue;
        const reward = { kind, amount };
        if (itemId)
            reward.itemId = itemId;
        if (charId)
            reward.characterId = charId;
        if (equipId)
            reward.equipmentId = equipId;
        result.push(reward);
    }
    return result;
}
exports.getActiveMissionRewards = getActiveMissionRewards;
function getAwakeMissionRewards(missionId, stage) {
    const mission = mission_char_awake_reward_json_1.default[String(missionId)];
    if (!mission)
        return [];
    const stageData = mission[String(stage)];
    if (!stageData || !stageData[0])
        return [];
    const row = stageData[0];
    const result = [];
    const base = 9;
    const kind = parseInt(row[base]) || 0;
    if (kind === 0)
        return [];
    const amount = parseInt(row[base + 1]) || 0;
    if (amount === 0)
        return [];
    const itemId = row[base + 2] ? parseInt(row[base + 2]) : undefined;
    // Skip item/equipment rewards with missing IDs (prevents SQL NOT NULL crash)
    if ((kind === 1 || kind === 2) && !itemId)
        return [];
    const reward = { kind, amount };
    if (itemId)
        reward.itemId = itemId;
    result.push(reward);
    return result;
}
exports.getAwakeMissionRewards = getAwakeMissionRewards;
function getEventMissionRewards(missionId, stage) {
    const mission = mission_event_reward_json_1.default[String(missionId)];
    if (!mission)
        return [];
    const stageData = mission[String(stage)];
    if (!stageData || !stageData[0])
        return [];
    const row = stageData[0];
    const result = [];
    // Event rewards use base=5 (single slot, kind=col[5], amount=col[6], item=col[7])
    const base = 5;
    const kind = parseInt(row[base]) || 0;
    if (kind === 0)
        return [];
    const amount = parseInt(row[base + 1]) || 0;
    if (amount === 0)
        return [];
    const itemId = row[base + 2] ? parseInt(row[base + 2]) : undefined;
    // Skip item/equipment rewards with missing IDs (prevents SQL NOT NULL crash)
    if ((kind === 1 || kind === 2) && !itemId)
        return [];
    const reward = { kind, amount };
    if (itemId)
        reward.itemId = itemId;
    result.push(reward);
    return result;
}
exports.getEventMissionRewards = getEventMissionRewards;

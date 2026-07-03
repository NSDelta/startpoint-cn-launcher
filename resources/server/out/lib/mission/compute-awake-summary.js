"use strict";
// Compute awake mission summary for /load response
// Returns active_mission_list (Array format for data.active_mission_list)
// and mana_board_awake per character (for data.character_list[i].mana_board_awake)
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAwakeSummary = void 0;
const mission_1 = require("../../data/domains/mission");
const character_1 = require("../../data/domains/character");
const registry_1 = require("./registry");
const stages_1 = require("./stages");
const character_queries_1 = require("./character-queries");
function computeAwakeSummary(playerId) {
    var _a, _b;
    const activeMissions = (0, mission_1.getPlayerActiveMissionsSync)(playerId);
    const playerChars = (0, character_1.getPlayerCharactersSync)(playerId);
    const awakeMissionIds = (0, stages_1.getMissionIdsByCategory)(9);
    const charMissionMap = new Map();
    for (const mid of awakeMissionIds) {
        const charId = (0, character_queries_1.getCharacterIdFromMission)(mid);
        if (!charMissionMap.has(charId))
            charMissionMap.set(charId, []);
        charMissionMap.get(charId).push(mid);
    }
    const computer = (0, registry_1.getComputer)(9);
    const ctx = computer.buildContext(playerId, 9);
    const activeMissionList = [];
    const manaBoardAwakeMap = new Map();
    for (const [charKId, missionIds] of charMissionMap) {
        if (!playerChars[charKId])
            continue;
        let allComplete = true;
        for (const missionId of missionIds) {
            const dbProgress = (_b = (_a = activeMissions[String(missionId)]) === null || _a === void 0 ? void 0 : _a.progress) !== null && _b !== void 0 ? _b : 0;
            const progress = computer.compute(missionId, ctx, dbProgress);
            const completedStages = (0, stages_1.getCompletedStageNumbers)(9, missionId, progress);
            const allStageIds = (0, stages_1.getMissionStageIds)(9, missionId);
            const stages = allStageIds.map(sid => ({
                stage: sid,
                received: completedStages.includes(sid),
            }));
            activeMissionList.push({
                mission_id: missionId,
                progress_value: progress,
                stages,
            });
            if (!allStageIds.every(sid => completedStages.includes(sid))) {
                allComplete = false;
            }
        }
        if (allComplete) {
            manaBoardAwakeMap.set(charKId, { 1: 1 });
        }
    }
    return { activeMissionList, manaBoardAwakeMap };
}
exports.computeAwakeSummary = computeAwakeSummary;

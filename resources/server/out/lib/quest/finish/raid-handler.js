"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRaidEventFinish = void 0;
const types_1 = require("../../../data/types");
const types_2 = require("../../types");
function handleRaidEventFinish(params) {
    const { questCategory, activeEventId, party, playerId, questId, getEvoLevelsFn, insertPartyFn } = params;
    if (questCategory !== types_2.QuestCategory.RAID_EVENT || !activeEventId)
        return;
    const characterIds = party.characters.map(val => { var _a; return (_a = val === null || val === void 0 ? void 0 : val.id) !== null && _a !== void 0 ? _a : null; });
    const unisonCharacterIds = party.unison_characters.map(val => { var _a; return (_a = val === null || val === void 0 ? void 0 : val.id) !== null && _a !== void 0 ? _a : null; });
    const evolutionImgLevels = getEvoLevelsFn(playerId, characterIds);
    const unisonEvolutionImgLevels = getEvoLevelsFn(playerId, unisonCharacterIds);
    insertPartyFn(playerId, activeEventId, {
        characterIds, unisonCharacterIds,
        equipmentIds: party.equipments.map(val => { var _a; return (_a = val === null || val === void 0 ? void 0 : val.id) !== null && _a !== void 0 ? _a : null; }),
        abilitySoulIds: party.ability_soul_ids,
        evolutionImgLevels,
        unisonEvolutionImgLevels,
        battleType: types_1.RushEventBattleType.FOLDER,
        round: questId
    });
}
exports.handleRaidEventFinish = handleRaidEventFinish;

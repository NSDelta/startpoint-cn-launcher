"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCarnivalEventFinish = void 0;
const types_1 = require("../../types");
function handleCarnivalEventFinish(params) {
    var _a, _b;
    const { questCategory, questAccomplished, questId, clearTime, party, playerId, carnivalLookup, upsertFn } = params;
    if (questCategory !== types_1.QuestCategory.CARNIVAL_EVENT || !questAccomplished)
        return null;
    const carnivalInfo = carnivalLookup[String(questId)];
    if (!carnivalInfo)
        return null;
    const characterIds = party.characters.map(v => { var _a; return (_a = v === null || v === void 0 ? void 0 : v.id) !== null && _a !== void 0 ? _a : null; });
    const unisonCharacterIds = party.unison_characters.map(v => { var _a; return (_a = v === null || v === void 0 ? void 0 : v.id) !== null && _a !== void 0 ? _a : null; });
    const leaderCharId = (_b = (_a = party.leader) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 0;
    const difficultyBonus = carnivalInfo.difficulty_score * 100;
    const timeBonus = Math.max(0, carnivalInfo.time_limit_ms - clearTime);
    const totalScore = difficultyBonus + timeBonus;
    upsertFn(playerId, carnivalInfo.event_id, carnivalInfo.folder_id, totalScore, characterIds, unisonCharacterIds);
    return {
        is_record_valid: true,
        leader_character_id: leaderCharId,
        new_degree_ids: [],
        previous_total_best_score: 0,
        reward_ids: [],
        score: { difficulty_bonus: difficultyBonus, time_bonus: timeBonus }
    };
}
exports.handleCarnivalEventFinish = handleCarnivalEventFinish;

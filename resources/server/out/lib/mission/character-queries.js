"use strict";
// Character → quest mapping helpers
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCharacterStoryQuestIds = exports.getCharacterIdFromMission = void 0;
const character_quest_lookup_json_1 = __importDefault(require("../../../assets/character_quest_lookup.json"));
function getCharacterIdFromMission(missionId) {
    const s = String(missionId);
    return s.length > 1 ? s.substring(0, s.length - 1) : s;
}
exports.getCharacterIdFromMission = getCharacterIdFromMission;
function getCharacterStoryQuestIds(characterId) {
    const cid = String(characterId);
    const lookupId = cid === '1' ? '10' : cid;
    const ids = [];
    for (const [key, rows] of Object.entries(character_quest_lookup_json_1.default)) {
        if (key.startsWith(lookupId) && rows.length > 0) {
            ids.push(parseInt(key));
        }
    }
    return ids;
}
exports.getCharacterStoryQuestIds = getCharacterStoryQuestIds;

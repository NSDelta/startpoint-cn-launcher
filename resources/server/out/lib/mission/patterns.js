"use strict";
// Pattern → mission_id reverse index (for update_mission_progress)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isComputablePattern = exports.getMissionPattern = exports.getMissionsByPattern = void 0;
const mission_regular_json_1 = __importDefault(require("../../../assets/mission_regular.json"));
const mission_daily_json_1 = __importDefault(require("../../../assets/mission_daily.json"));
const mission_event_json_1 = __importDefault(require("../../../assets/mission_event.json"));
const mission_degree_json_1 = __importDefault(require("../../../assets/mission_degree.json"));
const mission_collect_item_json_1 = __importDefault(require("../../../assets/mission_collect_item.json"));
const mission_weekly_def_json_1 = __importDefault(require("../../../assets/mission_weekly_def.json"));
const mission_char_awake_json_1 = __importDefault(require("../../../assets/mission_char_awake.json"));
const patternIndex = {};
const missionPatternLookup = {};
function indexPatterns(defs, category) {
    for (const [missionId, rows] of Object.entries(defs)) {
        const row = rows[0];
        if (!row || !Array.isArray(row))
            continue;
        const pattern = String(row[0]);
        if (!pattern || pattern === '(None)')
            continue;
        if (!patternIndex[pattern])
            patternIndex[pattern] = [];
        patternIndex[pattern].push({ missionId: parseInt(missionId), category });
        missionPatternLookup[`${category}_${missionId}`] = pattern;
    }
}
indexPatterns(mission_regular_json_1.default, 1);
indexPatterns(mission_daily_json_1.default, 2);
indexPatterns(mission_event_json_1.default, 3);
indexPatterns(mission_collect_item_json_1.default, 4);
indexPatterns(mission_degree_json_1.default, 5);
indexPatterns(mission_weekly_def_json_1.default, 10);
indexPatterns(mission_char_awake_json_1.default, 9);
function getMissionsByPattern(pattern) {
    return patternIndex[pattern] || [];
}
exports.getMissionsByPattern = getMissionsByPattern;
function getMissionPattern(category, missionId) {
    return missionPatternLookup[`${category}_${missionId}`] || '';
}
exports.getMissionPattern = getMissionPattern;
function isComputablePattern(pattern) {
    if (!pattern)
        return false;
    if (pattern.startsWith('single_battle_play') || pattern.startsWith('single_battle_clear_count'))
        return true;
    if (pattern.startsWith('used_stamina_count') || pattern.includes('stamina_use'))
        return true;
    return pattern.startsWith('rank_ss') || pattern.startsWith('rank_s') || pattern.startsWith('rank_a') || pattern.startsWith('rank_b');
}
exports.isComputablePattern = isComputablePattern;

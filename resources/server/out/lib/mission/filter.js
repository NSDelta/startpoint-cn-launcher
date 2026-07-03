"use strict";
// ─── Active mission ID filter (C8601 prevention) ────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterToActiveMissions = exports.isActiveMissionId = void 0;
const mission_active_reward_json_1 = __importDefault(require("../../../assets/mission_active_reward.json"));
const activeMissionIdSet = new Set(Object.keys(mission_active_reward_json_1.default).map(Number));
function isActiveMissionId(id) {
    return activeMissionIdSet.has(Number(id));
}
exports.isActiveMissionId = isActiveMissionId;
function filterToActiveMissions(missions) {
    const out = {};
    for (const [id, value] of Object.entries(missions)) {
        if (activeMissionIdSet.has(Number(id)))
            out[id] = value;
    }
    return out;
}
exports.filterToActiveMissions = filterToActiveMissions;

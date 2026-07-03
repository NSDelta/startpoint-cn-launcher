"use strict";
// Periodic snapshot — stores counter baselines for daily/weekly mission reset
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSnapshot = exports.takeSnapshot = void 0;
const db_1 = require("../../data/db");
function takeSnapshot(playerId, periodType, data) {
    (0, db_1.getDb)().prepare(`
    INSERT OR REPLACE INTO players_periodic_snapshots
        (player_id, period_type, quest_clears, stamina_used, rank_ss, rank_s, rank_a, rank_b, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(playerId, periodType, data.questClears, data.staminaUsed, data.rankSs, data.rankS, data.rankA, data.rankB);
}
exports.takeSnapshot = takeSnapshot;
function getSnapshot(playerId, periodType) {
    const row = (0, db_1.getDb)().prepare(`
    SELECT quest_clears, stamina_used, rank_ss, rank_s, rank_a, rank_b
    FROM players_periodic_snapshots
    WHERE player_id = ? AND period_type = ?
    `).get(playerId, periodType);
    if (!row)
        return null;
    return {
        questClears: row.quest_clears,
        staminaUsed: row.stamina_used,
        rankSs: row.rank_ss,
        rankS: row.rank_s,
        rankA: row.rank_a,
        rankB: row.rank_b,
    };
}
exports.getSnapshot = getSnapshot;

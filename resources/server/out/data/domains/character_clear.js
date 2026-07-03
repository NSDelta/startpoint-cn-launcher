"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementPlayerCharacterClearSync = exports.getPlayerCharacterClearSync = void 0;
const db_1 = require("../db");
function getPlayerCharacterClearSync(playerId, characterId) {
    const row = (0, db_1.getDb)().prepare(`
    SELECT clear_count, multi_count, leader_clear_count, leader_multi_count, leader_power_flip_count FROM players_character_quest_clears
    WHERE player_id = ? AND character_id = ?
    `).get(playerId, characterId);
    return row || { clear_count: 0, multi_count: 0, leader_clear_count: 0, leader_multi_count: 0, leader_power_flip_count: 0 };
}
exports.getPlayerCharacterClearSync = getPlayerCharacterClearSync;
function incrementPlayerCharacterClearSync(playerId, characterId, isMulti, isLeader = false) {
    const db = (0, db_1.getDb)();
    db.prepare(`
    INSERT INTO players_character_quest_clears (player_id, character_id, clear_count, multi_count, leader_clear_count, leader_multi_count)
    VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(player_id, character_id) DO UPDATE SET
        clear_count = clear_count + 1,
        multi_count = multi_count + ?,
        leader_clear_count = leader_clear_count + ?,
        leader_multi_count = leader_multi_count + ?
    `).run(playerId, characterId, isMulti ? 1 : 0, isLeader ? 1 : 0, isMulti && isLeader ? 1 : 0, isMulti ? 1 : 0, isLeader ? 1 : 0, isMulti && isLeader ? 1 : 0);
}
exports.incrementPlayerCharacterClearSync = incrementPlayerCharacterClearSync;

"use strict";
// Tracks party member co-clears (pairwise) for multi-character awake missions
// When 3+ specific characters must be in the same party, this tracks their co-appearances
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackPartyCoClears = void 0;
const db_1 = require("../../../data/db");
const race_utils_1 = require("./race-utils");
function trackPartyCoClears(ctx) {
    const ids = [];
    const allRaces = [];
    for (const c of ctx.party.characters) {
        if (c === null || c === void 0 ? void 0 : c.id) {
            ids.push(c.id);
            allRaces.push(...(0, race_utils_1.getCharacterRaces)(c.id));
        }
    }
    for (const c of ctx.party.unison_characters) {
        if (c === null || c === void 0 ? void 0 : c.id) {
            ids.push(c.id);
            allRaces.push(...(0, race_utils_1.getCharacterRaces)(c.id));
        }
    }
    // Co-clears (pairwise character IDs)
    const unique = [...new Set(ids)];
    if (unique.length >= 2) {
        const db = (0, db_1.getDb)();
        const insert = db.prepare(`
        INSERT INTO players_party_member_co_clears (player_id, char_id_a, char_id_b, co_clear_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(player_id, char_id_a, char_id_b) DO UPDATE SET
            co_clear_count = co_clear_count + 1
        `);
        const tx = db.transaction(() => {
            for (let i = 0; i < unique.length - 1; i++) {
                for (let j = i + 1; j < unique.length; j++) {
                    insert.run(ctx.playerId, unique[i], unique[j]);
                }
            }
        });
        tx();
    }
    // Race clears (unique race set)
    const raceKey = (0, race_utils_1.getRaceKeyString)(allRaces);
    if (raceKey) {
        (0, db_1.getDb)().prepare(`
        INSERT INTO players_party_race_clears (player_id, race_key, clear_count)
        VALUES (?, ?, 1)
        ON CONFLICT(player_id, race_key) DO UPDATE SET
            clear_count = clear_count + 1
        `).run(ctx.playerId, raceKey);
    }
}
exports.trackPartyCoClears = trackPartyCoClears;

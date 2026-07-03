"use strict";
// Save validator system — runs permanent validators on /load.
// Temporal filters are applied at serialization time (see load.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTemporalFilters = exports.runPermanentValidators = void 0;
const max_level_1 = require("./max-level");
const party_slot_1 = require("./party-slot");
const PERMANENT_VALIDATORS = [
    max_level_1.MaxLevelValidator,
    party_slot_1.PartySlotValidator,
];
const TEMPORAL_FILTERS = [
// Add temporal filters here (e.g. ExBoostReleaseFilter, ItemReleaseFilter)
];
/** Run all permanent validators. Returns total fixes applied. */
function runPermanentValidators(playerId) {
    let totalFixes = 0;
    for (const v of PERMANENT_VALIDATORS) {
        try {
            totalFixes += v.validate(playerId);
        }
        catch (e) {
            console.error(`[VALIDATE:${v.name}] error:`, e);
        }
    }
    if (totalFixes > 0) {
        console.log(`[VALIDATE] player=${playerId}: ${totalFixes} total permanent fixes`);
    }
    return totalFixes;
}
exports.runPermanentValidators = runPermanentValidators;
/** Apply all temporal filters to serialized output. */
function applyTemporalFilters(output) {
    for (const f of TEMPORAL_FILTERS) {
        try {
            output = f.apply(output);
        }
        catch (e) {
            console.error(`[VALIDATE:${f.name}] filter error:`, e);
        }
    }
    return output;
}
exports.applyTemporalFilters = applyTemporalFilters;

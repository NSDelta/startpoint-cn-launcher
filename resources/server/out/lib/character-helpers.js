"use strict";
// Character endpoint shared helpers — session validation, mana/item deduction
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCharacterResponse = exports.computeBondTokenAndEvolution = exports.buildCharacterListEntry = exports.computeItemDeductions = exports.computeManaDeduction = exports.validateCharacterOwnership = exports.validateSessionAndPlayer = void 0;
const player_1 = require("../data/domains/player");
const character_1 = require("../data/domains/character");
const session_1 = require("../data/domains/session");
const activeAccount_1 = require("../data/activeAccount");
const item_1 = require("../data/domains/item");
const character_2 = require("../data/domains/character");
const utils_1 = require("../utils");
const utils_2 = require("../data/utils");
/** Validates session + player existence. Sends 400/500 on failure. */
function validateSessionAndPlayer(viewerId, reply) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = yield (0, session_1.getSession)(viewerId.toString());
        if (!session) {
            reply.status(400).send({ "error": "Bad Request", "message": "Invalid viewer id." });
            return null;
        }
        const playerId = (0, activeAccount_1.resolvePlayerIdSync)(session.accountId);
        const player = (0, player_1.getPlayerSync)(playerId);
        if (!player) {
            reply.status(500).send({ "error": "Internal Server Error", "message": "No players bound to account." });
            return null;
        }
        return { viewerId, playerId, player };
    });
}
exports.validateSessionAndPlayer = validateSessionAndPlayer;
/** Validates character ownership. Sends 400 on failure. */
function validateCharacterOwnership(playerId, characterId, reply) {
    const characterData = (0, character_1.getPlayerCharacterSync)(playerId, characterId);
    if (!characterData) {
        reply.status(400).send({ "error": "Bad Request", "message": "Character not owned." });
        return null;
    }
    return characterData;
}
exports.validateCharacterOwnership = validateCharacterOwnership;
// ─── Mana deduction ───
function computeManaDeduction(player, manaCost) {
    let remaining = manaCost;
    let newFreeMana = player.freeMana;
    let newPaidMana = player.paidMana;
    if (remaining <= newFreeMana) {
        newFreeMana -= remaining;
    }
    else {
        remaining -= newFreeMana;
        newFreeMana = 0;
        newPaidMana -= remaining;
    }
    if (newFreeMana < 0 || newPaidMana < 0)
        return null;
    return { newFreeMana, newPaidMana };
}
exports.computeManaDeduction = computeManaDeduction;
// ─── Item deduction ───
/** Validates item availability and computes remaining amounts. Returns null on insufficient. */
function computeItemDeductions(playerId, itemsCosts, reply) {
    const result = {};
    for (const [itemId, itemCost] of Object.entries(itemsCosts)) {
        const item = (0, item_1.getPlayerItemSync)(playerId, itemId);
        const newAmount = (item !== null && item !== void 0 ? item : 0) - itemCost;
        if (newAmount < 0) {
            reply.status(400).send({ "error": "Bad Request", "message": `Not enough of item with id ${itemId}` });
            return null;
        }
        result[itemId] = newAmount;
    }
    return result;
}
exports.computeItemDeductions = computeItemDeductions;
// ─── Response builders ───
/** Builds the standard character_list entry for mana-related responses. */
function buildCharacterListEntry(characterId, characterData, extras = {}) {
    return Object.assign({ character_id: characterId, evolution_level: characterData.evolutionLevel, evolution_img_level: characterData.evolutionLevel, create_time: (0, utils_2.clientSerializeDate)(characterData.joinTime), update_time: (0, utils_2.clientSerializeDate)(characterData.updateTime), join_time: (0, utils_2.clientSerializeDate)(characterData.joinTime), bond_token_list: [] }, extras);
}
exports.buildCharacterListEntry = buildCharacterListEntry;
/**
 * Checks board completion and handles bond token grant + first evolution.
 * Used by both /learn_mana_node and /awake_mana_node.
 *
 * @param boardIndex — the mana board index being processed (1 for awake, currentManaNodeIndex for learn)
 */
function computeBondTokenAndEvolution(playerId, characterId, characterData, boardIndex, isBoardComplete) {
    var _a;
    let characterEvolutionLevel = characterData.evolutionLevel;
    let evolutionData = [];
    const bondTokenList = [];
    if (((_a = characterData.bondTokenList[boardIndex - 1]) === null || _a === void 0 ? void 0 : _a.status) === 0 && isBoardComplete) {
        (0, character_2.updatePlayerCharacterBondTokenSync)(playerId, characterId, { manaBoardIndex: boardIndex, status: 1 });
        for (const entry of characterData.bondTokenList) {
            bondTokenList.push({
                "mana_board_index": entry.manaBoardIndex,
                "status": entry.manaBoardIndex === boardIndex ? 1 : entry.status,
            });
        }
        if (characterEvolutionLevel === 0) {
            characterEvolutionLevel = 1;
            (0, character_2.updatePlayerCharacterSync)(playerId, characterId, { evolutionLevel: characterEvolutionLevel });
            evolutionData = { "character_id": characterId, "level": 1, "img_level": 1 };
        }
    }
    return { characterEvolutionLevel, evolutionData, bondTokenList };
}
exports.computeBondTokenAndEvolution = computeBondTokenAndEvolution;
/** Sends a standard-format mana-related response. */
function sendCharacterResponse(reply, viewerId, data) {
    reply.header("content-type", "application/x-msgpack");
    return reply.status(200).send({
        "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
        "data": data,
    });
}
exports.sendCharacterResponse = sendCharacterResponse;

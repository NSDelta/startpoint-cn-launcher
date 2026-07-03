"use strict";
// Character mana node endpoints — learn and awake
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
const character_1 = require("../../../data/domains/character");
const item_1 = require("../../../data/domains/item");
const player_1 = require("../../../data/domains/player");
const assets_1 = require("../../../lib/assets");
const character_helpers_1 = require("../../../lib/character-helpers");
const routes = (fastify) => __awaiter(void 0, void 0, void 0, function* () {
    fastify.post("/learn_mana_node", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const body = request.body;
        const viewerId = body.viewer_id;
        const characterId = body.character_id;
        const toUnlockNodeIds = body.mana_node_multiplied_id_list;
        console.log(`[MANA] learn_mana_node: viewer=${viewerId} char=${characterId} nodes=${JSON.stringify(toUnlockNodeIds)}`);
        if (!viewerId || isNaN(viewerId) || !characterId || isNaN(characterId) || !toUnlockNodeIds)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const sess = yield (0, character_helpers_1.validateSessionAndPlayer)(viewerId, reply);
        if (!sess)
            return;
        const { playerId, player } = sess;
        const characterData = (0, character_helpers_1.validateCharacterOwnership)(playerId, characterId, reply);
        if (!characterData)
            return;
        // compute the combined cost of each node
        let manaCost = 0;
        const itemsCosts = {};
        const userCharacterManaNodeListItem = [];
        const currentManaNodeIndex = characterData.manaBoardIndex;
        const characterManaNodes = (0, assets_1.getCharacterManaNodesSync)(characterId, currentManaNodeIndex);
        if (characterManaNodes === null)
            return reply.status(400).send({
                "error": "Bad Request", "message": `Character does not have mana nodes of index '${currentManaNodeIndex}'.`
            });
        const unlockedManaNodes = (0, character_1.getPlayerCharacterManaNodesSync)(playerId, characterId);
        const unlockedManaNodesRecord = {};
        let indexUnlockedNodesCount = 0;
        for (const manaNodeId of unlockedManaNodes) {
            unlockedManaNodesRecord[manaNodeId] = true;
            indexUnlockedNodesCount += characterManaNodes[manaNodeId] === undefined ? 0 : 1;
        }
        for (const manaNodeId of toUnlockNodeIds) {
            if (unlockedManaNodesRecord[manaNodeId])
                return reply.status(400).send({
                    "error": "Bad Request", "message": `Mana node '${manaNodeId}' already unlocked.`
                });
            const nodeData = characterManaNodes[manaNodeId];
            if (nodeData === undefined)
                return reply.status(400).send({
                    "error": "Bad Request", "message": `Mana node '${manaNodeId}' does not exist.`
                });
            if (nodeData !== null) {
                manaCost += nodeData.manaCost;
                for (const [itemId, itemCost] of Object.entries(nodeData.items)) {
                    itemsCosts[itemId] = ((_a = itemsCosts[itemId]) !== null && _a !== void 0 ? _a : 0) + itemCost;
                }
                userCharacterManaNodeListItem.push({ "multiplied_id": manaNodeId, "awake_level": 0 });
            }
        }
        // Deduct mana
        const manaResult = (0, character_helpers_1.computeManaDeduction)(player, manaCost);
        if (!manaResult)
            return reply.status(400).send({ "error": "Bad Request", "message": "Not enough mana." });
        const { newFreeMana, newPaidMana } = manaResult;
        // Deduct items
        const itemResult = (0, character_helpers_1.computeItemDeductions)(playerId, itemsCosts, reply);
        if (!itemResult)
            return;
        const newItemAmounts = itemResult;
        // Apply deductions
        (0, player_1.updatePlayerSync)({ id: playerId, freeMana: newFreeMana, paidMana: newPaidMana });
        for (const [itemId, newAmount] of Object.entries(newItemAmounts)) {
            (0, item_1.updatePlayerItemSync)(playerId, itemId, newAmount);
        }
        let characterEvolutionLevel = characterData.evolutionLevel;
        let evolutionData = [];
        let bondTokenList = [];
        const isBoardComplete = (indexUnlockedNodesCount + toUnlockNodeIds.length) === Object.keys(characterManaNodes).length;
        const bond = (0, character_helpers_1.computeBondTokenAndEvolution)(playerId, characterId, characterData, currentManaNodeIndex, isBoardComplete);
        characterEvolutionLevel = bond.characterEvolutionLevel;
        evolutionData = bond.evolutionData;
        bondTokenList = bond.bondTokenList;
        console.log(`[MANA] learn_mana_node done: boardComplete=${isBoardComplete} bondGiven=${!!bondTokenList.length} evoLevel=${characterEvolutionLevel}`);
        (0, character_1.insertPlayerCharacterManaNodesSync)(playerId, characterId, toUnlockNodeIds);
        return (0, character_helpers_1.sendCharacterResponse)(reply, viewerId, {
            user_info: { free_mana: newFreeMana, paid_mana: newPaidMana },
            character_list: [(0, character_helpers_1.buildCharacterListEntry)(characterId, characterData, {
                    evolution_level: characterEvolutionLevel,
                    evolution_img_level: characterEvolutionLevel,
                    bond_token_list: bondTokenList,
                })],
            user_character_mana_node_list: { [String(characterId)]: userCharacterManaNodeListItem },
            item_list: newItemAmounts,
            evolution: evolutionData,
            mail_arrived: false,
        });
    }));
    fastify.post("/awake_mana_node", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        var _b, _c, _d;
        const body = request.body;
        const viewerId = body.viewer_id;
        const characterId = body.character_id;
        const toAwakenNodeIds = body.mana_node_multiplied_id_list;
        const targetAwakeLevel = body.awake_level;
        console.log(`[MANA] awake_mana_node: viewer=${viewerId} char=${characterId} nodes=${JSON.stringify(toAwakenNodeIds)} level=${targetAwakeLevel}`);
        if (!viewerId || isNaN(viewerId) || !characterId || isNaN(characterId) || !toAwakenNodeIds || !targetAwakeLevel)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const sess = yield (0, character_helpers_1.validateSessionAndPlayer)(viewerId, reply);
        if (!sess)
            return;
        const { playerId, player } = sess;
        const characterData = (0, character_helpers_1.validateCharacterOwnership)(playerId, characterId, reply);
        if (!characterData)
            return;
        // Compute costs for each awakening node
        let manaCost = 0;
        const itemsCosts = {};
        const userCharacterManaNodeListItem = [];
        const awakeLevels = (0, character_1.getPlayerCharactersManaNodeAwakeLevelsSync)(playerId);
        const charAwakeLevels = (_b = awakeLevels[String(characterId)]) !== null && _b !== void 0 ? _b : {};
        // Cache character rarity outside the loop
        const charAssetData = (0, assets_1.getCharacterDataSync)(characterId);
        if (charAssetData === null)
            return reply.status(400).send({
                "error": "Bad Request", "message": `Character asset data not found for ID ${characterId}.`
            });
        const rarity = charAssetData.rarity;
        for (const manaNodeId of toAwakenNodeIds) {
            if (!(0, character_1.hasPlayerUnlockedCharacterManaNodeSync)(playerId, characterId, manaNodeId))
                return reply.status(400).send({
                    "error": "Bad Request", "message": `Mana node '${manaNodeId}' is not unlocked.`
                });
            const currentAwakeLevel = (_c = charAwakeLevels[manaNodeId]) !== null && _c !== void 0 ? _c : 0;
            if (currentAwakeLevel >= targetAwakeLevel) {
                userCharacterManaNodeListItem.push({ "multiplied_id": manaNodeId, "awake_level": currentAwakeLevel });
                continue;
            }
            const cost = (0, assets_1.getManaNodeAwakeCost)(characterId, manaNodeId, rarity);
            if (cost === null)
                return reply.status(400).send({
                    "error": "Bad Request", "message": `No awake cost found for node '${manaNodeId}' (rarity=${rarity}).`
                });
            manaCost += cost.manaAmount;
            for (const [itemId, itemCost] of Object.entries(cost.items)) {
                itemsCosts[itemId] = ((_d = itemsCosts[itemId]) !== null && _d !== void 0 ? _d : 0) + itemCost;
            }
            userCharacterManaNodeListItem.push({ "multiplied_id": manaNodeId, "awake_level": targetAwakeLevel });
        }
        // All nodes already at target — return current state
        if (manaCost === 0) {
            console.log(`[MANA] awake_mana_node: all nodes at level ${targetAwakeLevel}, returning current state`);
            return (0, character_helpers_1.sendCharacterResponse)(reply, viewerId, {
                user_info: { free_mana: player.freeMana, paid_mana: player.paidMana },
                character_list: [(0, character_helpers_1.buildCharacterListEntry)(characterId, characterData, {
                        mana_board_awake: { "1": targetAwakeLevel },
                        bond_token_list: (characterData.bondTokenList || []).map((e) => ({ mana_board_index: e.manaBoardIndex, status: e.status })),
                    })],
                user_character_mana_node_list: { [String(characterId)]: userCharacterManaNodeListItem },
                item_list: {},
                evolution: [],
                mail_arrived: false,
            });
        }
        // Deduct mana
        const manaResult = (0, character_helpers_1.computeManaDeduction)(player, manaCost);
        if (!manaResult)
            return reply.status(400).send({ "error": "Bad Request", "message": "Not enough mana." });
        const { newFreeMana, newPaidMana } = manaResult;
        // Deduct items
        const itemResult = (0, character_helpers_1.computeItemDeductions)(playerId, itemsCosts, reply);
        if (!itemResult)
            return;
        const newItemAmounts = itemResult;
        // Apply deductions
        (0, player_1.updatePlayerSync)({ id: playerId, freeMana: newFreeMana, paidMana: newPaidMana });
        for (const [itemId, newAmount] of Object.entries(newItemAmounts)) {
            (0, item_1.updatePlayerItemSync)(playerId, itemId, newAmount);
        }
        // Update awake_level for each newly-awakened node
        for (const item of userCharacterManaNodeListItem) {
            const nodeId = item.multiplied_id;
            const lvl = item.awake_level;
            if (lvl === targetAwakeLevel) {
                (0, character_1.updatePlayerCharacterManaNodeAwakeLevelSync)(playerId, characterId, nodeId, targetAwakeLevel);
            }
        }
        // Bond token + evolution check for board 1
        let characterEvolutionLevel = characterData.evolutionLevel;
        let evolutionData = [];
        let bondTokenList = [];
        const board1Nodes = (0, assets_1.getCharacterManaNodesSync)(characterId, 1);
        if (board1Nodes) {
            const totalBoardNodes = Object.keys(board1Nodes).length;
            const learnedNodes = (0, character_1.getPlayerCharacterManaNodesSync)(playerId, characterId);
            const board1NodeIds = Object.keys(board1Nodes).map(Number);
            const board1Learned = learnedNodes.filter(id => board1NodeIds.includes(id));
            const isBoardComplete = board1Learned.length === totalBoardNodes;
            const bond = (0, character_helpers_1.computeBondTokenAndEvolution)(playerId, characterId, characterData, 1, isBoardComplete);
            characterEvolutionLevel = bond.characterEvolutionLevel;
            evolutionData = bond.evolutionData;
            bondTokenList = bond.bondTokenList;
        }
        console.log(`[MANA] awake_mana_node done: manaCost=${manaCost} nodes=${toAwakenNodeIds.length} boardComplete=${!!bondTokenList.length}`);
        return (0, character_helpers_1.sendCharacterResponse)(reply, viewerId, {
            user_info: { free_mana: newFreeMana, paid_mana: newPaidMana },
            character_list: [(0, character_helpers_1.buildCharacterListEntry)(characterId, characterData, {
                    mana_board_awake: { "1": targetAwakeLevel },
                    evolution_level: characterEvolutionLevel,
                    evolution_img_level: characterEvolutionLevel,
                    bond_token_list: bondTokenList,
                })],
            user_character_mana_node_list: { [String(characterId)]: userCharacterManaNodeListItem },
            item_list: newItemAmounts,
            evolution: evolutionData,
            mail_arrived: false,
        });
    }));
});
exports.default = routes;

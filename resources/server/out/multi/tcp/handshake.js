"use strict";
// Multi battle TCP session handshake
// Protocol: JSON messages delimited by null byte (\0)
// Post-handshake messages use typepacker format with useEnumIndex=true:
//   [index, param1, param2, ...]
//
// HandshakeResult: Accept=0, Denied=1, Reconnect=2, Exception=3, Complete=4
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
exports.handleHandshake = exports.buildRealParty = void 0;
const session_1 = require("../../data/domains/session");
const account_1 = require("../../data/domains/account");
const player_1 = require("../../data/domains/player");
const party_1 = require("../../data/domains/party");
const character_1 = require("../../data/domains/character");
const equipment_1 = require("../../data/domains/equipment");
const types_1 = require("../../data/types");
const SessionManager_1 = require("../state/SessionManager");
const types_2 = require("../types");
const playerRankTable = require("../../../assets/cdndata/player_rank.json");
function getRankLevel(rankPoint) {
    let level = 1;
    for (const [lvl, data] of Object.entries(playerRankTable)) {
        const threshold = parseInt(data[0][1]);
        if (rankPoint >= threshold)
            level = parseInt(lvl);
    }
    return level;
}
function buildRealParty(playerId, targetParty) {
    var _a, _b, _c, _d;
    const emptyChar = [1];
    const filledChars = [];
    const filledUnison = [];
    const filledEquips = [];
    const filledSouls = [];
    // Search for an NPC-named party across NORMAL and EVENT categories
    let selectedParty = targetParty !== null && targetParty !== void 0 ? targetParty : null;
    if (!selectedParty) {
        for (const category of [types_1.PartyCategory.NORMAL, types_1.PartyCategory.EVENT]) {
            const groups = (0, party_1.getPlayerPartyGroupListSync)(playerId, category);
            for (const g of Object.values(groups)) {
                for (const party of Object.values(g.list)) {
                    if (party.name && party.name.includes("NPC")) {
                        selectedParty = party;
                        break;
                    }
                }
                if (selectedParty)
                    break;
            }
            if (selectedParty)
                break;
        }
    }
    for (let i = 0; i < 3; i++) {
        const charId = (_a = selectedParty === null || selectedParty === void 0 ? void 0 : selectedParty.characterIds[i]) !== null && _a !== void 0 ? _a : null;
        if (!charId) {
            filledChars.push([1]);
            filledUnison.push([1]);
        }
        else {
            const dbChar = (0, character_1.getPlayerCharacterSync)(playerId, charId);
            if (!dbChar) {
                filledChars.push([1]);
                filledUnison.push([1]);
            }
            else {
                const rawManaNodes = (0, character_1.getPlayerCharacterManaNodesSync)(playerId, charId);
                const manaNodeMap = {};
                for (const id of rawManaNodes)
                    manaNodeMap[String(id)] = 0;
                let exBoost = [1];
                if (dbChar.exBoost && dbChar.exBoost.abilityIdList && dbChar.exBoost.abilityIdList.length > 0) {
                    exBoost = [0, { ability_id_list: dbChar.exBoost.abilityIdList, status_id: dbChar.exBoost.statusId }];
                }
                const charObj = {
                    id: charId,
                    evolution_level: dbChar.evolutionLevel,
                    exp: dbChar.exp,
                    over_limit_step: dbChar.overLimitStep,
                    mana_node_ids: manaNodeMap,
                    ex_boost: exBoost,
                    illustration_settings: [1],
                };
                filledChars.push([0, charObj]);
            }
            const unisonId = (_b = selectedParty === null || selectedParty === void 0 ? void 0 : selectedParty.unisonCharacterIds[i]) !== null && _b !== void 0 ? _b : null;
            if (!unisonId) {
                filledUnison.push([1]);
            }
            else {
                const dbUnison = (0, character_1.getPlayerCharacterSync)(playerId, unisonId);
                if (!dbUnison) {
                    filledUnison.push([1]);
                }
                else {
                    const rawNodes = (0, character_1.getPlayerCharacterManaNodesSync)(playerId, unisonId);
                    const nodeMap = {};
                    for (const id of rawNodes)
                        nodeMap[String(id)] = 0;
                    let ubEx = [1];
                    if (dbUnison.exBoost && dbUnison.exBoost.abilityIdList && dbUnison.exBoost.abilityIdList.length > 0) {
                        ubEx = [0, { ability_id_list: dbUnison.exBoost.abilityIdList, status_id: dbUnison.exBoost.statusId }];
                    }
                    filledUnison.push([0, {
                            id: unisonId,
                            evolution_level: dbUnison.evolutionLevel,
                            exp: dbUnison.exp,
                            over_limit_step: dbUnison.overLimitStep,
                            mana_node_ids: nodeMap,
                            ex_boost: ubEx,
                            illustration_settings: [1],
                        }]);
                }
            }
        }
        const equipId = (_c = selectedParty === null || selectedParty === void 0 ? void 0 : selectedParty.equipmentIds[i]) !== null && _c !== void 0 ? _c : null;
        if (!equipId) {
            filledEquips.push([1]);
        }
        else {
            const dbEquip = (0, equipment_1.getPlayerEquipmentSync)(playerId, equipId);
            if (!dbEquip) {
                filledEquips.push([1]);
            }
            else {
                filledEquips.push([0, { equipmentId: equipId, level: dbEquip.level, enhancementLevel: dbEquip.enhancementLevel }]);
            }
        }
        const soulId = (_d = selectedParty === null || selectedParty === void 0 ? void 0 : selectedParty.abilitySoulIds[i]) !== null && _d !== void 0 ? _d : null;
        filledSouls.push(soulId ? [0, soulId] : [1]);
    }
    return {
        characters: filledChars,
        unison_characters: filledUnison,
        equipments: filledEquips,
        abilitySoulIds: filledSouls,
    };
}
exports.buildRealParty = buildRealParty;
function handleHandshake(socket, data) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`[TCP] handshake:`, JSON.stringify(data).substring(0, 200));
        const socklet = data.socklet;
        const roomNumber = data.room_number || data.roomNumber;
        if (socklet === "cooperation_battle") {
            const connectionId = data.connection_id || data.connectionId || `${socket.remoteAddress}:${socket.remotePort}`;
            if (!roomNumber) {
                SessionManager_1.sessionManager.sendJson(socket, [3, "HANDSHAKE_DENIED"]);
                socket.end();
                return;
            }
            const battleClient = SessionManager_1.sessionManager.createClient(socket, 0, String(roomNumber), String(connectionId), null);
            battleClient.isBattle = true;
            SessionManager_1.sessionManager.addBattleClient(String(connectionId), battleClient);
            SessionManager_1.sessionManager.sendJson(socket, [0, roomNumber, ""]);
            return;
        }
        if (socklet === "cooperation_room") {
            const viewerId = data.viewerId;
            if (!viewerId || !roomNumber) {
                SessionManager_1.sessionManager.sendJson(socket, [3, "HANDSHAKE_DENIED"]);
                socket.end();
                return;
            }
            const session = yield (0, session_1.getSession)(String(viewerId));
            if (!session) {
                SessionManager_1.sessionManager.sendJson(socket, [3, "HANDSHAKE_DENIED"]);
                socket.end();
                return;
            }
            const playerIds = yield (0, account_1.getAccountPlayers)(session.accountId);
            if (!playerIds || playerIds.length === 0 || isNaN(playerIds[0])) {
                SessionManager_1.sessionManager.sendJson(socket, [3, "HANDSHAKE_DENIED"]);
                socket.end();
                return;
            }
            const player = (0, player_1.getPlayerSync)(playerIds[0]);
            if (!player) {
                SessionManager_1.sessionManager.sendJson(socket, [3, "HANDSHAKE_DENIED"]);
                socket.end();
                return;
            }
            const playerId = playerIds[0];
            const connectionId = data.connection_id || data.connectionId || `${socket.remoteAddress}:${socket.remotePort}`;
            const client = SessionManager_1.sessionManager.createClient(socket, Number(viewerId), String(roomNumber), String(connectionId), playerId);
            client.clientState.tryTransition(types_2.ClientState.Handshaking);
            const party = buildRealParty(playerId);
            const yourSelf = {
                viewerId: Number(viewerId),
                playerId: playerId,
                name: player.name,
                rank: getRankLevel(player.rankPoint || 0),
                degreeId: player.degreeId || 1,
                mainCharacterId: player.leaderCharacterId,
                party,
                connectionId,
                playerRoleKind: player.role || 1,
                isNewbie: !!player.tutorialStep,
                isHost: true,
                entryTime: Date.now(),
                currentPartyId: player.partySlot || 1,
                autoplayMode: false,
                autoskillMode: 1,
                autoSpeedLevel: 1,
                autoStart: false,
                skillAbilityBehaviorMode: 1,
                dashBehaviorMode: 1,
                allowHealFromOtherPlayers: true,
                state: [0],
            };
            client.yourself = yourSelf;
            SessionManager_1.sessionManager.addClientToRoom(client);
            SessionManager_1.sessionManager.sendJson(socket, [0, connectionId, roomNumber]);
            return;
        }
        // Unknown socklet
        SessionManager_1.sessionManager.sendJson(socket, [1, "DENIED"]);
        socket.end();
    });
}
exports.handleHandshake = handleHandshake;

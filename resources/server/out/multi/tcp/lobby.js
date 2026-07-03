"use strict";
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
exports.handleMessage = exports.notifyRoomDisbanded = exports.checkHostAutoReady = void 0;
const SessionManager_1 = require("../state/SessionManager");
const manager_1 = require("../room/manager");
const controller_1 = require("../npc/controller");
const handshake_1 = require("./handshake");
const types_1 = require("../../data/types");
const party_1 = require("../../data/domains/party");
const NPC_JOIN_DELAY_MS = parseInt(process.env.NPC_JOIN_DELAY_MS || "2000");
const NPC_READY_DELAY_MS = parseInt(process.env.NPC_READY_DELAY_MS || "500");
function findClientBySocket(socket) {
    const clientsMap = SessionManager_1.sessionManager.clients;
    if (!clientsMap)
        return undefined;
    for (const client of clientsMap.values()) {
        if (client.socket === socket)
            return client;
    }
    return undefined;
}
function findHostClient(roomNumber) {
    const room = (0, manager_1.getRoom)(roomNumber);
    if (!room)
        return undefined;
    const clientsMap = SessionManager_1.sessionManager.clients;
    if (!clientsMap)
        return undefined;
    for (const client of clientsMap.values()) {
        if (client.viewerId === room.host_viewer_id && client.roomNumber === roomNumber && !client.isBattle) {
            return client;
        }
    }
    return undefined;
}
function countRealPlayers(mates) {
    return mates.filter(m => !m.comId).length; // real player has no comId
}
function checkHostAutoReady(roomNumber) {
    var _a, _b;
    const room = (0, manager_1.getRoom)(roomNumber);
    if (!room)
        return;
    const hostClient = findHostClient(roomNumber);
    if (!hostClient)
        return;
    const hostMate = hostClient.mates.find(m => m.viewerId === hostClient.viewerId);
    if (!hostMate)
        return;
    const nonHostReady = hostClient.mates.every(m => { var _a; return m.viewerId === hostClient.viewerId || ((_a = m.state) === null || _a === void 0 ? void 0 : _a[0]) === 1; });
    if (nonHostReady && hostClient.mates.length > 1) {
        if (((_a = hostMate.state) === null || _a === void 0 ? void 0 : _a[0]) !== 1) {
            hostMate.state = [1];
            SessionManager_1.sessionManager.broadcastToRoom(roomNumber, [1, [2, hostMate.connectionId, [1]]]);
            console.log(`[LOBBY] host auto-ready: room=${roomNumber}`);
        }
    }
    else {
        if (((_b = hostMate.state) === null || _b === void 0 ? void 0 : _b[0]) === 1) {
            hostMate.state = [0];
            SessionManager_1.sessionManager.broadcastToRoom(roomNumber, [1, [2, hostMate.connectionId, [0]]]);
            console.log(`[LOBBY] host auto-ready cancelled: room=${roomNumber}`);
        }
    }
    checkAllReadyAndStart(roomNumber);
}
exports.checkHostAutoReady = checkHostAutoReady;
const autoStartingRooms = new Set();
function checkAllReadyAndStart(roomNumber) {
    if (autoStartingRooms.has(roomNumber))
        return;
    const hostClient = findHostClient(roomNumber);
    if (!hostClient)
        return;
    const room = (0, manager_1.getRoom)(roomNumber);
    if (!room)
        return;
    // Guard: wait for all expected real players to return on rematch
    if (room.npc_count > 0) {
        const realPlayers = countRealPlayers(hostClient.mates);
        const expectedReal = 3 - room.npc_count;
        if (realPlayers < expectedReal)
            return;
    }
    if (hostClient.mates.length < 3)
        return;
    const allReady = hostClient.mates.every(m => { var _a; return ((_a = m.state) === null || _a === void 0 ? void 0 : _a[0]) === 1; });
    if (!allReady)
        return;
    autoStartingRooms.add(roomNumber);
    console.log(`[LOBBY] all ready — StartRemainingTime float: room=${roomNumber}`);
    SessionManager_1.sessionManager.broadcastToRoom(roomNumber, [1, [10, 2]]);
}
function notifyRoomDisbanded(roomNumber) {
    SessionManager_1.sessionManager.broadcastToRoom(roomNumber, [1, [6, "multibattle_room_dismissed"]]);
}
exports.notifyRoomDisbanded = notifyRoomDisbanded;
function handleEnterComs(client, coms) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const room = (0, manager_1.getRoom)(client.roomNumber);
        if (!room)
            return;
        room.is_npc_mode = true;
        const hostMate = (_a = client.yourself) !== null && _a !== void 0 ? _a : client.mates[0];
        if (!hostMate)
            return;
        // Merge all connected (but not yet entered) real players into client.mates
        const connectedClients = SessionManager_1.sessionManager.getClientsInRoom(client.roomNumber);
        for (const c of connectedClients) {
            if (c.yourself && !client.mates.find(m => m.viewerId === c.viewerId)) {
                client.mates.push(c.yourself);
            }
        }
        const realMates = client.mates.filter(m => !m.comId);
        // Determine NPC count: first recruit → calculate and store; rematch → restore fixed count
        let needNPCs;
        if (room.npc_count <= 0) {
            needNPCs = 3 - realMates.length;
            room.npc_count = needNPCs; // persist for rematch
        }
        else {
            needNPCs = room.npc_count;
        }
        if (needNPCs <= 0) {
            console.log(`[LOBBY] EnterComs: room full (${realMates.length} players), skip NPCs`);
            return;
        }
        const npcProvider = new controller_1.NpcMateProvider();
        const recruitResult = yield npcProvider.onRecruit(client.roomNumber, String((_b = room === null || room === void 0 ? void 0 : room.host_viewer_id) !== null && _b !== void 0 ? _b : 0));
        // Fetch NPC party data from player's DB (uses real equipment/character IDs)
        const npcParties = [];
        if (client.playerId) {
            try {
                for (const category of [types_1.PartyCategory.NORMAL, types_1.PartyCategory.EVENT]) {
                    const groups = (0, party_1.getPlayerPartyGroupListSync)(client.playerId, category);
                    for (const g of Object.values(groups)) {
                        for (const party of Object.values(g.list)) {
                            if (party.name && party.name.includes("NPC")) {
                                npcParties.push((0, handshake_1.buildRealParty)(client.playerId, party));
                            }
                        }
                    }
                }
            }
            catch (e) { }
        }
        const npcMates = [];
        for (let i = 0; i < needNPCs; i++) {
            const recruited = (_c = recruitResult.recruitedMates[i]) !== null && _c !== void 0 ? _c : null;
            const comId = (_d = recruited === null || recruited === void 0 ? void 0 : recruited.com_id) !== null && _d !== void 0 ? _d : (i + 1);
            const viewerId = (_e = recruited === null || recruited === void 0 ? void 0 : recruited.viewer_id) !== null && _e !== void 0 ? _e : (900000000 + i + 1);
            const party = (_g = (_f = npcParties[i]) !== null && _f !== void 0 ? _f : npcParties[0]) !== null && _g !== void 0 ? _g : hostMate.party;
            npcMates.push({
                viewerId: viewerId,
                comId: comId,
                name: (_j = (_h = coms[i]) === null || _h === void 0 ? void 0 : _h.name) !== null && _j !== void 0 ? _j : `NPC${comId}`,
                rank: hostMate.rank,
                degreeId: hostMate.degreeId,
                playerRoleKind: 99,
                party,
                connectionId: `${client.roomNumber}-npc-${comId}`,
                autoplayMode: false,
                autoskillMode: 1,
                autoSpeedLevel: 1,
                autoStart: false,
                skillAbilityBehaviorMode: 1,
                dashBehaviorMode: 1,
                allowHealFromOtherPlayers: true,
                state: [0],
                entryTime: Date.now(),
                isNewbie: false,
                isHost: false,
            });
        }
        client.mates = [...realMates, ...npcMates];
        const hostClient = findHostClient(client.roomNumber);
        if (hostClient)
            hostClient.mates = client.mates;
        if (room) {
            room.mates = client.mates.map(m => { var _a, _b; return ({ viewer_id: (_a = m.viewerId) !== null && _a !== void 0 ? _a : null, com_id: (_b = m.comId) !== null && _b !== void 0 ? _b : 0 }); });
        }
        console.log(`[LOBBY] EnterComs: room=${client.roomNumber} real=${realMates.length} npc=${npcMates.length} total=${client.mates.length}`);
        setTimeout(() => {
            try {
                // Send Mates only to triggering client — others get theirs via handleEnter
                SessionManager_1.sessionManager.sendJson(client.socket, [1, [1, client.mates]]);
            }
            catch (e) {
                console.error("[LOBBY] EnterComs send-mates error", e);
            }
        }, NPC_JOIN_DELAY_MS);
        setTimeout(() => {
            try {
                for (const npc of npcMates) {
                    npc.state = [1];
                    SessionManager_1.sessionManager.broadcastToRoom(client.roomNumber, [1, [2, npc.connectionId, [1]]]);
                }
                if (realMates.length === 1)
                    checkHostAutoReady(client.roomNumber);
            }
            catch (e) {
                console.error("[LOBBY] EnterComs npc-ready error", e);
            }
        }, NPC_JOIN_DELAY_MS + NPC_READY_DELAY_MS);
    });
}
function handleEnter(_socket, client, data) {
    var _a, _b, _c;
    const ed = data[1];
    if (!(ed === null || ed === void 0 ? void 0 : ed.party) || !client.yourself)
        return;
    client.yourself.party = ed.party;
    if (ed.autoplayMode !== undefined)
        client.yourself.autoplayMode = ed.autoplayMode;
    if (ed.autoskillMode !== undefined)
        client.yourself.autoskillMode = ed.autoskillMode;
    if (ed.autoSpeedLevel !== undefined)
        client.yourself.autoSpeedLevel = ed.autoSpeedLevel;
    if (ed.autoStart !== undefined)
        client.yourself.autoStart = ed.autoStart;
    if (ed.skillAbilityBehaviorMode !== undefined)
        client.yourself.skillAbilityBehaviorMode = ed.skillAbilityBehaviorMode;
    if (ed.dashBehaviorMode !== undefined)
        client.yourself.dashBehaviorMode = ed.dashBehaviorMode;
    if (ed.allowHealFromOtherPlayers !== undefined)
        client.yourself.allowHealFromOtherPlayers = ed.allowHealFromOtherPlayers;
    client.enterData = ed;
    const room = (0, manager_1.getRoom)(client.roomNumber);
    const isHost = room && client.viewerId === room.host_viewer_id;
    if (isHost) {
        (0, manager_1.updateRoomState)(client.roomNumber, 1);
    }
    const hostClient = findHostClient(client.roomNumber);
    // Guest entered before host (or host connected but hasn't entered) → wait with Welcome
    if (!isHost && (!hostClient || !hostClient.mates[0])) {
        client.mates = [client.yourself];
        SessionManager_1.sessionManager.sendJson(client.socket, [1, [0, client.yourself, [client.yourself]]]);
        console.log(`[LOBBY] guest ${client.viewerId} entered alone, waiting for host in room ${client.roomNumber}`);
        return;
    }
    if (isHost) {
        client.mates = [client.yourself];
        const set = (_b = (_a = SessionManager_1.sessionManager.roomClients) === null || _a === void 0 ? void 0 : _a.get) === null || _b === void 0 ? void 0 : _b.call(_a, client.roomNumber);
        if (set) {
            const clientsMap = SessionManager_1.sessionManager.clients;
            if (clientsMap) {
                for (const addr of set) {
                    const c = clientsMap.get(addr);
                    if (c && c !== client && !c.isBattle && c.mates[0]) {
                        const gm = c.mates.find((m) => m.viewerId === c.viewerId);
                        if (gm)
                            client.mates.push(gm);
                    }
                }
            }
        }
        if (room)
            room.mates = client.mates.map(m => { var _a, _b; return ({ viewer_id: (_a = m.viewerId) !== null && _a !== void 0 ? _a : null, com_id: (_b = m.comId) !== null && _b !== void 0 ? _b : 0 }); });
        if (client.mates.length > 1) {
            SessionManager_1.sessionManager.broadcastToRoom(client.roomNumber, [1, [1, client.mates]], `${client.viewerId}@${client.roomNumber}`);
        }
        if (room && room.npc_count > 0 && countRealPlayers(client.mates) < 3) {
            setTimeout(() => { handleEnterComs(client, [{ name: "开心超人" }, { name: "名字真难取" }]).catch(e => console.error("[LOBBY] EnterComs (timer) error", e)); }, 500);
        }
    }
    else {
        if (hostClient && client.yourself) {
            hostClient.mates.push(client.yourself);
            while (hostClient.mates.length > 3) {
                const npcIdx = hostClient.mates.findIndex(m => !!m.comId);
                if (npcIdx >= 0)
                    hostClient.mates.splice(npcIdx, 1);
                else
                    break;
            }
            client.mates = [...hostClient.mates];
        }
        else {
            client.mates = [client.yourself];
        }
        if (room)
            room.mates = client.mates.map(m => { var _a, _b; return ({ viewer_id: (_a = m.viewerId) !== null && _a !== void 0 ? _a : null, com_id: (_b = m.comId) !== null && _b !== void 0 ? _b : 0 }); });
    }
    const yourself = client.yourself;
    if (yourself) {
        SessionManager_1.sessionManager.sendJson(client.socket, [1, [0, yourself, [yourself]]]);
    }
    if (!isHost) {
        const mates = (_c = hostClient === null || hostClient === void 0 ? void 0 : hostClient.mates) !== null && _c !== void 0 ? _c : client.mates;
        SessionManager_1.sessionManager.broadcastToRoom(client.roomNumber, [1, [1, mates]], undefined);
    }
    console.log(`[LOBBY] ${isHost ? "host" : "guest"} ${client.viewerId} entered room ${client.roomNumber}`);
}
function handleBye(_socket, client, _data) {
    var _a, _b;
    const set = (_b = (_a = SessionManager_1.sessionManager.roomClients) === null || _a === void 0 ? void 0 : _a.get) === null || _b === void 0 ? void 0 : _b.call(_a, client.roomNumber);
    if (set) {
        const clientsMap = SessionManager_1.sessionManager.clients;
        if (clientsMap) {
            for (const addr of set) {
                const c = clientsMap.get(addr);
                if (c && c !== client && !c.isBattle) {
                    c.mates = c.mates.filter(m => m.viewerId !== client.viewerId);
                }
            }
        }
    }
    const hostClient = findHostClient(client.roomNumber);
    SessionManager_1.sessionManager.removeClient(client);
    // Only refresh the mate list if the room still exists AND a *different* client is the host (i.e. a
    // guest left but the room lives on). If the room was disbanded (host left / went empty), the
    // [6, dismissed] broadcast already tore it down — pushing a stale/empty mate list here makes the
    // remaining client's refreshMates dereference undefined character-display data and crash (F1010).
    if ((0, manager_1.getRoom)(client.roomNumber) && hostClient && hostClient !== client) {
        SessionManager_1.sessionManager.broadcastToRoom(client.roomNumber, [1, [1, hostClient.mates]]);
    }
    try {
        client.socket.destroy();
    }
    catch (e) { }
    console.log(`[LOBBY] client ${client.viewerId} left room ${client.roomNumber}`);
}
function handleChangeParty(_socket, client, data) {
    var _a;
    const pd = data[1];
    if ((pd === null || pd === void 0 ? void 0 : pd.party) && client.yourself) {
        client.yourself.party = pd.party;
        if (pd.currentPartyId !== undefined) {
            client.yourself.currentPartyId = pd.currentPartyId;
        }
    }
    const mate = client.mates.find(m => m.viewerId === client.viewerId);
    if (mate) {
        if (client.playerId && pd.currentPartyId !== undefined) {
            try {
                const up = require("../../data/domains/player").updatePlayerSync;
                up({ id: client.playerId, partySlot: pd.currentPartyId });
            }
            catch (e) { }
        }
        const room = (0, manager_1.getRoom)(client.roomNumber);
        if (room) {
            room.host_party_id = pd.currentPartyId;
        }
        const hostClient = findHostClient(client.roomNumber);
        SessionManager_1.sessionManager.broadcastToRoom(client.roomNumber, [1, [1, (_a = hostClient === null || hostClient === void 0 ? void 0 : hostClient.mates) !== null && _a !== void 0 ? _a : client.mates]]);
    }
    console.log(`[LOBBY] client ${client.viewerId} changed party`);
}
function handleReady(_socket, client, data) {
    var _a;
    const readyState = Array.isArray(data[1]) ? data[1][0] : data[1];
    client.isReady = readyState === 1;
    const mate = client.mates.find(m => m.viewerId === client.viewerId);
    if (mate) {
        mate.state = (_a = data[1]) !== null && _a !== void 0 ? _a : [1];
        SessionManager_1.sessionManager.broadcastToRoom(client.roomNumber, [1, [2, mate.connectionId, mate.state]]);
    }
    checkHostAutoReady(client.roomNumber);
    console.log(`[LOBBY] client ${client.viewerId} ready: ${client.isReady}`);
}
function handleHeartbeat(socket, client, _data) {
    SessionManager_1.sessionManager.sendJson(socket, [1, [11, client.connectionId]]);
}
function handleStartBattle(_socket, client, _data) {
    var _a, _b;
    if ((_b = (_a = SessionManager_1.sessionManager.battleExpectedCount) === null || _a === void 0 ? void 0 : _a.has) === null || _b === void 0 ? void 0 : _b.call(_a, client.roomNumber))
        return;
    const expectedCount = countRealPlayers(client.mates);
    SessionManager_1.sessionManager.setBattleExpectedCount(client.roomNumber, expectedCount);
    (0, manager_1.updateRoomState)(client.roomNumber, 4);
    autoStartingRooms.delete(client.roomNumber);
    const members = [...client.mates];
    SessionManager_1.sessionManager.broadcastToRoom(client.roomNumber, [1, [5, members]]);
    console.log(`[LOBBY] StartBattle: room=${client.roomNumber} mates=${client.mates.length} expected=${expectedCount}`);
}
function handleNotify(socket, client, data) {
    const notifyData = data[1];
    if (!Array.isArray(notifyData))
        return;
    const tag = notifyData[0];
    switch (tag) {
        case 0:
            handleEnter(socket, client, notifyData);
            break;
        case 1:
            handleBye(socket, client, notifyData);
            break;
        case 2:
            handleChangeParty(socket, client, notifyData);
            break;
        case 3:
            handleReady(socket, client, notifyData);
            break;
        case 4:
            handleHeartbeat(socket, client, notifyData);
            break;
        case 6:
            handleStartBattle(socket, client, notifyData);
            break;
        case 10:
            handleEnterComs(client, notifyData[1]).catch(e => console.error("[LOBBY] EnterComs error", e));
            break;
        default:
            console.log(`[LOBBY] unhandled Notify: ${tag}`);
    }
}
function handleBroadcast(_socket, client, data) {
    SessionManager_1.sessionManager.broadcastToRoom(client.roomNumber, data);
}
function handleSend(_socket, _client, data) {
    const targetViewerId = data[1];
    const roomNumber = _client.roomNumber;
    const clientsMap = SessionManager_1.sessionManager.clients;
    if (!clientsMap)
        return;
    for (const c of clientsMap.values()) {
        if (c.viewerId === targetViewerId && c.roomNumber === roomNumber) {
            SessionManager_1.sessionManager.sendJson(c.socket, data);
            return;
        }
    }
}
function handleMessage(socket, data) {
    if (!Array.isArray(data))
        return;
    const tag = data[0];
    const client = findClientBySocket(socket);
    if (!client) {
        console.log(`[LOBBY] no client found for socket, dropping message tag=${tag}`);
        return;
    }
    switch (tag) {
        case 0:
            handleNotify(socket, client, data);
            break;
        case 1:
            handleBroadcast(socket, client, data);
            break;
        case 2:
            handleSend(socket, client, data);
            break;
        default:
            console.log(`[LOBBY] unhandled Client2Server: ${tag}`);
    }
}
exports.handleMessage = handleMessage;

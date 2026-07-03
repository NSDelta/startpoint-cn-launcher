"use strict";
// Multi battle session manager
// Atomic indexing of room clients, battle clients and per-room state machines.
// Protocol arrays follow typepacker useEnumIndex=true format (see sessionServer.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionManager = exports.SessionManager = void 0;
const types_1 = require("../types");
const RoomStateMachine_1 = require("./RoomStateMachine");
const ClientStateMachine_1 = require("./ClientStateMachine");
class SessionManager {
    constructor() {
        this.clients = new Map();
        this.roomClients = new Map();
        this.battleClients = new Map();
        this.cidToBattleClient = new Map();
        this.sceneReadyClients = new Map();
        this.battleExpectedCount = new Map();
        this.roomStates = new Map();
    }
    addr(viewerId, roomNumber) {
        return `${viewerId}@${roomNumber}`;
    }
    createClient(socket, viewerId, roomNumber, connectionId, playerId) {
        return {
            socket,
            viewerId,
            roomNumber,
            connectionId,
            playerId,
            isBattle: false,
            isReady: false,
            buffer: "",
            mates: [],
            enterData: null,
            clientState: new ClientStateMachine_1.ClientStateMachine(types_1.ClientState.Connecting),
            battleState: types_1.BattleState.Initializing,
        };
    }
    getClient(viewerId, roomNumber) {
        return this.clients.get(this.addr(viewerId, roomNumber));
    }
    addClientToRoom(client) {
        const addr = this.addr(client.viewerId, client.roomNumber);
        this.clients.set(addr, client);
        let set = this.roomClients.get(client.roomNumber);
        if (!set) {
            set = new Set();
            this.roomClients.set(client.roomNumber, set);
        }
        set.add(addr);
        return { ok: true, value: undefined };
    }
    removeClient(client) {
        var _a, _b;
        const addr = this.addr(client.viewerId, client.roomNumber);
        this.clients.delete(addr);
        if (client.isBattle) {
            const bSet = this.battleClients.get(client.roomNumber);
            if (bSet) {
                for (const cid of bSet) {
                    if (cid !== client.connectionId) {
                        const c = this.cidToBattleClient.get(cid);
                        if (c)
                            this.sendJson(c.socket, [1, [0, client.connectionId]]); // BattleServerMessage.Leave(connectionId)
                    }
                }
            }
            (_a = this.battleClients.get(client.roomNumber)) === null || _a === void 0 ? void 0 : _a.delete(client.connectionId);
            this.cidToBattleClient.delete(client.connectionId);
            (_b = this.sceneReadyClients.get(client.roomNumber)) === null || _b === void 0 ? void 0 : _b.delete(client.connectionId);
            const exp = this.battleExpectedCount.get(client.roomNumber);
            if (exp && exp > 1)
                this.battleExpectedCount.set(client.roomNumber, exp - 1);
        }
        const set = this.roomClients.get(client.roomNumber);
        if (set) {
            set.delete(addr);
            if (set.size === 0) {
                this.roomClients.delete(client.roomNumber);
                // OLD: auto-disband empty non-battle rooms
                // But check if battle clients still exist first
                const bSet = this.battleClients.get(client.roomNumber);
                if (!bSet || bSet.size === 0) {
                    if (!client.isBattle) {
                        const { getRoom, disbandRoom } = require("../room/manager");
                        const room = getRoom(client.roomNumber);
                        if (room && room.raising_state !== 4) {
                            this.broadcastToRoom(client.roomNumber, [1, [6, "multibattle_room_dismissed"]]);
                            disbandRoom(client.roomNumber);
                        }
                    }
                }
            }
            else {
                // OLD: if room still has clients, re-evaluate host auto-ready
                if (!client.isBattle) {
                    try {
                        const lobby = require("../tcp/lobby");
                        if (lobby.checkHostAutoReady)
                            lobby.checkHostAutoReady(client.roomNumber);
                    }
                    catch (e) { }
                }
            }
        }
        return { ok: true, value: undefined };
    }
    getClientsInRoom(roomNumber) {
        const set = this.roomClients.get(roomNumber);
        if (!set)
            return [];
        const out = [];
        for (const addr of set) {
            const c = this.clients.get(addr);
            if (c)
                out.push(c);
        }
        return out;
    }
    hasRoomClients(roomNumber) {
        const set = this.roomClients.get(roomNumber);
        return !!set && set.size > 0;
    }
    isHostOnline(hostViewerId, roomNumber) {
        const set = this.roomClients.get(roomNumber);
        if (!set)
            return false;
        for (const addr of set) {
            const c = this.clients.get(addr);
            if (c && !c.isBattle && c.viewerId === hostViewerId)
                return true;
        }
        return false;
    }
    addBattleClient(connectionId, client) {
        let set = this.battleClients.get(client.roomNumber);
        if (!set) {
            set = new Set();
            this.battleClients.set(client.roomNumber, set);
        }
        set.add(connectionId);
        this.cidToBattleClient.set(connectionId, client);
    }
    removeBattleClient(connectionId) {
        var _a, _b;
        const client = this.cidToBattleClient.get(connectionId);
        if (client) {
            (_a = this.battleClients.get(client.roomNumber)) === null || _a === void 0 ? void 0 : _a.delete(connectionId);
            (_b = this.sceneReadyClients.get(client.roomNumber)) === null || _b === void 0 ? void 0 : _b.delete(connectionId);
        }
        this.cidToBattleClient.delete(connectionId);
    }
    getBattleClient(connectionId) {
        return this.cidToBattleClient.get(connectionId);
    }
    markSceneReady(connectionId, roomNumber) {
        var _a, _b, _c;
        const expected = (_a = this.battleExpectedCount.get(roomNumber)) !== null && _a !== void 0 ? _a : 0;
        if (expected <= 0)
            return false;
        let readySet = this.sceneReadyClients.get(roomNumber);
        if (!readySet) {
            readySet = new Set();
            this.sceneReadyClients.set(roomNumber, readySet);
        }
        readySet.add(connectionId);
        const connected = (_c = (_b = this.battleClients.get(roomNumber)) === null || _b === void 0 ? void 0 : _b.size) !== null && _c !== void 0 ? _c : 0;
        if (readySet.size >= expected && readySet.size >= connected) {
            this.battleExpectedCount.set(roomNumber, 0);
            return true;
        }
        return false;
    }
    clearSceneReady(roomNumber) {
        this.sceneReadyClients.delete(roomNumber);
    }
    setBattleExpectedCount(roomNumber, count) {
        this.battleExpectedCount.set(roomNumber, count);
    }
    clearBattleExpectedCount(roomNumber) {
        this.battleExpectedCount.delete(roomNumber);
    }
    getRoomState(roomNumber) {
        let sm = this.roomStates.get(roomNumber);
        if (!sm) {
            sm = new RoomStateMachine_1.RoomStateMachine();
            this.roomStates.set(roomNumber, sm);
        }
        return sm;
    }
    removeRoomState(roomNumber) {
        this.roomStates.delete(roomNumber);
    }
    sendJson(socket, data) {
        if (!socket.writable)
            return;
        socket.write(JSON.stringify(data) + "\0");
    }
    broadcastToRoom(roomNumber, data, excludeAddr) {
        const set = this.roomClients.get(roomNumber);
        if (!set)
            return;
        for (const addr of set) {
            if (excludeAddr !== undefined && addr === excludeAddr)
                continue;
            const c = this.clients.get(addr);
            if (c)
                this.sendJson(c.socket, data);
        }
    }
    getRoomClientCount(roomNumber) {
        var _a, _b;
        return (_b = (_a = this.roomClients.get(roomNumber)) === null || _a === void 0 ? void 0 : _a.size) !== null && _b !== void 0 ? _b : 0;
    }
}
exports.SessionManager = SessionManager;
exports.sessionManager = new SessionManager();

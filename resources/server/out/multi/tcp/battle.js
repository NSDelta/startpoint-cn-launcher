"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleBattleMessage = void 0;
const SessionManager_1 = require("../state/SessionManager");
const relay_1 = require("./relay");
function findBattleClientBySocket(socket) {
    const map = SessionManager_1.sessionManager.cidToBattleClient;
    if (!map)
        return undefined;
    for (const client of map.values()) {
        if (client.socket === socket)
            return client;
    }
    return undefined;
}
function handleBattleNotify(socket, data) {
    var _a, _b, _c, _d;
    if (!Array.isArray(data))
        return;
    const tag = data[0];
    const client = findBattleClientBySocket(socket);
    switch (tag) {
        case 0: { // SceneReady
            if (!client)
                break;
            const allReady = SessionManager_1.sessionManager.markSceneReady(client.connectionId, client.roomNumber);
            if (allReady) {
                const bSet = (_b = (_a = SessionManager_1.sessionManager.battleClients) === null || _a === void 0 ? void 0 : _a.get) === null || _b === void 0 ? void 0 : _b.call(_a, client.roomNumber);
                if (bSet) {
                    for (const cid of bSet) {
                        const c = SessionManager_1.sessionManager.getBattleClient(cid);
                        if (c)
                            SessionManager_1.sessionManager.sendJson(c.socket, [1, [1]]);
                    }
                }
            }
            break;
        }
        case 1: { // Finalize
            if (client)
                SessionManager_1.sessionManager.sendJson(client.socket, [1, [2]]);
            break;
        }
        case 2: { // Measurement
            if (client) {
                const params = data[1];
                const frame = (_c = params === null || params === void 0 ? void 0 : params[0]) !== null && _c !== void 0 ? _c : 0;
                const clientTime = (_d = params === null || params === void 0 ? void 0 : params[1]) !== null && _d !== void 0 ? _d : 0;
                SessionManager_1.sessionManager.sendJson(client.socket, [1, [3, frame, clientTime, Date.now()]]);
            }
            break;
        }
        case 4: // Heartbeat
            if (client)
                SessionManager_1.sessionManager.sendJson(client.socket, [1, [3, 0, 0, Date.now()]]);
            break;
        default:
            break;
    }
}
function handleBattleMessage(socket, data) {
    if (!Array.isArray(data))
        return;
    const tag = data[0];
    switch (tag) {
        case 0: // Notify
            handleBattleNotify(socket, data[1]);
            break;
        case 1: { // Broadcast → relay as BattleServer2Client.Messages(2, senderId, array)
            const client = findBattleClientBySocket(socket);
            if (client) {
                const bcData = data[1];
                (0, relay_1.relayToBattleRoom)(String(client.roomNumber), String(client.connectionId), [2, client.connectionId, bcData]);
                SessionManager_1.sessionManager.sendJson(socket, [1, [3, 0, 0, Date.now()]]);
            }
            break;
        }
        case 2: { // Send → relay as BattleServer2Client.Send(3, senderId, message)
            const client = findBattleClientBySocket(socket);
            if (client) {
                const sendMsg = data[2];
                if (sendMsg) {
                    (0, relay_1.relayToBattleRoom)(String(client.roomNumber), String(client.connectionId), [3, client.connectionId, sendMsg]);
                }
                SessionManager_1.sessionManager.sendJson(socket, [1, [3, 0, 0, Date.now()]]);
            }
            break;
        }
        default:
            break;
    }
}
exports.handleBattleMessage = handleBattleMessage;

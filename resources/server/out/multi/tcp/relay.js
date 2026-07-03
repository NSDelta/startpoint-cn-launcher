"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relayToBattleRoom = void 0;
const SessionManager_1 = require("../state/SessionManager");
function relayToBattleRoom(roomNumber, sourceCid, data) {
    var _a, _b, _c, _d;
    const bSet = (_b = (_a = SessionManager_1.sessionManager.battleClients) === null || _a === void 0 ? void 0 : _a.get) === null || _b === void 0 ? void 0 : _b.call(_a, roomNumber);
    if (!bSet)
        return;
    for (const cid of bSet) {
        if (cid === sourceCid)
            continue;
        const client = (_d = (_c = SessionManager_1.sessionManager.cidToBattleClient) === null || _c === void 0 ? void 0 : _c.get) === null || _d === void 0 ? void 0 : _d.call(_c, cid);
        if (client)
            SessionManager_1.sessionManager.sendJson(client.socket, data);
    }
}
exports.relayToBattleRoom = relayToBattleRoom;

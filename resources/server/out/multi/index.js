"use strict";
// Barrel entry for multi battle / co-op system
// Re-exports for backward compatibility with cn-server.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearBattleExpectedCount = exports.isHostOnline = exports.hasRoomClients = exports.sessionManager = exports.stopSessionServer = exports.startSessionServer = exports.multiBattleRoutes = void 0;
var register_1 = require("./http/register");
Object.defineProperty(exports, "multiBattleRoutes", { enumerable: true, get: function () { return register_1.multiBattleRoutes; } });
var server_1 = require("./tcp/server");
Object.defineProperty(exports, "startSessionServer", { enumerable: true, get: function () { return server_1.startSessionServer; } });
Object.defineProperty(exports, "stopSessionServer", { enumerable: true, get: function () { return server_1.stopSessionServer; } });
var SessionManager_1 = require("./state/SessionManager");
Object.defineProperty(exports, "sessionManager", { enumerable: true, get: function () { return SessionManager_1.sessionManager; } });
// Compatibility shims — mirror the old exports that other files depend on
const SessionManager_2 = require("./state/SessionManager");
function hasRoomClients(roomNumber) {
    return SessionManager_2.sessionManager.hasRoomClients(roomNumber);
}
exports.hasRoomClients = hasRoomClients;
function isHostOnline(hostViewerId, roomNumber) {
    return SessionManager_2.sessionManager.isHostOnline(hostViewerId, roomNumber);
}
exports.isHostOnline = isHostOnline;
function clearBattleExpectedCount(roomNumber) {
    SessionManager_2.sessionManager.clearBattleExpectedCount(roomNumber);
}
exports.clearBattleExpectedCount = clearBattleExpectedCount;

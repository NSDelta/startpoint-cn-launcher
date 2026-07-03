"use strict";
// Multi battle TCP session server
// Protocol: JSON messages delimited by null byte (\0)
// Post-handshake messages use typepacker format with useEnumIndex=true:
//   [index, param1, param2, ...]
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopSessionServer = exports.startSessionServer = exports.SESSION_HOST = exports.SESSION_PORT = void 0;
const net = __importStar(require("net"));
const handshake_1 = require("./handshake");
const battle_1 = require("./battle");
const SessionManager_1 = require("../state/SessionManager");
exports.SESSION_PORT = parseInt(process.env.SESSION_PORT || "8003");
exports.SESSION_HOST = process.env.SESSION_HOST || "0.0.0.0";
let server = null;
function startSessionServer() {
    return new Promise((resolve) => {
        if (server) {
            resolve();
            return;
        }
        server = net.createServer((socket) => {
            const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
            console.log(`[TCP] new connection from ${remoteAddr}`);
            socket.setEncoding("utf8");
            let buffer = "";
            let handshakeDone = false;
            let isBattleSocket = false;
            socket.on("data", (chunk) => {
                buffer += chunk;
                while (buffer.includes("\0")) {
                    const idx = buffer.indexOf("\0");
                    const raw = buffer.substring(0, idx);
                    buffer = buffer.substring(idx + 1);
                    if (raw.trim().length === 0)
                        continue;
                    try {
                        const data = JSON.parse(raw);
                        if (!handshakeDone && data.socklet) {
                            handshakeDone = true;
                            isBattleSocket = data.socklet === "cooperation_battle";
                            (0, handshake_1.handleHandshake)(socket, data).catch((err) => {
                                console.log(`[TCP] handshake failed:`, err);
                                socket.destroy();
                            });
                        }
                        else if (handshakeDone) {
                            if (isBattleSocket) {
                                (0, battle_1.handleBattleMessage)(socket, data);
                            }
                            else {
                                const lobby = require("./lobby");
                                lobby.handleMessage(socket, data);
                            }
                        }
                    }
                    catch (e) {
                        console.log(`[TCP] parse error from ${remoteAddr}:`, e.message);
                    }
                }
            });
            socket.on("close", () => {
                console.log(`[TCP] connection closed: ${remoteAddr}`);
                // OLD: remove client on socket close to prevent zombies
                try {
                    const clientsMap = SessionManager_1.sessionManager.clients;
                    if (clientsMap) {
                        for (const [, client] of clientsMap) {
                            if (client.socket === socket) {
                                SessionManager_1.sessionManager.removeClient(client);
                                break;
                            }
                        }
                    }
                    const c2b = SessionManager_1.sessionManager.cidToBattleClient;
                    if (c2b) {
                        for (const [, client] of c2b) {
                            if (client.socket === socket) {
                                SessionManager_1.sessionManager.removeClient(client);
                                break;
                            }
                        }
                    }
                }
                catch (e) { }
            });
            socket.on("error", (err) => {
                console.log(`[TCP] socket error from ${remoteAddr}:`, err.message);
                // OLD: remove client on error to prevent zombies
                try {
                    const clientsMap = SessionManager_1.sessionManager.clients;
                    if (clientsMap) {
                        for (const [, client] of clientsMap) {
                            if (client.socket === socket) {
                                SessionManager_1.sessionManager.removeClient(client);
                                break;
                            }
                        }
                    }
                    const c2b = SessionManager_1.sessionManager.cidToBattleClient;
                    if (c2b) {
                        for (const [, client] of c2b) {
                            if (client.socket === socket) {
                                SessionManager_1.sessionManager.removeClient(client);
                                break;
                            }
                        }
                    }
                }
                catch (e) { }
            });
        });
        server.listen(exports.SESSION_PORT, exports.SESSION_HOST, () => {
            console.log(`[TCP] session server listening on ${exports.SESSION_HOST}:${exports.SESSION_PORT}`);
            resolve();
        });
    });
}
exports.startSessionServer = startSessionServer;
function stopSessionServer() {
    return new Promise((resolve) => {
        if (!server) {
            resolve();
            return;
        }
        server.close(() => {
            server = null;
            resolve();
        });
    });
}
exports.stopSessionServer = stopSessionServer;

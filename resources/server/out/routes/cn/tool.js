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
const utils_1 = require("../../utils");
const session_1 = require("../../data/domains/session");
const account_1 = require("../../data/domains/account");
const player_1 = require("../../data/domains/player");
const types_1 = require("../../data/types");
const activeAccount_1 = require("../../data/activeAccount");
function generateLoginToken() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let token = "";
    for (let i = 0; i < 32; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
}
const viewerIdToAccountId = new Map();
const routes = (fastify) => __awaiter(void 0, void 0, void 0, function* () {
    fastify.post("/get_header_response", (request, reply) => {
        const body = request.body;
        reply.header("content-type", "application/x-msgpack");
        reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({
                viewer_id: body.viewer_id
            }),
            "data": []
        });
    });
    fastify.post("/auth", (_request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        reply.header("content-type", "application/x-msgpack");
        reply.status(200).send({
            data_headers: (0, utils_1.generateDataHeaders)(),
            data: {}
        });
    }));
    fastify.post("/signup", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        const body = request.body;
        const udid = request.headers["udid"] || "unknown";
        const shortUdid = 0;
        const deviceId = body.device_id;
        const loginToken = generateLoginToken();
        let accountId;
        let newAccount = true;
        let viewerId; // set when reusing existing session
        if (!deviceId) {
            return reply.status(400).send({ error: "Missing device_id" });
        }
        // Device binding: each device gets its own account
        const binding = (0, session_1.getDeviceBindingSync)(deviceId);
        if (binding) {
            // Known device — verify account still exists
            const accountExists = (0, account_1.getAccountSync)(binding.account_id);
            if (accountExists) {
                accountId = binding.account_id;
                newAccount = false;
                (0, account_1.updateAccountSync)({ id: accountId, lastLoginTime: new Date() });
                // Clean all old sessions for this account, reuse first token
                const sessions = (0, session_1.getAccountSessionsOfTypeSync)(accountId, types_1.SessionType.VIEWER);
                if (sessions.length > 0) {
                    viewerId = parseInt(sessions[0].token);
                    (0, session_1.deleteAccountSessionsOfTypeSync)(accountId, types_1.SessionType.VIEWER);
                }
            }
            else {
                // Account was deleted — clean up stale binding and create new account
                (0, session_1.deleteDeviceBindingSync)(deviceId);
                const account = (0, account_1.insertAccountSync)({
                    appId: "wf_cn", idpAlias: "", idpCode: "leiting", idpId: "", status: "normal"
                });
                accountId = account.id;
                const player = (0, player_1.insertDefaultPlayerSync)(accountId);
                (0, activeAccount_1.saveAccountDefaultPlayer)(accountId, player.id);
                (0, session_1.insertDeviceBindingSync)(deviceId, accountId);
            }
        }
        else {
            // New device → create account
            const account = (0, account_1.insertAccountSync)({
                appId: "wf_cn", idpAlias: "", idpCode: "leiting", idpId: "", status: "normal"
            });
            accountId = account.id;
            const player = (0, player_1.insertDefaultPlayerSync)(accountId);
            (0, activeAccount_1.saveAccountDefaultPlayer)(accountId, player.id);
            (0, session_1.insertDeviceBindingSync)(deviceId, accountId);
        }
        if (!viewerId) {
            viewerId = (0, utils_1.generateViewerId)();
        }
        yield (0, session_1.insertSessionWithToken)({
            token: String(viewerId),
            accountId: accountId,
            type: types_1.SessionType.VIEWER,
            expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });
        viewerIdToAccountId.set(viewerId, accountId);
        reply.header("content-type", "application/x-msgpack");
        reply.status(200).send({
            data_headers: (0, utils_1.generateDataHeaders)({
                viewer_id: viewerId,
                short_udid: shortUdid,
                udid: udid,
            }),
            data: {
                login_token: loginToken,
                newAccount: newAccount ? 1 : 0,
                roleName: `Player${accountId}`,
                accountName: `Player${accountId}`,
                sign: "dummy_sign",
                createDate: new Date().toISOString(),
                serverName: "StarPoint CN",
                serverId: 1,
            }
        });
    }));
});
exports.default = routes;

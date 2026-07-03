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
exports.registerLobbyRoutes = void 0;
const account_1 = require("../../data/domains/account");
const player_1 = require("../../data/domains/player");
const session_1 = require("../../data/domains/session");
const assets_1 = require("../../lib/assets");
const utils_1 = require("../../utils");
const manager_1 = require("../room/manager");
const serializer_1 = require("../room/serializer");
const SessionManager_1 = require("../state/SessionManager");
function getViewerIdAndPlayer(viewerId) {
    return __awaiter(this, void 0, void 0, function* () {
        const sid = yield (0, session_1.getSession)(viewerId.toString());
        if (!sid)
            return null;
        const players = yield (0, account_1.getAccountPlayers)(sid.accountId);
        if (!players || players.length === 0)
            return null;
        const player = (0, player_1.getPlayerSync)(players[0]);
        if (!player)
            return null;
        return { playerId: players[0], player };
    });
}
function registerLobbyRoutes(fastify) {
    fastify.post("/get_rooms", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        if (!viewerId || isNaN(viewerId))
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const sid = yield (0, session_1.getSession)(viewerId.toString());
        if (!sid)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id."
            });
        const rooms = (0, manager_1.getRooms)(body.category_id, body.event_id)
            .filter(r => r.host_viewer_id === viewerId)
            .filter(r => SessionManager_1.sessionManager.hasRoomClients(r.room_number))
            .map(serializer_1.serializeRoom);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": { "rooms": rooms }
        });
    }));
    fastify.post("/create_room", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const body = request.body;
        const { viewer_id, category, quest_id, party_id } = body;
        if (!viewer_id || isNaN(viewer_id))
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const ctx = yield getViewerIdAndPlayer(viewer_id);
        if (!ctx)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id or no player bound."
            });
        const quest = (0, assets_1.getQuestFromCategorySync)(category, quest_id);
        if (!quest)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Quest doesn't exist."
            });
        const room = (0, manager_1.createRoom)(viewer_id, ctx.playerId, party_id, category, quest_id, 0, ((_a = ctx.player) === null || _a === void 0 ? void 0 : _a.leaderCharacterId) || 1);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id }),
            "data": {
                "access_token": room.access_token,
                "room_number": room.room_number,
                "room_url": ""
            }
        });
    }));
    fastify.post("/search_room", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        var _b, _c, _d, _e;
        const body = request.body;
        const viewerId = body.viewer_id;
        if (!viewerId || isNaN(viewerId))
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const sid = yield (0, session_1.getSession)(viewerId.toString());
        if (!sid)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id."
            });
        const room = (0, manager_1.getRoom)(body.room_number);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": {
                "room_exists": !!room,
                "category_id": (_b = room === null || room === void 0 ? void 0 : room.category) !== null && _b !== void 0 ? _b : 0,
                "quest_id": (_c = room === null || room === void 0 ? void 0 : room.quest_id) !== null && _c !== void 0 ? _c : 0,
                "room_number": (_d = room === null || room === void 0 ? void 0 : room.room_number) !== null && _d !== void 0 ? _d : body.room_number,
                "establisher_viewer_id": (_e = room === null || room === void 0 ? void 0 : room.host_viewer_id) !== null && _e !== void 0 ? _e : 0,
                "establisher_follow": 0
            }
        });
    }));
    fastify.post("/select_room", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        if (!viewerId || isNaN(viewerId))
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const ctx = yield getViewerIdAndPlayer(viewerId);
        if (!ctx)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id or no player bound."
            });
        const room = body.room_number ? (0, manager_1.getRoom)(body.room_number) : (0, manager_1.getRoomByToken)(body.access_token || "");
        if (!room) {
            reply.header("content-type", "application/x-msgpack");
            return reply.status(200).send({
                "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
                "data": {
                    application_update_url: "",
                    category_id: 0,
                    host_entry_time: 0,
                    ip_address: "",
                    port: 0,
                    quest_id: 0,
                    raising_state: 9,
                    room_number: body.room_number || "",
                    room_sequence: 0,
                    share_room_options: 0,
                    is_pickup: null
                }
            });
        }
        const selectData = (0, serializer_1.serializeRoomConnection)(room);
        if (viewerId === room.host_viewer_id) {
            selectData.raising_state = 1;
            console.log(`[MULTI] select_room: host override raising_state → 1`);
        }
        else if (!SessionManager_1.sessionManager.isHostOnline(room.host_viewer_id, room.room_number)) {
            selectData.raising_state = 2;
            console.log(`[MULTI] select_room: host offline, guest polls raising_state → 2`);
        }
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": selectData
        });
    }));
}
exports.registerLobbyRoutes = registerLobbyRoutes;

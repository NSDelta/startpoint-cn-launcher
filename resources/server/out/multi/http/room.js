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
exports.registerRoomRoutes = void 0;
const utils_1 = require("../../utils");
const manager_1 = require("../room/manager");
const serializer_1 = require("../room/serializer");
const SessionManager_1 = require("../state/SessionManager");
const builder_1 = require("../npc/builder");
function registerRoomRoutes(fastify) {
    // ---- prepare ----
    fastify.post("/prepare", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] prepare: viewer=${viewerId} room=${body.room_number}`);
        if (!viewerId || isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        const room = body.room_number
            ? (0, manager_1.getRoom)(body.room_number)
            : (0, manager_1.getRoomByToken)(body.access_token || "");
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
                    is_pickup: null,
                }
            });
        }
        (0, manager_1.updateHostEntryTime)(room.room_number);
        const data = (0, serializer_1.serializeRoomConnection)(room);
        if (viewerId === room.host_viewer_id) {
            data.raising_state = 1;
        }
        else if (!SessionManager_1.sessionManager.isHostOnline(room.host_viewer_id, room.room_number)) {
            data.raising_state = 2;
            console.log(`[MULTI] prepare: host offline, guest polls raising_state → 2`);
        }
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": data,
        });
    }));
    // ---- summon ----
    fastify.post("/summon", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] summon: viewer=${viewerId} room=${body.room_number}`);
        if (!viewerId || isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        const room = (0, manager_1.getRoom)(body.room_number);
        if (!room) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Room doesn't exist."
            });
        }
        const mates = (0, builder_1.buildNpcMates)(body.quest_id, room.category);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": {
                "mate1": mates.mate1,
                "mate2": mates.mate2,
            }
        });
    }));
    // ---- restore_room ----
    fastify.post("/restore_room", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] restore_room: viewer=${viewerId} room=${body.room_number}`);
        if (!viewerId || isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        const room = (0, manager_1.getRoom)(body.room_number);
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
                    room_number: body.room_number,
                    room_sequence: 0,
                    share_room_options: 0,
                    is_pickup: null,
                    is_same_room: true,
                }
            });
        }
        const data = Object.assign(Object.assign({}, (0, serializer_1.serializeRoomConnection)(room)), { is_same_room: true });
        if (viewerId === room.host_viewer_id) {
            data.raising_state = 1;
        }
        else if (!SessionManager_1.sessionManager.isHostOnline(room.host_viewer_id, room.room_number)) {
            data.raising_state = 2;
            console.log(`[MULTI] restore_room: host offline, guest polls raising_state → 2`);
        }
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": data,
        });
    }));
    // ---- share_room ----
    fastify.post("/share_room", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] share_room: viewer=${viewerId} room=${body.room_number}`);
        if (!viewerId || isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": {}
        });
    }));
    // ---- disband_room ----
    fastify.post("/disband_room", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] disband_room: viewer=${viewerId} room=${body.room_number}`);
        if (!viewerId || isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        if (body.room_number) {
            SessionManager_1.sessionManager.broadcastToRoom(body.room_number, [1, [6, "multibattle_room_dismissed"]]);
            (0, manager_1.disbandRoom)(body.room_number);
            console.log(`[MULTI] room ${body.room_number} disbanded by viewer ${viewerId}`);
        }
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": {}
        });
    }));
}
exports.registerRoomRoutes = registerRoomRoutes;

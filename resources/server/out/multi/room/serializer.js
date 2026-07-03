"use strict";
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
exports.serializeRoomConnection = exports.serializeRoom = exports.getDisplayHost = void 0;
const os = __importStar(require("os"));
function getDisplayHost() {
    const publicHost = (process.env.SESSION_PUBLIC_HOST || process.env.CN_PUBLIC_HOST || "").trim();
    if (publicHost.length > 0)
        return publicHost;
    const raw = (process.env.CN_LISTEN_HOST || "127.0.0.1").trim();
    if (raw !== "0.0.0.0" && raw !== "::")
        return raw;
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        const addrs = nets[name];
        if (!addrs)
            continue;
        for (const addr of addrs) {
            if (addr.family === "IPv4" && !addr.internal) {
                return addr.address;
            }
        }
    }
    return "127.0.0.1";
}
exports.getDisplayHost = getDisplayHost;
function serializeRoom(room) {
    const charId = Number(room.host_main_character_id) || 1;
    return {
        access_token: room.access_token,
        category_id: room.category,
        clear_phase: 0,
        host_entry_time: room.host_entry_time,
        host_main_character_id: room.host_main_character_id,
        host_player_id: room.host_player_id,
        host_viewer_id: room.host_viewer_id,
        is_npc_mode: room.is_npc_mode,
        quest_id: room.quest_id,
        raising_state: room.raising_state,
        room_number: room.room_number,
        share_room_options: room.share_room_options,
        room_sequence: room.room_sequence,
        room_member_count: room.mates.length,
        // Required by client parser (see SerializedRoom).
        establisher_character: charId,
        establisher_character_evolution_img_level: 0,
        establisher_follow: 1,
        establisher_name: `Player${room.host_viewer_id}`,
        is_pickup: false,
        mates: room.mates.length,
    };
}
exports.serializeRoom = serializeRoom;
function serializeRoomConnection(room) {
    const displayHost = getDisplayHost();
    const sessionPort = parseInt(process.env.SESSION_PORT || "8003");
    return {
        application_update_url: "",
        category_id: room.category,
        host_entry_time: room.host_entry_time,
        ip_address: displayHost,
        port: sessionPort,
        quest_id: room.quest_id,
        raising_state: room.raising_state,
        room_number: room.room_number,
        room_sequence: room.room_sequence,
        share_room_options: room.share_room_options,
        is_pickup: null,
    };
}
exports.serializeRoomConnection = serializeRoomConnection;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateHostEntryTime = exports.disbandRoom = exports.setRoomBattle = exports.updateRoomState = exports.getRooms = exports.getRoomByToken = exports.getRoom = exports.createRoom = exports.generateRoomNumber = exports.STATIC_ACCESS_TOKEN = void 0;
const crypto_1 = require("crypto");
const utils_1 = require("../../utils");
const SessionManager_1 = require("../state/SessionManager");
const rooms = new Map();
let roomSequence = 1;
const INCOMPLETE_EXPIRY_MS = parseInt(process.env.MULTI_ROOM_INCOMPLETE_EXPIRY_MS || "900000"); // 15min, mates < 3
const FULL_ROOM_EXPIRY_MS = parseInt(process.env.MULTI_ROOM_FULL_EXPIRY_MS || "1800000"); // 30min, mates >= 3
const CLEAN_INTERVAL_MS = parseInt(process.env.MULTI_ROOM_CLEAN_INTERVAL_MS || "60000");
const REMAINING_NOTIFY_MS = 30000; // send RemainingTime float 30s before disband
// Track which rooms have already been notified (to avoid repeat floats)
const notifiedRooms = new Set();
function cleanExpiredRooms() {
    const now = Date.now();
    const timeOffset = now - (0, utils_1.getServerTime)() * 1000;
    let cleaned = 0;
    for (const [roomNumber, room] of rooms) {
        // Battle rooms — rely on removeClient auto-disband, no timer
        if (room.raising_state === 4)
            continue;
        const idleAge = now - (room.host_entry_time * 1000 + timeOffset);
        const timeout = room.mates.length < 3 ? INCOMPLETE_EXPIRY_MS : FULL_ROOM_EXPIRY_MS;
        const remaining = timeout - idleAge;
        // Send RemainingTime float 30s before expiry
        if (remaining > 0 && remaining <= REMAINING_NOTIFY_MS && !notifiedRooms.has(roomNumber)) {
            SessionManager_1.sessionManager.broadcastToRoom(roomNumber, [1, [7, Math.ceil(remaining / 1000)]]);
            notifiedRooms.add(roomNumber);
            console.log(`[MULTI] RemainingTime sent: room=${roomNumber} seconds=${Math.ceil(remaining / 1000)}`);
        }
        if (idleAge > timeout) {
            rooms.delete(roomNumber);
            SessionManager_1.sessionManager.removeRoomState(roomNumber);
            notifiedRooms.delete(roomNumber);
            cleaned++;
        }
    }
    if (cleaned > 0)
        console.log(`[MULTI] expired rooms cleaned: ${cleaned}`);
}
setInterval(cleanExpiredRooms, CLEAN_INTERVAL_MS);
exports.STATIC_ACCESS_TOKEN = "multi_battle_quest_access_token";
function generateRoomNumber() {
    return String((0, crypto_1.randomInt)(100000, 999999));
}
exports.generateRoomNumber = generateRoomNumber;
function createRoom(hostViewerId, hostPlayerId, hostPartyId, category, questId, acceptedType, hostMainCharacterId, isNpcMode = false) {
    const roomNumber = generateRoomNumber();
    const room = {
        room_number: roomNumber,
        access_token: exports.STATIC_ACCESS_TOKEN,
        category,
        quest_id: questId,
        host_viewer_id: hostViewerId,
        host_player_id: hostPlayerId,
        host_party_id: hostPartyId,
        host_main_character_id: hostMainCharacterId,
        accepted_type: acceptedType,
        created_at: Date.now(),
        raising_state: 2,
        room_sequence: roomSequence++,
        host_entry_time: (0, utils_1.getServerTime)(),
        mates: [],
        share_room_options: 0,
        is_npc_mode: isNpcMode,
        npc_count: 0,
    };
    rooms.set(roomNumber, room);
    console.log(`[MULTI] room created: ${roomNumber} host=${hostViewerId} category=${category} quest=${questId}`);
    return room;
}
exports.createRoom = createRoom;
function getRoom(roomNumber) {
    const room = rooms.get(roomNumber);
    if (!room)
        console.log(`[MULTI] room not found: ${roomNumber}`);
    return room;
}
exports.getRoom = getRoom;
function getRoomByToken(token) {
    for (const room of rooms.values()) {
        if (room.access_token === token)
            return room;
    }
    return undefined;
}
exports.getRoomByToken = getRoomByToken;
function getRooms(categoryId, eventId) {
    const result = [];
    for (const room of rooms.values()) {
        if (room.category === categoryId) {
            result.push(room);
        }
    }
    return result;
}
exports.getRooms = getRooms;
function updateRoomState(roomNumber, state) {
    const room = rooms.get(roomNumber);
    if (!room)
        return false;
    console.log(`[MULTI] room state: ${roomNumber} → ${state}`);
    room.raising_state = state;
    return true;
}
exports.updateRoomState = updateRoomState;
function setRoomBattle(roomNumber) {
    return updateRoomState(roomNumber, 4);
}
exports.setRoomBattle = setRoomBattle;
function disbandRoom(roomNumber) {
    const deleted = rooms.delete(roomNumber);
    if (deleted) {
        console.log(`[MULTI] room deleted: ${roomNumber}`);
        SessionManager_1.sessionManager.removeRoomState(roomNumber);
    }
    return deleted;
}
exports.disbandRoom = disbandRoom;
function updateHostEntryTime(roomNumber) {
    const room = rooms.get(roomNumber);
    if (!room)
        return false;
    room.host_entry_time = (0, utils_1.getServerTime)();
    return true;
}
exports.updateHostEntryTime = updateHostEntryTime;

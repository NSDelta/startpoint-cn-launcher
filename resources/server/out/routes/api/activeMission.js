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
const mission_1 = require("../../data/domains/mission");
const player_1 = require("../../data/domains/player");
const session_1 = require("../../data/domains/session");
const item_1 = require("../../data/domains/item");
const character_1 = require("../../data/domains/character");
const utils_1 = require("../../utils");
const activeAccount_1 = require("../../data/activeAccount");
const index_1 = require("../../lib/mission/index");
const routes = (fastify) => __awaiter(void 0, void 0, void 0, function* () {
    fastify.post("/receive", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const body = request.body;
        const viewerId = body.viewer_id;
        if (!viewerId || isNaN(viewerId))
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "Invalid request body."
            });
        const session = yield (0, session_1.getSession)(viewerId.toString());
        if (!session)
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "Invalid viewer id."
            });
        const playerId = (0, activeAccount_1.resolvePlayerIdSync)(session.accountId);
        if (playerId === null)
            return reply.status(500).send({
                "error": "Internal Server Error",
                "message": "No players bound to account."
            });
        const player = (0, player_1.getPlayerSync)(playerId);
        if (!player)
            return reply.status(500).send({
                "error": "Internal Server Error",
                "message": "Player not found."
            });
        const activeMissions = (0, mission_1.getPlayerActiveMissionsSync)(playerId);
        const resultList = [];
        const itemRewards = {};
        let freeMana = player.freeMana;
        let expPool = player.expPool;
        let totalManaGained = 0;
        const requestList = body.active_mission_list || [];
        for (const entry of requestList) {
            const missionId = entry.mission_id;
            const stages = entry.stages || [];
            const currentMission = activeMissions[String(missionId)];
            const progress = (_a = currentMission === null || currentMission === void 0 ? void 0 : currentMission.progress) !== null && _a !== void 0 ? _a : 0;
            const responseStages = [];
            for (const stage of stages) {
                // Skip if already received (prevent duplicate rewards)
                const existingStages = currentMission === null || currentMission === void 0 ? void 0 : currentMission.stages;
                if (existingStages && !Array.isArray(existingStages) && existingStages[String(stage)])
                    continue;
                // Mark stage as received
                (0, mission_1.updatePlayerActiveMissionStageSync)(playerId, stage, missionId, true);
                // Get rewards from CDN — awake missions use a different reward table
                const isAwake = String(missionId).length >= 7 && missionId % 10 <= 4;
                const rewards = isAwake
                    ? (0, index_1.getAwakeMissionRewards)(missionId, stage)
                    : (0, index_1.getActiveMissionRewards)(missionId, stage);
                for (const r of rewards) {
                    switch (r.kind) {
                        case 1: // Item
                            if (r.itemId) {
                                const newTotal = (0, item_1.givePlayerItemSync)(playerId, r.itemId, r.amount);
                                itemRewards[r.itemId] = newTotal;
                            }
                            break;
                        case 2: // Equipment
                            if (r.equipmentId) {
                                const newTotal = (0, item_1.givePlayerItemSync)(playerId, r.equipmentId, r.amount);
                                itemRewards[r.equipmentId] = newTotal;
                            }
                            break;
                        case 3: // Mana
                            freeMana += r.amount;
                            totalManaGained += r.amount;
                            break;
                        case 4: // Character
                            if (r.characterId && r.amount > 0) {
                                try {
                                    (0, character_1.insertDefaultPlayerCharacterSync)(playerId, r.characterId);
                                }
                                catch (_) {
                                    // Character may already exist — ignore duplicate
                                }
                            }
                            break;
                        case 5: // Exp pool
                            expPool += r.amount;
                            break;
                    }
                }
                responseStages.push({ stage, received: true });
            }
            resultList.push({
                mission_id: missionId,
                progress_value: progress,
                stages: responseStages
            });
        }
        // Apply mana and exp changes
        if (freeMana !== player.freeMana || expPool !== player.expPool) {
            (0, player_1.updatePlayerSync)({ id: playerId, freeMana, expPool, totalManaObtained: ((_b = player.totalManaObtained) !== null && _b !== void 0 ? _b : 0) + totalManaGained });
        }
        console.log(`[ACTIVE_MISSION] receive viewer=${viewerId} missions=${requestList.length} items=${Object.keys(itemRewards).length}`);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": {
                "active_mission_list": resultList,
                "user_info": {
                    "free_mana": freeMana,
                    "exp_pool": expPool,
                    "exp_pooled_time": (0, utils_1.getServerTime)(player.expPooledTime)
                },
                "item_list": itemRewards,
                "mail_arrived": false
            }
        });
    }));
});
exports.default = routes;

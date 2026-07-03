"use strict";
// Mission progress endpoints — get and update
// Uses lib/mission/ computer registry for compute dispatch
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
const session_1 = require("../../data/domains/session");
const item_1 = require("../../data/domains/item");
const character_1 = require("../../data/domains/character");
const player_1 = require("../../data/domains/player");
const utils_1 = require("../../utils");
const index_1 = require("../../lib/mission/index");
const activeAccount_1 = require("../../data/activeAccount");
const routes = (fastify) => __awaiter(void 0, void 0, void 0, function* () {
    fastify.post("/get_mission_progress", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d;
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
        // Cache computer+context per category to avoid redundant builds
        const computerCache = new Map();
        function getCtx(category) {
            let entry = computerCache.get(category);
            if (!entry) {
                const computer = (0, index_1.getComputer)(category);
                const ctx = computer.buildContext(playerId, category);
                entry = { ctx };
                computerCache.set(category, entry);
            }
            return entry.ctx;
        }
        const requestList = body.category_list || [{ category: 1 }];
        const requestCategories = requestList.map(c => c.category);
        const activeMissions = (0, mission_1.getPlayerActiveMissionsSync)(playerId);
        const missionProgressList = [];
        // Build category→character_id filter map
        const categoryCharMap = {};
        for (const entry of requestList) {
            if (entry.character_id !== undefined) {
                categoryCharMap[entry.category] = String(entry.character_id);
            }
        }
        for (const category of requestCategories) {
            const computer = (0, index_1.getComputer)(category);
            const ctx = getCtx(category);
            const allIds = (0, index_1.getMissionIdsByCategory)(category);
            const charId = categoryCharMap[category];
            for (const missionId of allIds) {
                // Character-awake: filter by character_id
                if (charId && category === 9) {
                    if ((0, index_1.getCharacterIdFromMission)(missionId) !== charId)
                        continue;
                }
                const dbProgress = (_b = (_a = activeMissions[String(missionId)]) === null || _a === void 0 ? void 0 : _a.progress) !== null && _b !== void 0 ? _b : 0;
                const progress = computer.compute(missionId, ctx, dbProgress);
                const stage = (0, index_1.getCurrentStage)(category, missionId, progress);
                // Auto-grant rewards for newly completed stages (skip periodic categories)
                const completedStages = (0, index_1.getCompletedStageNumbers)(category, missionId, progress);
                const existingStages = (_c = activeMissions[String(missionId)]) === null || _c === void 0 ? void 0 : _c.stages;
                const isRecord = existingStages && !Array.isArray(existingStages);
                const skipAutoGrant = category === 2 || category === 10; // daily/weekly rewards via active_mission/receive
                let localMana = ctx.player.freeMana;
                let localExp = ctx.player.expPool;
                if (!skipAutoGrant)
                    for (const s of completedStages) {
                        if (isRecord && existingStages[String(s)])
                            continue;
                        (0, mission_1.updatePlayerActiveMissionSync)(playerId, missionId, progress);
                        (0, mission_1.updatePlayerActiveMissionStageSync)(playerId, s, missionId, true);
                        const rewards = category === 9
                            ? (0, index_1.getAwakeMissionRewards)(missionId, s)
                            : category === 3
                                ? (0, index_1.getEventMissionRewards)(missionId, s)
                                : (0, index_1.getActiveMissionRewards)(missionId, s);
                        for (const r of rewards) {
                            if (r.kind === 1 || r.kind === 2) {
                                (0, item_1.givePlayerItemSync)(playerId, (r.itemId || r.equipmentId), r.amount);
                            }
                            else if (r.kind === 3) {
                                localMana += r.amount;
                                (0, player_1.updatePlayerSync)({
                                    id: playerId,
                                    freeMana: localMana,
                                    totalManaObtained: ((_d = ctx.player.totalManaObtained) !== null && _d !== void 0 ? _d : 0) + (localMana - ctx.player.freeMana)
                                });
                            }
                            else if (r.kind === 4 && r.characterId) {
                                try {
                                    (0, character_1.insertDefaultPlayerCharacterSync)(playerId, r.characterId);
                                }
                                catch (_) { }
                            }
                            else if (r.kind === 5) {
                                localExp += r.amount;
                                (0, player_1.updatePlayerSync)({ id: playerId, expPool: localExp });
                            }
                        }
                    }
                missionProgressList.push({
                    mission_category: category,
                    mission_id: missionId,
                    progress_value: Number(progress),
                    stage: stage
                });
            }
        }
        console.log(`[MISSION] get_progress viewer=${viewerId} categories=${requestCategories} missions=${missionProgressList.length}`);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": {
                "mission_progress_list": missionProgressList
            }
        });
    }));
    fastify.post("/update_mission_progress", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
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
        // Update mission progress counters in DB (fire-and-forget from client)
        const missionParams = body.mission_param_list || [];
        let updatedCount = 0;
        for (const param of missionParams) {
            const matches = (0, index_1.getMissionsByPattern)(param.mission_pattern);
            for (const m of matches) {
                (0, mission_1.updatePlayerActiveMissionSync)(playerId, m.missionId, param.progress_value);
                updatedCount++;
            }
        }
        console.log(`[MISSION] update_progress viewer=${viewerId} params=${missionParams.length} db_updates=${updatedCount}`);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": {
                "mission_info": [],
                "degree_list": []
            }
        });
    }));
});
exports.default = routes;

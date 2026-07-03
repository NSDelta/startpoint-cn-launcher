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
exports.registerBattleRoutes = void 0;
const utils_1 = require("../../utils");
const manager_1 = require("../room/manager");
const SessionManager_1 = require("../state/SessionManager");
const singleBattleQuest_1 = require("../../routes/api/singleBattleQuest");
const quest_active_1 = require("../../data/domains/quest_active");
const player_1 = require("../../data/domains/player");
const quest_1 = require("../../data/domains/quest");
const session_1 = require("../../data/domains/session");
const assets_1 = require("../../lib/assets");
const character_1 = require("../../lib/character");
const quest_2 = require("../../lib/quest");
const stamina_1 = require("../../lib/stamina");
const activeAccount_1 = require("../../data/activeAccount");
const db_1 = require("../../data/db");
const character_clear_tracker_1 = require("../../lib/quest/finish/character-clear-tracker");
const powerflip_tracker_1 = require("../../lib/quest/finish/powerflip-tracker");
const leader_powerflip_tracker_1 = require("../../lib/quest/finish/leader-powerflip-tracker");
const party_co_clear_tracker_1 = require("../../lib/quest/finish/party-co-clear-tracker");
function resolvePlayer(viewerId) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = yield (0, session_1.getSession)(viewerId.toString());
        if (!session)
            return null;
        const playerId = (0, activeAccount_1.resolvePlayerIdSync)(session.accountId);
        if (!playerId)
            return null;
        const player = (0, player_1.getPlayerSync)(playerId);
        if (!player)
            return null;
        return { playerId, player };
    });
}
function registerBattleRoutes(fastify) {
    // ---- start ----
    fastify.post("/start", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const { viewer_id, quest_id, category, party_id, use_boost_point, use_boss_boost_point, is_auto_start_mode, room_number, mate_player_ids, play_id } = body;
        console.log(`[MULTI] start: viewer=${viewer_id} quest=${quest_id} category=${category} party=${party_id} room=${room_number}`);
        if (isNaN(viewer_id) || isNaN(party_id) || isNaN(quest_id) || isNaN(category) || use_boost_point === undefined || use_boss_boost_point === undefined || is_auto_start_mode === undefined) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        const ctx = yield resolvePlayer(viewer_id);
        if (!ctx) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id or no player bound."
            });
        }
        const questData = (0, assets_1.getQuestFromCategorySync)(category, quest_id);
        if (questData === null || !('rankPointReward' in questData)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Quest doesn't exist."
            });
        }
        const room = (0, manager_1.getRoom)(room_number);
        if (!room) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Room doesn't exist."
            });
        }
        (0, manager_1.setRoomBattle)(room_number);
        const mateComIds = room.mates.map(m => m.com_id);
        (0, singleBattleQuest_1.insertActiveQuest)(ctx.playerId, {
            questId: quest_id,
            category,
            useBoostPoint: use_boost_point,
            useBossBoostPoint: use_boss_boost_point,
            isAutoStartMode: is_auto_start_mode,
            isMulti: true,
            roomNumber: room_number,
            matePlayerIds: mate_player_ids,
            mateComIds,
            playId: play_id,
            continueCount: 0,
        });
        if (questData.fixedParty === undefined) {
            (0, player_1.updatePlayerSync)({ id: ctx.playerId, partySlot: party_id });
        }
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id }),
            "data": {
                "is_multi": "multi",
                "play_id": play_id,
            }
        });
    }));
    // ---- finish ----
    fastify.post("/finish", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const body = request.body;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] finish: viewer=${viewerId} quest=${body.quest_id} category=${body.category} room=${body.room_number}`);
        if (!viewerId || isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        const ctx = yield resolvePlayer(viewerId);
        if (!ctx || !ctx.player) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id."
            });
        }
        const { playerId, player } = ctx;
        const activeQuestData = singleBattleQuest_1.activeQuests[playerId];
        if (activeQuestData === undefined) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "No active quest to finish."
            });
        }
        const questCategory = activeQuestData.category;
        const questId = activeQuestData.questId;
        const questData = (0, assets_1.getQuestFromCategorySync)(questCategory, questId);
        if (questData === null || !('rankPointReward' in questData)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Quest doesn't exist."
            });
        }
        delete singleBattleQuest_1.activeQuests[playerId];
        (0, quest_active_1.deletePlayerActiveQuestSync)(playerId);
        if (activeQuestData.roomNumber) {
            SessionManager_1.sessionManager.clearBattleExpectedCount(activeQuestData.roomNumber);
        }
        if (activeQuestData.roomNumber) {
            const room = (0, manager_1.getRoom)(activeQuestData.roomNumber);
            if (room && room.host_player_id === playerId) {
                (0, manager_1.updateRoomState)(room.room_number, 1);
                console.log(`[MULTI] finish: room ${activeQuestData.roomNumber} reset to raising_state=1`);
            }
        }
        // calculate clear rank
        const clearTime = body.elapsed_time_ms || 0;
        const hasRankThresholds = questData.bRankTime > 0;
        const clearRank = hasRankThresholds ? (questData.sPlusRankTime >= clearTime ? 5
            : questData.sRankTime >= clearTime ? 4
                : questData.aRankTime >= clearTime ? 3
                    : questData.bRankTime >= clearTime ? 2
                        : 1) : null;
        const beforeRankPoint = player.rankPoint;
        const newRankPoint = beforeRankPoint + questData.rankPointReward;
        const newMana = player.freeMana + questData.manaReward + (body.add_mana || 0);
        const manaObtained = questData.manaReward + (body.add_mana || 0);
        const newExpPool = player.expPool + questData.poolExpReward;
        let newBoostPoint = player.boostPoint - (activeQuestData.useBoostPoint ? 1 : 0);
        let newBossBoostPoint = player.bossBoostPoint - (activeQuestData.useBossBoostPoint ? 1 : 0);
        const useBoostPoint = (activeQuestData.useBoostPoint && (newBoostPoint >= 0)) || (activeQuestData.useBossBoostPoint && (newBossBoostPoint >= 0));
        // quest progress
        const questProgress = (0, quest_1.getPlayerSingleQuestProgressSync)(playerId, questCategory, questId);
        const questPreviouslyCompleted = questProgress !== null;
        const questAccomplished = body.is_accomplished;
        const leaderId = (_e = (_d = (_c = (((_a = body.statistics) === null || _a === void 0 ? void 0 : _a.party) || ((_b = body.quest_statistics) === null || _b === void 0 ? void 0 : _b.party))) === null || _c === void 0 ? void 0 : _c.characters) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.id;
        const clearReward = !questPreviouslyCompleted && questData.clearReward !== undefined ? (0, quest_2.givePlayerRewardSync)(playerId, questData.clearReward) : null;
        const sPlusClearReward = (clearRank === 5) && ((questProgress === null || questProgress === void 0 ? void 0 : questProgress.clearRank) !== 5) && (questData.sPlusReward !== undefined) ? (0, quest_2.givePlayerRewardSync)(playerId, questData.sPlusReward) : null;
        if (questAccomplished) {
            if (questPreviouslyCompleted) {
                const updateData = {
                    questId: questId,
                    finished: true,
                    bestElapsedTimeMs: questProgress.bestElapsedTimeMs === undefined || questProgress.bestElapsedTimeMs === null ? clearTime : Math.min(clearTime, questProgress.bestElapsedTimeMs),
                    highScore: questProgress.highScore === undefined ? (body.score || 0) : Math.max(body.score || 0, questProgress.highScore),
                    leaderCharacterId: leaderId !== null && leaderId !== void 0 ? leaderId : null
                };
                if (clearRank !== null) {
                    updateData.clearRank = questProgress.clearRank === undefined ? clearRank : Math.max(clearRank, questProgress.clearRank);
                }
                (0, quest_1.updatePlayerQuestProgressSync)(playerId, questCategory, updateData);
            }
            else {
                (0, quest_1.insertPlayerQuestProgressSync)(playerId, questCategory, {
                    questId: questId,
                    finished: true,
                    bestElapsedTimeMs: clearTime,
                    highScore: body.score || 0,
                    clearRank: clearRank !== null && clearRank !== void 0 ? clearRank : 5,
                    leaderCharacterId: leaderId !== null && leaderId !== void 0 ? leaderId : null
                });
            }
        }
        const oldRkDegree = (0, stamina_1.getRankDegree)(beforeRankPoint);
        const newDegreeId = (0, stamina_1.getRankDegree)(newRankPoint);
        const didLevelUp = newDegreeId > oldRkDegree;
        // Increment multi clear count for event mission tracking
        (0, db_1.getDb)().prepare(`
        UPDATE players_quest_progress SET multi_clear_count = multi_clear_count + 1
        WHERE player_id = ? AND section = ? AND quest_id = ?
        `).run(playerId, Number(questCategory), Number(questId));
        (0, player_1.updatePlayerSync)(Object.assign({ id: playerId, freeMana: newMana, expPool: newExpPool, rankPoint: newRankPoint, boostPoint: newBoostPoint, bossBoostPoint: newBossBoostPoint, totalManaObtained: ((_f = player.totalManaObtained) !== null && _f !== void 0 ? _f : 0) + manaObtained, maxComboAchieved: Math.max((_g = player.maxComboAchieved) !== null && _g !== void 0 ? _g : 0, (_j = (_h = body.statistics) === null || _h === void 0 ? void 0 : _h.max_combo_count) !== null && _j !== void 0 ? _j : 0) }, (didLevelUp ? { stamina: player.stamina + (0, stamina_1.getMaxStamina)(newDegreeId), staminaHealTime: new Date() } : {})));
        const playerData = player;
        if (didLevelUp) {
            playerData.stamina = playerData.stamina + (0, stamina_1.getMaxStamina)(newDegreeId);
            playerData.staminaHealTime = new Date();
        }
        const scoreRewardsResult = (0, quest_2.givePlayerScoreRewardsSync)(playerId, questData.scoreRewardGroupId || 0, questData.scoreRewardGroup, useBoostPoint, questData.element);
        const bodyPartyStatistics = ((_k = body.statistics) === null || _k === void 0 ? void 0 : _k.party) || ((_l = body.quest_statistics) === null || _l === void 0 ? void 0 : _l.party) || { characters: [], unison_characters: [] };
        const partyCharacterIdsArray = [];
        for (const value of [...(bodyPartyStatistics.characters || []), ...(bodyPartyStatistics.unison_characters || [])]) {
            if (value !== null && value.id !== null && value.id !== undefined)
                partyCharacterIdsArray.push(value.id);
        }
        // Track mission progress (decoupled from core quest mechanics)
        const finishCtx = {
            playerId, questCategory, questId,
            questAccomplished,
            clearTime, clearRank,
            party: bodyPartyStatistics,
            statistics: body.statistics || body.quest_statistics || {},
            player,
            questPreviouslyCompleted,
            questProgress,
            isMulti: true,
        };
        (0, character_clear_tracker_1.trackCharacterClears)(finishCtx);
        (0, leader_powerflip_tracker_1.trackLeaderPowerflip)(finishCtx);
        (0, party_co_clear_tracker_1.trackPartyCoClears)(finishCtx);
        (0, powerflip_tracker_1.trackPowerflip)(finishCtx);
        const rewardCharacterExpResult = (0, character_1.givePlayerCharactersExpSync)(playerId, partyCharacterIdsArray, questData.characterExpReward || 0, questData.fixedParty !== undefined);
        const dataHeaders = (0, utils_1.generateDataHeaders)({ viewer_id: viewerId });
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": dataHeaders,
            "data": {
                "user_info": {
                    "free_mana": newMana + ((clearReward === null || clearReward === void 0 ? void 0 : clearReward.user_info.free_mana) || 0) + ((sPlusClearReward === null || sPlusClearReward === void 0 ? void 0 : sPlusClearReward.user_info.free_mana) || 0) + scoreRewardsResult.user_info.free_mana,
                    "exp_pool": rewardCharacterExpResult.exp_pool + ((clearReward === null || clearReward === void 0 ? void 0 : clearReward.user_info.exp_pool) || 0) + scoreRewardsResult.user_info.exp_pool,
                    "exp_pooled_time": (0, utils_1.getServerTime)(playerData.expPooledTime),
                    "free_vmoney": playerData.freeVmoney + ((clearReward === null || clearReward === void 0 ? void 0 : clearReward.user_info.free_vmoney) || 0) + ((sPlusClearReward === null || sPlusClearReward === void 0 ? void 0 : sPlusClearReward.user_info.free_vmoney) || 0) + scoreRewardsResult.user_info.free_vmoney,
                    "rank_point": newRankPoint,
                    "degree_id": 1,
                    "stamina": playerData.stamina,
                    "stamina_heal_time": (0, utils_1.realToVirtual)(playerData.staminaHealTime),
                    "boost_point": newBoostPoint,
                    "boss_boost_point": newBossBoostPoint
                },
                "add_exp_list": rewardCharacterExpResult.add_exp_list,
                "character_list": [
                    ...rewardCharacterExpResult.character_list,
                    ...((clearReward === null || clearReward === void 0 ? void 0 : clearReward.character_list) || []),
                    ...((sPlusClearReward === null || sPlusClearReward === void 0 ? void 0 : sPlusClearReward.character_list) || []),
                    ...scoreRewardsResult.character_list
                ],
                "bond_token_status_list": rewardCharacterExpResult.bond_token_status_list,
                "rewards": {
                    "overflow_pool_exp": 0,
                    "converted_pool_exp": 0,
                    "reward_pool_exp": questData.poolExpReward,
                    "reward_mana": questData.manaReward,
                    "field_mana": body.add_mana || 0
                },
                "old_high_score": questProgress === null ? 0 : questProgress.highScore || 0,
                "joined_character_id_list": [
                    ...((clearReward === null || clearReward === void 0 ? void 0 : clearReward.joined_character_id_list) || []),
                    ...((sPlusClearReward === null || sPlusClearReward === void 0 ? void 0 : sPlusClearReward.joined_character_id_list) || []),
                    ...scoreRewardsResult.joined_character_id_list
                ],
                "before_rank_point": beforeRankPoint,
                "clear_rank": clearRank !== null && clearRank !== void 0 ? clearRank : 5,
                "drop_score_reward_ids": scoreRewardsResult.drop_score_reward_ids,
                "drop_rare_reward_ids": scoreRewardsResult.drop_rare_reward_ids,
                "drop_additional_reward_ids": [],
                "drop_periodic_reward_ids": [],
                "equipment_list": [
                    ...scoreRewardsResult.equipment_list,
                    ...((clearReward === null || clearReward === void 0 ? void 0 : clearReward.equipment_list) || []),
                    ...((sPlusClearReward === null || sPlusClearReward === void 0 ? void 0 : sPlusClearReward.equipment_list) || [])
                ],
                "category_id": questCategory,
                "start_time": dataHeaders['servertime'],
                "is_multi": "multi",
                "quest_name": "",
                "item_list": scoreRewardsResult.items,
                "presigned_quest_category": [],
                "mate_player_result": body.mate_player_result || [],
                "contribution_score": (_m = body.contribution_score) !== null && _m !== void 0 ? _m : 0,
                "host_finished": true,
                "aborted_play_id": null,
            }
        });
    }));
    // ---- abort ----
    fastify.post("/abort", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] abort: viewer=${viewerId} quest=${body.quest_id} category=${body.category}`);
        if (isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        const ctx = yield resolvePlayer(viewerId);
        if (!ctx) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id or no player bound."
            });
        }
        const { playerId, player } = ctx;
        const activeQuestData = singleBattleQuest_1.activeQuests[playerId];
        if (activeQuestData) {
            if (activeQuestData.roomNumber) {
                const room = (0, manager_1.getRoom)(activeQuestData.roomNumber);
                if (room && room.host_player_id === playerId) {
                    (0, manager_1.disbandRoom)(activeQuestData.roomNumber);
                    console.log(`[MULTI] abort: room ${activeQuestData.roomNumber} disbanded (host abandoned)`);
                }
            }
            delete singleBattleQuest_1.activeQuests[playerId];
            (0, quest_active_1.deletePlayerActiveQuestSync)(playerId);
            if (activeQuestData.roomNumber) {
                SessionManager_1.sessionManager.clearBattleExpectedCount(activeQuestData.roomNumber);
            }
        }
        const headers = (0, utils_1.generateDataHeaders)({ viewer_id: viewerId });
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": headers,
            "data": {
                "user_info": {},
                "category_id": body.category,
                "is_multi": "multi",
                "start_time": headers['servertime'],
                "quest_name": "",
                "aborted_play_id": null,
                "unfinished_play_id": null,
                "drawn_quest": null,
                "party_info": null,
                "presigned_url": null
            }
        });
    }));
    // ---- play_continue ----
    fastify.post("/play_continue", (request, reply) => __awaiter(this, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] play_continue: viewer=${viewerId} quest=${body.quest_id} category=${body.category}`);
        if (isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }
        const ctx = yield resolvePlayer(viewerId);
        if (!ctx || !ctx.player) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id or no player bound."
            });
        }
        const { playerId } = ctx;
        if (singleBattleQuest_1.activeQuests[playerId] === undefined) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "No active quest to continue."
            });
        }
        const activeData = singleBattleQuest_1.activeQuests[playerId];
        activeData.continueCount++;
        (0, quest_active_1.updatePlayerActiveQuestContinueCountSync)(playerId, activeData.continueCount);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({ viewer_id: viewerId }),
            "data": {
                continue_count: activeData.continueCount,
            }
        });
    }));
}
exports.registerBattleRoutes = registerBattleRoutes;

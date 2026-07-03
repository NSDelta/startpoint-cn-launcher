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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertActiveQuest = exports.activeQuests = void 0;
const quest_active_1 = require("../../data/domains/quest_active");
const rushEvent_1 = require("../../data/domains/rushEvent");
const player_1 = require("../../data/domains/player");
const item_1 = require("../../data/domains/item");
const quest_1 = require("../../data/domains/quest");
const carnivalEvent_1 = require("../../data/domains/carnivalEvent");
const assets_1 = require("../../lib/assets");
const character_1 = require("../../lib/character");
const quest_2 = require("../../lib/quest");
const types_1 = require("../../lib/types");
const utils_1 = require("../../utils");
const rushEvent_2 = require("./rushEvent");
const stamina_1 = require("../../lib/stamina");
const stamina_cost_1 = require("../../lib/stamina-cost");
const carnival_handler_1 = require("../../lib/quest/finish/carnival-handler");
const rush_handler_1 = require("../../lib/quest/finish/rush-handler");
const raid_handler_1 = require("../../lib/quest/finish/raid-handler");
const quest_calc_1 = require("../../lib/quest/finish/quest-calc");
const session_validator_1 = require("../../lib/quest/finish/session-validator");
const challenge_point_1 = require("../../lib/quest/finish/challenge-point");
const character_clear_tracker_1 = require("../../lib/quest/finish/character-clear-tracker");
const powerflip_tracker_1 = require("../../lib/quest/finish/powerflip-tracker");
const leader_powerflip_tracker_1 = require("../../lib/quest/finish/leader-powerflip-tracker");
const party_co_clear_tracker_1 = require("../../lib/quest/finish/party-co-clear-tracker");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const quest_entry_costs_json_1 = __importDefault(require("../../../assets/quest_entry_costs.json"));
const score_attack_border_reward_json_1 = __importDefault(require("../../../assets/score_attack_border_reward.json"));
const event_challenge_point_map_json_1 = __importDefault(require("../../../assets/event_challenge_point_map.json"));
// Load carnival quest score data
let carnivalScoreLookup = {};
try {
    const scorePath = path_1.default.join(process.cwd(), "assets", "carnival_event_quest_scores.json");
    if ((0, fs_1.existsSync)(scorePath)) {
        carnivalScoreLookup = JSON.parse((0, fs_1.readFileSync)(scorePath, "utf-8"));
    }
}
catch (_a) { } // Init failed silently; carnival scoring won't work
const rush_1 = require("../../lib/rush");
const continueVmoneyCost = 50;
exports.activeQuests = {};
function insertActiveQuest(playerId, quest) {
    var _a, _b, _c;
    exports.activeQuests[playerId] = quest;
    // Persist to DB for battle recovery across server restarts
    (0, quest_active_1.insertPlayerActiveQuestSync)(playerId, {
        playerId,
        playId: quest.playId,
        questId: quest.questId,
        category: quest.category,
        useBossBoostPoint: quest.useBossBoostPoint,
        useBoostPoint: quest.useBoostPoint,
        isAutoStartMode: quest.isAutoStartMode,
        isMulti: quest.isMulti,
        roomNumber: (_a = quest.roomNumber) !== null && _a !== void 0 ? _a : null,
        entryItemId: (_b = quest.entryItemId) !== null && _b !== void 0 ? _b : null,
        eventId: (_c = quest.eventId) !== null && _c !== void 0 ? _c : null,
        continueCount: quest.continueCount
    });
}
exports.insertActiveQuest = insertActiveQuest;
const routes = (fastify) => __awaiter(void 0, void 0, void 0, function* () {
    fastify.post("/finish", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
        const body = request.body;
        const viewerId = body.viewer_id;
        if (!viewerId || isNaN(viewerId))
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const sessionResult = yield (0, session_validator_1.validateSessionAndPlayer)(viewerId);
        if (!sessionResult)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id."
            });
        const { playerId, playerData } = sessionResult;
        // get active quest data
        const activeQuestData = exports.activeQuests[playerId];
        console.log(`[FINISH] req: playerId=${playerId} questId=${body.quest_id} category=${body.category} activeExists=${activeQuestData !== undefined} multi=${(_b = activeQuestData === null || activeQuestData === void 0 ? void 0 : activeQuestData.isMulti) !== null && _b !== void 0 ? _b : false}`);
        if (activeQuestData === undefined)
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "No active quest to finish."
            });
        const questCategory = activeQuestData.category;
        const questId = activeQuestData.questId;
        console.log(`[FINISH] active: category=${questCategory} questId=${questId}`);
        const questData = (0, assets_1.getQuestFromCategorySync)(questCategory, questId);
        if (questData === null || !('rankPointReward' in questData)) {
            console.log(`[BATTLE] finish failed: category=${questCategory} questId=${questId} found=${!!questData} hasRankReward=${questData ? ('rankPointReward' in questData) : 'N/A'}`);
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "Quest doesn't exist."
            });
        }
        // delete the active quest data from global record
        delete exports.activeQuests[playerId];
        (0, quest_active_1.deletePlayerActiveQuestSync)(playerId);
        // calculate clear rank
        const clearTime = body.elapsed_time_ms;
        const clearRank = (0, quest_calc_1.calculateClearRank)(clearTime, questData);
        // calculate player rewards
        const newExpPool = playerData.expPool + questData.poolExpReward;
        const beforeRankPoint = playerData.rankPoint;
        const newRankPoint = beforeRankPoint + questData.rankPointReward;
        let newMana = playerData.freeMana + questData.manaReward + body.add_mana;
        const manaObtained = questData.manaReward + body.add_mana;
        // calculate boost point
        let newBoostPoint = playerData.boostPoint - (activeQuestData.useBoostPoint ? 1 : 0);
        let newBossBoostPoint = playerData.bossBoostPoint - (activeQuestData.useBossBoostPoint ? 1 : 0);
        let useBoostPoint = (activeQuestData.useBoostPoint && (newBoostPoint >= 0)) || (activeQuestData.useBossBoostPoint && (newBossBoostPoint >= 0));
        // check current quest progress
        const questProgress = (0, quest_1.getPlayerSingleQuestProgressSync)(playerId, questCategory, questId);
        const questPreviouslyCompleted = questProgress !== null;
        // Score attack: accomplished determined by border reward minimum tier (from CDN)
        let questAccomplished = body.is_accomplished;
        if (questCategory === types_1.QuestCategory.SCORE_ATTACK_EVENT) {
            const eventId = questData.eventId;
            const folderId = questData.folderId;
            if (eventId !== undefined && folderId !== undefined) {
                const borderTiers = score_attack_border_reward_json_1.default[`${eventId}_${folderId}`];
                if (borderTiers && borderTiers.length > 0) {
                    questAccomplished = body.score >= borderTiers[0].score;
                }
            }
        }
        const clearReward = !questPreviouslyCompleted && questData.clearReward !== undefined ? (0, quest_2.givePlayerRewardSync)(playerId, questData.clearReward) : null;
        const sPlusClearReward = (clearRank === 5) && ((questProgress === null || questProgress === void 0 ? void 0 : questProgress.clearRank) !== 5) && (questData.sPlusReward !== undefined) ? (0, quest_2.givePlayerRewardSync)(playerId, questData.sPlusReward) : null;
        const leaderId = (_c = body.statistics.party.characters[0]) === null || _c === void 0 ? void 0 : _c.id;
        if (questAccomplished) {
            // update quest progress
            if (questPreviouslyCompleted) {
                // simply update the quest progress if it already exists.
                const updateData = {
                    questId: questId,
                    finished: true,
                    bestElapsedTimeMs: questProgress.bestElapsedTimeMs === undefined || questProgress.bestElapsedTimeMs === null ? clearTime : Math.min(clearTime, questProgress.bestElapsedTimeMs),
                    highScore: questProgress.highScore === undefined ? body.score : Math.max(body.score, questProgress.highScore),
                    leaderCharacterId: leaderId !== null && leaderId !== void 0 ? leaderId : null
                };
                if (clearRank !== null) {
                    updateData.clearRank = questProgress.clearRank === undefined ? clearRank : Math.max(clearRank, questProgress.clearRank);
                }
                (0, quest_1.updatePlayerQuestProgressSync)(playerId, questCategory, updateData);
            }
            else {
                // insert if it doesn't already exist.
                const insertData = {
                    questId: questId,
                    finished: true,
                    bestElapsedTimeMs: clearTime,
                    highScore: body.score,
                    clearRank: clearRank !== null && clearRank !== void 0 ? clearRank : 5,
                    leaderCharacterId: leaderId !== null && leaderId !== void 0 ? leaderId : null
                };
                (0, quest_1.insertPlayerQuestProgressSync)(playerId, questCategory, insertData);
            }
        }
        // update player
        const oldRkDegree = (0, stamina_1.getRankDegree)(beforeRankPoint);
        const newDegreeId = (0, stamina_1.getRankDegree)(newRankPoint);
        const didLevelUp = newDegreeId > oldRkDegree;
        (0, player_1.updatePlayerSync)(Object.assign({ id: playerId, freeMana: newMana, expPool: newExpPool, rankPoint: newRankPoint, boostPoint: newBoostPoint, bossBoostPoint: newBossBoostPoint, totalManaObtained: ((_d = playerData.totalManaObtained) !== null && _d !== void 0 ? _d : 0) + manaObtained, maxComboAchieved: Math.max((_e = playerData.maxComboAchieved) !== null && _e !== void 0 ? _e : 0, (_g = (_f = body.statistics) === null || _f === void 0 ? void 0 : _f.max_combo_count) !== null && _g !== void 0 ? _g : 0) }, (didLevelUp ? { stamina: playerData.stamina + (0, stamina_1.getMaxStamina)(newDegreeId), staminaHealTime: new Date() } : {})));
        if (didLevelUp) {
            playerData.stamina = playerData.stamina + (0, stamina_1.getMaxStamina)(newDegreeId);
            playerData.staminaHealTime = new Date();
            console.log(`[BATTLE-FINISH] player ${playerId} leveled up: ${oldRkDegree} -> ${newDegreeId}, stamina refilled`);
        }
        // Consume daily challenge point
        const dailyChallengePointList = (0, challenge_point_1.handleDailyChallengePoint)({
            questCategory,
            eventId: questData.eventId,
            playerId,
            challengePointMap: event_challenge_point_map_json_1.default,
            getEntries: (pid) => (0, player_1.getPlayerDailyChallengePointListSync)(pid),
            updatePoint: (pid, id, pt) => (0, player_1.updatePlayerDailyChallengePointSync)(pid, id, pt),
        });
        // reward score rewards
        if (questCategory === types_1.QuestCategory.SCORE_ATTACK_EVENT) {
            console.log(`[SCORE_ATTACK] questId=${questId} body={score:${body.score}, elapsed:${body.elapsed_time_ms}, accomplished:${body.is_accomplished}, addMana:${body.add_mana}, continue:${body.continue_count}}`);
            console.log(`[SCORE_ATTACK] questData={groupId:${questData.scoreRewardGroupId}, groupLen:${(_j = (_h = questData.scoreRewardGroup) === null || _h === void 0 ? void 0 : _h.length) !== null && _j !== void 0 ? _j : 'null'}, bRank:${questData.bRankTime}, aRank:${questData.aRankTime}, sRank:${questData.sRankTime}, sPlus:${questData.sPlusRankTime}, rankPt:${questData.rankPointReward}, charExp:${questData.characterExpReward}, mana:${questData.manaReward}, poolExp:${questData.poolExpReward}, clearReward:${(_l = (_k = questData.clearReward) === null || _k === void 0 ? void 0 : _k.id) !== null && _l !== void 0 ? _l : 'none'}}`);
        }
        console.log(`[BATTLE] scoreReward groupId=${questData.scoreRewardGroupId} groupLen=${(_o = (_m = questData.scoreRewardGroup) === null || _m === void 0 ? void 0 : _m.length) !== null && _o !== void 0 ? _o : 'null'} questId=${questId} category=${questCategory}`);
        const scoreRewardsResult = (0, quest_2.givePlayerScoreRewardsSync)(playerId, questData.scoreRewardGroupId, questData.scoreRewardGroup, useBoostPoint, questData.element);
        let scoreAttackRewardIds = [];
        if (questCategory === types_1.QuestCategory.SCORE_ATTACK_EVENT) {
            // Look up border rewards for score attack events
            const eventId = questData.eventId;
            const folderId = questData.folderId;
            if (eventId !== undefined && folderId !== undefined) {
                const borderKey = `${eventId}_${folderId}`;
                const borderTiers = score_attack_border_reward_json_1.default[borderKey];
                if (borderTiers) {
                    // Find highest tier the player's score qualifies for
                    let matched = null;
                    for (const tier of borderTiers) {
                        if (body.score >= tier.score) {
                            matched = tier;
                        }
                    }
                    if (matched) {
                        console.log(`[SCORE_ATTACK] borderReward matched: score=${body.score} tierScore=${matched.score} coinItem=${matched.coinItemId}x${matched.coinCount}`);
                        // Give coin item only (rewardItemId=16001 does not exist in CDN)
                        if (matched.coinItemId > 0 && matched.coinCount > 0) {
                            (0, item_1.givePlayerItemSync)(playerId, matched.coinItemId, matched.coinCount);
                            scoreRewardsResult.items[String(matched.coinItemId)] = ((_p = scoreRewardsResult.items[String(matched.coinItemId)]) !== null && _p !== void 0 ? _p : 0) + matched.coinCount;
                            scoreAttackRewardIds.push(matched.coinItemId);
                        }
                    }
                }
            }
            console.log(`[SCORE_ATTACK] afterReward: dropIds=${JSON.stringify(scoreRewardsResult.drop_score_reward_ids)}, drops=${scoreRewardsResult.drop_score_reward_ids.length}, items=${JSON.stringify(scoreRewardsResult.items)}, equipList=${(_r = (_q = scoreRewardsResult.equipment_list) === null || _q === void 0 ? void 0 : _q.length) !== null && _r !== void 0 ? _r : 0}`);
            console.log(`[SCORE_ATTACK] response: accomplished=${questAccomplished}, clearRank=${clearRank}, score=${body.score}, elapsed=${body.elapsed_time_ms}, items=${JSON.stringify(scoreRewardsResult.items)}, clientCategory=${questCategory}`);
        }
        // reward character exp
        const bodyPartyStatistics = body.statistics.party;
        const partyCharacterIds = [...bodyPartyStatistics.characters, ...bodyPartyStatistics.unison_characters];
        // Build finish context for mission trackers
        const finishCtx = {
            playerId, questCategory, questId,
            questAccomplished,
            clearTime: body.elapsed_time_ms,
            clearRank,
            party: body.statistics.party,
            statistics: body.statistics,
            player: playerData,
            questPreviouslyCompleted,
            questProgress,
        };
        // Track mission progress (decoupled from core quest mechanics)
        (0, character_clear_tracker_1.trackCharacterClears)(finishCtx);
        (0, leader_powerflip_tracker_1.trackLeaderPowerflip)(finishCtx);
        (0, party_co_clear_tracker_1.trackPartyCoClears)(finishCtx);
        (0, powerflip_tracker_1.trackPowerflip)(finishCtx);
        const partyCharacterIdsArray = [];
        for (const value of partyCharacterIds.values()) {
            if (value !== null && value.id !== null)
                partyCharacterIdsArray.push(value.id);
        }
        const addExpAmount = questData.characterExpReward;
        const rewardCharacterExpResult = (0, character_1.givePlayerCharactersExpSync)(playerId, partyCharacterIdsArray, addExpAmount, questData.fixedParty !== undefined);
        const dataHeaders = (0, utils_1.generateDataHeaders)({
            viewer_id: viewerId
        });
        // handle event quest-specific data & rewards
        const { rushEventData, rushEventRewardsResult } = (0, rush_handler_1.handleRushEventFinish)({
            questCategory,
            questData,
            clearTime,
            party: bodyPartyStatistics,
            playerId,
            questId,
            getEvoLevels: (pid, chars) => (0, character_1.getCharactersEvolutionImgLevels)(pid, chars),
            folderMaxRounds: rushEvent_2.rushEventFolderMaxRounds,
            getRushEvent: (pid, eid) => (0, rushEvent_1.getPlayerRushEventSync)(pid, eid),
            updateRushEvent: (pid, data) => (0, rushEvent_1.updatePlayerRushEventSync)(pid, data),
            insertParty: (pid, eid, p) => (0, rushEvent_1.insertPlayerRushEventPlayedPartySync)(pid, eid, p),
            insertClearedFolder: (pid, eid, fid) => (0, rushEvent_1.insertPlayerRushEventClearedFolderSync)(pid, eid, fid),
            deletePartyList: (pid, eid, bt) => (0, rushEvent_1.deletePlayerRushEventPlayedPartyListSync)(pid, eid, bt),
            getSerializedParties: (pid, eid) => (0, rush_1.getSerializedPlayerRushEventPlayedPartiesSync)(pid, eid),
            getFolderRewards: (eid, fid) => (0, assets_1.getRushEventFolderClearRewards)(eid, fid),
            giveRewards: (pid, r) => (0, quest_2.givePlayerRewardsSync)(pid, r),
        });
        // Record played party for RAID_EVENT
        (0, raid_handler_1.handleRaidEventFinish)({
            questCategory,
            activeEventId: activeQuestData.eventId,
            party: bodyPartyStatistics,
            playerId,
            questId,
            getEvoLevelsFn: (pid, chars) => (0, character_1.getCharactersEvolutionImgLevels)(pid, chars),
            insertPartyFn: (pid, eid, p) => (0, rushEvent_1.insertPlayerRushEventPlayedPartySync)(pid, eid, p),
        });
        // handle carnival event score & records
        const carnivalEventData = (0, carnival_handler_1.handleCarnivalEventFinish)({
            questCategory,
            questAccomplished,
            questId,
            clearTime,
            party: bodyPartyStatistics,
            playerId,
            carnivalLookup: carnivalScoreLookup,
            upsertFn: (pid, eid, fid, score, chars, unisons) => (0, carnivalEvent_1.upsertPlayerCarnivalEventRecordSync)(pid, eid, fid, score, chars, unisons),
        });
        const itemList = Object.assign(Object.assign(Object.assign({}, (activeQuestData.entryItemId ? { [activeQuestData.entryItemId]: (_s = (0, item_1.getPlayerItemSync)(playerId, activeQuestData.entryItemId)) !== null && _s !== void 0 ? _s : 0 } : {})), scoreRewardsResult.items), ((_t = rushEventRewardsResult === null || rushEventRewardsResult === void 0 ? void 0 : rushEventRewardsResult.items) !== null && _t !== void 0 ? _t : {}));
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
                    "field_mana": body.add_mana
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
                    ...((sPlusClearReward === null || sPlusClearReward === void 0 ? void 0 : sPlusClearReward.equipment_list) || []),
                    ...((rushEventRewardsResult === null || rushEventRewardsResult === void 0 ? void 0 : rushEventRewardsResult.equipment_list) || [])
                ],
                "category_id": body.category,
                "start_time": dataHeaders['servertime'],
                "is_multi": "single",
                "quest_name": "",
                "item_list": itemList,
                "rush_event": rushEventData,
                "carnival_event": carnivalEventData,
                "user_daily_challenge_point_list": dailyChallengePointList !== null && dailyChallengePointList !== void 0 ? dailyChallengePointList : [],
                "presigned_quest_category": []
            }
        });
    }));
    fastify.post("/abort", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        if (isNaN(viewerId))
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const sessionResult = yield (0, session_validator_1.validateSessionAndPlayer)(viewerId);
        if (!sessionResult)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id."
            });
        const { playerId } = sessionResult;
        const headers = (0, utils_1.generateDataHeaders)({ viewer_id: body.viewer_id });
        // delete existing active quest
        delete exports.activeQuests[playerId];
        (0, quest_active_1.deletePlayerActiveQuestSync)(playerId);
        return reply.status(200).send({
            "data_headers": headers,
            "data": {
                "user_info": {},
                "category_id": body.category,
                "is_multi": "single",
                "start_time": headers['servertime'],
                "quest_name": ""
            }
        });
    }));
    fastify.post("/start", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        var _u, _v, _w;
        const body = request.body;
        const viewerId = body.viewer_id;
        const partyId = body.party_id;
        const questId = body.quest_id;
        const category = body.category;
        const useBoostPoint = body.use_boost_point;
        const useBossBoostPoint = body.use_boss_boost_point;
        const isAutoStartMode = body.is_auto_start_mode;
        if (isNaN(viewerId) || isNaN(partyId) || isNaN(questId) || isNaN(category) || useBoostPoint === undefined || useBossBoostPoint === undefined || isAutoStartMode === undefined)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const sessionResult = yield (0, session_validator_1.validateSessionAndPlayer)(viewerId);
        if (!sessionResult)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id."
            });
        const { playerId, playerData: player } = sessionResult;
        // get quest data
        const questData = (0, assets_1.getQuestFromCategorySync)(category, questId);
        if (questData === null || !('rankPointReward' in questData)) {
            console.log(`[BATTLE] start failed: category=${category} questId=${questId} found=${!!questData} hasRankReward=${questData ? ('rankPointReward' in questData) : 'N/A'}`);
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "Quest doesn't exist."
            });
        }
        // Deduct entry cost (ticket/item)
        const questKey = `${category}_${questId}`;
        const entryCost = quest_entry_costs_json_1.default[questKey];
        const staminaInfo = (0, stamina_cost_1.getStaminaCost)(questKey);
        console.log(`[BATTLE] start entry: questId=${questId} questKey=${questKey} entryCost=${JSON.stringify(entryCost)} discountRate=${staminaInfo.rate} baseStamina=${staminaInfo.baseCost}→${staminaInfo.cost}`);
        if (entryCost && entryCost.itemId > 0) {
            const playerItemCount = (_u = (0, item_1.getPlayerItemSync)(playerId, entryCost.itemId)) !== null && _u !== void 0 ? _u : 0;
            console.log(`[BATTLE] start deduct: itemId=${entryCost.itemId} playerHas=${playerItemCount} need=${entryCost.itemCount}`);
            if (playerItemCount < entryCost.itemCount) {
                return reply.status(400).send({
                    "error": "Bad Request",
                    "message": `Not enough entry items (need ${entryCost.itemCount} of ${entryCost.itemId}, have ${playerItemCount}).`
                });
            }
            (0, item_1.updatePlayerItemSync)(playerId, entryCost.itemId, playerItemCount - entryCost.itemCount);
        }
        // Deduct stamina cost
        const staminaCost = staminaInfo.cost;
        let afterStamina = 0;
        if (staminaCost > 0) {
            const currentStamina = (0, stamina_1.computeRealTimeStamina)(player);
            if (currentStamina < staminaCost) {
                console.warn(`[BATTLE-START] player ${playerId} stamina insufficient: ${currentStamina} < ${staminaCost}`);
                return reply.status(400).send({
                    "error": "Bad Request",
                    "message": "Insufficient stamina."
                });
            }
            const newStamina = Math.max(0, currentStamina - staminaCost);
            (0, player_1.updatePlayerSync)({
                id: playerId,
                stamina: newStamina,
                staminaHealTime: new Date(),
                totalStaminaUsed: ((_v = player.totalStaminaUsed) !== null && _v !== void 0 ? _v : 0) + staminaCost
            });
            afterStamina = newStamina;
            console.log(`[BATTLE-START] stamina: ${currentStamina} -> ${newStamina} (cost: ${staminaCost}, rate: ${staminaInfo.rate})`);
        }
        else {
            // No stamina deduction, read current stamina for response
            const player = (0, player_1.getPlayerSync)(playerId);
            afterStamina = (_w = player === null || player === void 0 ? void 0 : player.stamina) !== null && _w !== void 0 ? _w : 0;
        }
        // add to active quests table
        delete exports.activeQuests[playerId];
        exports.activeQuests[playerId] = {
            questId: questId,
            category: category,
            useBoostPoint: useBoostPoint,
            useBossBoostPoint: useBossBoostPoint,
            isAutoStartMode: isAutoStartMode,
            isMulti: false,
            entryItemId: entryCost === null || entryCost === void 0 ? void 0 : entryCost.itemId,
            playId: body.play_id,
            continueCount: 0
        };
        // update player last party slot
        if (questData.fixedParty === undefined) {
            (0, player_1.updatePlayerSync)({
                id: playerId,
                partySlot: partyId
            });
        }
        const dataHeaders = (0, utils_1.generateDataHeaders)({
            viewer_id: viewerId
        });
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": dataHeaders,
            "data": {
                "user_info": {
                    "last_main_quest_id": body.quest_id,
                    "stamina": afterStamina,
                    "stamina_heal_time": (0, utils_1.realToVirtual)(new Date())
                },
                "category_id": body.category,
                "is_multi": "single",
                "start_time": dataHeaders['servertime'],
                "quest_name": ""
            }
        });
    }));
    fastify.post("/play_continue", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
        const body = request.body;
        const viewerId = body.viewer_id;
        if (isNaN(viewerId))
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        const sessionResult = yield (0, session_validator_1.validateSessionAndPlayer)(viewerId);
        if (!sessionResult)
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id."
            });
        const { playerId, playerData: player } = sessionResult;
        // get active quest data
        const activeQuestData = exports.activeQuests[playerId];
        if (activeQuestData === undefined)
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "No active quest to continue."
            });
        const freeVmoney = player.freeVmoney;
        const newFreeVmoney = freeVmoney - continueVmoneyCost;
        const vmoney = player.vmoney;
        const newVmoney = 0 > newFreeVmoney ? vmoney - continueVmoneyCost : vmoney;
        if (0 > newFreeVmoney && 0 > newVmoney)
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "Not enough vmoney to continue"
            });
        // update the player's vmoney balances
        const setNewFreeVmoney = 0 > newFreeVmoney ? freeVmoney : newFreeVmoney;
        (0, player_1.updatePlayerSync)({
            id: playerId,
            freeVmoney: setNewFreeVmoney,
            vmoney: newVmoney
        });
        // increment continue count for battle recovery
        activeQuestData.continueCount++;
        (0, quest_active_1.updatePlayerActiveQuestContinueCountSync)(playerId, activeQuestData.continueCount);
        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": (0, utils_1.generateDataHeaders)({
                viewer_id: viewerId
            }),
            "data": {
                "user_info": {
                    "free_vmoney": setNewFreeVmoney,
                    "vmoney": newVmoney
                },
                "mail_arrived": false
            }
        });
    }));
});
exports.default = routes;

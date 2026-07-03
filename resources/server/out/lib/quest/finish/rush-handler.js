"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRushEventFinish = void 0;
const types_1 = require("../../../data/types");
const types_2 = require("../../types");
function handleRushEventFinish(params) {
    var _a, _b, _c, _d, _e, _f;
    const { questCategory, questData, clearTime, party, playerId, questId, getEvoLevels, folderMaxRounds, getRushEvent, updateRushEvent, insertParty, insertClearedFolder, deletePartyList, getSerializedParties, getFolderRewards, giveRewards } = params;
    let rushEventData = null;
    let rushEventRewardsResult = null;
    if (questCategory !== types_2.QuestCategory.RUSH_EVENT) {
        return { rushEventData, rushEventRewardsResult };
    }
    const rushEventId = questData.rushEventId;
    const rushEventFolderId = questData.rushEventFolderId;
    const rushEventRound = questData.rushEventRound;
    if (rushEventFolderId === undefined || rushEventRound === undefined || rushEventId === undefined) {
        return { rushEventData, rushEventRewardsResult };
    }
    const rushEventBattleType = rushEventRound === 0 ? types_1.RushEventBattleType.ENDLESS : types_1.RushEventBattleType.FOLDER;
    const characterIds = party.characters.map(val => { var _a; return (_a = val === null || val === void 0 ? void 0 : val.id) !== null && _a !== void 0 ? _a : null; });
    const unisonCharacterIds = party.unison_characters.map(val => { var _a; return (_a = val === null || val === void 0 ? void 0 : val.id) !== null && _a !== void 0 ? _a : null; });
    const evolutionImgLevels = getEvoLevels(playerId, characterIds);
    const unisonEvolutionImgLevels = getEvoLevels(playerId, unisonCharacterIds);
    let round = questId;
    let oldEndlessMaxRound = null;
    let oldBestElapsedTimeMs = null;
    let newEndlessMaxRound = null;
    let newEndlessNextRound = null;
    let newBestElapsedTimeMs = null;
    if (rushEventBattleType === types_1.RushEventBattleType.ENDLESS) {
        const playerRushEventData = getRushEvent(playerId, rushEventId);
        const playerNextRound = (_a = playerRushEventData === null || playerRushEventData === void 0 ? void 0 : playerRushEventData.endlessBattleNextRound) !== null && _a !== void 0 ? _a : 1;
        const playerMaxRound = (_b = playerRushEventData === null || playerRushEventData === void 0 ? void 0 : playerRushEventData.endlessBattleMaxRound) !== null && _b !== void 0 ? _b : 1;
        const playerBestClearTime = (_c = playerRushEventData === null || playerRushEventData === void 0 ? void 0 : playerRushEventData.endlessBattleMaxRoundTime) !== null && _c !== void 0 ? _c : Number.MAX_SAFE_INTEGER;
        round = playerNextRound;
        oldEndlessMaxRound = playerMaxRound;
        oldBestElapsedTimeMs = playerBestClearTime < Number.MAX_SAFE_INTEGER ? playerBestClearTime : null;
        const isNewRecord = (playerNextRound >= playerMaxRound && playerBestClearTime >= clearTime) || (playerNextRound > playerMaxRound);
        if (isNewRecord) {
            updateRushEvent(playerId, {
                eventId: rushEventId,
                endlessBattleMaxRound: playerNextRound,
                endlessBattleMaxRoundTime: clearTime,
                endlessBattleMaxRoundCharacterIds: characterIds,
                endlessBattleMaxRoundCharacterEvolutionImgLvls: evolutionImgLevels
            });
            newEndlessMaxRound = playerNextRound;
            newBestElapsedTimeMs = clearTime;
        }
        else {
            newEndlessMaxRound = playerMaxRound;
            newBestElapsedTimeMs = playerBestClearTime < Number.MAX_SAFE_INTEGER ? playerBestClearTime : null;
        }
        newEndlessNextRound = playerNextRound + 1;
        insertParty(playerId, rushEventId, {
            characterIds, unisonCharacterIds,
            equipmentIds: party.equipments.map(val => { var _a; return (_a = val === null || val === void 0 ? void 0 : val.id) !== null && _a !== void 0 ? _a : null; }),
            abilitySoulIds: party.ability_soul_ids,
            evolutionImgLevels, unisonEvolutionImgLevels,
            battleType: rushEventBattleType, round
        });
    }
    else if (rushEventBattleType === types_1.RushEventBattleType.FOLDER) {
        const isFolderFinal = rushEventRound >= ((_d = folderMaxRounds[rushEventFolderId]) !== null && _d !== void 0 ? _d : 0);
        if (isFolderFinal) {
            insertClearedFolder(playerId, rushEventId, rushEventFolderId);
            updateRushEvent(playerId, { eventId: rushEventId, activeRushBattleFolderId: null });
            deletePartyList(playerId, rushEventId, rushEventBattleType);
        }
        else {
            insertParty(playerId, rushEventId, {
                characterIds, unisonCharacterIds,
                equipmentIds: party.equipments.map(val => { var _a; return (_a = val === null || val === void 0 ? void 0 : val.id) !== null && _a !== void 0 ? _a : null; }),
                abilitySoulIds: party.ability_soul_ids,
                evolutionImgLevels, unisonEvolutionImgLevels,
                battleType: rushEventBattleType, round
            });
        }
    }
    const serializedPlayedParties = getSerializedParties(playerId, rushEventId);
    const isEndless = rushEventBattleType === types_1.RushEventBattleType.ENDLESS;
    rushEventData = {
        "rush_battle_reward_list": [],
        "rush_battle_played_party_list": serializedPlayedParties.folderParties,
        "endless_battle_played_party_list": serializedPlayedParties.endlessParties,
        "is_out_of_period": false,
        "endless_battle_next_round": isEndless ? newEndlessNextRound : null,
        "endless_battle_max_round": isEndless ? newEndlessMaxRound : null,
        "high_score": isEndless ? clearTime : null,
        "best_elapsed_time_ms": isEndless ? newBestElapsedTimeMs : null,
        "old_endless_battle_max_round": isEndless ? oldEndlessMaxRound : null,
        "old_best_elapsed_time_ms": isEndless ? oldBestElapsedTimeMs : null
    };
    if (rushEventBattleType === types_1.RushEventBattleType.FOLDER && rushEventRound >= ((_e = folderMaxRounds[rushEventFolderId]) !== null && _e !== void 0 ? _e : 0)) {
        const rewards = (_f = getFolderRewards(rushEventId, rushEventFolderId)) !== null && _f !== void 0 ? _f : [];
        rushEventRewardsResult = giveRewards(playerId, rewards);
        rushEventData.rush_battle_reward_list = rewards.map(reward => {
            const itemReward = reward;
            return { "kind": 1, "kind_id": itemReward.id, "number": itemReward.count };
        });
    }
    return { rushEventData, rushEventRewardsResult };
}
exports.handleRushEventFinish = handleRushEventFinish;

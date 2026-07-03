"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMergedPlayerDataSync = exports.getClientSerializedData = exports.getDefaultPlayerData = void 0;
const serialize_player_1 = require("./serialize-player");
const utils_1 = require("../../utils");
const rushEvent_1 = require("../domains/rushEvent");
const mission_1 = require("../domains/mission");
const boxGacha_1 = require("../domains/boxGacha");
const character_1 = require("../domains/character");
const player_1 = require("../domains/player");
const quest_1 = require("../domains/quest");
const equipment_1 = require("../domains/equipment");
const gacha_1 = require("../domains/gacha");
const item_1 = require("../domains/item");
const campaign_1 = require("../domains/campaign");
const option_1 = require("../domains/option");
const party_1 = require("../domains/party");
const tutorial_1 = require("../domains/tutorial");
const index_1 = require("../../lib/mission/index");
const index_2 = require("../../lib/mission/index");
/**
 * Generates default player data.
 *
 * @returns The generated default player data.
 */
function getDefaultPlayerData() {
    const now = (0, utils_1.getServerDate)();
    // Default values aligned with CN client PlayerSaveDataTools.createDummy()
    return {
        stamina: 10,
        staminaHealTime: new Date(),
        boostPoint: 10,
        bossBoostPoint: 3,
        transitionState: 0,
        role: 1,
        name: "冒险者",
        lastLoginTime: now,
        comment: "よろしくお願いします",
        vmoney: 100,
        freeVmoney: 100,
        rankPoint: 0,
        starCrumb: 2,
        bondToken: 10,
        expPool: 0,
        expPooledTime: now,
        leaderCharacterId: 1,
        partySlot: 1,
        degreeId: 1,
        birth: 19900101,
        freeMana: 2000,
        paidMana: 2000,
        enableAuto3x: false,
        totalStaminaUsed: 0,
        totalPowerflips: 0,
        totalDashes: 0,
        totalManaObtained: 0,
        maxComboAchieved: 0,
        totalLoginDays: 0,
        tutorialStep: 0,
        tutorialSkipFlag: null,
        tutorialGachaCharacterId: null,
        timeOffset: null
    };
}
exports.getDefaultPlayerData = getDefaultPlayerData;
/**
 * Takes a playerID and returns all of the necessary data for the game client.
 *
 * @param playerId
 * @param viewerId
 * @returns
 */
function getClientSerializedData(playerId, options) {
    var _a;
    const playerData = (0, player_1.getPlayerSync)(playerId);
    if (playerData === null)
        return null;
    const doSerializeRushEventData = (_a = options.serializeRushEventData) !== null && _a !== void 0 ? _a : false;
    // Compute awake mission summary for /load injection
    const awakeSummary = (0, index_2.computeAwakeSummary)(playerId);
    return (0, serialize_player_1.serializePlayerData)({
        player: playerData,
        dailyChallengePointList: (0, player_1.getPlayerDailyChallengePointListSync)(playerId),
        triggeredTutorial: (0, tutorial_1.getPlayerTriggeredTutorialsSync)(playerId),
        clearedRegularMissionList: (0, mission_1.getPlayerClearedRegularMissionListSync)(playerId),
        characterList: (0, character_1.getPlayerCharactersSync)(playerId),
        characterManaNodeList: (0, character_1.getPlayerCharactersManaNodesSync)(playerId),
        characterManaNodeAwakeLevels: (0, character_1.getPlayerCharactersManaNodeAwakeLevelsSync)(playerId),
        partyGroupList: (0, party_1.getPlayerPartyGroupListSync)(playerId),
        itemList: (0, item_1.getPlayerItemsSync)(playerId),
        equipmentList: (0, equipment_1.getPlayerEquipmentListSync)(playerId),
        questProgress: (0, quest_1.getPlayerQuestProgressSync)(playerId),
        gachaInfoList: (0, gacha_1.getPlayerGachaInfoListSync)(playerId),
        gachaCampaignList: (0, gacha_1.getPlayerGachaCampaignListSync)(playerId),
        drawnQuestList: (0, quest_1.getPlayerDrawnQuestsSync)(playerId),
        periodicRewardPointList: (0, campaign_1.getPlayerPeriodicRewardPointsSync)(playerId),
        allActiveMissionList: (0, index_1.filterToActiveMissions)((0, mission_1.getPlayerActiveMissionsSync)(playerId)),
        boxGachaList: (0, boxGacha_1.getPlayerBoxGachasSync)(playerId),
        purchasedTimesList: {},
        startDashExchangeCampaignList: (0, campaign_1.getPlayerStartDashExchangeCampaignsSync)(playerId),
        multiSpecialExchangeCampaignList: (0, campaign_1.getPlayerMultiSpecialExchangeCampaignsSync)(playerId),
        userOption: (0, option_1.getPlayerOptionsSync)(playerId),
        rushEventList: doSerializeRushEventData ? (0, rushEvent_1.getPlayerRushEventListSync)(playerId) : undefined,
        rushEventClearedFolderList: doSerializeRushEventData ? (0, rushEvent_1.getPlayerRushEventListClearedFoldersSync)(playerId) : undefined,
        rushEventPlayedPartyList: doSerializeRushEventData ? (0, rushEvent_1.getPlayerRushEventListPlayedPartiesSync)(playerId) : undefined
    }, Object.assign(Object.assign({}, options), { activeMissionList: awakeSummary.activeMissionList, manaBoardAwakeMap: awakeSummary.manaBoardAwakeMap }));
}
exports.getClientSerializedData = getClientSerializedData;
/**
 * Assembles a player's full server-side MergedPlayerData (no client serialization).
 * Used by the admin save export/import (snapshot round-trip).
 */
function getMergedPlayerDataSync(playerId) {
    const playerData = (0, player_1.getPlayerSync)(playerId);
    if (playerData === null)
        return null;
    return {
        player: playerData,
        dailyChallengePointList: (0, player_1.getPlayerDailyChallengePointListSync)(playerId),
        triggeredTutorial: (0, tutorial_1.getPlayerTriggeredTutorialsSync)(playerId),
        clearedRegularMissionList: (0, mission_1.getPlayerClearedRegularMissionListSync)(playerId),
        characterList: (0, character_1.getPlayerCharactersSync)(playerId),
        characterManaNodeList: (0, character_1.getPlayerCharactersManaNodesSync)(playerId),
        partyGroupList: (0, party_1.getPlayerPartyGroupListSync)(playerId),
        itemList: (0, item_1.getPlayerItemsSync)(playerId),
        equipmentList: (0, equipment_1.getPlayerEquipmentListSync)(playerId),
        questProgress: (0, quest_1.getPlayerQuestProgressSync)(playerId),
        gachaInfoList: (0, gacha_1.getPlayerGachaInfoListSync)(playerId),
        gachaCampaignList: (0, gacha_1.getPlayerGachaCampaignListSync)(playerId),
        drawnQuestList: (0, quest_1.getPlayerDrawnQuestsSync)(playerId),
        periodicRewardPointList: (0, campaign_1.getPlayerPeriodicRewardPointsSync)(playerId),
        allActiveMissionList: (0, mission_1.getPlayerActiveMissionsSync)(playerId),
        boxGachaList: (0, boxGacha_1.getPlayerBoxGachasSync)(playerId),
        purchasedTimesList: {},
        startDashExchangeCampaignList: (0, campaign_1.getPlayerStartDashExchangeCampaignsSync)(playerId),
        multiSpecialExchangeCampaignList: (0, campaign_1.getPlayerMultiSpecialExchangeCampaignsSync)(playerId),
        userOption: (0, option_1.getPlayerOptionsSync)(playerId),
        rushEventList: (0, rushEvent_1.getPlayerRushEventListSync)(playerId),
        rushEventClearedFolderList: (0, rushEvent_1.getPlayerRushEventListClearedFoldersSync)(playerId),
        rushEventPlayedPartyList: (0, rushEvent_1.getPlayerRushEventListPlayedPartiesSync)(playerId)
    };
}
exports.getMergedPlayerDataSync = getMergedPlayerDataSync;

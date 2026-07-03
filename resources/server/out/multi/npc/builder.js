"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNpcMates = void 0;
const types_1 = require("./types");
function buildMateCharacter(id) {
    return {
        id,
        evolution_level: 5,
        exp: 0,
        over_limit_step: 0,
        mana_node_ids: [],
        ex_boost: null,
    };
}
function buildMateEquipment(id) {
    return {
        equipment_id: id,
        level: 1,
        enhancement_level: 0,
    };
}
function buildNpcMate(template) {
    const characters = template.characters.map(buildMateCharacter);
    while (characters.length < 3)
        characters.push(null);
    const unisonCharacters = template.unison_characters.map(buildMateCharacter);
    while (unisonCharacters.length < 3)
        unisonCharacters.push(null);
    const equipments = template.equipments.map(buildMateEquipment);
    while (equipments.length < 3)
        equipments.push(null);
    const abilitySoulIds = [...template.ability_soul_ids];
    while (abilitySoulIds.length < 3)
        abilitySoulIds.push(null);
    return {
        com_id: template.com_id,
        degree_id: template.degree_id,
        rank: template.rank,
        party: {
            characters,
            unison_characters: unisonCharacters,
            equipments,
            ability_soul_ids: abilitySoulIds,
        },
    };
}
function buildNpcMates(_questId, _category) {
    const t1 = types_1.NPC_TEMPLATES[0];
    const t2 = types_1.NPC_TEMPLATES[1];
    return {
        mate1: t1 ? buildNpcMate(t1) : null,
        mate2: t2 ? buildNpcMate(t2) : null,
    };
}
exports.buildNpcMates = buildNpcMates;

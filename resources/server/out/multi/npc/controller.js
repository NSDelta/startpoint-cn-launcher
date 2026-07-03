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
exports.NpcMateProvider = void 0;
const builder_1 = require("./builder");
class NpcMateProvider {
    getMates(roomNumber) {
        const { mate1, mate2 } = (0, builder_1.buildNpcMates)();
        return [mate1, mate2].filter((m) => m !== null);
    }
    onRecruit(roomNumber, hostViewerId) {
        return __awaiter(this, void 0, void 0, function* () {
            return {
                recruitedMates: [
                    { viewer_id: 900000001, com_id: 1 },
                    { viewer_id: 900000002, com_id: 2 },
                ],
            };
        });
    }
    isRoomFull(roomNumber) {
        return true;
    }
    getAvailableCompanions(hostViewerId) {
        return [];
    }
}
exports.NpcMateProvider = NpcMateProvider;

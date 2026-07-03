"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomStateMachine = void 0;
const types_1 = require("../types");
class RoomStateMachine {
    constructor(initialState) {
        this.state = types_1.RoomState.Waiting;
        if (initialState !== undefined)
            this.state = initialState;
    }
    getState() { return this.state; }
    tryTransition(to, guard) {
        const allowed = [
            [types_1.RoomState.Waiting, types_1.RoomState.Ready],
            [types_1.RoomState.Ready, types_1.RoomState.Filled],
            [types_1.RoomState.Ready, types_1.RoomState.Disbanded],
            [types_1.RoomState.Filled, types_1.RoomState.Battle],
            [types_1.RoomState.Filled, types_1.RoomState.Ready],
            [types_1.RoomState.Filled, types_1.RoomState.Disbanded],
            [types_1.RoomState.Battle, types_1.RoomState.Ready],
            [types_1.RoomState.Battle, types_1.RoomState.Disbanded],
        ];
        const match = allowed.find(([f, t]) => f === this.state && t === to);
        if (!match)
            return { allowed: false, reason: `INVALID_TRANSITION: ${types_1.RoomState[this.state]} → ${types_1.RoomState[to]}` };
        if (guard && !guard())
            return { allowed: false, reason: "GUARD_FAILED" };
        this.state = to;
        return { allowed: true };
    }
}
exports.RoomStateMachine = RoomStateMachine;

"use strict";
// Mission computer dispatch registry
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComputer = void 0;
const computer_regular_1 = require("./computer-regular");
const computer_degree_1 = require("./computer-degree");
const computer_awake_1 = require("./computer-awake");
const computer_event_1 = require("./computer-event");
const computer_fallback_1 = require("./computer-fallback");
const REGISTRY = new Map([
    [1, computer_regular_1.RegularComputer],
    [2, computer_regular_1.RegularComputer],
    [3, computer_event_1.EventComputer],
    [5, computer_degree_1.DegreeComputer],
    [9, computer_awake_1.AwakeComputer],
    // Category 4,10 → Fallback (DB-stored progress)
]);
function getComputer(category) {
    var _a;
    return (_a = REGISTRY.get(category)) !== null && _a !== void 0 ? _a : computer_fallback_1.FallbackComputer;
}
exports.getComputer = getComputer;

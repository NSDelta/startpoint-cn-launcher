"use strict";
// Time utility — reset-hour-aware day/week boundary detection
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNewWeek = exports.isNewDay = exports.getWeekBucket = exports.getDayBucket = void 0;
const resetHour = parseInt(process.env.DAILY_RESET_HOUR || '5', 10);
function shiftByResetHour(date) {
    return new Date(date.getTime() - resetHour * 3600000);
}
function getDayBucket(date) {
    const s = shiftByResetHour(date);
    return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() };
}
exports.getDayBucket = getDayBucket;
function getWeekBucket(date) {
    // Week resets on the day that falls into Sunday after reset-hour shift
    const s = shiftByResetHour(date);
    // Create a date for the start of the shifted day (UTC)
    const start = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
    // Sunday = 0, we want the Sunday that contains this day
    const dayOfWeek = start.getUTCDay();
    // Monday=1 ... Saturday=6, Sunday=0. The "containing Sunday" is:
    // If today is Sunday, use today. Otherwise go forward to next Sunday.
    const sunday = dayOfWeek === 0 ? start : new Date(start.getTime() + (7 - dayOfWeek) * 86400000);
    return { y: sunday.getUTCFullYear(), w: Math.floor(sunday.getTime() / (7 * 86400000)) };
}
exports.getWeekBucket = getWeekBucket;
function isNewDay(now, last) {
    const a = getDayBucket(now);
    const b = getDayBucket(last);
    return a.y > b.y || a.m > b.m || a.d > b.d;
}
exports.isNewDay = isNewDay;
function isNewWeek(now, last) {
    const a = getWeekBucket(now);
    const b = getWeekBucket(last);
    return a.y > b.y || a.w > b.w;
}
exports.isNewWeek = isNewWeek;

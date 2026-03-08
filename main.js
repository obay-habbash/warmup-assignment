const fs = require("fs");

// ------------------------
// Helper Functions
// ------------------------
function time12ToSeconds(time) {
    let [t, modifier] = time.split(" ");
    let [h, m, s] = t.split(":").map(Number);

    if (modifier.toLowerCase() === "pm" && h !== 12) h += 12;
    if (modifier.toLowerCase() === "am" && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

function timeToSeconds(time) {
    let [h, m, s] = time.split(":").map(Number);
    return h * 3600 + m * 60 + s;
}

function secondsToTime(sec) {
    let h = Math.floor(sec / 3600);
    sec %= 3600;
    let m = Math.floor(sec / 60);
    let s = sec % 60;

    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ============================================================
function getShiftDuration(startTime, endTime) {
    let start = time12ToSeconds(startTime);
    let end = time12ToSeconds(endTime);

    if (end < start) end += 86400;

    return secondsToTime(end - start);
}

// ============================================================
function getIdleTime(startTime, endTime) {
    let start = time12ToSeconds(startTime);
    let end = time12ToSeconds(endTime);

    if (end < start) end += 86400;

    return secondsToTime(end - start);
}

// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shift = timeToSeconds(shiftDuration);
    let idle = timeToSeconds(idleTime);

    return secondsToTime(Math.max(shift - idle, 0));
}

// ============================================================
function metQuota(date, activeTime) {
    let required = 8 * 3600;
    return timeToSeconds(activeTime) >= required;
}

// ============================================================
function addShiftRecord(textFile, shiftObj) {
    if (!fs.existsSync(textFile)) fs.writeFileSync(textFile, "");

    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = "0:00:00";
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let bonus = metQuota(shiftObj.date, activeTime);

    let record = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: bonus,
        bonus
    };

    let line = Object.values(record).join(",") + "\n";
    fs.appendFileSync(textFile, line);

    return record;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord
};

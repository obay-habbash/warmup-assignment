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

// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");

    lines = lines.map(line => {
        let parts = line.split(",");

        if (parts[0] === driverID && parts[2] === date) {
            parts[9] = newValue;
        }

        return parts.join(",");
    });

    fs.writeFileSync(textFile, lines.join("\n"));
}

// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile)) return -1;

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");
    let count = 0;
    let found = false;

    lines.forEach(line => {
        let parts = line.split(",");
        let id = parts[0];
        let date = parts[2];
        let bonus = parts[9] === "true";

        if (id === driverID) {
            found = true;

            let m = parseInt(date.split("-")[1]);
            if (m === parseInt(month) && bonus) count++;
        }
    });

    return found ? count : -1;
}

// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile)) return "0:00:00";

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");
    let total = 0;

    lines.forEach(line => {
        let parts = line.split(",");
        let id = parts[0];
        let date = parts[2];
        let active = parts[7];

        if (id === driverID) {
            let m = parseInt(date.split("-")[1]);
            if (m === parseInt(month)) {
                total += timeToSeconds(active);
            }
        }
    });

    return secondsToTime(total);
}

// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let base = 160 * 3600;
    let bonusReduction = bonusCount * 3600;

    return secondsToTime(Math.max(base - bonusReduction, 0));
}

// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rates = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    let rate = 0;

    rates.forEach(line => {
        let [id, r] = line.split(",");
        if (id === driverID) rate = Number(r);
    });

    let actual = timeToSeconds(actualHours) / 3600;
    let required = timeToSeconds(requiredHours) / 3600;

    let pay = actual * rate;

    if (actual < required) {
        pay *= 0.9;
    }

    return Math.round(pay);
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};

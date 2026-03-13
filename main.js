const fs = require("fs");
 
// ============================================================
// Business Policy Constants
// ============================================================
const DELIVERY_START_SECONDS = 8 * 3600;
const DELIVERY_END_SECONDS = 22 * 3600;
 
const NORMAL_QUOTA_SECONDS = 8 * 3600 + 24 * 60;
const EID_QUOTA_SECONDS = 6 * 3600;
 
const TIER_ALLOWANCE_HOURS = {
    1: 50,
    2: 20,
    3: 10,
    4: 3
};
 
// ============================================================
// Time Utility Helpers
// ============================================================
function parseTime12(timeStr) {
    timeStr = timeStr.trim();
    let parts = timeStr.split(" ");
    let time = parts[0];
    let period = parts[1].toLowerCase();
    let timeParts = time.split(":").map(Number);
    let h = timeParts[0];
    let m = timeParts[1];
    let s = timeParts[2];
 
    if (period === "pm" && h !== 12) h += 12;
    if (period === "am" && h === 12) h = 0;
 
    return h * 3600 + m * 60 + s;
}
 
function parseDuration(timeStr) {
    let parts = timeStr.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
 
function formatDuration(seconds) {
    if (seconds < 0) seconds = 0;
    let h = Math.floor(seconds / 3600);
    let m = Math.floor((seconds % 3600) / 60);
    let s = seconds % 60;
    return String(h) + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
 
// ============================================================
// Domain Logic Helpers
// ============================================================
function getMonth(date) {
    return parseInt(date.split("-")[1]);
}
 
function isEid(date) {
    return date >= "2025-04-10" && date <= "2025-04-30";
}
 
function getQuotaSeconds(date) {
    return isEid(date) ? EID_QUOTA_SECONDS : NORMAL_QUOTA_SECONDS;
}
 
function getWeekday(dateStr) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const d = new Date(dateStr + "T00:00:00");
    return days[d.getDay()];
}
 
// ============================================================
// File Helpers
// ============================================================
function readFileLines(filePath) {
    let content = fs.readFileSync(filePath, "utf8");
    content = content.replace(/\r/g, "");
    let lines = content.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines;
}
 
function parseShiftLine(line) {
    let cols = line.split(",");
    return {
        driverID:      cols[0],
        driverName:    cols[1],
        date:          cols[2],
        startTime:     cols[3],
        endTime:       cols[4],
        shiftDuration: cols[5],
        idleTime:      cols[6],
        activeTime:    cols[7],
        metQuota:      cols[8] === "true",
        hasBonus:      cols[9] === "true"
    };
}
 
function shiftObjectToLine(shiftObj) {
    return [
        shiftObj.driverID,
        shiftObj.driverName,
        shiftObj.date,
        shiftObj.startTime,
        shiftObj.endTime,
        shiftObj.shiftDuration,
        shiftObj.idleTime,
        shiftObj.activeTime,
        String(shiftObj.metQuota),
        String(shiftObj.hasBonus)
    ].join(",");
}
 
function parseRateLine(line) {
    let cols = line.split(",");
    return {
        driverID: cols[0].trim(),
        dayOff:   cols[1].trim(),
        basePay:  parseInt(cols[2].trim()),
        tier:     parseInt(cols[3].trim())
    };
}
 
// ============================================================
// Function 1: getShiftDuration
// ============================================================
function getShiftDuration(startTime, endTime) {
    let startSeconds = parseTime12(startTime);
    let endSeconds   = parseTime12(endTime);
 
    let durationSeconds = endSeconds - startSeconds;
    if (durationSeconds < 0) durationSeconds += 86400;
 
    return formatDuration(durationSeconds);
}
 
// ============================================================
// Function 2: getIdleTime
// ============================================================
function getIdleTime(startTime, endTime) {
    let startSeconds = parseTime12(startTime);
    let endSeconds   = parseTime12(endTime);
 
    if (endSeconds < startSeconds) endSeconds += 86400;
 
    let idleSeconds = 0;
 
    if (startSeconds < DELIVERY_START_SECONDS) {
        idleSeconds += Math.min(endSeconds, DELIVERY_START_SECONDS) - startSeconds;
    }
 
    if (endSeconds > DELIVERY_END_SECONDS) {
        idleSeconds += endSeconds - Math.max(startSeconds, DELIVERY_END_SECONDS);
    }
 
    return formatDuration(idleSeconds);
}
 
// ============================================================
// Function 3: getActiveTime
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shiftSeconds  = parseDuration(shiftDuration);
    let idleSeconds   = parseDuration(idleTime);
    let activeSeconds = shiftSeconds - idleSeconds;
    return formatDuration(activeSeconds);
}
 
// ============================================================
// Function 4: metQuota
// ============================================================
function metQuota(date, activeTime) {
    let activeSeconds = parseDuration(activeTime);
    let quotaSeconds  = getQuotaSeconds(date);
    return activeSeconds >= quotaSeconds;
}
 
// ============================================================
// Function 5: addShiftRecord
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let lines  = readFileLines(textFile);
    let header = lines[0];
    let rows   = lines.slice(1);
    let parsed = rows.map(parseShiftLine);
 
    for (let r of parsed) {
        if (r.driverID === shiftObj.driverID && r.date === shiftObj.date) {
            return {};
        }
    }
 
    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime      = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime    = getActiveTime(shiftDuration, idleTime);
    let quota         = metQuota(shiftObj.date, activeTime);
 
    let record = {
        driverID:      shiftObj.driverID,
        driverName:    shiftObj.driverName,
        date:          shiftObj.date,
        startTime:     shiftObj.startTime,
        endTime:       shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime:      idleTime,
        activeTime:    activeTime,
        metQuota:      quota,
        hasBonus:      false
    };
 
    let insertIndex = rows.length;
    for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].driverID === shiftObj.driverID) {
            insertIndex = i + 1;
        }
    }
 
    rows.splice(insertIndex, 0, shiftObjectToLine(record));
 
    fs.writeFileSync(textFile, header + "\n" + rows.join("\n") + "\n");
 
    return record;
}
 
// ============================================================
// Function 6: setBonus
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let lines  = readFileLines(textFile);
    let header = lines[0];
    let rows   = lines.slice(1);
 
    rows = rows.map(function(r) {
        let cols = r.split(",");
        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = String(newValue);
        }
        return cols.join(",");
    });
 
    fs.writeFileSync(textFile, header + "\n" + rows.join("\n") + "\n");
}
 
// ============================================================
// Function 7: countBonusPerMonth
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let rows = readFileLines(textFile).slice(1);
    month    = parseInt(month);
 
    let found = false;
    let count = 0;
 
    for (let r of rows) {
        let shift = parseShiftLine(r);
        if (shift.driverID === driverID) {
            found = true;
            if (getMonth(shift.date) === month && shift.hasBonus) {
                count++;
            }
        }
    }
 
    if (!found) return -1;
    return count;
}
 
// ============================================================
// Function 8: getTotalActiveHoursPerMonth
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let rows         = readFileLines(textFile).slice(1);
    month            = parseInt(month);
    let totalSeconds = 0;
 
    for (let r of rows) {
        let shift = parseShiftLine(r);
        if (shift.driverID === driverID && getMonth(shift.date) === month) {
            totalSeconds += parseDuration(shift.activeTime);
        }
    }
 
    return formatDuration(totalSeconds);
}
 
// ============================================================
// Function 9: getRequiredHoursPerMonth
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    month = parseInt(month);
 
    let rateLines = readFileLines(rateFile);
    let dayOff    = null;
 
    for (let line of rateLines) {
        if (line.startsWith("DriverID") || line.startsWith("driverID")) continue;
        let r = parseRateLine(line);
        if (r.driverID === driverID) {
            dayOff = r.dayOff;
            break;
        }
    }
 
    let rows         = readFileLines(textFile).slice(1);
    let totalSeconds = 0;
 
    for (let r of rows) {
        let shift = parseShiftLine(r);
        if (shift.driverID === driverID && getMonth(shift.date) === month) {
            let weekday = getWeekday(shift.date);
            if (weekday === dayOff) continue;
            totalSeconds += getQuotaSeconds(shift.date);
        }
    }
 
    totalSeconds -= bonusCount * 2 * 3600;
    if (totalSeconds < 0) totalSeconds = 0;
 
    return formatDuration(totalSeconds);
}
 
// ============================================================
// Function 10: getNetPay
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let lines   = readFileLines(rateFile);
    let basePay = null;
    let tier    = null;
 
    for (let line of lines) {
        if (line.startsWith("DriverID") || line.startsWith("driverID")) continue;
        let rate = parseRateLine(line);
        if (rate.driverID === driverID) {
            basePay = rate.basePay;
            tier    = rate.tier;
            break;
        }
    }
 
    if (basePay === null) return null;
 
    let actual   = parseDuration(actualHours);
    let required = parseDuration(requiredHours);
 
    if (actual >= required) return basePay;
 
    let missingSeconds          = required - actual;
    let allowanceSeconds        = TIER_ALLOWANCE_HOURS[tier] * 3600;
    let remainingMissingSeconds = missingSeconds - allowanceSeconds;
 
    if (remainingMissingSeconds <= 0) return basePay;
 
    let billableFullHours = Math.floor(remainingMissingSeconds / 3600);
    if (billableFullHours <= 0) return basePay;
 
    let deductionRate = Math.floor(basePay / 185);
    let deduction     = billableFullHours * deductionRate;
 
    return basePay - deduction;
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
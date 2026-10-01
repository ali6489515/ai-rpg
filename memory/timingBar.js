"use strict";

/*
 * نوار زمان‌بندی حمله (سبز / زرد / قرمز)
 *
 * جریان:
 *   1) کلاینت  → POST /timing/start      → سرور یک نوار می‌سازد و می‌فرستد
 *   2) کلاینت نوار را نشان می‌دهد و بازیکن کلیک می‌کند
 *   3) کلاینت  → POST /attack یا /skill  با { barId, elapsedMs }
 *   4) سرور موقعیت نشانگر را خودش از روی elapsedMs حساب می‌کند و ضریب آسیب را تعیین می‌کند
 *
 * کلاینت هرگز «رنگ» یا «ضریب» نمی‌فرستد؛ فقط می‌گوید چند میلی‌ثانیه بعد از شروع کلیک کرده.
 */

const crypto = require("crypto");

/* ناحیه‌ها (متقارن): قرمز ۲۵٪ ، زرد ۳۵٪ ، سبز ۴۰٪ */
const ZONES = [
    { id: "red",    from: 0,     to: 0.125 },
    { id: "yellow", from: 0.125, to: 0.30  },
    { id: "green",  from: 0.30,  to: 0.70  },
    { id: "yellow", from: 0.70,  to: 0.875 },
    { id: "red",    from: 0.875, to: 1     }
];

/* میانگین ضرایب ≈ 1.03 است، پس تعادل کلی بازی تقریباً عوض نمی‌شود */
const ZONE_MULT = {
    green: 1.4,
    yellow: 1.0,
    red: 0.5
};

const NEUTRAL_MULT = 1.0;

const ATTACK_SWEEP_MS = 800;      // زمان رفتن نشانگر از یک سر نوار به سر دیگر
const MIN_SWEEP_MS = 550;

const BAR_LIFETIME_MS = 45000;    // بعد از این زمان نوار باطل می‌شود
const MIN_ELAPSED_MS = 100;       // کلیک زودتر از این = کلیک اتفاقی
const CLOCK_TOLERANCE_MS = 100;   // اختلاف مجاز ساعت‌ها
const MAX_LAG_MS = 2500;          // بیشترین تأخیر شبکه‌ی قابل قبول

/* یک نوار فعال برای هر session */
const activeBars = new Map();

function sweepForSkill(multiplier) {
    const m = Number(multiplier) || 1;
    return Math.max(
        MIN_SWEEP_MS,
        ATTACK_SWEEP_MS - Math.round((m - 1) * 100)
    );
}

function cleanupExpired(now) {
    for (const [sid, bar] of activeBars) {
        if (now > bar.expiresAt) {
            activeBars.delete(sid);
        }
    }
}

/* موج مثلثی: ۰ → ۱ → ۰ → ... */
function positionAt(sweepMs, phase, elapsedMs) {
    const cycle = 2 * sweepMs;
    let c = (elapsedMs / cycle + phase) % 1;
    if (c < 0) c += 1;
    return c < 0.5 ? c * 2 : 2 - c * 2;
}

function zoneAt(pos) {
    for (const z of ZONES) {
        if (pos >= z.from && pos < z.to) {
            return z.id;
        }
    }
    return "red"; // pos === 1
}

function createBar(sessionId, action, sweepMs, now = Date.now(), rng = Math.random) {
    cleanupExpired(now);

    const bar = {
        barId: crypto.randomBytes(12).toString("hex"),
        action,
        sweepMs,
        phase: rng(),
        startedAt: now,
        expiresAt: now + BAR_LIFETIME_MS
    };

    // نوار قبلی همین session باطل می‌شود (فقط یک نوار فعال)
    activeBars.set(sessionId, bar);

    return {
        barId: bar.barId,
        sweepMs: bar.sweepMs,
        phase: bar.phase,
        zones: ZONES,
        lifetimeMs: BAR_LIFETIME_MS
    };
}

function neutral(reason, used = true) {
    return {
        used,
        valid: false,
        reason,
        zone: null,
        mult: NEUTRAL_MULT
    };
}

/**
 * نتیجه‌ی کلیک بازیکن را اعتبارسنجی و مصرف می‌کند (هر نوار فقط یک بار).
 * هر مشکلی → ضریب خنثی (۱٫۰) ، نه خطا و نه امتیاز اضافه.
 */
function consumeShot(sessionId, action, barId, elapsedMs, now = Date.now()) {

    // نوار نفرستاده (کلاینت قدیمی یا رد کردن نوار) → ضریب خنثی، بدون پیام
    if (!barId) {
        return neutral("no-bar-sent", false);
    }

    const bar = activeBars.get(sessionId);

    // از اینجا به بعد نوار مصرف می‌شود، چه معتبر باشد چه نه
    activeBars.delete(sessionId);

    if (!bar) {
        return neutral("no-active-bar");
    }

    if (bar.barId !== String(barId)) {
        return neutral("bar-id-mismatch");
    }

    if (bar.action !== action) {
        return neutral("wrong-action");
    }

    if (now > bar.expiresAt) {
        return neutral("expired");
    }

    const clientElapsed = Number(elapsedMs);

    if (!Number.isFinite(clientElapsed) || clientElapsed < 0) {
        return neutral("bad-elapsed");
    }

    if (clientElapsed < MIN_ELAPSED_MS) {
        return neutral("too-fast");
    }

    const serverElapsed = now - bar.startedAt;

    // کلاینت ادعا کرده زمان بیشتری از زمان واقعی گذشته → جعل
    if (clientElapsed > serverElapsed + CLOCK_TOLERANCE_MS) {
        return neutral("claims-more-time-than-passed");
    }

    // زمان زیادی حساب نشده (تأخیر شدید یا کلاینتی که آفلاین محاسبه کرده)
    if (serverElapsed - clientElapsed > MAX_LAG_MS) {
        return neutral("too-much-unaccounted-time");
    }

    const pos = positionAt(bar.sweepMs, bar.phase, clientElapsed);
    const zone = zoneAt(pos);

    return {
        used: true,
        valid: true,
        reason: null,
        zone,
        mult: ZONE_MULT[zone],
        pos
    };
}

/* متن کوتاه برای پیام مبارزه */
function describeShot(shot) {
    if (!shot || !shot.used) return "";

    if (!shot.valid) {
        return "⏱️ زمان‌بندی ثبت نشد (آسیب معمولی). ";
    }

    if (shot.zone === "green") return "🟢 ضربه‌ی عالی! ";
    if (shot.zone === "yellow") return "🟡 ضربه‌ی خوب. ";
    return "🔴 ضربه‌ی ضعیف. ";
}

/* بخشی از نتیجه که به کلاینت برگردانده می‌شود */
function publicShot(shot) {
    if (!shot || !shot.used) return null;
    return {
        valid: shot.valid,
        zone: shot.zone,
        mult: shot.mult
    };
}

module.exports = {
    ZONES,
    ZONE_MULT,
    ATTACK_SWEEP_MS,
    sweepForSkill,
    createBar,
    consumeShot,
    positionAt,
    zoneAt,
    describeShot,
    publicShot
};

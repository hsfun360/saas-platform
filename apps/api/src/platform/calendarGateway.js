// src/platform/calendarGateway.js
//
// PLATFORM SEAM: product systems (Membership / Golf / Facility) -> Control
// Plane day classification.
//
// Weekend days (per company) and Public Holidays (per account+country) are
// Control-Plane data. A product must NOT require() the saas module directly
// (golden rule #4) - it classifies dates through this seam. Today everything is
// one process, so the seam resolves in-process; when the Control Plane splits
// out, only THIS file changes to HTTP calls via internalServiceUrl('saas').
//
// BUSINESS RULE (user decision 2026-07-14): PUBLIC HOLIDAYS COUNT AS WEEKEND.
// There is no separate 'holiday' day type anywhere in the platform - a date is
// 'weekend' when it falls on one of the company's configured weekend days OR is
// an active public holiday of the company's country; otherwise it is 'weekday'.
// A company with no weekend days configured has NO weekend-by-weekday dates
// (only holidays classify as weekend), matching the pricing rule "unconfigured
// = weekend pricing never applies".

const { getUserContext, internalServiceUrl } = require('./serviceContext');

// The classification context of the ACTIVE company: its weekend-day set and its
// country's active holidays inside [dateFrom, dateTo] ('YYYY-MM-DD' strings).
// Returns { weekendDays: Set<number ISO 1-7>, holidays: Set<'YYYY-MM-DD'> }.
async function companyDayContext(req, dateFrom, dateTo) {
    const { companyId } = getUserContext(req);
    const weekendDays = new Set();
    const holidays = new Set();
    if (!companyId) return { weekendDays, holidays };

    // WHEN SPLIT: GET {internalServiceUrl('saas')}/internal/weekend-days?companyId
    //         and GET {internalServiceUrl('saas')}/internal/public-holidays?companyId&from&to
    const CompanyWeekendDay = require('../modules/saas/companyWeekendDay.model');
    const dayRows = await CompanyWeekendDay.findAll({ where: { companyId }, attributes: ['dayOfWeek'] });
    for (const r of dayRows) weekendDays.add(Number(r.dayOfWeek));

    const Company = require('../modules/saas/company.model');
    const company = await Company.findByPk(companyId, { attributes: ['accountId', 'countryCode'] });
    if (company && company.accountId && company.countryCode) {
        const { Op } = require('sequelize');
        const PublicHoliday = require('../modules/saas/publicHoliday.model');
        const rows = await PublicHoliday.findAll({
            where: {
                accountId: company.accountId,
                countryCode: company.countryCode,
                isActive: true,
                holidayDate: { [Op.gte]: dateFrom, [Op.lte]: dateTo },
            },
            attributes: ['holidayDate'],
        });
        for (const r of rows) holidays.add(String(r.holidayDate));
    }

    return { weekendDays, holidays };
}

// ISO day of week (1 = Monday ... 7 = Sunday) of a 'YYYY-MM-DD' string, computed
// in UTC so the server's timezone never shifts the date.
function isoDayOfWeek(dateStr) {
    const jsDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
    return jsDay === 0 ? 7 : jsDay;
}

// Classify every date in [dateFrom, dateTo] for the active company.
// Returns [{ date: 'YYYY-MM-DD', dayType: 'weekday'|'weekend', isHoliday }].
async function classifyDateRange(req, dateFrom, dateTo) {
    const { weekendDays, holidays } = await companyDayContext(req, dateFrom, dateTo);

    const out = [];
    const end = new Date(`${dateTo}T00:00:00Z`).getTime();
    for (let t = new Date(`${dateFrom}T00:00:00Z`).getTime(); t <= end; t += 86400000) {
        const date = new Date(t).toISOString().slice(0, 10);
        const isHoliday = holidays.has(date);
        const dayType = isHoliday || weekendDays.has(isoDayOfWeek(date)) ? 'weekend' : 'weekday';
        out.push({ date, dayType, isHoliday });
    }
    return out;
}

module.exports = {
    companyDayContext,
    classifyDateRange,
    isoDayOfWeek,
    // Re-exported so a future split can read the peer URL from one import site.
    internalServiceUrl,
};

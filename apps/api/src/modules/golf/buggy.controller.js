// Buggies - the fleet register (Golf Management → Common Setup → Buggies;
// spec 2.1.3 球车资料 + 2.1.9 tracking + 2.1.10 history, user decisions
// 2026-10-17): one row per unit with its type, purchase facts, the printed
// QR token, the register status (active | retired) and the live location
// the station maintains. Deleted only while it has no outing; retired
// otherwise. The QR label sheet prints from here.

const { Op } = require('sequelize');
const QRCode = require('qrcode');
const GolfBuggy = require('./buggy.model');
const GolfBuggyType = require('./buggyType.model');
const GolfBuggyIssue = require('./buggyIssue.model');
const GolfBuggyIssueRider = require('./buggyIssueRider.model');
const station = require('./buggyStation.service');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
    getCompanyLetterhead,
} = require('../../platform/serviceContext');
const {
    BUGGY_STATUSES, BUGGY_LOCATIONS, ISSUE_STATUSES, CONDITIONS_OUT, CONDITIONS_IN,
} = require('./buggy.constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toDto(b, canModify = true, openIssue = null) {
    return {
        id: b.id,
        canModify,
        buggyNo: b.buggyNo,
        buggyTypeId: b.buggyTypeId,
        buggyType: b.buggyType ? { id: b.buggyType.id, code: b.buggyType.code, name: b.buggyType.name, seats: Number(b.buggyType.seats) } : null,
        model: b.model || null,
        serialNo: b.serialNo || null,
        purchaseDate: b.purchaseDate || null,
        qrToken: b.qrToken,
        status: b.status,
        retiredAt: b.retiredAt || null,
        retireReason: b.retireReason || null,
        location: b.location,
        remarks: b.remarks || null,
        openIssue: openIssue ? station.issueDto(openIssue) : null,
    };
}

// Validate + normalise a payload. Returns { value } or { error }.
async function normalizeBody(companyId, body) {
    const buggyNo = str(body.buggyNo).toUpperCase();
    if (!buggyNo) return { error: 'Buggy number is required.' };
    if (buggyNo.length > 20) return { error: 'Buggy number must be 20 characters or fewer.' };
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(buggyNo)) return { error: 'Buggy number may only contain letters, digits and hyphens.' };
    const buggyTypeId = str(body.buggyTypeId);
    if (!buggyTypeId) return { error: 'Select the buggy type.' };
    const type = await GolfBuggyType.findOne({ where: { companyId, id: buggyTypeId } });
    if (!type) return { error: 'The buggy type is not one of this company\'s types.' };
    if (type.isActive === false) return { error: `Buggy type '${type.code}' is disabled - pick an active type.` };
    const model = str(body.model).slice(0, 100) || null;
    const serialNo = str(body.serialNo).slice(0, 100) || null;
    const purchaseDate = str(body.purchaseDate) || null;
    if (purchaseDate && !DATE_RE.test(purchaseDate)) return { error: 'Purchase date must be a valid date.' };
    const remarks = str(body.remarks).slice(0, 255) || null;
    return { value: { buggyNo, buggyTypeId, model, serialNo, purchaseDate, remarks }, type };
}

// GET /api/golf/buggies/meta - vocabularies + the active types.
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const types = await GolfBuggyType.findAll({ where: { companyId, isActive: true }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] });
        res.status(200).json({
            buggyTypes: types.map((t) => ({ id: t.id, code: t.code, name: t.name, seats: Number(t.seats) })),
            statuses: BUGGY_STATUSES,
            locations: BUGGY_LOCATIONS,
            issueStatuses: ISSUE_STATUSES,
            conditionsOut: CONDITIONS_OUT,
            conditionsIn: CONDITIONS_IN,
            enabled: await station.enabled(companyId),
        });
    } catch (error) {
        console.error('Error loading golf buggy meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/buggies - the fleet with each unit's live outing.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await GolfBuggy.findAll({
            where: { companyId },
            include: [{ model: GolfBuggyType, as: 'buggyType', attributes: ['id', 'code', 'name', 'seats'] }],
            order: [['status', 'ASC'], ['buggyNo', 'ASC']],
        });
        const open = await GolfBuggyIssue.findAll({
            where: { companyId, status: 'out' },
            include: [{ model: GolfBuggyIssueRider, as: 'riders' }],
        });
        const openByBuggy = new Map(open.map((i) => [i.buggyId, i]));
        const flags = await annotateCanModify(req, rows);
        res.status(200).json({
            buggies: rows.map((r, i) => toDto(r, flags[i], openByBuggy.get(r.id) || null)),
            fleet: await station.fleetCounts(companyId),
            enabled: await station.enabled(companyId),
        });
    } catch (error) {
        console.error('Error listing golf buggies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/buggies
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = await normalizeBody(companyId, req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await GolfBuggy.findOne({ where: { companyId, buggyNo: v.buggyNo } });
        if (existing) return res.status(409).json({ message: `Buggy ${existing.buggyNo} already exists.` });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfBuggy.create({
            companyId, ...v, qrToken: station.newQrToken(), status: 'active', location: 'in-depot',
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        row.buggyType = parsed.type;
        res.status(201).json({ message: `Buggy ${row.buggyNo} added to the fleet.`, buggy: toDto(row) });
    } catch (error) {
        console.error('Error creating golf buggy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function findOwned(req, res) {
    const companyId = companyIdOf(req);
    if (!companyId) { res.status(400).json({ message: 'Select a workspace first.' }); return null; }
    const row = await GolfBuggy.findOne({ where: { id: req.params.id, companyId }, include: [{ model: GolfBuggyType, as: 'buggyType', attributes: ['id', 'code', 'name', 'seats'] }] });
    if (!row) { res.status(404).json({ message: 'Buggy not found.' }); return null; }
    if (!(await canModifyRecord(req, row))) {
        res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        return null;
    }
    return { companyId, row };
}

// PUT /api/golf/buggies/:id
exports.update = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { companyId, row } = found;
        const parsed = await normalizeBody(companyId, req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        if (v.buggyNo !== row.buggyNo) {
            const clash = await GolfBuggy.findOne({ where: { companyId, buggyNo: v.buggyNo, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Buggy ${clash.buggyNo} already exists.` });
        }
        if (v.buggyTypeId !== row.buggyTypeId && row.location === 'on-course') {
            return res.status(409).json({ message: `Buggy ${row.buggyNo} is on course - change its type once it is back.` });
        }
        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        row.buggyType = parsed.type;
        res.status(200).json({ message: `Buggy ${row.buggyNo} updated.`, buggy: toDto(row) });
    } catch (error) {
        console.error('Error updating golf buggy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/buggies/:id/retire { reason }
exports.retire = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { row } = found;
        const reason = str(req.body.reason).slice(0, 255);
        if (!reason) return res.status(400).json({ message: 'Give the reason for retiring the buggy.' });
        if (row.status === 'retired') return res.status(409).json({ message: `Buggy ${row.buggyNo} is already retired.` });
        if (row.location === 'on-course') return res.status(409).json({ message: `Buggy ${row.buggyNo} is on course - return it first.` });
        const callerId = getUserContext(req).userId;
        Object.assign(row, { status: 'retired', retiredAt: new Date(), retiredBy: callerId, retireReason: reason, updatedBy: callerId });
        await row.save();
        res.status(200).json({ message: `Buggy ${row.buggyNo} retired.`, buggy: toDto(row) });
    } catch (error) {
        console.error('Error retiring golf buggy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/buggies/:id/reinstate
exports.reinstate = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { row } = found;
        if (row.status !== 'retired') return res.status(409).json({ message: `Buggy ${row.buggyNo} is not retired.` });
        const callerId = getUserContext(req).userId;
        Object.assign(row, { status: 'active', retiredAt: null, retiredBy: null, retireReason: null, location: 'in-depot', updatedBy: callerId });
        await row.save();
        res.status(200).json({ message: `Buggy ${row.buggyNo} back in the fleet.`, buggy: toDto(row) });
    } catch (error) {
        console.error('Error reinstating golf buggy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/buggies/:id/regenerate-qr - a lost or damaged label: the old
// sticker stops resolving the moment a new token is issued.
exports.regenerateQr = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { row } = found;
        row.qrToken = station.newQrToken();
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `New QR code issued for buggy ${row.buggyNo} - reprint its label.`, buggy: toDto(row) });
    } catch (error) {
        console.error('Error regenerating golf buggy QR:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/buggies/:id - only a unit with no outing (mis-keyed row).
exports.remove = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { companyId, row } = found;
        const outings = await GolfBuggyIssue.count({ where: { companyId, buggyId: row.id } });
        if (outings) return res.status(409).json({ message: `Buggy ${row.buggyNo} has ${outings} outing(s) on record - retire it instead.` });
        await row.destroy();
        res.status(200).json({ message: `Buggy ${row.buggyNo} deleted.` });
    } catch (error) {
        console.error('Error deleting golf buggy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/buggies/:id/history - the unit's outings, newest first.
exports.history = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await GolfBuggy.findOne({ where: { id: req.params.id, companyId }, include: [{ model: GolfBuggyType, as: 'buggyType', attributes: ['id', 'code', 'name', 'seats'] }] });
        if (!row) return res.status(404).json({ message: 'Buggy not found.' });
        const issues = await GolfBuggyIssue.findAll({
            where: { companyId, buggyId: row.id },
            include: [{ model: GolfBuggyIssueRider, as: 'riders' }],
            order: [['issuedAt', 'DESC']],
            limit: 200,
        });
        res.status(200).json({ buggy: toDto(row), issues: issues.map(station.issueDto) });
    } catch (error) {
        console.error('Error loading golf buggy history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// The station URL base a label encodes: the configured frontend, else the
// web origin the request came from - Origin (cross-origin calls), the Referer
// (a same-origin fetch sends no Origin header), then the proxied host - so a
// phone camera scan opens the station in every environment.
function frontendBase(req) {
    const env = (process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
    if (env) return env;
    if (req.get('origin')) return req.get('origin').replace(/\/$/, '');
    const referer = req.get('referer');
    if (referer) {
        try { return new URL(referer).origin; } catch { /* fall through */ }
    }
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    return host ? `${proto}://${host.split(',')[0].trim()}` : '';
}

// GET /api/golf/buggies/labels/html?ids=a,b - a printable sheet of QR labels
// (every active unit when no ids are named). Each QR encodes the station
// URL with the unit's token, so any phone camera opens the station on it;
// a handheld scanner types the same text into the station's code box.
exports.labelsHtml = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
        const where = { companyId, ...(ids.length ? { id: { [Op.in]: ids } } : { status: 'active' }) };
        const rows = await GolfBuggy.findAll({
            where,
            include: [{ model: GolfBuggyType, as: 'buggyType', attributes: ['code', 'name', 'seats'] }],
            order: [['buggyNo', 'ASC']],
        });
        if (!rows.length) return res.status(404).json({ message: 'No buggies to print.' });
        const letterhead = await getCompanyLetterhead(companyId);
        const base = frontendBase(req);
        const labels = [];
        for (const b of rows) {
            const content = base ? `${base}/golf/buggy-station?b=${b.qrToken}` : b.qrToken;
            const svg = await QRCode.toString(content, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
            labels.push(`<div class="label"><div class="qr">${svg}</div><div class="no">${esc(b.buggyNo)}</div><div class="club">${esc(letterhead ? letterhead.name : '')}</div>${b.buggyType ? `<div class="type">${esc(b.buggyType.name)}</div>` : ''}</div>`);
        }
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Buggy QR labels</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:16px}
.sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(62mm,1fr));gap:6mm}
.label{border:1px dashed #94a3b8;border-radius:4mm;padding:4mm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.qr svg{width:40mm;height:40mm;background:#fff}
.no{font-size:22px;font-weight:700;margin-top:2mm;letter-spacing:1px}
.club{font-size:11px;color:#475569;margin-top:1mm}.type{font-size:10px;color:#64748b}
.noprint{margin-bottom:12px}
@media print{body{margin:8mm}.noprint{display:none}.label{border-color:#cbd5e1}}
</style></head><body>
<p class="noprint"><button onclick="window.print()">Print</button> ${rows.length} label(s)</p>
<div class="sheet">${labels.join('')}</div>
</body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(html);
    } catch (error) {
        console.error('Error rendering buggy labels:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

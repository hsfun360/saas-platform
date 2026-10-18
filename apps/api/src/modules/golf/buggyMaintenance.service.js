// Buggy maintenance + damage (slice 2, user decisions 2026-10-18): the jobs on
// the fleet and the damage register.
//   - a routine SERVICE or a REPAIR parks the unit (Buggy.location
//     'maintenance'); a unit out on the course cannot be parked; completing
//     the job returns the unit to the depot; one open service/repair per unit;
//   - an INSPECTION ticks the five systems (steering, brakes, electrical,
//     drive, body) and is done on the spot: all clear, or a fault that opens
//     a repair (source 'inspection') and parks the unit;
//   - a fault or damaged RETURN at the station opens a repair by itself
//     (source 'station-return') and, when damaged, records the damage against
//     the outing and the rider the desk names; the damage resolves when that
//     repair completes;
//   - compensation stays OUTSIDE the system: no amount, no charge.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const GolfBuggy = require('./buggy.model');
const GolfBuggyType = require('./buggyType.model');
const GolfBuggyIssue = require('./buggyIssue.model');
const GolfBuggyIssueRider = require('./buggyIssueRider.model');
const GolfBuggyMaintenance = require('./buggyMaintenance.model');
const GolfBuggyDamage = require('./buggyDamage.model');
const {
    MAINTENANCE_KINDS, MAINTENANCE_KIND_KEYS, MAINTENANCE_STATUSES, MAINTENANCE_STATUS_KEYS, MAINTENANCE_SOURCES,
    INSPECTION_SYSTEMS, INSPECTION_SYSTEM_KEYS, DAMAGE_REASON_TYPES, DAMAGE_REASON_TYPE_KEYS,
} = require('./buggy.constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PARKING_KINDS = ['service', 'repair'];

function fail(message, status = 400) {
    return { error: message, status };
}

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

async function callerStamps(req) {
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

function text(v, max = 1000) {
    return typeof v === 'string' ? v.trim().slice(0, max) || null : null;
}

const BUGGY_INCLUDE = [{ model: GolfBuggy, as: 'buggy', attributes: ['id', 'buggyNo', 'status', 'location'], include: [{ model: GolfBuggyType, as: 'buggyType', attributes: ['id', 'code', 'name', 'seats'] }] }];

// ---------------------------------------------------------------------------
// PURE (unit-tested)

// Normalise an inspection's checks: every system defaults to ok; a system
// is faulty only when its flag is explicitly false.
function normalizeChecks(input) {
    const out = {};
    for (const key of INSPECTION_SYSTEM_KEYS) out[key] = !(input && input[key] === false);
    return out;
}

// The faulty systems of a checklist, by label.
function faultyLabels(checks) {
    return INSPECTION_SYSTEMS.filter((s) => checks[s.key] === false).map((s) => s.label);
}

// Does a job park the unit?
function parks(kind) {
    return PARKING_KINDS.includes(kind);
}

// ---------------------------------------------------------------------------

function kindLabel(kind) {
    return (MAINTENANCE_KINDS.find((k) => k.key === kind) || {}).label || kind;
}

function dto(m) {
    const checks = m.kind === 'inspection' ? Object.fromEntries(INSPECTION_SYSTEM_KEYS.map((k) => [k, m[k] !== false])) : null;
    return {
        id: m.id,
        buggyId: m.buggyId,
        buggyNo: m.buggyNo,
        buggyType: m.buggy && m.buggy.buggyType ? { code: m.buggy.buggyType.code, name: m.buggy.buggyType.name } : null,
        buggyLocation: m.buggy ? m.buggy.location : null,
        kind: m.kind,
        kindLabel: kindLabel(m.kind),
        status: m.status,
        openedAt: m.openedAt,
        source: m.source,
        buggyIssueId: m.buggyIssueId,
        buggyDamageId: m.buggyDamageId,
        findings: m.findings || null,
        workDone: m.workDone || null,
        cost: m.cost === null || m.cost === undefined ? null : Number(m.cost),
        checks,
        faulty: checks ? faultyLabels(checks) : [],
        completedAt: m.completedAt,
        remarks: m.remarks || null,
    };
}

function damageDto(d) {
    return {
        id: d.id,
        buggyId: d.buggyId,
        buggyNo: d.buggyNo,
        buggyType: d.buggy && d.buggy.buggyType ? { code: d.buggy.buggyType.code, name: d.buggy.buggyType.name } : null,
        buggyIssueId: d.buggyIssueId,
        playDate: d.playDate,
        golferId: d.golferId,
        playerId: d.playerId,
        golferName: d.golferName || null,
        memberNo: d.memberNo || null,
        reasonType: d.reasonType,
        reasonTypeLabel: (DAMAGE_REASON_TYPES.find((r) => r.key === d.reasonType) || {}).label || d.reasonType,
        description: d.description,
        maintenanceId: d.maintenanceId,
        resolvedAt: d.resolvedAt,
        status: d.resolvedAt ? 'resolved' : 'open',
        remarks: d.remarks || null,
        createdAt: d.createdAt,
    };
}

function meta() {
    return { kinds: MAINTENANCE_KINDS, statuses: MAINTENANCE_STATUSES, sources: MAINTENANCE_SOURCES, systems: INSPECTION_SYSTEMS, reasonTypes: DAMAGE_REASON_TYPES };
}

// The active units with their open job (the pickers and the batch inspect).
async function fleet(companyId) {
    const [units, open] = await Promise.all([
        GolfBuggy.findAll({ where: { companyId, status: 'active' }, include: [{ model: GolfBuggyType, as: 'buggyType', attributes: ['id', 'code', 'name', 'seats'] }], order: [['buggyNo', 'ASC']] }),
        GolfBuggyMaintenance.findAll({ where: { companyId, status: 'open' } }),
    ]);
    const openByBuggy = new Map(open.map((m) => [m.buggyId, m]));
    return units.map((b) => ({
        id: b.id, buggyNo: b.buggyNo, location: b.location,
        buggyType: b.buggyType ? { code: b.buggyType.code, name: b.buggyType.name, seats: Number(b.buggyType.seats) } : null,
        openJob: openByBuggy.has(b.id) ? dto(openByBuggy.get(b.id)) : null,
    }));
}

// The open job per unit (the Buggies register).
async function openJobsByBuggy(companyId) {
    const rows = await GolfBuggyMaintenance.findAll({ where: { companyId, status: 'open' } });
    return new Map(rows.map((m) => [m.buggyId, dto(m)]));
}

// GET /buggy-maintenance?status&kind&dateFrom&dateTo&buggyId
async function list(req, query) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const where = { companyId };
    if (query.status && MAINTENANCE_STATUS_KEYS.includes(String(query.status))) where.status = String(query.status);
    if (query.kind && MAINTENANCE_KIND_KEYS.includes(String(query.kind))) where.kind = String(query.kind);
    if (query.buggyId) where.buggyId = String(query.buggyId);
    const from = DATE_RE.test(String(query.dateFrom || '')) ? `${query.dateFrom}T00:00:00.000Z` : null;
    const to = DATE_RE.test(String(query.dateTo || '')) ? `${query.dateTo}T23:59:59.999Z` : null;
    if (from || to) where.openedAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
    const rows = await GolfBuggyMaintenance.findAll({ where, include: BUGGY_INCLUDE, order: [['status', 'DESC'], ['openedAt', 'DESC']] });
    return { jobs: rows.map(dto), fleet: await fleet(companyId), ...meta() };
}

// POST /buggy-maintenance { buggyIds, kind: 'service' | 'repair', findings?, remarks? }
async function open(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const kind = String(body.kind || '');
    if (!parks(kind)) return fail('Pick Service or Repair (inspections go through Inspect).');
    const ids = [...new Set((Array.isArray(body.buggyIds) ? body.buggyIds : []).map((v) => String(v)))];
    if (!ids.length) return fail('Pick the buggy.');
    const findings = text(body.findings);
    const remarks = text(body.remarks, 255);
    const stamps = await callerStamps(req);
    const result = await sequelize.transaction(async (transaction) => {
        const units = await GolfBuggy.findAll({ where: { companyId, id: { [Op.in]: ids } }, transaction, lock: transaction.LOCK.UPDATE });
        if (units.length !== ids.length) return fail('A picked buggy no longer exists.', 404);
        const created = [];
        for (const b of units) {
            const refused = await parkCheck(companyId, b, { transaction });
            if (refused) return refused;
            const row = await openJob({ companyId, buggy: b, kind, source: 'manual', findings, remarks, stamps, transaction });
            created.push(row);
        }
        return { created, units };
    });
    if (result.error) return result;
    const nos = result.units.map((b) => b.buggyNo).join(', ');
    return { message: `${kindLabel(kind)} opened for ${nos} - ${result.units.length === 1 ? 'the unit is' : 'the units are'} parked in maintenance.`, jobs: result.created.map(dto) };
}

// Can this unit be parked right now?
async function parkCheck(companyId, buggy, { transaction }) {
    if (buggy.status !== 'active') return fail(`Buggy ${buggy.buggyNo} is retired.`, 409);
    if (buggy.location === 'on-course') return fail(`Buggy ${buggy.buggyNo} is out on the course - return it first.`, 409);
    const openRow = await GolfBuggyMaintenance.findOne({ where: { companyId, buggyId: buggy.id, status: 'open', kind: { [Op.in]: PARKING_KINDS } }, transaction });
    if (openRow) return fail(`Buggy ${buggy.buggyNo} already has an open ${kindLabel(openRow.kind).toLowerCase()} - complete it first.`, 409);
    return null;
}

// Create the job row and park the unit (inside the caller's transaction).
async function openJob({ companyId, buggy, kind, source, findings, remarks, buggyIssueId = null, buggyDamageId = null, stamps, transaction }) {
    const row = await GolfBuggyMaintenance.create({
        companyId, buggyId: buggy.id, buggyNo: buggy.buggyNo, kind, status: 'open', openedAt: new Date(), openedBy: stamps.updatedBy,
        source, buggyIssueId, buggyDamageId, findings, remarks, ...stamps,
    }, { transaction });
    if (parks(kind) && buggy.location !== 'maintenance') {
        buggy.location = 'maintenance';
        buggy.updatedBy = stamps.updatedBy;
        await buggy.save({ transaction });
    }
    return row;
}

// POST /buggy-maintenance/inspect { items: [{ buggyId, steeringOk, brakesOk, electricalOk, driveOk, bodyOk, findings }], remarks? }
// Every item is an inspection done on the spot; a fault opens a repair.
async function inspect(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return fail('Pick the buggies to inspect.');
    const remarks = text(body.remarks, 255);
    const stamps = await callerStamps(req);
    const result = await sequelize.transaction(async (transaction) => {
        const ids = [...new Set(items.map((i) => String(i.buggyId || '')))];
        const units = await GolfBuggy.findAll({ where: { companyId, id: { [Op.in]: ids } }, transaction, lock: transaction.LOCK.UPDATE });
        const byId = new Map(units.map((b) => [b.id, b]));
        const passed = [];
        const faulted = [];
        const skipped = [];
        const now = new Date();
        for (const item of items) {
            const b = byId.get(String(item.buggyId || ''));
            if (!b) return fail('A picked buggy no longer exists.', 404);
            if (b.status !== 'active') return fail(`Buggy ${b.buggyNo} is retired.`, 409);
            if (b.location === 'on-course') return fail(`Buggy ${b.buggyNo} is out on the course - inspect it when it is back.`, 409);
            const checks = normalizeChecks(item);
            const faults = faultyLabels(checks);
            const findings = text(item.findings);
            if (faults.length && !findings) return fail(`Describe the fault found on ${b.buggyNo} (${faults.join(', ')}).`);
            const inspection = await GolfBuggyMaintenance.create({
                companyId, buggyId: b.id, buggyNo: b.buggyNo, kind: 'inspection', status: 'done', openedAt: now, openedBy: stamps.updatedBy,
                source: 'manual', findings, ...checks, completedAt: now, completedBy: stamps.updatedBy, remarks, ...stamps,
            }, { transaction });
            if (!faults.length) { passed.push(b.buggyNo); continue; }
            const openRow = await GolfBuggyMaintenance.findOne({ where: { companyId, buggyId: b.id, status: 'open', kind: { [Op.in]: PARKING_KINDS } }, transaction });
            if (openRow) {
                // Already parked: the inspection's findings join the open job.
                openRow.findings = [openRow.findings, `Inspection: ${faults.join(', ')} - ${findings}`].filter(Boolean).join('\n').slice(0, 1000);
                openRow.updatedBy = stamps.updatedBy;
                await openRow.save({ transaction });
                skipped.push(b.buggyNo);
            } else {
                await openJob({ companyId, buggy: b, kind: 'repair', source: 'inspection', findings: `${faults.join(', ')} - ${findings}`, remarks: null, stamps, transaction });
                faulted.push(b.buggyNo);
            }
            void inspection;
        }
        return { passed, faulted, skipped };
    });
    if (result.error) return result;
    const parts = [];
    if (result.passed.length) parts.push(`${result.passed.join(', ')} passed`);
    if (result.faulted.length) parts.push(`repair opened for ${result.faulted.join(', ')}`);
    if (result.skipped.length) parts.push(`${result.skipped.join(', ')} already in maintenance (findings added)`);
    return { message: `Inspection recorded: ${parts.join('; ')}.`, ...result };
}

// POST /buggy-maintenance/:id/complete { workDone?, cost? }
async function complete(req, id, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const callerId = getUserContext(req).userId;
    const workDone = text(body.workDone);
    const cost = body.cost === null || body.cost === undefined || body.cost === '' ? null : Number(body.cost);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return fail('Cost must be 0.00 or more.');
    const result = await sequelize.transaction(async (transaction) => {
        const row = await GolfBuggyMaintenance.findOne({ where: { companyId, id: String(id) }, transaction, lock: transaction.LOCK.UPDATE });
        if (!row) return fail('Job not found.', 404);
        if (row.status !== 'open') return fail(`This ${kindLabel(row.kind).toLowerCase()} is already done.`, 409);
        const now = new Date();
        Object.assign(row, { status: 'done', workDone, cost: cost === null ? null : cost.toFixed(2), completedAt: now, completedBy: callerId, updatedBy: callerId });
        await row.save({ transaction });
        const buggy = await GolfBuggy.findOne({ where: { companyId, id: row.buggyId }, transaction, lock: transaction.LOCK.UPDATE });
        // Back to the depot unless another job still parks the unit.
        const still = await GolfBuggyMaintenance.count({ where: { companyId, buggyId: row.buggyId, status: 'open', kind: { [Op.in]: PARKING_KINDS } }, transaction });
        if (buggy && buggy.location === 'maintenance' && !still) {
            buggy.location = 'in-depot';
            buggy.updatedBy = callerId;
            await buggy.save({ transaction });
        }
        if (row.buggyDamageId) await GolfBuggyDamage.update({ resolvedAt: now, updatedBy: callerId }, { where: { companyId, id: row.buggyDamageId, resolvedAt: null }, transaction });
        return { row, buggy, still };
    });
    if (result.error) return result;
    const full = await GolfBuggyMaintenance.findOne({ where: { id: result.row.id }, include: BUGGY_INCLUDE });
    return { message: `${kindLabel(result.row.kind)} on ${result.row.buggyNo} completed${result.still ? '' : ' - the unit is back in the depot'}.`, job: dto(full) };
}

// DELETE /buggy-maintenance/:id - a mis-keyed OPEN job only (the station's
// and the inspection's rows stay as history; complete them instead).
async function cancel(req, id) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const callerId = getUserContext(req).userId;
    const result = await sequelize.transaction(async (transaction) => {
        const row = await GolfBuggyMaintenance.findOne({ where: { companyId, id: String(id) }, transaction, lock: transaction.LOCK.UPDATE });
        if (!row) return fail('Job not found.', 404);
        if (row.status !== 'open') return fail('Only an open job can be cancelled.', 409);
        if (row.source !== 'manual') return fail(`This ${kindLabel(row.kind).toLowerCase()} was raised by ${row.source === 'inspection' ? 'an inspection' : 'the station'} - complete it instead.`, 409);
        await row.destroy({ transaction });
        const buggy = await GolfBuggy.findOne({ where: { companyId, id: row.buggyId }, transaction, lock: transaction.LOCK.UPDATE });
        const still = await GolfBuggyMaintenance.count({ where: { companyId, buggyId: row.buggyId, status: 'open', kind: { [Op.in]: PARKING_KINDS } }, transaction });
        if (buggy && buggy.location === 'maintenance' && !still) {
            buggy.location = 'in-depot';
            buggy.updatedBy = callerId;
            await buggy.save({ transaction });
        }
        return { row };
    });
    if (result.error) return result;
    return { message: `${kindLabel(result.row.kind)} on ${result.row.buggyNo} cancelled.` };
}

// ---------------------------------------------------------------------------
// The station hook: a fault or damaged return / swap (inside its transaction).
// `damage` = { reasonType, description?, playerId? } from the desk's assessment.
async function openFromReturn({ companyId, buggy, issue, conditionIn, remarksIn, damage, stamps, transaction }) {
    if (conditionIn === 'good') return { job: null, damage: null };
    let damageRow = null;
    if (conditionIn === 'damaged') {
        const d = damage || {};
        const reasonType = DAMAGE_REASON_TYPE_KEYS.includes(d.reasonType) ? d.reasonType : 'player';
        const riders = await GolfBuggyIssueRider.findAll({ where: { buggyIssueId: issue.id }, transaction });
        const rider = d.playerId ? riders.find((r) => r.playerId === String(d.playerId)) || null : (reasonType === 'player' && riders.length === 1 ? riders[0] : null);
        damageRow = await GolfBuggyDamage.create({
            companyId, buggyId: buggy.id, buggyNo: buggy.buggyNo, buggyIssueId: issue.id, playDate: issue.playDate,
            golferId: rider ? rider.golferId : null, playerId: rider ? rider.playerId : null, golferName: rider ? rider.playerName : null, memberNo: rider ? rider.memberNo : null,
            reasonType, description: text(d.description) || remarksIn || 'Damaged on return', ...stamps,
        }, { transaction });
    }
    const existing = await GolfBuggyMaintenance.findOne({ where: { companyId, buggyId: buggy.id, status: 'open', kind: { [Op.in]: PARKING_KINDS } }, transaction });
    let job;
    if (existing) {
        existing.findings = [existing.findings, `${conditionIn === 'damaged' ? 'Damaged' : 'Fault'} on return: ${remarksIn}`].filter(Boolean).join('\n').slice(0, 1000);
        if (damageRow && !existing.buggyDamageId) existing.buggyDamageId = damageRow.id;
        existing.updatedBy = stamps.updatedBy;
        await existing.save({ transaction });
        job = existing;
    } else {
        job = await openJob({
            companyId, buggy, kind: 'repair', source: 'station-return', findings: `${conditionIn === 'damaged' ? 'Damaged' : 'Fault'} on return: ${remarksIn}`,
            remarks: null, buggyIssueId: issue.id, buggyDamageId: damageRow ? damageRow.id : null, stamps, transaction,
        });
    }
    if (damageRow) {
        damageRow.maintenanceId = job.id;
        await damageRow.save({ transaction });
    }
    // The unit is parked even when the open job already existed.
    if (buggy.location !== 'maintenance') {
        buggy.location = 'maintenance';
        buggy.updatedBy = stamps.updatedBy;
        await buggy.save({ transaction });
    }
    return { job, damage: damageRow };
}

// ---------------------------------------------------------------------------
// Damage register

// GET /buggy-damages?status&dateFrom&dateTo&buggyId
async function listDamages(req, query) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const where = { companyId };
    if (query.status === 'open') where.resolvedAt = null;
    if (query.status === 'resolved') where.resolvedAt = { [Op.ne]: null };
    if (query.buggyId) where.buggyId = String(query.buggyId);
    const from = DATE_RE.test(String(query.dateFrom || '')) ? String(query.dateFrom) : null;
    const to = DATE_RE.test(String(query.dateTo || '')) ? String(query.dateTo) : null;
    if (from || to) where.playDate = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
    const rows = await GolfBuggyDamage.findAll({ where, include: BUGGY_INCLUDE, order: [['playDate', 'DESC'], ['createdAt', 'DESC']] });
    return { damages: rows.map(damageDto), fleet: await fleet(companyId), reasonTypes: DAMAGE_REASON_TYPES };
}

// POST /buggy-damages { buggyId, playDate, reasonType, description, golferName?, memberNo?, remarks?, openRepair? }
async function recordDamage(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const buggyId = String(body.buggyId || '');
    const playDate = String(body.playDate || '');
    if (!DATE_RE.test(playDate)) return fail('Pick the date of the damage.');
    const reasonType = String(body.reasonType || '');
    if (!DAMAGE_REASON_TYPE_KEYS.includes(reasonType)) return fail('Pick who or what caused the damage.');
    const description = text(body.description);
    if (!description) return fail('Describe the damage.');
    const stamps = await callerStamps(req);
    const result = await sequelize.transaction(async (transaction) => {
        const buggy = await GolfBuggy.findOne({ where: { companyId, id: buggyId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!buggy) return fail('Pick the buggy.', 404);
        const row = await GolfBuggyDamage.create({
            companyId, buggyId: buggy.id, buggyNo: buggy.buggyNo, playDate, reasonType, description,
            golferName: text(body.golferName, 255), memberNo: text(body.memberNo, 50), remarks: text(body.remarks, 255), ...stamps,
        }, { transaction });
        let job = null;
        if (body.openRepair === true) {
            const refused = await parkCheck(companyId, buggy, { transaction });
            if (refused) {
                // Already parked: attach to the open job rather than refuse.
                const existing = await GolfBuggyMaintenance.findOne({ where: { companyId, buggyId: buggy.id, status: 'open', kind: { [Op.in]: PARKING_KINDS } }, transaction });
                if (!existing) return refused;
                if (!existing.buggyDamageId) { existing.buggyDamageId = row.id; await existing.save({ transaction }); }
                job = existing;
            } else {
                job = await openJob({ companyId, buggy, kind: 'repair', source: 'manual', findings: `Damage: ${description}`, remarks: null, buggyDamageId: row.id, stamps, transaction });
            }
            row.maintenanceId = job.id;
            await row.save({ transaction });
        }
        return { row, job };
    });
    if (result.error) return result;
    const full = await GolfBuggyDamage.findOne({ where: { id: result.row.id }, include: BUGGY_INCLUDE });
    return { message: `Damage recorded on ${result.row.buggyNo}${result.job ? ' - repair opened' : ''}.`, damage: damageDto(full) };
}

// PUT /buggy-damages/:id { reasonType, description, golferName?, memberNo?, remarks? }
async function updateDamage(req, id, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const row = await GolfBuggyDamage.findOne({ where: { companyId, id: String(id) } });
    if (!row) return fail('Damage record not found.', 404);
    const reasonType = String(body.reasonType || row.reasonType);
    if (!DAMAGE_REASON_TYPE_KEYS.includes(reasonType)) return fail('Pick who or what caused the damage.');
    const description = text(body.description);
    if (!description) return fail('Describe the damage.');
    Object.assign(row, { reasonType, description, golferName: text(body.golferName, 255), memberNo: text(body.memberNo, 50), remarks: text(body.remarks, 255), updatedBy: getUserContext(req).userId });
    await row.save();
    const full = await GolfBuggyDamage.findOne({ where: { id: row.id }, include: BUGGY_INCLUDE });
    return { message: `Damage record on ${row.buggyNo} updated.`, damage: damageDto(full) };
}

// POST /buggy-damages/:id/resolve - close a record with no repair (or whose repair is done).
async function resolveDamage(req, id) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const row = await GolfBuggyDamage.findOne({ where: { companyId, id: String(id) } });
    if (!row) return fail('Damage record not found.', 404);
    if (row.resolvedAt) return fail('This damage record is already resolved.', 409);
    if (row.maintenanceId) {
        const job = await GolfBuggyMaintenance.findOne({ where: { companyId, id: row.maintenanceId } });
        if (job && job.status === 'open') return fail(`Complete the repair on ${row.buggyNo} first - it resolves the record.`, 409);
    }
    Object.assign(row, { resolvedAt: new Date(), updatedBy: getUserContext(req).userId });
    await row.save();
    const full = await GolfBuggyDamage.findOne({ where: { id: row.id }, include: BUGGY_INCLUDE });
    return { message: `Damage record on ${row.buggyNo} resolved.`, damage: damageDto(full) };
}

// The outing's riders for the station's damage assessment picker.
async function ridersOfIssue(issue, { transaction } = {}) {
    return GolfBuggyIssueRider.findAll({ where: { buggyIssueId: issue.id }, transaction });
}

module.exports = {
    normalizeChecks, faultyLabels, parks, dto, damageDto, meta,
    list, open, inspect, complete, cancel, openFromReturn, openJobsByBuggy, fleet,
    listDamages, recordDamage, updateDamage, resolveDamage, ridersOfIssue,
};

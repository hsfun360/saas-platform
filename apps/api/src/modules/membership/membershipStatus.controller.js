const MembershipStatus = require('./membershipStatus.model');
const {
    getUserContext,
    listSubscriptionCompanies,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const {
    STATUS_CLASSES,
    SYSTEM_CONTROLS,
    STATUS_CLASS_KEYS,
    SYSTEM_CONTROL_KEYS,
} = require('./membershipStatus.constants');

// #RGB or #RRGGBB.
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeColor(v) {
    const s = String(v ?? '').trim();
    return s || null;
}

// The active company (club) whose statuses we're maintaining. Master files are
// per-company, so every request must carry a workspace.
function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// GET /api/membership/statuses/meta
// The fixed option lists for the screen's dropdowns (and the source the API
// validates against). Auth + entitlement already enforced by the parent router.
exports.getMeta = async (req, res) => {
    res.status(200).json({ classes: STATUS_CLASSES, controls: SYSTEM_CONTROLS });
};

// GET /api/membership/statuses  - every status for the active company.
exports.listStatuses = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await MembershipStatus.findAll({
            where: { companyId },
            order: [['membershipStatus', 'ASC']],
        });
        // Row-level data scope: flag which rows the caller's role may modify,
        // so the UI hides Edit/Enable/Disable instead of 403-ing after a click.
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => ({ ...r.toJSON(), canModify: flags[i] })));
    } catch (error) {
        console.error('Error listing membership statuses:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/statuses
// Body: { membershipStatus, statusClass, systemControl, description?, statusColor? }
exports.createStatus = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const membershipStatus = String(req.body.membershipStatus || '').trim();
        const statusClass = String(req.body.statusClass || '').trim();
        const systemControl = String(req.body.systemControl || '').trim();
        const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
        const statusColor = normalizeColor(req.body.statusColor);

        if (!membershipStatus) return res.status(400).json({ message: 'Membership status is required.' });
        if (!STATUS_CLASS_KEYS.includes(statusClass)) return res.status(400).json({ message: 'Invalid status class.' });
        if (!SYSTEM_CONTROL_KEYS.includes(systemControl)) return res.status(400).json({ message: 'Invalid system control.' });
        if (statusColor && !HEX_COLOR.test(statusColor)) return res.status(400).json({ message: 'Status color must be a hex value like #22c55e.' });

        const existing = await MembershipStatus.findOne({ where: { companyId, membershipStatus } });
        if (existing) return res.status(409).json({ message: `Membership status '${membershipStatus}' already exists.` });

        // Ownership stamps: creator + their department at creation (data scope).
        const { departmentId } = await getCallerPlacement(req);
        const status = await MembershipStatus.create({
            companyId,
            membershipStatus,
            statusClass,
            description: description || null,
            systemControl,
            statusColor,
            createdBy: getUserContext(req).userId,
            createdByDepartmentId: departmentId,
            updatedBy: getUserContext(req).userId,
        });
        res.status(201).json({ message: 'Membership status created.', status });
    } catch (error) {
        console.error('Error creating membership status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/membership/statuses/:id
// Body: any of { membershipStatus, statusClass, systemControl, description, statusColor, isActive }
exports.updateStatus = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const status = await MembershipStatus.findOne({ where: { id: req.params.id, companyId } });
        if (!status) return res.status(404).json({ message: 'Membership status not found.' });

        // Row-level data scope: own / department (strictly senior) / all.
        if (!(await canModifyRecord(req, status))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.membershipStatus === 'string' && req.body.membershipStatus.trim()) {
            const membershipStatus = req.body.membershipStatus.trim();
            if (membershipStatus !== status.membershipStatus) {
                const clash = await MembershipStatus.findOne({ where: { companyId, membershipStatus } });
                if (clash) return res.status(409).json({ message: `Membership status '${membershipStatus}' already exists.` });
                status.membershipStatus = membershipStatus;
            }
        }
        if (typeof req.body.statusClass === 'string' && req.body.statusClass.trim()) {
            const statusClass = req.body.statusClass.trim();
            if (!STATUS_CLASS_KEYS.includes(statusClass)) return res.status(400).json({ message: 'Invalid status class.' });
            status.statusClass = statusClass;
        }
        if (typeof req.body.systemControl === 'string' && req.body.systemControl.trim()) {
            const systemControl = req.body.systemControl.trim();
            if (!SYSTEM_CONTROL_KEYS.includes(systemControl)) return res.status(400).json({ message: 'Invalid system control.' });
            status.systemControl = systemControl;
        }
        if (typeof req.body.description === 'string') status.description = req.body.description.trim() || null;
        if (typeof req.body.statusColor === 'string') {
            const color = normalizeColor(req.body.statusColor);
            if (color && !HEX_COLOR.test(color)) return res.status(400).json({ message: 'Status color must be a hex value like #22c55e.' });
            status.statusColor = color;
        }
        if (typeof req.body.isActive === 'boolean') status.isActive = req.body.isActive;

        status.updatedBy = getUserContext(req).userId;
        await status.save();
        res.status(200).json({ message: 'Membership status updated.', status });
    } catch (error) {
        console.error('Error updating membership status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Shape a status row for the copy picker (no companyId/timestamps).
function toSourceDto(s) {
    return {
        id: s.id,
        membershipStatus: s.membershipStatus,
        statusClass: s.statusClass,
        description: s.description,
        systemControl: s.systemControl,
        statusColor: s.statusColor,
    };
}

// GET /api/membership/statuses/copy-sources
// Sibling companies in the same subscription that have at least one status,
// each with its statuses (so the picker can offer a selectable list). Used by
// the first-time-setup "Copy from another company" flow.
exports.getCopySources = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const siblings = (await listSubscriptionCompanies(req)).filter((c) => c.id !== companyId);
        if (siblings.length === 0) return res.status(200).json([]);

        const siblingIds = siblings.map((c) => c.id);
        // Only active statuses are offered for copying - a disabled status in the
        // source company must not be seeded into a new one.
        const rows = await MembershipStatus.findAll({
            where: { companyId: siblingIds, isActive: true },
            order: [['membershipStatus', 'ASC']],
        });

        const sources = siblings
            .map((c) => {
                const statuses = rows.filter((r) => r.companyId === c.id);
                return { companyId: c.id, companyName: c.name, count: statuses.length, statuses: statuses.map(toSourceDto) };
            })
            .filter((s) => s.count > 0);

        res.status(200).json(sources);
    } catch (error) {
        console.error('Error listing copy sources:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/statuses/copy   Body: { fromCompanyId, statusIds? }
// Clone statuses from a sibling company into the active company. Only allowed
// during first-time setup (target company must be empty), and only from a
// company in the same subscription. `statusIds` selects a subset; omit to copy all.
exports.copyStatuses = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const fromCompanyId = String(req.body.fromCompanyId || '').trim();
        if (!fromCompanyId) return res.status(400).json({ message: 'Source company is required.' });
        if (fromCompanyId === companyId) return res.status(400).json({ message: 'Choose a different company to copy from.' });

        // Target must be empty - copy is a first-time-setup convenience only.
        const existingCount = await MembershipStatus.count({ where: { companyId } });
        if (existingCount > 0) {
            return res.status(409).json({ message: 'This company already has statuses. Copy is only available during first-time setup.' });
        }

        // Source must be a sibling within the same subscription (security boundary).
        const siblings = await listSubscriptionCompanies(req);
        const source = siblings.find((c) => c.id === fromCompanyId);
        if (!source) return res.status(403).json({ message: 'You can only copy from a company in the same subscription.' });

        // Selected subset, or all of the source's statuses when none specified.
        // Only active source statuses are copyable (mirrors copy-sources).
        const statusIds = Array.isArray(req.body.statusIds) ? req.body.statusIds.map(String) : null;
        const where = { companyId: fromCompanyId, isActive: true };
        if (statusIds) {
            if (statusIds.length === 0) return res.status(400).json({ message: 'No statuses selected to copy.' });
            where.id = statusIds;
        }
        const sourceStatuses = await MembershipStatus.findAll({ where });
        if (sourceStatuses.length === 0) return res.status(400).json({ message: 'No statuses found to copy.' });

        // Copies are records the CALLER creates in the target company.
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const clones = sourceStatuses.map((s) => ({
            companyId,
            membershipStatus: s.membershipStatus,
            statusClass: s.statusClass,
            description: s.description,
            systemControl: s.systemControl,
            statusColor: s.statusColor,
            isActive: s.isActive,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        }));
        const created = await MembershipStatus.bulkCreate(clones);

        res.status(201).json({
            message: `Copied ${created.length} status${created.length === 1 ? '' : 'es'} from ${source.name}.`,
            total: created.length,
        });
    } catch (error) {
        console.error('Error copying membership statuses:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

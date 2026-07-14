const { sequelize } = require('../../platform/db');
const UnitCourse = require('./unitCourse.model');
const UnitCourseHole = require('./unitCourseHole.model');
const { getUserContext } = require('../../platform/serviceContext');
const { holeNumbersForType } = require('./unitCourse.constants');

// Holes are children of a unit course; every request scopes through the parent
// (active company + :id), never by hole id alone.
async function findOwnedUnitCourse(req) {
    const companyId = getUserContext(req).companyId || null;
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const unitCourse = await UnitCourse.findOne({ where: { id: req.params.id, companyId } });
    if (!unitCourse) return { status: 404, message: 'Unit course not found.' };
    return { unitCourse };
}

// GET /api/golf/unit-courses/:id/holes
// The saved hole rows, ordered. The screen merges these onto the type's full
// range (unitCourse.constants holeFrom/holeTo, served via /meta), so a course
// whose holes were never saved still presents a complete grid.
exports.listHoles = async (req, res) => {
    try {
        const target = await findOwnedUnitCourse(req);
        if (target.status) return res.status(target.status).json({ message: target.message });

        const holes = await UnitCourseHole.findAll({
            where: { unitCourseId: target.unitCourse.id },
            order: [['holeNumber', 'ASC']],
        });
        res.status(200).json(holes);
    } catch (error) {
        console.error('Error listing unit course holes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/unit-courses/:id/holes
// Body: { holes: [{ holeNumber, par?, strokeIndex?, remarks? }] }
// Replaces the whole hole set atomically. The posted numbers must be exactly the
// range the unit course's type dictates (OUT 1-9, IN 10-18, COMPOSITE 1-18) - the
// numbering is system-defined per spec 2.2.2, only the per-hole values are the
// user's. Saving after a type change therefore re-syncs the numbering naturally.
exports.saveHoles = async (req, res) => {
    try {
        const target = await findOwnedUnitCourse(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const unitCourse = target.unitCourse;

        const expected = holeNumbersForType(unitCourse.courseType);
        const rawHoles = Array.isArray(req.body.holes) ? req.body.holes : [];
        if (rawHoles.length !== expected.length) {
            return res.status(400).json({ message: `A ${unitCourse.courseType.toUpperCase()} unit course needs exactly ${expected.length} holes (${expected[0]}-${expected[expected.length - 1]}).` });
        }

        const rows = [];
        const seen = new Set();
        for (const h of rawHoles) {
            const holeNumber = Number(h.holeNumber);
            if (!expected.includes(holeNumber) || seen.has(holeNumber)) {
                return res.status(400).json({ message: `Hole numbers must be exactly ${expected[0]}-${expected[expected.length - 1]}, each once.` });
            }
            seen.add(holeNumber);

            let par = null;
            if (h.par !== undefined && h.par !== null && h.par !== '') {
                par = Number(h.par);
                if (!Number.isInteger(par) || par < 3 || par > 5) {
                    return res.status(400).json({ message: `Hole ${holeNumber}: par must be 3, 4 or 5.` });
                }
            }
            let handicapIndex = null;
            if (h.handicapIndex !== undefined && h.handicapIndex !== null && h.handicapIndex !== '') {
                handicapIndex = Number(h.handicapIndex);
                if (!Number.isInteger(handicapIndex) || handicapIndex < 1 || handicapIndex > 18) {
                    return res.status(400).json({ message: `Hole ${holeNumber}: handicap index must be a whole number between 1 and 18.` });
                }
                // Parity follows the numbering context: front-nine holes (1-9)
                // take ODD indexes, back-nine holes (10-18) take EVEN ones - so
                // an OUT+IN pairing yields a complete 1-18 set.
                const wantOdd = holeNumber <= 9;
                if (wantOdd && handicapIndex % 2 === 0) {
                    return res.status(400).json({ message: `Hole ${holeNumber}: front-nine holes take an ODD handicap index (1-17).` });
                }
                if (!wantOdd && handicapIndex % 2 === 1) {
                    return res.status(400).json({ message: `Hole ${holeNumber}: back-nine holes take an EVEN handicap index (2-18).` });
                }
            }
            const remarks = typeof h.remarks === 'string' ? h.remarks.trim() : null;
            if (remarks && remarks.length > 255) {
                return res.status(400).json({ message: `Hole ${holeNumber}: remarks must be 255 characters or less.` });
            }

            rows.push({ unitCourseId: unitCourse.id, holeNumber, par, handicapIndex, remarks: remarks || null });
        }

        await sequelize.transaction(async (t) => {
            await UnitCourseHole.destroy({ where: { unitCourseId: unitCourse.id }, transaction: t });
            await UnitCourseHole.bulkCreate(rows, { transaction: t });
        });

        const holes = await UnitCourseHole.findAll({
            where: { unitCourseId: unitCourse.id },
            order: [['holeNumber', 'ASC']],
        });
        res.status(200).json({ message: `Holes saved for ${unitCourse.unitCourseCode}.`, holes });
    } catch (error) {
        console.error('Error saving unit course holes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

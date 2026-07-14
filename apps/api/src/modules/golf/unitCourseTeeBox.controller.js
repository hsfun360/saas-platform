const { sequelize } = require('../../platform/db');
const UnitCourse = require('./unitCourse.model');
const UnitCourseTeeBox = require('./unitCourseTeeBox.model');
const UnitCourseTeeBoxDistance = require('./unitCourseTeeBoxDistance.model');
const { getUserContext } = require('../../platform/serviceContext');
const { MEASUREMENT_UNIT_KEYS, holeNumbersForType } = require('./unitCourse.constants');

// #RGB or #RRGGBB.
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Tee boxes are children of a unit course; every request scopes through the
// parent (active company + :id), never by tee-box id alone.
async function findOwnedUnitCourse(req) {
    const companyId = getUserContext(req).companyId || null;
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const unitCourse = await UnitCourse.findOne({ where: { id: req.params.id, companyId } });
    if (!unitCourse) return { status: 404, message: 'Unit course not found.' };
    return { unitCourse };
}

function listQuery(unitCourseId) {
    return UnitCourseTeeBox.findAll({
        where: { unitCourseId },
        include: [{ model: UnitCourseTeeBoxDistance, as: 'Distances' }],
        order: [
            ['seq', 'ASC'],
            ['colorCode', 'ASC'],
            [{ model: UnitCourseTeeBoxDistance, as: 'Distances' }, 'holeNumber', 'ASC'],
        ],
    });
}

// GET /api/golf/unit-courses/:id/tee-boxes - the course's tee boxes with their
// per-gender rating rows.
exports.listTeeBoxes = async (req, res) => {
    try {
        const target = await findOwnedUnitCourse(req);
        if (target.status) return res.status(target.status).json({ message: target.message });

        const teeBoxes = await listQuery(target.unitCourse.id);
        res.status(200).json(teeBoxes);
    } catch (error) {
        console.error('Error listing tee boxes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/unit-courses/:id/tee-boxes
// Body: { teeBoxes: [{ colorCode, seq?, description?, measurementUnit?,
//                      distances?: [{ holeNumber, distance }] }] }
// Replaces the whole tee-box set (headers + per-hole distances) atomically,
// like the hole grid. Unlike holes the set itself is user-defined, so rows may
// be added or removed freely at this stage (nothing references a tee box yet;
// an in-use guard comes with tee sheets/scorecards). Distances are per hole
// (the scorecard's yardage rows) in the header's measurementUnit; a partial set
// is allowed while the club is still measuring - totals are computed by the
// reader, never stored.
exports.saveTeeBoxes = async (req, res) => {
    try {
        const target = await findOwnedUnitCourse(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const unitCourse = target.unitCourse;

        const rawBoxes = Array.isArray(req.body.teeBoxes) ? req.body.teeBoxes : [];
        const validHoleNumbers = new Set(holeNumbersForType(unitCourse.courseType));
        const headers = [];
        const seenColors = new Set();
        for (const b of rawBoxes) {
            const colorCode = String(b.colorCode || '').trim().toUpperCase();
            if (!colorCode) return res.status(400).json({ message: 'Every tee box needs a colour code.' });
            if (colorCode.length > 20) return res.status(400).json({ message: `Tee box '${colorCode}': colour code must be 20 characters or less.` });
            if (seenColors.has(colorCode)) return res.status(400).json({ message: `Tee box colour '${colorCode}' appears more than once.` });
            seenColors.add(colorCode);

            let seq = null;
            if (b.seq !== undefined && b.seq !== null && b.seq !== '') {
                seq = Number(b.seq);
                if (!Number.isInteger(seq) || seq < 1 || seq > 5) {
                    return res.status(400).json({ message: `Tee box '${colorCode}': number must be between 1 and 5.` });
                }
            }

            let colorHex = null;
            if (typeof b.colorHex === 'string' && b.colorHex.trim()) {
                colorHex = b.colorHex.trim();
                if (!HEX_COLOR.test(colorHex)) {
                    return res.status(400).json({ message: `Tee box '${colorCode}': colour must be a hex value like #1e40af.` });
                }
            }
            const description = typeof b.description === 'string' ? b.description.trim() : null;
            if (description && description.length > 255) {
                return res.status(400).json({ message: `Tee box '${colorCode}': description must be 255 characters or less.` });
            }

            const measurementUnit = String(b.measurementUnit || 'meter').trim();
            if (!MEASUREMENT_UNIT_KEYS.includes(measurementUnit)) {
                return res.status(400).json({ message: `Tee box '${colorCode}': measurement must be Meter or Yard.` });
            }

            // Per-hole distances: numbers must belong to the type's range, each
            // hole at most once. A subset is fine (blank scorecard cells).
            const distances = [];
            const seenHoles = new Set();
            for (const d of Array.isArray(b.distances) ? b.distances : []) {
                const holeNumber = Number(d.holeNumber);
                if (!validHoleNumbers.has(holeNumber)) {
                    return res.status(400).json({ message: `Tee box '${colorCode}': hole ${d.holeNumber} is not part of this unit course.` });
                }
                if (seenHoles.has(holeNumber)) {
                    return res.status(400).json({ message: `Tee box '${colorCode}': duplicate distance for hole ${holeNumber}.` });
                }
                seenHoles.add(holeNumber);
                if (d.distance === undefined || d.distance === null || d.distance === '') continue;
                const distance = Number(d.distance);
                if (!Number.isInteger(distance) || distance < 1 || distance > 2000) {
                    return res.status(400).json({ message: `Tee box '${colorCode}', hole ${holeNumber}: distance must be a whole number between 1 and 2000.` });
                }
                distances.push({ holeNumber, distance });
            }

            headers.push({ colorCode, seq, colorHex, description: description || null, measurementUnit, distances });
        }

        await sequelize.transaction(async (t) => {
            // Distances cascade with their tee boxes, so clearing the headers
            // clears both levels.
            await UnitCourseTeeBox.destroy({ where: { unitCourseId: unitCourse.id }, transaction: t });
            for (const h of headers) {
                const box = await UnitCourseTeeBox.create({
                    unitCourseId: unitCourse.id,
                    colorCode: h.colorCode,
                    seq: h.seq,
                    colorHex: h.colorHex,
                    description: h.description,
                    measurementUnit: h.measurementUnit,
                }, { transaction: t });
                if (h.distances.length) {
                    await UnitCourseTeeBoxDistance.bulkCreate(
                        h.distances.map((d) => ({ ...d, teeBoxId: box.id })),
                        { transaction: t },
                    );
                }
            }
        });

        const teeBoxes = await listQuery(unitCourse.id);
        res.status(200).json({ message: `Tee boxes saved for ${unitCourse.unitCourseCode}.`, teeBoxes });
    } catch (error) {
        console.error('Error saving tee boxes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

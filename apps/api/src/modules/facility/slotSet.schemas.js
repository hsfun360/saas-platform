// Request schemas for the Facility Type slot-set routes (the Zod boundary
// seam, platform/validate.js). The controller keeps the vocabulary, time,
// date and range checks; these schemas bound SHAPE and SIZE and strip unknown
// keys, so every key validateHeader and saveSlots read is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const header = {
    description: str(500),
    dayScope: str(30),
    effectiveDate: str(10),
    firstSlotTime: str(8),
    lastSlotTime: str(8),
    slotMinutes: numberish,
    frontDeskFrom: str(8),
};

const slotLine = z.object({
    slotNumber: numberish,
    startTime: str(8),
    endTime: str(8),
    isFrontDesk: z.boolean().optional(),
    isActive: z.boolean().optional(),
});

const typeParam = { params: z.object({ id }) };
const setParam = { params: z.object({ id, setId: id }) };

module.exports = {
    type: typeParam,
    set: setParam,
    preview: { ...typeParam, body: z.object(header) },
    createSet: { ...typeParam, body: z.object(header) },
    updateSet: { ...setParam, body: z.object({ ...header, isActive: z.boolean().optional(), regenerate: z.boolean().optional() }) },
    // The service's own ceiling is 200 slots; the bound sits above it so its
    // friendlier message still fires.
    saveSlots: { ...setParam, body: z.object({ slots: z.array(slotLine).max(300).nullable().optional() }) },
};

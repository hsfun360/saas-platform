// Request schemas for the Billing Schedule (fee run) routes defined on the
// membership module router (the Zod boundary seam, platform/validate.js -
// mounted 2026-10-12). The controller keeps the billing-type vocabulary, the
// date/month formats and the item status machine; these schemas bound SHAPE
// and SIZE and strip unknown keys, so every key the controller reads is listed
// here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    generate: { body: z.object({ billingType: str(30), month: str(7), docDate: str(10), trxDate: str(10) }) },
    list: { query: z.object({ month: str(7) }) },
    // Selective posting: one AR Invoice per chosen pending item. A fee run over
    // a large club carries thousands of items, so the cap is generous.
    post: { ...idParam, body: z.object({ itemIds: z.array(z.string().max(64)).max(10000).nullable().optional() }) },
    setItemStatus: { ...idParam, body: z.object({ status: str(20) }) },
};

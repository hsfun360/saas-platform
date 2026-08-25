// src/wiring/dimensionUsage.js
//
// COMPOSITION-TIME registration of the Dimension capability's slot-usage
// checks: each consuming module tells the dimension gateway how to detect
// that one of a category's options is referenced by its documents (the
// slot-repurpose lock's eyes). Same pattern as workflowHandlers. Required
// once from app.js.
//
// WHEN SPLIT: each consumer exposes this check as an internal HTTP endpoint
// and the dimension service calls it through the gateway instead.

const { registerUsageCheck } = require('../platform/dimensionGateway');

// AR: any Ledger document carrying one of the options in its slot column.
// slotNo is gateway-validated 1..6 - the column name never carries user input.
registerUsageCheck(async ({ companyId, slotNo, optionIds }) => {
    const { Op } = require('sequelize');
    const Ledger = require('../modules/ar/ledger.model');
    const row = await Ledger.findOne({
        where: { companyId, [`analysis${slotNo}Id`]: { [Op.in]: optionIds } },
        attributes: ['id'],
    });
    return !!row;
});

module.exports = {};

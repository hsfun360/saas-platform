// src/wiring/dimensionUsage.js
//
// COMPOSITION-TIME registration of the Dimension capability's usage checks:
// each consuming module tells the dimension gateway how to detect that one of
// a category's options is referenced by its documents (the repurpose lock's
// eyes). Same pattern as workflowHandlers. Required once from app.js.
//
// WHEN SPLIT: each consumer exposes this check as an internal HTTP endpoint
// and the dimension service calls it through the gateway instead.

const { registerUsageCheck } = require('../platform/dimensionGateway');

// AR: any Ledger document carrying one of the options in its analysis column.
// dimensionNo is gateway-validated 1..6 - the column name never carries user
// input.
registerUsageCheck(async ({ companyId, dimensionNo, optionIds }) => {
    const { Op } = require('sequelize');
    const Ledger = require('../modules/ar/ledger.model');
    const row = await Ledger.findOne({
        where: { companyId, [`analysis${dimensionNo}Id`]: { [Op.in]: optionIds } },
        attributes: ['id'],
    });
    return !!row;
});

module.exports = {};

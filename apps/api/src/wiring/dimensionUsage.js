// src/wiring/dimensionUsage.js
//
// COMPOSITION-TIME registration of the Dimension capability's CONSUMERS: each
// module that stamps analysis dimensions onto its documents declares itself
// here, giving the gateway two things - the Control-Plane module name it is
// known by (so the Setup screen can offer it as a tickable module, and so
// stored rows resolve to a real Module id), and a usage check that detects one
// of a category's options being referenced by its documents (the repurpose
// lock's eyes). Same pattern as workflowHandlers. Required once from app.js.
//
// A module appears on the Analysis Setup screen ONLY once it is registered
// here, so every checkbox there changes behaviour somewhere. Adding POS or
// Golf later is one registerConsumer() block - no setup data migration.
//
// WHEN SPLIT: each consumer exposes this check as an internal HTTP endpoint
// and the dimension service calls it through the gateway instead.

const { registerConsumer } = require('../platform/dimensionGateway');

// AR: any Ledger document carrying one of the options in its analysis column.
// dimensionNo is gateway-validated 1..6 - the column name never carries user
// input.
registerConsumer({
    moduleCode: 'AR',
    usageCheck: async ({ companyId, dimensionNo, optionIds }) => {
        const { Op } = require('sequelize');
        const Ledger = require('../modules/ar/ledger.model');
        const row = await Ledger.findOne({
            where: { companyId, [`analysis${dimensionNo}Id`]: { [Op.in]: optionIds } },
            attributes: ['id'],
        });
        return !!row;
    },
});

module.exports = {};

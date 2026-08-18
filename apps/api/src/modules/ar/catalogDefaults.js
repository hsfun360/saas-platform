// Designated catalog entries for AR's OWN generated documents (2026-08-15):
// which Transaction Type the interest run posts under, and which Credit Note
// type deposit conversions post under. AR Specification names them
// explicitly; when unset, the seeded code is created on first use and
// remembered on the setting - selection is never inferred from a category.

const TransactionType = require('./transactionType.model');
const Setting = require('./setting.model');

async function designatedType(companyId, { settingField, code, trxClass, description }) {
    const [setting] = await Setting.findOrCreate({ where: { companyId }, defaults: { companyId } });
    if (setting[settingField]) {
        const chosen = await TransactionType.findOne({ where: { companyId, id: setting[settingField] } });
        if (chosen && chosen.isActive) return chosen.toJSON();
        // Designation points at a deleted/inactive row - fall through to seed.
    }
    const [row] = await TransactionType.findOrCreate({
        where: { companyId, transactionType: code },
        defaults: {
            companyId,
            transactionType: code,
            trxClass,
            description,
            taxSchemeCode: null,
            isInterestChargeable: false,
            usableInModules: [],
            isEInvoice: false,
            isActive: true,
        },
    });
    if (setting[settingField] !== row.id) {
        setting[settingField] = row.id;
        await setting.save();
    }
    return row.toJSON();
}

// The non-compounding Interest type (its isInterestChargeable stays false -
// flipping it on would deliberately enable interest-on-interest).
exports.interestType = (companyId) => designatedType(companyId, {
    settingField: 'interestTransactionTypeId',
    code: 'INTEREST',
    trxClass: 'interest',
    description: 'Late-payment interest',
});

// The non-taxable Credit Note type deposit conversions post under.
exports.depositConversionType = (companyId) => designatedType(companyId, {
    settingField: 'depositConversionTransactionTypeId',
    code: 'DEPCONV',
    trxClass: 'credit-note',
    description: 'Deposit conversion',
});

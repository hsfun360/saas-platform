// Transaction Type - READ-ONLY VIEW (2026-08-15). The catalog moved to AR
// (ar.TransactionType, maintained on /ar/transaction-types); this endpoint
// keeps the membership screen as a viewing copy of the entries opened to the
// Membership module. All writes happen on the AR master - the old write
// endpoints are gone.

const { getUserContext } = require('../../platform/serviceContext');
const arGateway = require('../../platform/arGateway');

// GET /api/membership/transaction-types - membership-usable catalog entries
// (read-only; includes inactive rows so the view matches the old screen).
exports.list = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await arGateway.listTransactionTypes(companyId, { module: 'membership', activeOnly: false });
        res.status(200).json(rows.map((t) => ({
            id: t.id,
            canModify: false, // maintained on the AR master, never here
            transactionType: t.transactionType,
            trxClass: t.trxClass,
            description: t.description,
            taxSchemeCode: t.taxSchemeCode,
            isInterestChargeable: t.isInterestChargeable === true,
            isActive: t.isActive,
        })));
    } catch (error) {
        console.error('Error listing transaction types (membership view):', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

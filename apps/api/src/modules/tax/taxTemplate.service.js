const { sequelize } = require('../../platform/db');
const TaxSchemeTemplate = require('./taxSchemeTemplate.model');
const TaxRateTemplate = require('./taxRateTemplate.model');
const catalog = require('./tax-templates.catalog');

// Seed the platform tax-scheme templates from the bundled starter catalog. Idempotent
// and safe to run on every boot (mirrors emailTemplate.service.seedPlatformDefaults):
//   - scheme template keyed by (countryCode, taxSchemeCode): created if missing,
//     otherwise its descriptive fields are refreshed from the bundle;
//   - `isActive` is PRESERVED on existing rows, so a platform admin disabling a
//     template is not undone by a redeploy;
//   - rate lines are replaced wholesale to match the bundle (the source of truth).
async function seedPlatformTaxTemplates() {
    for (const country of catalog) {
        for (const s of country.schemes) {
            await sequelize.transaction(async (t) => {
                const [tmpl, created] = await TaxSchemeTemplate.findOrCreate({
                    where: { countryCode: country.countryCode, taxSchemeCode: s.taxSchemeCode },
                    defaults: {
                        countryCode: country.countryCode,
                        taxSchemeCode: s.taxSchemeCode,
                        name: s.name,
                        description: s.description || null,
                        ieFlag: s.ieFlag,
                        taxClass: s.taxClass,
                        seededAsOf: country.seededAsOf || null,
                        isActive: true,
                    },
                    transaction: t,
                });

                if (!created) {
                    // Refresh descriptive fields from the bundle; keep admin's isActive.
                    tmpl.name = s.name;
                    tmpl.description = s.description || null;
                    tmpl.ieFlag = s.ieFlag;
                    tmpl.taxClass = s.taxClass;
                    tmpl.seededAsOf = country.seededAsOf || null;
                    await tmpl.save({ transaction: t });
                }

                await TaxRateTemplate.destroy({ where: { taxSchemeTemplateId: tmpl.id }, transaction: t });
                await TaxRateTemplate.bulkCreate(
                    s.rates.map((r) => ({
                        taxSchemeTemplateId: tmpl.id,
                        taxCode: r.taxCode,
                        taxRate: r.taxRate,
                        taxPriority: r.taxPriority || 1,
                        isClaimable: !!r.isClaimable,
                        claimPercentage: r.claimPercentage || 0,
                        glAccountCode: r.glAccountCode || null,
                    })),
                    { transaction: t },
                );
            });
        }
    }
}

module.exports = { seedPlatformTaxTemplates };

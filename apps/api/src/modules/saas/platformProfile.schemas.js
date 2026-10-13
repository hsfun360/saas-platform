// Request schemas for the Platform Profile routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep). The
// controller keeps every business check (trim-or-null on each text field, the
// canonical lowercase/uppercase codes, the numeric amount rule, the scheme
// resolution through taxGateway); these schemas bound SHAPE and SIZE and strip
// unknown keys, so every key updateProfile's textFields loop and quoteCharge
// read is listed here - an unlisted key would be silently dropped.
//
// Bounds mirror the column widths on platformProfile.model.js so a value that
// passes here can never fail at the database as a 500. The multipart logo
// upload (POST /platform-profile/logo) reads req.file only and stays bare.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();

module.exports = {
    update: {
        body: z.object({
            // Issuer identity (invoice header)
            legalName: str(255),
            tradingName: str(255),
            registrationNumber: str(255),
            taxRegistrationNumber: str(255),
            email: str(255),
            phone: str(255),
            website: str(255),
            addressLine1: str(255),
            addressLine2: str(255),
            city: str(255),
            state: str(255),
            postalCode: str(255),
            logo: str(255),
            defaultTaxSchemeCode: str(255),
            // LHDN e-Invoice issuer identity
            tin: str(20),
            msicCode: str(20),
            businessActivityDescription: str(300),
            sstRegistrationNumber: str(35),
            ttxRegistrationNumber: str(35),
            // Billing config (alpha-2 country, alpha-3 currency)
            countryCode: str(2),
            baseCurrencyCode: str(3),
        }),
    },
    // Tax on a platform charge via the profile's country + default scheme.
    quote: { body: z.object({ amount: numberish, date: str(10) }) },
};

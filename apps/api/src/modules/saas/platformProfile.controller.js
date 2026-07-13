const { Storage } = require('@google-cloud/storage');
const PlatformProfile = require('./platformProfile.model');
const { quotePlatformCharge } = require('../../platform/taxGateway');

// Reuse the same GCS bucket the company-logo upload uses (default credentials on
// Cloud Run). The platform profile is a System-Admin concern, so its upload route is
// guarded by isSystemAdmin - it can't reuse the tenant-admin `/auth/company/logo`.
const storage = new Storage();
const bucket = storage.bucket('membership-app-avatars-123');

// The platform's own "company of record" (a singleton). SaaS-admin only - the parent
// router (admin.routes) enforces verifyToken + isSystemAdmin.

const SINGLETON_KEY = 'platform';

function trimOrNull(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// Shape the row (or an empty profile) for the API. Never 404s: the screen always has
// a form to fill, even before the first save.
function toDto(profile) {
    if (!profile) {
        return {
            legalName: null, tradingName: null, registrationNumber: null, taxRegistrationNumber: null,
            email: null, phone: null, website: null,
            addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null,
            logo: null, countryCode: null, baseCurrencyCode: null, defaultTaxSchemeCode: null,
        };
    }
    return {
        legalName: profile.legalName,
        tradingName: profile.tradingName,
        registrationNumber: profile.registrationNumber,
        taxRegistrationNumber: profile.taxRegistrationNumber,
        email: profile.email,
        phone: profile.phone,
        website: profile.website,
        addressLine1: profile.addressLine1,
        addressLine2: profile.addressLine2,
        city: profile.city,
        state: profile.state,
        postalCode: profile.postalCode,
        logo: profile.logo,
        countryCode: profile.countryCode,
        baseCurrencyCode: profile.baseCurrencyCode,
        defaultTaxSchemeCode: profile.defaultTaxSchemeCode,
    };
}

// GET /api/admin/platform-profile - the singleton (or an empty profile if unset).
exports.getProfile = async (req, res) => {
    try {
        const profile = await PlatformProfile.findOne({ where: { singletonKey: SINGLETON_KEY } });
        res.status(200).json(toDto(profile));
    } catch (error) {
        console.error('Error loading platform profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/admin/platform-profile - create or update the singleton (upsert on the key).
exports.updateProfile = async (req, res) => {
    try {
        const b = req.body || {};
        const [profile] = await PlatformProfile.findOrCreate({
            where: { singletonKey: SINGLETON_KEY },
            defaults: { singletonKey: SINGLETON_KEY },
        });

        // Free-text identity/address fields (empty string clears to null).
        const textFields = [
            'legalName', 'tradingName', 'registrationNumber', 'taxRegistrationNumber',
            'email', 'phone', 'website',
            'addressLine1', 'addressLine2', 'city', 'state', 'postalCode',
            'logo', 'defaultTaxSchemeCode',
        ];
        for (const f of textFields) {
            if (b[f] !== undefined) profile[f] = trimOrNull(b[f]);
        }
        // Canonical codes: alpha-2 lowercase, currency alpha-3 uppercase.
        if (b.countryCode !== undefined) {
            profile.countryCode = b.countryCode ? String(b.countryCode).trim().toLowerCase() || null : null;
        }
        if (b.baseCurrencyCode !== undefined) {
            profile.baseCurrencyCode = b.baseCurrencyCode ? String(b.baseCurrencyCode).trim().toUpperCase() || null : null;
        }

        await profile.save();
        res.status(200).json({ message: 'Platform profile saved.', profile: toDto(profile) });
    } catch (error) {
        console.error('Error saving platform profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/platform-profile/quote  Body: { amount, date? }
// Compute the tax on a platform charge using the profile's country + default tax
// scheme. Proves the association is correct (a MY profile always resolves a MY
// scheme) and is the exact seam the future invoice entity will call.
exports.quoteCharge = async (req, res) => {
    try {
        const amount = Number(req.body.amount);
        const onDate = typeof req.body.date === 'string' && req.body.date ? req.body.date : undefined;
        if (!Number.isFinite(amount)) return res.status(400).json({ message: 'A numeric amount is required.' });

        const result = await quotePlatformCharge({ amount, onDate });
        if (result.error) return res.status(400).json({ message: result.error });
        res.status(200).json(result.quote);
    } catch (error) {
        console.error('Error quoting platform charge:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/platform-profile/logo  (multipart, field "logo")
// Upload the platform logo image to GCS and return its public URL. Not tied to the
// profile row - the caller stores the returned URL via PUT (same shape as the
// company-logo flow). Guarded to System Admins by the parent router.
exports.uploadLogo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        const fileExtension = req.file.originalname.split('.').pop();
        const gcsFileName = `platform-logo-${Date.now()}.${fileExtension}`;
        const blob = bucket.file(gcsFileName);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        res.status(200).json({ message: 'Logo uploaded.', url: publicUrl });
    } catch (error) {
        console.error('Platform logo upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload logo.' });
    }
};

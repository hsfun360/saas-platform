const Language = require('./language.model');
const { DEFAULT_LANGUAGES } = require('./language-defaults');

// Normalise a language code to the stored shape: trimmed, lowercase.
function normalizeCode(code) {
    return String(code || '').trim().toLowerCase();
}

// POST /api/admin/languages/seed
// Insert the bundled default language set. Idempotent: upserts by code and
// preserves each existing row's isActive flag (only the name is refreshed), so
// re-running only adds new codes.
exports.seedLanguages = async (req, res) => {
    try {
        const records = DEFAULT_LANGUAGES.map((l) => ({
            languageCode: normalizeCode(l.languageCode),
            name: l.name,
        }));

        await Language.bulkCreate(records, {
            updateOnDuplicate: ['name', 'updatedAt'],
        });

        res.status(200).json({ message: 'Default languages loaded.', total: records.length });
    } catch (error) {
        console.error('Error seeding languages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/languages  (System Admin maintenance — every language)
exports.listAllLanguages = async (req, res) => {
    try {
        const languages = await Language.findAll({ order: [['name', 'ASC']] });
        res.status(200).json(languages);
    } catch (error) {
        console.error('Error listing languages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/languages   Body: { languageCode, name }
exports.createLanguage = async (req, res) => {
    try {
        const languageCode = normalizeCode(req.body.languageCode);
        const name = String(req.body.name || '').trim();
        if (!languageCode) return res.status(400).json({ message: 'Language code is required.' });
        if (!name) return res.status(400).json({ message: 'Name is required.' });

        const existing = await Language.findByPk(languageCode);
        if (existing) return res.status(409).json({ message: `Language '${languageCode}' already exists.` });

        const language = await Language.create({ languageCode, name });
        res.status(201).json({ message: 'Language created.', language });
    } catch (error) {
        console.error('Error creating language:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/languages/:languageCode   Body: { name?, isActive? }
exports.updateLanguage = async (req, res) => {
    try {
        const languageCode = normalizeCode(req.params.languageCode);
        const language = await Language.findByPk(languageCode);
        if (!language) return res.status(404).json({ message: 'Language not found.' });

        if (typeof req.body.name === 'string' && req.body.name.trim()) language.name = req.body.name.trim();
        if (typeof req.body.isActive === 'boolean') language.isActive = req.body.isActive;
        await language.save();

        res.status(200).json({ message: 'Language updated.', language });
    } catch (error) {
        console.error('Error updating language:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/languages/:languageCode
exports.deleteLanguage = async (req, res) => {
    try {
        const languageCode = normalizeCode(req.params.languageCode);
        const language = await Language.findByPk(languageCode);
        if (!language) return res.status(404).json({ message: 'Language not found.' });

        await language.destroy();
        res.status(200).json({ message: 'Language deleted.' });
    } catch (error) {
        console.error('Error deleting language:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/languages  (any authenticated user — active languages for pickers)
exports.listActiveLanguages = async (req, res) => {
    try {
        const languages = await Language.findAll({
            where: { isActive: true },
            attributes: ['languageCode', 'name'],
            order: [['name', 'ASC']],
        });
        res.status(200).json(languages);
    } catch (error) {
        console.error('Error listing active languages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

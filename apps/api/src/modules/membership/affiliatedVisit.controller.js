// Affiliated Visits - the Letter-of-Introduction document (Membership
// Management → Affiliated Visits; user decisions 2026-10-15 / 16). The
// service owns every rule; the letter upload lands in the per-env assets
// bucket like every other upload.
const { Storage } = require('@google-cloud/storage');
const visits = require('./affiliatedVisit.service');
const { getUserContext } = require('../../platform/serviceContext');

const storage = new Storage();
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

function send(res, out, okStatus = 200) {
    if (out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}
function handler(name, fn, okStatus = 200) {
    return async (req, res) => {
        try {
            send(res, await fn(req), okStatus);
        } catch (error) {
            console.error(`Error ${name}:`, error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}

exports.meta = handler('loading affiliated-visit meta', (req) => visits.meta(req));
exports.list = handler('listing affiliated visits', (req) => visits.list(req, req.query));
exports.get = handler('loading affiliated visit', (req) => visits.get(req, req.params.id));
exports.create = handler('recording affiliated visit', (req) => visits.create(req, req.body), 201);
exports.update = handler('updating affiliated visit', (req) => visits.update(req, req.params.id, req.body));
exports.preview = handler('previewing affiliated visit confirmation', (req) => visits.preview(req, req.params.id));
exports.confirm = handler('confirming affiliated visit', (req) => visits.confirm(req, req.params.id));
exports.issue = handler('issuing letter of introduction', (req) => visits.issue(req, req.params.id));
exports.decline = handler('declining affiliated visit', (req) => visits.decline(req, req.params.id, req.body));
exports.cancel = handler('cancelling affiliated visit', (req) => visits.cancel(req, req.params.id, req.body));
exports.arrive = handler('receiving affiliated visit', (req) => visits.arrive(req, req.params.id, req.body));
exports.complete = handler('completing affiliated visit', (req) => visits.complete(req, req.params.id));

// POST /affiliated-visits/letter (multipart field "letter") - upload the
// home club's letter; the caller stores the URL via create / update.
exports.uploadLetter = async (req, res) => {
    try {
        const companyId = getUserContext(req).companyId;
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
        const bucket = assetsBucket();
        const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
        const blob = bucket.file(`membership-visit-letter-${companyId}-${Date.now()}.${ext}`);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        res.status(200).json({ message: 'Letter uploaded.', url: `https://storage.googleapis.com/${bucket.name}/${blob.name}` });
    } catch (error) {
        console.error('Affiliated-visit letter upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload the letter.' });
    }
};

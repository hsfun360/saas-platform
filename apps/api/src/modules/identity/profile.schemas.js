// Request schemas for the self-service PROFILE route (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep). The
// inline PUT /profile handler in auth.routes.js reads fullName, phone, bio and
// profilePicture; the avatar normally arrives through the multipart
// /upload-avatar door (which stays bare - multer owns that boundary), so the
// picture key is bounded above the 100kb JSON body limit and the body parser's
// own ceiling stays the real one. Every key the handler reads is listed here -
// an unlisted key would be silently dropped.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();

module.exports = {
    update: {
        body: z.object({
            fullName: str(255),
            phone: str(50),
            bio: str(5000),
            profilePicture: str(200000),
        }),
    },
};

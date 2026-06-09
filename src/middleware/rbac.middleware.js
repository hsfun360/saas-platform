// src/middleware/rbac.middleware.js

// Middleware to strictly protect internal SaaS admin routes
exports.isSystemAdmin = async (req, res, next) => {
    try {
        // Assuming your standard verifyToken middleware attaches the decoded token to req.user
        const userEmail = req.user.email; 

        // Check against the master admin list in your .env file
        const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
        
        if (!adminEmails.includes(userEmail.toLowerCase())) {
            return res.status(403).json({ 
                message: "Access Denied: You do not have Master System Administrator privileges." 
            });
        }

        // If they are on the list, let them pass to the controller!
        next();
    } catch (error) {
        console.error("System Admin Auth Error:", error);
        res.status(500).json({ message: "Internal server error during authorization check." });
    }
};
// My Dashboard favorites - the caller's own starred screens in the ACTIVE
// workspace, served under /api/auth/my/favorites (any authenticated workspace
// user; strictly self-service, always scoped by the JWT's userId + companyId).

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const UserFavorite = require('./userFavorite.model');
const Menu = require('./menu.model');

// GET /api/auth/my/favorites -> { menuIds: [...] } in the user's order.
exports.listMyFavorites = async (req, res) => {
    try {
        const userId = req.user?.id;
        const companyId = req.user?.companyId;
        if (!userId || !companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await UserFavorite.findAll({
            where: { userId, companyId },
            order: [['sequence', 'ASC']],
            attributes: ['menuId'],
        });
        res.status(200).json({ menuIds: rows.map((r) => r.menuId) });
    } catch (error) {
        console.error('Error loading favorites:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/auth/my/favorites  body { menuIds: [...] } - replace the whole
// ordered list (star toggle and reorder both go through here). Unknown menu
// ids are dropped server-side, duplicates collapse to the first occurrence.
exports.replaceMyFavorites = async (req, res) => {
    try {
        const userId = req.user?.id;
        const companyId = req.user?.companyId;
        if (!userId || !companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const raw = Array.isArray(req.body?.menuIds) ? req.body.menuIds : null;
        if (!raw) return res.status(400).json({ message: 'menuIds must be an array.' });
        const unique = [...new Set(raw.filter((id) => typeof id === 'string' && id))].slice(0, 100);

        // Keep only ids that are real menus (a stale/foreign id just drops out).
        const menus = unique.length
            ? await Menu.findAll({ where: { id: { [Op.in]: unique } }, attributes: ['id'] })
            : [];
        const valid = new Set(menus.map((m) => m.id));
        const menuIds = unique.filter((id) => valid.has(id));

        await sequelize.transaction(async (t) => {
            await UserFavorite.destroy({ where: { userId, companyId }, transaction: t });
            if (menuIds.length) {
                await UserFavorite.bulkCreate(
                    menuIds.map((menuId, i) => ({ userId, companyId, menuId, sequence: i })),
                    { transaction: t },
                );
            }
        });

        res.status(200).json({ message: 'Favorites saved.', menuIds });
    } catch (error) {
        console.error('Error saving favorites:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

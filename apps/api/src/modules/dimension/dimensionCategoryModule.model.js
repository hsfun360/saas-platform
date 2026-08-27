const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { DIMENSION_SCHEMA } = require('../../platform/schemas');

// DimensionCategoryModule - which consuming modules a dimension applies to
// (user decision 2026-08-27). The catalog and the dimension NUMBER stay
// company-global, because that is what makes analysis<N>Id joinable across
// modules; what varies per module is only whether a picker appears on that
// module's entry screens and whether it is mandatory there. So a company can
// run 'Department' on AR + POS + Golf while 'Company vehicle' stays an
// expenditure-only dimension nobody's AR clerk ever sees.
//
// PRESENCE = APPLICABLE (opt-in): no row means the module never offers the
// dimension. `isRequired` moved down here from DimensionCategory the same day,
// so "is Department mandatory?" has exactly one answer per module.
//
// Unticking a module that already has stamped documents is ALLOWED and needs
// no lock - unlike a dimensionNo change (which reinterprets existing data), it
// only stops NEW entry; existing documents keep their option ids and every
// report still resolves.
const DimensionCategoryModule = sequelize.define('DimensionCategoryModule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Parent category. Intra-service FK (same schema), like DimensionOption.
    categoryId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: { tableName: 'DimensionCategory', schema: DIMENSION_SCHEMA },
            key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
    },
    // The Control-Plane Module id (audience 'tenant'). Plain UUID, NO FK: saas
    // is a peer service, same treatment companyId already gets. Resolved from
    // the module NAME through platform/serviceContext's memoized catalog, so
    // consumers keep calling the gateway with the readable name they already
    // pass to requireModule().
    moduleId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Manual document entry in THIS module must carry a value (system
    // producers are exempt - a fee run has no clerk to ask).
    isRequired: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: DIMENSION_SCHEMA,
    tableName: 'DimensionCategoryModule',
    timestamps: true,
    indexes: [
        { name: 'IDX_DimensionCategoryModule_Category_Module', fields: ['categoryId', 'moduleId'], unique: true },
        { name: 'IDX_DimensionCategoryModule_Company_Module', fields: ['companyId', 'moduleId'] },
    ],
});

module.exports = DimensionCategoryModule;

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RegistrationLead = sequelize.define('RegistrationLead', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    company: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false, // E.g., the Full Name of the person registering
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            isEmail: true, // Ensures we don't save garbage data
        }
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    country: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    timezone: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    source: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Organic', // E.g., Organic, Google Ads, LinkedIn
    },
    occurredOn: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW, // Automatically stamps the exact time they clicked submit
    },
    processedDate: {
        type: DataTypes.DATE,
        allowNull: true, // This stays NULL until they actually verify their email in Step 4
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'PENDING', 
        validate: {
            isIn: [['PENDING', 'PROCESSED', 'EXPIRED']] // Strict statuses
        }
    }
}, {
    tableName: 'RegistrationLead',
    timestamps: true, // Automatically gives you createdAt and updatedAt

    // --- CRITICAL INDEX CONFIGURATION ---
    indexes: [
        {
            name: 'IDX_RegistrationLead_Pending',
            fields: ['occurredOn'],
            // Partial/Filtered Index: Only indexes RegistrationLead that haven't been processed.
            // This makes the worker polling query extremely efficient.
            where: {
                processedDate: null
            }
        }
    ]
});

module.exports = RegistrationLead;
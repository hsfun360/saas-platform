// src/config/db.js

const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Sequelize with connection details from .env
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false, // Set to true to see SQL queries in the console
    dialectOptions: {
        // Required for deployment platforms like Cloud Run/Render/Heroku that use SSL
        // --- TEMPORARILY REMOVE OR COMMENT OUT THIS SECTION FOR LOCAL TESTING ---
        /*
        ssl: {
            require: true,
            rejectUnauthorized: false // Use with caution; may be required by some hosting providers
        }
        */
       // --- TEMPORARILY REMOVE OR COMMENT OUT THIS SECTION FOR LOCAL TESTING ---
    }
});

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('PostgreSQL connection established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        // Exit process with failure
        //process.exit(1); 
    }
};

module.exports = { sequelize, connectDB };
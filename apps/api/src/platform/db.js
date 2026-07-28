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
        // TCP keepalive on every pooled connection - the external Postgres was
        // observed dropping idle/long-lived connections mid-work (ECONNRESET
        // during the boot schema sync, 2026-07-16). Probes start after 10s idle.
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        // TLS to Postgres, controlled by DB_SSL so it is a CONFIG flip, not a
        // code change, once the server enables SSL (as of 2026-07-28 the
        // external server has ssl=off, so this defaults to plaintext):
        //   DB_SSL=require -> encrypted transit, server cert NOT verified
        //                     (self-signed friendly; stops passive sniffing)
        //   DB_SSL=verify  -> encrypted + cert chain verified (needs a CA the
        //                     Node runtime trusts)
        //   unset/off      -> no TLS (current server capability)
        ...(process.env.DB_SSL === 'require'
            ? { ssl: { require: true, rejectUnauthorized: false } }
            : process.env.DB_SSL === 'verify'
                ? { ssl: { require: true, rejectUnauthorized: true } }
                : {}),
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
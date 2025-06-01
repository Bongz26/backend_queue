require('dotenv').config();
const { Pool } = require("pg");

// ✅ Configuring PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // ✅ Secure connection via Render env variables
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
});

// ✅ Test Database Connection on Startup
pool.connect()
    .then(() => console.log("✅ Connected to PostgreSQL successfully!"))
    .catch((err) => {
        console.error("❌ Database Connection Error:", err);
        process.exit(1);
    });

module.exports = pool; // ✅ Export pool correctly for use in `server.js`
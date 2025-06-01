require('dotenv').config();
const { Pool } = require("pg");


const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // ✅ Secure connection via Render env variables
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log("✅ Connected to PostgreSQL successfully!"))
    .catch((err) => {
        console.error("❌ Database Connection Error:", err);
        process.exit(1);
    });

module.exports = pool;

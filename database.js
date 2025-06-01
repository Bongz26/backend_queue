require('dotenv').config();
const { Pool } = require("pg");

// ✅ Choose between local manual DB settings & Render DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || null,  // ✅ Use Render's URL if available
    user: process.env.DATABASE_URL ? null : process.env.DB_USER,
    host: process.env.DATABASE_URL ? null : process.env.DB_HOST,
    database: process.env.DATABASE_URL ? null : process.env.DB_NAME,
    password: process.env.DATABASE_URL ? null : String(process.env.DB_PASSWORD), // ✅ Ensures password is handled as a string
    port: process.env.DATABASE_URL ? null : process.env.DB_PORT,
    ssl: process.env.DATABASE_URL 
        ? { rejectUnauthorized: false }
        : (process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false)
});

//Log Database Connection

console.log("🔍 Attempting DB Connection...");
console.log("🔍 DATABASE_URL:", process.env.DATABASE_URL);
console.log("🔍 DB_USER:", process.env.DB_USER);
console.log("🔍 DB_HOST:", process.env.DB_HOST);
console.log("🔍 DB_NAME:", process.env.DB_NAME);
console.log("🔍 DB_PORT:", process.env.DB_PORT);
console.log("🔍 DB_SSL:", process.env.DB_SSL);

// ✅ Test Database Connection on Startup
pool.connect()
    .then(() => console.log("✅ Connected to PostgreSQL successfully!"))
    .catch((err) => {
        console.error("❌ Database Connection Error:", err);
        process.exit(1);
    });

module.exports = pool; // ✅ Export pool correctly for use in `server.js`
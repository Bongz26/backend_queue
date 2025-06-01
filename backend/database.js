/*const { Pool } = require("pg"); // ✅ Correct import

const pool = new Pool({
    user: process.env.DB_USER || "paint_queue_db_user",
    password: process.env.DB_PASS || "YwuR7x1f9qrn1ms47ORf76HmkAjC58Dt",
    host: process.env.DB_HOST || "dpg-d0t6m8e3jp1c73e97v50-a.oregon-postgres.render.com",
    database: process.env.DB_NAME || "paint_queue_db",
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log("✅ Connected to PostgreSQL successfully!"))
    .catch((err) => {
        console.error("❌ Database Connection Error:", err);
        process.exit(1);
    });

module.exports = pool; // ✅ Export pool correctly*/

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // ✅ Secure connection via Render env variables
    ssl: { rejectUnauthorized: false }
});
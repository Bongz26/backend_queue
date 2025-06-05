const express = require("express");
const cors = require("cors");
const pool = require("./database"); // PostgreSQL Pool

const app = express();
app.use(express.json()); // Enable JSON parsing

// ✅ CORS Configuration
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ Fetch All Orders
app.get("/api/orders", async (req, res) => {
    try {
        console.log("🛠 Fetching latest orders...");
        const result = await pool.query("SELECT * FROM Order2 ORDER BY start_time DESC LIMIT 10");

        if (!result.rows.length) {
            return res.status(404).json({ message: "No orders found" });
        }

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ Add a New Order (Fixed Timestamp Issue)
app.post("/api/orders", async (req, res) => {
    try {
        await pool.query("BEGIN");

        const { transaction_id, client_name, client_contact, paint_type, color_code, category, priority, start_time, estimated_completion, current_status } = req.body;

        // ✅ Validate Required Fields
        if (!transaction_id || !client_name || !client_contact || !paint_type || !category || !priority) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // ✅ Ensure Estimated Completion is a Timestamp
        const formattedETC = new Date(start_time);
        formattedETC.setMinutes(formattedETC.getMinutes() + 40); // Adjust mixing time

        const values = [
            transaction_id,
            client_name,
            client_contact,
            paint_type,
            color_code || "Pending",
            category,
            priority || "Standard",
            start_time || new Date().toISOString(),
            formattedETC.toISOString(), // ✅ Fixed timestamp format
            current_status || "Pending"
        ];

        const query = `
            INSERT INTO Order2 (
                transaction_id, client_name, client_contact,
                paint_type, color_code, category, priority,
                start_time, estimated_completion, current_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`;

        const newOrder = await pool.query(query, values);
        await pool.query("COMMIT");

        console.log("✅ Inserted Order:", newOrder.rows[0]); // ✅ Debug Log

        res.status(201).json(newOrder.rows[0]); // ✅ Return inserted order

    } catch (err) {
        await pool.query("ROLLBACK");
        console.error("🚨 Order Insertion Failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Health Check Endpoint
app.get("/health", (req, res) => {
    res.send("🚀 Backend is alive mchana!!");
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

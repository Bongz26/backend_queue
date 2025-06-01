require('dotenv').config();
const { Pool } = require("pg");

// ✅ Using PostgreSQL

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: process.env.DB_SSL === "true" }
});


const express = require('express');
const cors = require('cors');


const app = express();
app.use(cors());
app.use(express.json());

 
app.use(cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ Fetch Orders
app.get("/orders", async (req, res) => {
    try {
        console.log("🛠 Attempting to query the latest orders...");
        await pool.query("DISCARD ALL"); // ✅ Clears connection cache before querying

        const result = await pool.query("SELECT * FROM Orders2 ORDER BY start_time DESC LIMIT 10");

        if (!result || !result.rows || result.rows.length === 0) {
            console.warn("⚠️ No orders found in the database.");
            return res.status(404).json({ message: "No orders found" });
        }

        console.log("✅ Latest Orders fetched successfully:", result.rows);
        res.json(result.rows);
    } catch (err) {
        console.error("🚨 Error fetching orders:", err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Check for Duplicate Orders
app.get("/check-duplicate", async (req, res) => {
    try {
        const { customer_name, client_contact, paint_type, category } = req.query;
        
        const result = await pool.query(
            "SELECT COUNT(*) AS count FROM Orders2 WHERE customer_name = $1 AND client_contact = $2 AND paint_type = $3 AND category = $4", 
            [customer_name, client_contact, paint_type, category]
        );

        res.json({ exists: result.rows[0].count > 0 });
    } catch (error) {
        console.error("🚨 Error checking duplicate orders:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Fetch Order Status
app.get("/order-status/:trackID", async (req, res) => {
    try {
        console.log(`Checking order status for TrackID: ${req.params.trackID}`);
        
        const result = await pool.query(
            "SELECT current_status, estimated_completion FROM Orders2 WHERE transaction_id = $1", 
            [req.params.trackID]
        );

        if (result.rows.length === 0) {
            console.warn("No order found for TrackID:", req.params.trackID);
            return res.status(404).json({ message: "Order not found" });
        }

        res.json({
            status: result.rows[0].current_status,
            estimatedCompletion: result.rows[0].estimated_completion
        });
    } catch (err) {
        console.error("Error checking order status:", err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Fetch Active Orders Count
app.get("/active-orders-count", async (req, res) => {
    try {
        console.log("🔍 Fetching active orders count...");
        const result = await pool.query("SELECT COUNT(*) AS activeOrders FROM Orders2 WHERE current_status IN ('Waiting', 'Mixing')");
        
        res.json({ activeOrders: result.rows[0].activeorders });
    } catch (err) {
        console.error("🚨 Error fetching active orders count:", err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Test Database Connection
app.get("/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM Orders2 LIMIT 1");
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ Update Order Status
app.put("/orders/:id", async (req, res) => {
    try {
        const { current_status } = req.body;  
        const { id } = req.params;

        console.log("🔍 Updating order status:", id, current_status);

        await pool.query(
            "UPDATE Orders2 SET current_status = $1 WHERE id = $2",
            [current_status, id]
        );

        res.json({ message: "✅ Order status updated successfully!" });
    } catch (error) {
        console.error("🚨 Error updating order status:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Add New Order
app.post("/orders", async (req, res) => {
    try {
        await pool.query("BEGIN"); // ✅ Start transaction
        console.log("Received new order:", req.body);

        const query = `
            INSERT INTO Orders2 (transaction_id, customer_name, client_contact, paint_type, colour_code, category, priority, start_time, current_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;

        const values = [
            req.body.transaction_id,
            req.body.customer_name,
            req.body.client_contact,
            req.body.paint_type,
            req.body.colour_code || "Pending",
            req.body.category,
            "Standard",
            new Date(),
            req.body.current_status || "Pending"
        ];

        const newOrder = await pool.query(query, values);
        await pool.query("COMMIT"); // ✅ Ensure changes are saved

        res.json(newOrder.rows[0]);
    } catch (err) {
        await pool.query("ROLLBACK"); // ✅ Roll back transaction if error occurs
        console.error("🚨 Backend Error Inserting Order:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(5000, () => {
    console.log("🚀 Server running on port 5000");
});
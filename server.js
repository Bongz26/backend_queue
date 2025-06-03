const express = require('express');
const cors = require('cors');
const pool = require('./database'); // ✅ use existing pool✅ Using PostgreSQL


const app = express();
app.use(express.json());

 
app.use(cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json");
    next();
});

// ✅ Fetch Orders
app.get("/api/orders", async (req, res) => {
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
app.get("/api/check-duplicate", async (req, res) => {
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
app.get("/api/order-status/:trackID", async (req, res) => {
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
app.get("/api/active-orders-count", async (req, res) => {
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
app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM Orders2 LIMIT 1");
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ Update Order Status
app.put("/api/orders/:id", async (req, res) => {
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
app.post("/api/orders", async (req, res) => {
    try {
        await pool.query("BEGIN"); // ✅ Start transaction

        console.log("📥 Received new order:", req.body); // Log raw body

        // ✅ Extract estimated_completion properly before using it
        const estimatedCompletionFormatted = req.body.estimated_completion.replace("T", " ").split(".")[0];

        // ✅ 1. Validate required fields immediately
        const { transaction_id, customer_name, client_contact, paint_type, colour_code, category } = req.body;

        if (!transaction_id || !customer_name || !client_contact || !paint_type || !category) {
            console.warn("🚨 Missing required fields in request body");
            return res.status(400).json({ error: "Missing required fields" });
        }

        // ✅ 2. Prepare values safely
        const values = [
            transaction_id,
            customer_name,
            client_contact,
            paint_type,
            colour_code || "Pending",
            category,
            "Standard",
            new Date().toLocaleString("en-GB", { timeZone: "Africa/Johannesburg", hour12: false }), // ✅ Adjusted to UTC+2
    estimatedCompletionFormatted, // ✅ Now storing correctly formatted ETC
    req.body.current_status || "Pending"


        ];

        console.log("✅ Processed Values:", values); // ✅ AFTER defining `values`

        const query = `
            INSERT INTO Orders2 (
                transaction_id, customer_name, client_contact, 
                paint_type, colour_code, category, priority, 
                start_time, estimated_completion, current_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`;

        const newOrder = await pool.query(query, values);
        await pool.query("COMMIT");

        const insertedOrder = newOrder.rows[0];

        console.log("✅ Inserted order:", insertedOrder);
        res.status(201).json({
            transaction_id: insertedOrder.transaction_id,
            customer_name: insertedOrder.customer_name,
            client_contact: insertedOrder.client_contact,
            paint_type: insertedOrder.paint_type,
            estimated_completion: insertedOrder.estimated_completion
        });

    } catch (err) {
        await pool.query("ROLLBACK");
        console.error("🚨 Backend Error Inserting Order:", err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
});

app.get("/", (req, res) => {
  res.send("🚀 Backend is alive! 🫠 ");
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
          console.log(`🚀 Server running on port ${PORT}`));

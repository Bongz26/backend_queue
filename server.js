const express = require("express");
const cors = require("cors");
const pool = require("./database"); // ✅ PostgreSQL connection

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

// ✅ Fetch Orders (Including "Mixing" and "Spraying" Orders)
app.get("/api/orders", async (req, res) => {
    try {
        console.log("🛠 Fetching latest orders...");
        await pool.query("DISCARD ALL");

        const result = await pool.query(`
            SELECT transaction_id, customer_name, client_contact, assigned_employee, 
                   current_status, colour_code, paint_type, start_time, paint_quantity, order_type, category
            FROM Orders2 
            WHERE current_status NOT IN ('Ready') 
            ORDER BY current_status DESC 
            LIMIT 20
        `);

        console.log("✅ Orders fetched successfully");
        res.json(result.rows);
    } catch (err) {
        console.error("🚨 Error fetching orders:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/orders/active", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM Orders2 WHERE current_status IN ('Mixing', 'Waiting', 'Pending')"
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error("🚨 Error fetching active orders:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Add New Order
app.post("/api/orders", async (req, res) => {
    try {
        const { transaction_id, customer_name, client_contact, paint_type, colour_code, category, paint_quantity, current_status, order_type } = req.body;
        const start_time = new Date().toISOString(); // ✅ Store accurate time

        console.log("🛠 Adding new order:", req.body);

        await pool.query(
            "INSERT INTO Orders2 (transaction_id, customer_name, client_contact, paint_type, colour_code, category, paint_quantity, current_status, order_type, start_time) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            [transaction_id, customer_name, client_contact, paint_type, colour_code, category, paint_quantity, current_status, order_type, start_time]
        );

        console.log("✅ Order added successfully!");
        res.json({ message: "✅ Order added successfully!" });
    } catch (error) {
        console.error("🚨 Error adding order:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Update Order Status (Supports "Mixing" & "Spraying")
app.put("/api/orders/:id", async (req, res) => {
    try {
        const { current_status, assigned_employee, colour_code } = req.body;
        const { id } = req.params;

        console.log("🛠 Updating order:", { id, current_status, assigned_employee, colour_code });

        await pool.query(
            "UPDATE Orders2 SET current_status = $1, assigned_employee = $2, colour_code = $3 WHERE transaction_id = $4",
            [current_status, assigned_employee, colour_code || "Pending", id]
        );

        console.log(`✅ Order updated successfully: ${id} → ${current_status}`);
        res.json({ message: "✅ Order status updated!" });
    } catch (error) {
        console.error("🚨 Error updating order:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Verify Employee Code
app.get("/api/employees", async (req, res) => {
    try {
        const { code } = req.query;
        console.log("🔍 Searching for Employee Code:", code);

        const result = await pool.query("SELECT employee_name FROM employees WHERE TRIM(employee_code) = TRIM($1)", [code]);

        if (result.rows.length === 0) {
            console.warn("❌ Invalid Employee Code!");
            return res.status(404).json({ error: "Invalid Employee Code" });
        }

        console.log("✅ Employee found:", result.rows[0].employee_name);
        res.json({ employee_name: result.rows[0].employee_name });
    } catch (error) {
        console.error("🚨 Error fetching employee:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/orders/admin", async (req, res) => {
    try {
        console.log("🛠 Fetching Ready orders for Admin...");
        const result = await pool.query(`
            SELECT transaction_id, customer_name, client_contact, assigned_employee, 
                   current_status, colour_code, paint_type, start_time, paint_quantity, order_type, category
            FROM Orders2 
            WHERE current_status = 'Ready' 
            ORDER BY start_time DESC
        `);
        
        console.log("✅ Ready orders fetched successfully");
        res.json(result.rows);
    } catch (error) {
        console.error("🚨 Error fetching Ready orders:", error);
        res.status(500).json({ error: error.message });
    }
});


app.get("/", (req, res) => {
    res.send("🚀 Backend is alive!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

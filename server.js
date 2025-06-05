const express = require("express");
const cors = require("cors");
const pool = require("./database"); // ✅ Using PostgreSQL

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

// ✅ Fetch Orders with assigned employees included
app.get("/api/orders", async (req, res) => {
    try {
        console.log("🛠 Fetching latest orders...");
        await pool.query("DISCARD ALL"); // ✅ Clears connection cache before querying

        const result = await pool.query(`
            SELECT transaction_id, customer_name, assigned_employee, current_status, colour_code
            FROM Orders2 
            WHERE current_status != 'Ready' 
            ORDER BY current_status DESC 
            LIMIT 10
        `);

        console.log("✅ Orders fetched successfully:", result.rows);
        res.json(result.rows);
    } catch (err) {
        console.error("🚨 Error fetching orders:", err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Update Order Status, ensuring assigned_employee is updated
app.put("/api/orders/:id", async (req, res) => {
    try {
        const { current_status, assigned_employee, colour_code } = req.body;
        const { id } = req.params;

        console.log("🛠 Incoming update request:", { current_status, assigned_employee, colour_code });

        await pool.query(
            "UPDATE Orders2 SET current_status = $1, assigned_employee = $2, colour_code = $3 WHERE transaction_id = $4",
            [current_status, assigned_employee || null, colour_code || "Pending", id]
        );

        console.log("✅ Order updated successfully in DB!");
        res.json({ message: "✅ Order status updated successfully!" });
    } catch (error) {
        console.error("🚨 Error updating order status:", error);
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

app.get("/", (req, res) => {
    res.send("🚀 Backend is alive!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

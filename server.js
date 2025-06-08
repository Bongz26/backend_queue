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
        await pool.query("DISCARD ALL");

        const result = await pool.query(`
            SELECT transaction_id, customer_name, client_contact, assigned_employee, 
                   current_status, colour_code, paint_type, start_time, paint_quantity, order_type, category
            FROM Orders2 
            WHERE current_status NOT IN ('Ready')
            ORDER BY current_status DESC 
            LIMIT 20
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("🚨 Error fetching orders:", err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Verify Employee Code Before Assigning
app.get("/api/employees", async (req, res) => {
    try {
        const { code } = req.query;
        console.log("🔍 Searching for Employee Code:", code);

        const result = await pool.query("SELECT employee_name FROM employees WHERE TRIM(employee_code) = TRIM($1)", [code]);

        if (result.rows.length === 0) {
            console.warn("❌ Invalid Employee Code!");
            return res.status(404).json({ error: "Invalid Employee Code" });
        }

        res.json({ employee_name: result.rows[0].employee_name });
    } catch (error) {
        console.error("🚨 Error fetching employee:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Update Order Status (Admin-controlled "Complete" status)
app.put("/api/orders/:id", async (req, res) => {
    try {
        const { current_status, assigned_employee, userRole, adminId } = req.body;
        const { id } = req.params;

        // Prevent non-admins from setting "Complete"
        if (current_status === "Complete" && userRole !== "Admin") {
            return res.status(403).json({ error: "Only Admins can confirm completion" });
        }

        console.log("🛠 Updating order:", { id, current_status, assigned_employee });

        await pool.query(
            "UPDATE Orders2 SET current_status = $1, assigned_employee = $2 WHERE transaction_id = $3",
            [current_status, assigned_employee, id]
        );

        console.log(`✅ Order updated: ${id} → ${current_status}`);

        // ✅ Log admin confirmation when setting "Complete"
        if (current_status === "Complete" && adminId) {
            await pool.query(`
                INSERT INTO AdminLogs (admin_id, order_id, action)
                VALUES ($1, $2, 'Order Completed')
            `, [adminId, id]);
        }

        res.json({ message: "✅ Order status updated!" });
    } catch (error) {
        console.error("🚨 Error updating order:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Backend status check
app.get("/", (req, res) => {
    res.send("🚀 Backend is alive!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

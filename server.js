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

// ✅ Fetch Orders including assigned employees
app.get("/api/orders", async (req, res) => {
    try {
        console.log("🛠 Fetching latest orders...");
        await pool.query("DISCARD ALL"); // ✅ Clears connection cache before querying

        const result = await pool.query(`
            SELECT transaction_id, customer_name, client_contact, assigned_employee, 
                   current_status, colour_code, paint_type, start_time
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

// ✅ Fetch Active Orders Count
app.get("/api/active-orders-count", async (req, res) => {
    try {
        console.log("🔍 Fetching active orders count...");
        const result = await pool.query("SELECT COUNT(*) AS activeOrders FROM Orders2 WHERE current_status NOT IN ('Ready')");

        res.json({ activeOrders: result.rows[0].activeorders });
    } catch (err) {
        console.error("🚨 Error fetching active orders count:", err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Update Order Status, ensuring assigned_employee is updated
app.put("/api/orders/:id", async (req, res) => {
    try {
        const { current_status, assigned_employee, colour_code } = req.body;
        const { id } = req.params;

        console.log("🛠 Incoming update request:", { id, current_status, assigned_employee, colour_code });

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

// ✅ Add Colour Code when status is "Ready"
app.put("/api/orders/update-colour/:id", async (req, res) => {
    try {
        const { new_colour_code } = req.body;
        const { id } = req.params;

        console.log("🎨 Updating Colour Code for Order:", id, "New Colour Code:", new_colour_code);

        if (!new_colour_code) {
            return res.status(400).json({ error: "❌ Colour Code is required!" });
        }

        await pool.query(
            "UPDATE Orders2 SET colour_code = $1 WHERE transaction_id = $2",
            [new_colour_code, id]
        );

        console.log("✅ Colour Code updated successfully!");
        res.json({ message: "✅ Colour Code updated successfully!" });
    } catch (error) {
        console.error("🚨 Error updating colour code:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/", (req, res) => {
    res.send("🚀 Backend is alive after it froze :( !");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

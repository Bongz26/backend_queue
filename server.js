const express = require("express");
const cors = require("cors");
const pool = require("./database"); // PostgreSQL connection

const app = express();

app.use(express.json());

const allowedOrigins = [
  "https://queue-system-ewrn.onrender.com",
  "https://fronttest-eibo.onrender.com",
  "https://proctest.netlify.app",
  "http://localhost:3000" // Added for local testing
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json");
  next();
});

// Search Orders
app.get("/api/orders/search", async (req, res) => {
  const { q } = req.query;
  try {
    console.log("🔍 Searching orders with query:", q);
    const result = await pool.query(`
      SELECT *
      FROM orders2
      ORDER BY 1 DESC
    `);
    console.log("✅ Search returned:", result.rows.length, "orders");
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Search failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Check Transaction ID
app.get("/api/orders/check-id/:id", async (req, res) => {
  const { id } = req.params;
  try {
    console.log("🔍 Checking transaction ID:", id);
    const result = await pool.query("SELECT 1 FROM orders2 WHERE transaction_id = $1", [id]);
    if (result.rowCount > 0) {
      console.log("⚠️ Transaction ID exists");
      return res.status(409).json({ exists: true });
    } else {
      console.log("✅ Transaction ID available");
      return res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error("❌ Error checking transaction ID:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Fetch Active Orders
app.get("/api/orders", async (req, res) => {
  try {
    console.log("🛠 Fetching latest orders...");
    await pool.query("DISCARD ALL");
    const result = await pool.query(`
      SELECT o.transaction_id, o.customer_name, o.client_contact, o.assigned_employee,
             o.current_status, o.colour_code, o.paint_type, o.start_time,
             o.paint_quantity, o.order_type, o.category, o.note,
             h.entered_at AS status_started_at
      FROM orders2 o
      LEFT JOIN LATERAL (
        SELECT entered_at
        FROM order_status_history
        WHERE transaction_id = o.transaction_id AND status = o.current_status
        ORDER BY entered_at DESC
        LIMIT 1
      ) h ON true
      WHERE o.current_status NOT IN ('Ready', 'Complete')
      AND o.archived = FALSE
      AND o.deleted = FALSE
      ORDER BY o.current_status DESC
      LIMIT 20
    `);
    console.log("✅ Active orders fetched:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching orders:", err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch Active Orders (Original /api/orders/active)
app.get("/api/orders/active", async (req, res) => {
  try {
    console.log("🛠 Fetching active orders (Mixing, Waiting, Pending)...");
    const result = await pool.query(
      "SELECT * FROM orders2 WHERE current_status IN ('Mixing', 'Waiting', 'Pending')"
    );
    console.log("✅ Active orders fetched:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("🚨 Error fetching active orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch Archived Orders
app.get("/api/orders/archived", async (req, res) => {
  try {
    console.log("🛠 Fetching archived orders...");
    const result = await pool.query(`
      SELECT transaction_id, customer_name, client_contact, assigned_employee,
             current_status, colour_code, paint_type, start_time,
             paint_quantity, order_type, category, note
      FROM orders2
      WHERE archived = TRUE
      ORDER BY start_time DESC
    `);
    console.log("✅ Archived orders fetched:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching archived orders:", err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch Deleted Orders
app.get("/api/orders/deleted", async (req, res) => {
  try {
    console.log("🛠 Fetching deleted orders...");
    const result = await pool.query(`
      SELECT transaction_id, customer_name, client_contact, assigned_employee,
             current_status, colour_code, paint_type, start_time,
             paint_quantity, order_type, category, note
      FROM deleted_orders
      ORDER BY start_time DESC
    `);
    console.log("✅ Deleted orders fetched:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching deleted orders:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add New Order
app.post("/api/orders", async (req, res) => {
  try {
    let {
      transaction_id,
      customer_name,
      client_contact,
      paint_type,
      colour_code,
      category,
      paint_quantity,
      current_status,
      order_type,
      note
    } = req.body;

    if (category === "New Mix") {
      colour_code = "Pending";
    }
    if (!colour_code || colour_code.trim() === "") {
      colour_code = "N/A";
    }

    const start_time = new Date().toISOString();
    console.log("🛠 Adding new order:", req.body);

    await pool.query(
      `INSERT INTO orders2 (
        transaction_id, customer_name, client_contact, paint_type, 
        colour_code, category, paint_quantity, current_status, 
        order_type, start_time, note, archived, deleted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, FALSE)`,
      [
        transaction_id, customer_name, client_contact, paint_type,
        colour_code, category, paint_quantity, current_status,
        order_type, start_time, note || null
      ]
    );

    console.log("✅ Order added successfully!");
    res.json({ message: "✅ Order added successfully!" });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: "❌ Duplicate Transaction ID! Please use a unique ID." });
    }
    console.error("🚨 Error adding order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update Order Status
app.put("/api/orders/:id", async (req, res) => {
  try {
    let { current_status, assigned_employee, colour_code, note } = req.body;
    const { id } = req.params;

    const validStatuses = ["Waiting", "Mixing", "Spraying", "Re-Mixing", "Ready", "Complete"];
    if (!validStatuses.includes(current_status)) {
      return res.status(400).json({ error: "❌ Invalid status update!" });
    }

    if (current_status === "Ready" && (!colour_code || colour_code.trim() === "")) {
      return res.status(400).json({ error: "❌ Colour Code is required to mark order as Ready!" });
    }

    if (current_status !== "Waiting" && (!assigned_employee || assigned_employee.trim() === "")) {
      return res.status(400).json({ error: "❌ Employee must be assigned when updating order status!" });
    }

    console.log("🛠 Updating order:", { id, current_status, assigned_employee, colour_code, note });

    await pool.query(
      `UPDATE orders2
       SET current_status = $1, colour_code = $2, assigned_employee = $3, note = $4
       WHERE transaction_id = $5`,
      [current_status, colour_code || "Pending", assigned_employee, note || null, id]
    );

    await pool.query(
      `INSERT INTO order_status_history (transaction_id, status)
       VALUES ($1, $2)`,
      [id, current_status]
    );

    const orderId = id;
    const oldStatus = req.body.old_status || "Unknown";
    const newStatus = current_status;
    const employeeName = assigned_employee;
    const userRole = req.body.userRole || "Unknown";

    await pool.query(
      `INSERT INTO audit_logs
       (order_id, action, from_status, to_status, employee_name, user_role, colour_code, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        orderId,
        "Status Changed",
        oldStatus,
        newStatus,
        employeeName,
        userRole,
        colour_code || null,
        note ? `Status updated with note: ${note}` : "Status updated via UI"
      ]
    );

    console.log(`✅ Order updated successfully: ${id} → ${current_status}`);
    res.json({ message: `✅ Order status updated to ${current_status}` });
  } catch (error) {
    console.error("🚨 Error updating order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete Order
app.delete("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  try {
    console.log(`🛠 Deleting order: ${id}`);

    await pool.query(
      `INSERT INTO deleted_orders (
        transaction_id, customer_name, client_contact, assigned_employee,
        current_status, colour_code, paint_type, start_time,
        paint_quantity, order_type, category, note
      )
      SELECT transaction_id, customer_name, client_contact, assigned_employee,
             current_status, colour_code, paint_type, start_time,
             paint_quantity, order_type, category, note
      FROM orders2
      WHERE transaction_id = $1`,
      [id]
    );

    await pool.query(`DELETE FROM orders2 WHERE transaction_id = $1`, [id]);

    await pool.query(
      `INSERT INTO audit_logs
       (order_id, action, from_status, to_status, employee_name, user_role, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, "Order Deleted", "N/A", "Deleted", null, req.body.userRole || "Unknown", "Order deleted by admin"]
    );

    console.log(`✅ Order ${id} deleted successfully`);
    res.json({ message: "✅ Order deleted successfully" });
  } catch (error) {
    console.error("🚨 Error deleting order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch Staff
app.get("/api/staff", async (req, res) => {
  try {
    console.log("🛠 Fetching staff list from employees table...");
    const result = await pool.query("SELECT employee_name, employee_code AS code, role FROM employees");
    console.log("✅ Staff list fetched:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching staff:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add Staff
app.post("/api/staff", async (req, res) => {
  try {
    const { employee_name, code, role } = req.body;
    if (!employee_name || !code || !role) {
      return res.status(400).json({ error: "❌ Employee name, code, and role are required" });
    }
    console.log("🛠 Adding new staff to employees table:", req.body);
    await pool.query(
      `INSERT INTO employees (employee_name, employee_code, role)
       VALUES ($1, $2, $3)`,
      [employee_name, code, role]
    );
    console.log("✅ Staff added successfully!");
    res.json({ message: "✅ Staff added successfully!" });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: "❌ Duplicate Employee Code! Please use a unique code." });
    }
    console.error("🚨 Error adding staff:", error);
    res.status(500).json({ error: error.message });
  }
});

// Edit Staff
app.put("/api/staff/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const { employee_name, role } = req.body;
    if (!employee_name || !role) {
      return res.status(400).json({ error: "❌ Employee name and role are required" });
    }
    console.log("🛠 Updating staff in employees table:", { code, employee_name, role });
    await pool.query(
      `UPDATE employees
       SET employee_name = $1, role = $2
       WHERE employee_code = $3`,
      [employee_name, role, code]
    );
    console.log("✅ Staff updated successfully");
    res.json({ message: "✅ Staff updated successfully" });
  } catch (error) {
    console.error("🚨 Error updating staff:", error);
    res.status(500).json({ error: error.message });
  }
});

// Remove Staff
app.delete("/api/staff/:code", async (req, res) => {
  try {
    const { code } = req.params;
    console.log(`🛠 Deleting staff from employees table: ${code}`);
    await pool.query(`DELETE FROM employees WHERE employee_code = $1`, [code]);
    console.log("✅ Staff deleted successfully");
    res.json({ message: "✅ Staff deleted successfully" });
  } catch (error) {
    console.error("🚨 Error deleting staff:", error);
    res.status(500).json({ error: error.message });
  }
});

// Verify Employee Code (Original endpoint)
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

// Fetch Ready Orders for Admin
app.get("/api/orders/admin", async (req, res) => {
  try {
    console.log("🛠 Fetching Ready orders for Admin...");
    const result = await pool.query(`
      SELECT transaction_id, customer_name, client_contact, assigned_employee,
             current_status, colour_code, paint_type, start_time, paint_quantity, 
             order_type, category, note
      FROM orders2
      WHERE current_status = 'Ready' AND order_type IN ('Order', 'Paid')
      ORDER BY start_time DESC
    `);
    console.log("✅ Ready orders fetched:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("🚨 Error fetching Ready orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark Order as Paid/Complete
app.put("/api/orders/mark-paid/:id", async (req, res) => {
  try {
    const { userRole } = req.body;
    const { id } = req.params;
    if (userRole !== "Admin") {
      return res.status(403).json({ error: "Only Admins can mark orders as Paid" });
    }
    const check = await pool.query(
      "SELECT order_type, current_status FROM orders2 WHERE transaction_id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = check.rows[0];
    if (order.current_status !== "Ready") {
      return res.status(400).json({ error: "Only 'Ready' orders can be marked as Complete" });
    }
    await pool.query(
      "UPDATE orders2 SET current_status = 'Complete' WHERE transaction_id = $1",
      [id]
    );
    console.log(`✅ Order ${id} marked as Complete`);
    res.json({ message: "✅ Order marked as Complete" });
  } catch (error) {
    console.error("🚨 Error marking as Complete:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Archive Old Waiting Orders
app.put("/api/orders/archive-old", async (req, res) => {
  try {
    console.log("🛠 Archiving old orders...");
    const result = await pool.query(`
      UPDATE orders2
      SET archived = TRUE
      WHERE current_status = 'Waiting'
      AND archived = FALSE
      AND COALESCE(start_time) < NOW() - INTERVAL '21 days'
    `);
    console.log(`✅ ${result.rowCount} orders archived`);
    res.json({ message: `✅ ${result.rowCount} orders archived` });
  } catch (err) {
    console.error("❌ Archiving failed:", err.message);
    res.status(500).json({ error: "Failed to archive old orders" });
  }
});

// Health Check
app.get("/", (req, res) => {
  res.send("🚀 Backend is alive!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

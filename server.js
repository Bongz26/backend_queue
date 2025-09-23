const express = require("express");
const cors = require("cors");
const pool = require("./database"); // PostgreSQL connection

const app = express();

app.use(express.json());

const allowedOrigins = [
  "https://queue-system-ewrn.onrender.com",
  "https://fronttest-eibo.onrender.com",
  "https://proctest.netlify.app",
  "http://localhost:3000"
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

// Fetch all orders
app.get("/api/orders", async (req, res) => {
  try {
    console.log("🛠 Fetching all orders");
    const result = await pool.query("SELECT * FROM orders2 WHERE deleted = FALSE ORDER BY start_time DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Fetch archived orders
app.get("/api/orders/archived", async (req, res) => {
  try {
    console.log("🛠 Fetching archived orders");
    const result = await pool.query("SELECT * FROM orders2 WHERE archived = TRUE AND deleted = FALSE ORDER BY start_time DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching archived orders:", err);
    res.status(500).json({ error: "Failed to fetch archived orders" });
  }
});

// Update order status
app.put("/api/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status, employeeCode, colourCode, employeeName, userRole, remarks } = req.body;
  console.log("🛠 Updating order status:", { id, status, employeeCode, colourCode, employeeName, userRole, remarks });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const updateOrder = await client.query(
        "UPDATE orders2 SET current_status = $1, assigned_employee = $2, assigned_employee_code = $3, colour_code = $4 WHERE id = $5 RETURNING *",
        [status, employeeName, employeeCode, colourCode, id]
      );

      if (updateOrder.rows.length === 0) {
        throw new Error("Order not found");
      }

      await client.query(
        "INSERT INTO audit_logs (order_id, action, from_status, to_status, employee_name, user_role, colour_code, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [updateOrder.rows[0].transaction_id, "Status Changed", updateOrder.rows[0].current_status, status, employeeName, userRole, colourCode, remarks]
      );

      await client.query("COMMIT");
      console.log("✅ Order status updated:", updateOrder.rows[0]);
      res.json(updateOrder.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("🚨 Error updating order status:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// Update order note
app.put("/api/orders/:id/note", async (req, res) => {
  const { id } = req.params;
  const { note, employeeName, userRole } = req.body;
  console.log("🛠 Updating order note:", { id, note, employeeName, userRole });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const updateOrder = await client.query(
        "UPDATE orders2 SET note = $1 WHERE id = $2 RETURNING *",
        [note, id]
      );

      if (updateOrder.rows.length === 0) {
        throw new Error("Order not found");
      }

      await client.query(
        "INSERT INTO audit_logs (order_id, action, employee_name, user_role, remarks) VALUES ($1, $2, $3, $4, $5)",
        [updateOrder.rows[0].transaction_id, "Note Updated", employeeName, userRole, note]
      );

      await client.query("COMMIT");
      console.log("✅ Order note updated:", updateOrder.rows[0]);
      res.json(updateOrder.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("🚨 Error updating order note:", err);
    res.status(500).json({ error: "Failed to update order note" });
  }
});

// Cancel order
app.put("/api/orders/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const { reason, employeeName, userRole } = req.body;
  console.log("🛠 Cancelling order:", { id, reason, employeeName, userRole });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const order = await client.query("SELECT * FROM orders2 WHERE id = $1", [id]);
      if (order.rows.length === 0) {
        throw new Error("Order not found");
      }

      await client.query(
        "INSERT INTO deleted_orders (transaction_id, customer_name, client_contact, paint_type, colour_code, category, current_status, order_type, paint_quantity, po_type, note, assigned_employee, start_time) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        [
          order.rows[0].transaction_id,
          order.rows[0].customer_name,
          order.rows[0].client_contact,
          order.rows[0].paint_type,
          order.rows[0].colour_code,
          order.rows[0].category,
          order.rows[0].current_status,
          order.rows[0].order_type,
          order.rows[0].paint_quantity,
          order.rows[0].po_type,
          order.rows[0].note,
          order.rows[0].assigned_employee,
          order.rows[0].start_time
        ]
      );

      await client.query(
        "INSERT INTO audit_logs (order_id, action, employee_name, user_role, remarks) VALUES ($1, $2, $3, $4, $5)",
        [order.rows[0].transaction_id, "Order Deleted", employeeName, userRole, reason]
      );

      const updateOrder = await client.query(
        "UPDATE orders2 SET deleted = TRUE WHERE id = $1 RETURNING *",
        [id]
      );

      await client.query("COMMIT");
      console.log("✅ Order cancelled:", updateOrder.rows[0]);
      res.json(updateOrder.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("🚨 Error cancelling order:", err);
    res.status(500).json({ error: "Failed to cancel order" });
  }
});

// Fetch deleted orders
app.get("/api/orders/deleted", async (req, res) => {
  try {
    console.log("🛠 Fetching deleted orders");
    const result = await pool.query("SELECT * FROM deleted_orders ORDER BY start_time DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching deleted orders:", err);
    res.status(500).json({ error: "Failed to fetch deleted orders" });
  }
});

// Fetch all staff
app.get("/api/staff", async (req, res) => {
  try {
    console.log("🛠 Fetching all staff");
    const result = await pool.query("SELECT * FROM employees ORDER BY employee_name");
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching staff:", err);
    res.status(500).json({ error: "Failed to fetch staff" });
  }
});

// Add new staff
app.post("/api/staff", async (req, res) => {
  const { employee_name, code, role } = req.body;
  console.log("🛠 Adding new staff:", { employee_name, code, role });

  try {
    const result = await pool.query(
      "INSERT INTO employees (employee_name, employee_code, role) VALUES ($1, $2, $3) RETURNING *",
      [employee_name, code, role]
    );
    console.log("✅ Staff added:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("🚨 Error adding staff:", err);
    res.status(500).json({ error: "Failed to add staff" });
  }
});

// Update staff
app.put("/api/staff/:id", async (req, res) => {
  const { id } = req.params;
  const { employee_name, code, role } = req.body;
  console.log("🛠 Updating staff:", { id, employee_name, code, role });

  try {
    const result = await pool.query(
      "UPDATE employees SET employee_name = $1, employee_code = $2, role = $3 WHERE employee_id = $4 RETURNING *",
      [employee_name, code, role, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff not found" });
    }
    console.log("✅ Staff updated:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("🚨 Error updating staff:", err);
    res.status(500).json({ error: "Failed to update staff" });
  }
});

// Delete staff
app.delete("/api/staff/:id", async (req, res) => {
  const { id } = req.params;
  console.log("🛠 Deleting staff:", { id });

  try {
    const result = await pool.query("DELETE FROM employees WHERE employee_id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff not found" });
    }
    console.log("✅ Staff deleted:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("🚨 Error deleting staff:", err);
    res.status(500).json({ error: "Failed to delete staff" });
  }
});

// Fetch Order Report
app.get("/api/orders/report", async (req, res) => {
  try {
    const { start_date, end_date, status, category, include_deleted } = req.query;
    console.log("🛠 Generating order report with filters:", { start_date, end_date, status, category, include_deleted });

    // Validate inputs
    if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return res.status(400).json({ error: "Invalid start_date format. Use YYYY-MM-DD." });
    }
    if (end_date && !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      return res.status(400).json({ error: "Invalid end_date format. Use YYYY-MM-DD." });
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: "start_date cannot be after end_date." });
    }
    const validStatuses = ["Waiting", "Mixing", "Spraying", "Re-Mixing", "Ready", "Complete", "All"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value." });
    }

    // Build query for orders2
    let queryConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    queryConditions.push(`deleted = FALSE`);

    if (start_date) {
      queryConditions.push(`start_time >= $${paramIndex}`);
      queryParams.push(start_date);
      paramIndex++;
    }
    if (end_date) {
      queryConditions.push(`start_time <= $${paramIndex}::date + INTERVAL '1 day'`);
      queryParams.push(end_date);
      paramIndex++;
    }
    if (status && status !== "All") {
      queryConditions.push(`current_status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }
    if (category && category !== "All") {
      queryConditions.push(`category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }

    const whereClause = queryConditions.length > 0 ? `WHERE ${queryConditions.join(" AND ")}` : "";

    // Status Summary
    const statusResult = await pool.query(`
      SELECT current_status, COUNT(*) as count
      FROM orders2
      ${whereClause}
      GROUP BY current_status
    `, queryParams);

    // Category Summary
    const categoryResult = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM orders2
      ${whereClause}
      GROUP BY category
    `, queryParams);

    // History Summary (from audit_logs)
    let historyConditions = [];
    let historyParams = [];
    let historyIndex = 1;

    if (start_date) {
      historyConditions.push(`timestamp >= $${historyIndex}`);
      historyParams.push(start_date);
      historyIndex++;
    }
    if (end_date) {
      historyConditions.push(`timestamp <= $${historyIndex}::date + INTERVAL '1 day'`);
      historyParams.push(end_date);
      historyIndex++;
    }
    if (status && status !== "All") {
      historyConditions.push(`to_status = $${historyIndex}`);
      historyParams.push(status);
      historyIndex++;
    }

    const historyWhereClause = historyConditions.length > 0 ? `WHERE ${historyConditions.join(" AND ")}` : "";

    let historySummary = {};
    try {
      const historyResult = await pool.query(`
        SELECT action, COUNT(*) as count
        FROM audit_logs
        ${historyWhereClause}
        GROUP BY action
      `, historyParams);
      historySummary = historyResult.rows.reduce((acc, row) => {
        acc[row.action] = parseInt(row.count, 10);
        return acc;
      }, {});
    } catch (err) {
      console.warn("⚠️ Audit logs query failed, returning empty history:", err.message);
      historySummary = { "No audit data": 0 };
    }

    // Include deleted orders if requested
    let deletedSummary = {};
    if (include_deleted === "true") {
      let deletedConditions = [];
      let deletedParams = [];
      let deletedIndex = 1;

      if (start_date) {
        deletedConditions.push(`start_time >= $${deletedIndex}`);
        deletedParams.push(start_date);
        deletedIndex++;
      }
      if (end_date) {
        deletedConditions.push(`start_time <= $${deletedIndex}::date + INTERVAL '1 day'`);
        deletedParams.push(end_date);
        deletedIndex++;
      }
      if (status && status !== "All") {
        deletedConditions.push(`current_status = $${deletedIndex}`);
        deletedParams.push(status);
        deletedIndex++;
      }
      if (category && category !== "All") {
        deletedConditions.push(`category = $${deletedIndex}`);
        deletedParams.push(category);
        deletedIndex++;
      }

      const deletedWhereClause = deletedConditions.length > 0 ? `WHERE ${deletedConditions.join(" AND ")}` : "";

      const deletedResult = await pool.query(`
        SELECT current_status, COUNT(*) as count
        FROM deleted_orders
        ${deletedWhereClause}
        GROUP BY current_status
      `, deletedParams);

      deletedSummary = deletedResult.rows.reduce((acc, row) => {
        acc[row.current_status] = parseInt(row.count, 10);
        return acc;
      }, {});
    }

    console.log("✅ Report generated:", { statusSummary, categorySummary, historySummary, deletedSummary });
    res.json({ statusSummary, categorySummary, historySummary, deletedSummary });
  } catch (err) {
    console.error("🚨 Error generating report:", err.stack);
    res.status(500).json({ error: "Failed to generate report", details: err.message });
  }
});

// Fetch Detailed Audit Logs
app.get("/api/audit_logs", async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;
    console.log("🛠 Fetching audit logs with filters:", { start_date, end_date, status });

    // Validate inputs
    if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return res.status(400).json({ error: "Invalid start_date format. Use YYYY-MM-DD." });
    }
    if (end_date && !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      return res.status(400).json({ error: "Invalid end_date format. Use YYYY-MM-DD." });
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: "start_date cannot be after end_date." });
    }
    const validStatuses = ["Waiting", "Mixing", "Spraying", "Re-Mixing", "Ready", "Complete", "All"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value." });
    }

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (start_date) {
      conditions.push(`timestamp >= $${paramIndex}`);
      params.push(start_date);
      paramIndex++;
    }
    if (end_date) {
      conditions.push(`timestamp <= $${paramIndex}::date + INTERVAL '1 day'`);
      params.push(end_date);
      paramIndex++;
    }
    if (status && status !== "All") {
      conditions.push(`to_status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(`
      SELECT log_id, order_id, action, from_status, to_status, employee_name, timestamp, remarks
      FROM audit_logs
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT 100
    `, params);

    console.log("✅ Audit logs fetched:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching audit logs:", err.stack);
    res.status(500).json({ error: "Failed to fetch audit logs", details: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

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

// Search Orders (Updated)
app.get("/api/orders/search", async (req, res) => {
  const { q, sortBy = 'transaction_id', sortOrder = 'DESC', limit = 50 } = req.query;

  // Validate sortBy to prevent SQL injection
  const validSortColumns = [
    'transaction_id',
    'customer_name',
    'client_contact',
    'current_status',
    'start_time',
    'paint_type',
    'category',
    'po_type'
  ];
  const column = validSortColumns.includes(sortBy) ? sortBy : 'transaction_id';

  // Validate sortOrder
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Validate limit
  const resultLimit = parseInt(limit, 10) > 0 ? parseInt(limit, 10) : 50;

  try {
    console.log("🔍 Searching orders with query:", { q, sortBy: column, sortOrder: order, limit: resultLimit });

    // Build the WHERE clause for search
    let queryConditions = ['deleted = FALSE']; // Exclude deleted orders
    let queryParams = [];
    let paramIndex = 1;

    if (q && q.trim() !== '') {
      const searchTerm = `%${q.trim()}%`;
      queryConditions.push(`
        (transaction_id ILIKE $${paramIndex}
        OR customer_name ILIKE $${paramIndex + 1}
        OR client_contact ILIKE $${paramIndex + 2})
      `);
      queryParams.push(searchTerm, searchTerm, searchTerm);
      paramIndex += 3;
    }

    const whereClause = queryConditions.length > 0 ? `WHERE ${queryConditions.join(' AND ')}` : '';

    const query = `
      SELECT transaction_id, customer_name, client_contact, assigned_employee,
             current_status, colour_code, paint_type, start_time,
             paint_quantity, order_type, category, note, po_type
      FROM orders2
      ${whereClause}
      ORDER BY ${column} ${order}
      LIMIT $${paramIndex}
    `;
    queryParams.push(resultLimit);

    const result = await pool.query(query, queryParams);
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
             o.paint_quantity, o.order_type, o.category, o.note, o.po_type,
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
      `SELECT transaction_id, customer_name, client_contact, assigned_employee,
              current_status, colour_code, paint_type, start_time,
              paint_quantity, order_type, category, note, po_type
       FROM orders2 
       WHERE current_status IN ('Mixing', 'Waiting', 'Pending')`
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
             paint_quantity, order_type, category, note, po_type
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
             paint_quantity, order_type, category, note, po_type
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

//// Fetch Complete Orders
app.get("/api/orders/complete", async (req, res) => {
  try {
    console.log("🛠 Fetching complete orders...");
    const result = await pool.query(`
      SELECT transaction_id, customer_name, client_contact, assigned_employee,
             current_status, colour_code, paint_type, start_time, paint_quantity, 
             order_type, category, note, po_type, completed_at
      FROM orders2
      WHERE current_status = 'Complete'
      ORDER BY start_time DESC
    `);
    console.log("✅ Complete orders fetched:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("🚨 Error fetching complete orders:", error);
    res.status(500).json({ error: error.message });
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
      po_type,
      note
    } = req.body;

    if (category === "New Mix") {
      colour_code = "Pending";
    }
    if (!colour_code || colour_code.trim() === "") {
      colour_code = "N/A";
    }
    if (order_type === "Paid" && !["Nexa", "Carvello"].includes(po_type)) {
      return res.status(400).json({ error: "❌ PO Type must be 'Nexa' or 'Carvello' for Paid orders" });
    }

    const start_time = new Date().toISOString();
    console.log("🛠 Adding new order:", req.body);

    await pool.query(
      `INSERT INTO orders2 (
        transaction_id, customer_name, client_contact, paint_type, 
        colour_code, category, paint_quantity, current_status, 
        order_type, start_time, note, archived, deleted, po_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, FALSE, $12)`,
      [
        transaction_id, customer_name, client_contact, paint_type,
        colour_code, category, paint_quantity, current_status,
        order_type, start_time, note || null, po_type || null
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
    let { current_status, assigned_employee, colour_code, note, old_status, userRole, po_type } = req.body;
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

    const currentOrder = await pool.query(
      "SELECT current_status, note, po_type FROM orders2 WHERE transaction_id = $1",
      [id]
    );
    if (currentOrder.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const { current_status: existingStatus, note: existingNote, po_type: existingPoType } = currentOrder.rows[0];

    console.log("🛠 Updating order:", { id, current_status, assigned_employee, colour_code, note, po_type });

    await pool.query(
      `UPDATE orders2
       SET current_status = $1, colour_code = $2, assigned_employee = $3, note = $4, po_type = $5
       WHERE transaction_id = $6`,
      [current_status, colour_code || "Pending", assigned_employee, note || null, po_type || existingPoType || null, id]
    );

    if (current_status !== existingStatus) {
      await pool.query(
        `INSERT INTO order_status_history (transaction_id, status)
         VALUES ($1, $2)`,
        [id, current_status]
      );
    }

    const action = current_status !== existingStatus ? "Status Changed" : "Note Updated";
    const remarks = note && note !== existingNote ? `Note updated to: ${note}` : 
                    current_status !== existingStatus ? `Status updated${note ? ` with note: ${note}` : ""}` : 
                    "Note updated via UI";
    await pool.query(
      `INSERT INTO audit_logs
       (order_id, action, from_status, to_status, employee_name, user_role, colour_code, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        action,
        current_status !== existingStatus ? existingStatus : "N/A",
        current_status !== existingStatus ? current_status : "N/A",
        assigned_employee || null,
        userRole || "Unknown",
        colour_code || null,
        remarks
      ]
    );

    console.log(`✅ Order updated successfully: ${id} → ${action}`);
    res.json({ message: `✅ Order ${action.toLowerCase()}` });
  } catch (error) {
    console.error("🚨 Error updating order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete Order
app.delete("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  const { userRole, note } = req.body;

  try {
    if (userRole !== "Admin") {
      console.warn(`❌ Unauthorized deletion attempt by role: ${userRole}`);
      return res.status(403).json({ error: "Only Admins can delete orders" });
    }

    if (!note || note.trim() === "") {
      console.warn("❌ Deletion attempt without note");
      return res.status(400).json({ error: "A note is required to delete an order" });
    }

    const check = await pool.query(
      "SELECT current_status, po_type FROM orders2 WHERE transaction_id = $1 AND deleted = FALSE",
      [id]
    );
    if (check.rows.length === 0) {
      console.warn(`❌ Order not found: ${id}`);
      return res.status(404).json({ error: "Order not found" });
    }

    const { current_status, po_type } = check.rows[0];
    const validStatuses = ["Waiting", "Mixing", "Spraying", "Re-Mixing"];
    if (!validStatuses.includes(current_status)) {
      console.warn(`❌ Invalid status for deletion: ${current_status}`);
      return res.status(400).json({ error: "Only Waiting or Active orders can be deleted" });
    }

    console.log(`🛠 Deleting order: ${id} with note: ${note}`);

    await pool.query(
      `INSERT INTO deleted_orders (
        transaction_id, customer_name, client_contact, assigned_employee,
        current_status, colour_code, paint_type, start_time,
        paint_quantity, order_type, category, note, po_type
      )
      SELECT transaction_id, customer_name, client_contact, assigned_employee,
             current_status, colour_code, paint_type, start_time,
             paint_quantity, order_type, category, $2, po_type
      FROM orders2
      WHERE transaction_id = $1`,
      [id, note]
    );

    await pool.query(
      `UPDATE orders2 SET deleted = TRUE WHERE transaction_id = $1`,
      [id]
    );

    await pool.query(
      `INSERT INTO audit_logs
       (order_id, action, from_status, to_status, employee_name, user_role, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, "Order Deleted", current_status, "Deleted", null, userRole, `Order deleted with note: ${note}`]
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

// Verify Employee Code
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
             order_type, category, note, po_type
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

// Fetch Order Report
app.get("/api/orders/report", async (req, res) => {
  try {
    const { start_date, end_date, status, category, include_deleted } = req.query;
    console.log("🛠 Generating order report with filters:", { start_date, end_date, status, category, include_deleted });

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

    const statusResult = await pool.query(`
      SELECT current_status, COUNT(*) as count
      FROM orders2
      ${whereClause}
      GROUP BY current_status
    `, queryParams);

    const categoryResult = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM orders2
      ${whereClause}
      GROUP BY category
    `, queryParams);

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

    const statusSummary = statusResult.rows.reduce((acc, row) => {
      acc[row.current_status] = parseInt(row.count, 10);
      return acc;
    }, {});

    const categorySummary = categoryResult.rows.reduce((acc, row) => {
      acc[row.category] = parseInt(row.count, 10);
      return acc;
    }, {});

    console.log("✅ Report generated:", { statusSummary, categorySummary, historySummary, deletedSummary });
    res.json({ statusSummary, categorySummary, historySummary, deletedSummary });
  } catch (err) {
    console.error("🚨 Error generating report:", err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch Detailed Audit Logs
app.get("/api/audit_logs", async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;
    console.log("🛠 Fetching audit logs with filters:", { start_date, end_date, status });

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
    const result = await pool.query(
      `SELECT log_id, order_id, action, from_status, to_status, employee_name, timestamp, remarks
       FROM audit_logs
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT 100`,
      params
    );

    console.log("✅ Audit logs fetched:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Error fetching audit logs:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health Check
app.get("/", (req, res) => {
  res.send("🚀 Backend is alive!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

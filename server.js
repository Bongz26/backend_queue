const express = require("express");
const cors = require("cors");
const pool = require("./database"); // ✅ PostgreSQL connection

const app = express();
app.use(express.json());

const allowedOrigins = [
  "https://queue-system-ewrn.onrender.com",
  "https://fronttest-eibo.onrender.com",
  "https://proctest.netlify.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));


app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json");
    next();
});

app.get("/api/orders/search", async (req, res) => {
  const { q } = req.query; // query string value
  try {
     
      const result = await pool.query(`
            SELECT *
            FROM orders2
			      ORDER BY 1 DESC;
        `);

    res.json(result.rows);
  } catch (err) {
    console.error("🚨 Search failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Check if transaction ID exists
app.get("/api/orders/check-id/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT 1 FROM orders2 WHERE transaction_id = $1", [id]);
    if (result.rowCount > 0) {
      return res.status(409).json({ exists: true }); // 409 = conflict
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error("❌ Error checking transaction ID:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Fetch Orders (Including "Mixing" and "Spraying" Orders)
app.get("/api/orders", async (req, res) => {
    try {
        console.log("🛠 Fetching latest orders...");
        await pool.query("DISCARD ALL");

        const result = await pool.query(`
		 SELECT o.transaction_id, o.customer_name, o.client_contact, o.assigned_employee, 
		         o.current_status, o.colour_code, o.paint_type, o.start_time, 
		         o.paint_quantity, o.order_type, o.category,
		         h.entered_at AS status_started_at
	 		 FROM orders2 o
	  	LEFT JOIN LATERAL (
	    	SELECT entered_at
	    	FROM order_status_history
	    	WHERE transaction_id= o.transaction_id AND status = o.current_status
	    	ORDER BY entered_at DESC
	   	 LIMIT 1
	  ) h ON true
	  WHERE o.current_status NOT IN ('Ready','Complete') 
		AND o.archived = FALSE
	  ORDER BY o.current_status DESC 
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
            "SELECT * FROM orders2 WHERE current_status IN ('Mixing', 'Waiting', 'Pending')"
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
       
 let {
  transaction_id,
  customer_name,
  client_contact,
  paint_type,
  colour_code,
  category,
  paint_quantity,
  current_status,
  order_type
} = req.body;

if (category === "New Mix") {
  colour_code = "Pending";
}

if (!colour_code || colour_code.trim() === "") {
  colour_code = "N/A";  // fallback for other cases
}

        const start_time = new Date().toISOString(); // ✅ Store accurate time

        console.log("🛠 Adding new order:", req.body);

        await pool.query(
            "INSERT INTO orders2 (transaction_id, customer_name, client_contact, paint_type, colour_code, category, paint_quantity, current_status, order_type, start_time) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            [transaction_id, customer_name, client_contact, paint_type, colour_code, category, paint_quantity, current_status, order_type, start_time]
        );

        console.log("✅ Order added successfully!");
        res.json({ message: "✅ Order added successfully!" });
    } catch (error) {
        if (error.code === '23505') { // ✅ PostgreSQL UNIQUE constraint violation error code
            return res.status(400).json({ error: "❌ Duplicate Transaction ID! Please use a unique ID." });
        }

        console.error("🚨 Error adding order:", error);
        res.status(500).json({ error: error.message });
    }
});


app.put("/api/orders/:id", async (req, res) => {
  try {
    let { current_status, assigned_employee, colour_code } = req.body;
    const { id } = req.params;

    // ✅ Validate allowed statuses
    const validStatuses = ["Waiting", "Mixing", "Spraying", "Re-Mixing", "Ready", "Complete"];
    if (!validStatuses.includes(current_status)) {
      return res.status(400).json({ error: "❌ Invalid status update!" });
    }

    // ✅ Require Colour Code when marking as "Ready"
    if (current_status === "Ready" && (!colour_code || colour_code.trim() === "")) {
      return res.status(400).json({ error: "❌ Colour Code is required to mark order as Ready!" });
    }

    // ✅ Require Employee Assignment for Status Changes (except "Waiting")
    if (current_status !== "Waiting" && (!assigned_employee || assigned_employee.trim() === "")) {
      return res.status(400).json({ error: "❌ Employee must be assigned when updating order status!" });
    }

    console.log("🛠 Updating order:", { id, current_status, assigned_employee, colour_code });

    // ✅ Update order
    await pool.query(
      `UPDATE orders2 
       SET current_status = $1, colour_code = $2, assigned_employee = $3
       WHERE transaction_id = $4`,
      [current_status, colour_code || "Pending", assigned_employee, id]
    );

    // ✅ Insert into order_status_history
    await pool.query(
      `INSERT INTO order_status_history (transaction_id, status)
       VALUES ($1, $2)`,
      [id, current_status]
    );

    // ✅ Audit Log
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
        "Status updated via UI"
      ]
    );

    console.log(`✅ Order updated successfully: ${id} → ${current_status}`);
    res.json({ message: `✅ Order status updated to ${current_status}` });
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
            FROM orders2 
            WHERE current_status = 'Ready' and order_type in ('Order','Paid')
            ORDER BY start_time DESC
        `);
        
        console.log("✅ Ready orders fetched successfully");
        res.json(result.rows);
    } catch (error) {
        console.error("🚨 Error fetching Ready orders:", error);
        res.status(500).json({ error: error.message });
    }
});

app.put("/api/orders/mark-paid/:id", async (req, res) => {
  try {
    const { userRole } = req.body;
    const { id } = req.params;

    if (userRole !== "Admin") {
      return res.status(403).json({ error: "Only Admins can mark orders as Paid" });
    }

    // ✅ Check if order is READY before updating
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

// Archive Waiting orders older than 21 days
app.put("/api/orders/archive-old", async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE orders2
      SET archived = TRUE
      WHERE current_status = 'Waiting'
        AND archived = FALSE
        AND COALESCE(start_time) < NOW() - INTERVAL '21 days'
    `);

    res.json({ message: `✅ ${result.rowCount} orders archived.` });
  } catch (err) {
    console.error("❌ Archiving failed:", err.message);
    res.status(500).json({ error: "Failed to archive old orders." });
  }
});

app.get("/", (req, res) => {
    res.send("🚀 Backend is alive!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

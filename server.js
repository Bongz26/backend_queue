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

// [Other routes unchanged...]

// Fetch Order Report
app.get("/api/orders/report", async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;
    console.log("🛠 Generating order report with filters:", { start_date, end_date, status });

    // Validate date inputs
    let validatedStartDate = start_date;
    let validatedEndDate = end_date;
    if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return res.status(400).json({ error: "Invalid start_date format. Use YYYY-MM-DD." });
    }
    if (end_date && !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      return res.status(400).json({ error: "Invalid end_date format. Use YYYY-MM-DD." });
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: "start_date cannot be after end_date." });
    }

    // Validate status
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
      // Adjust end_date to include the full day
      queryConditions.push(`start_time <= $${paramIndex}::date + INTERVAL '1 day'`);
      queryParams.push(end_date);
      paramIndex++;
    }
    if (status && status !== "All") {
      queryConditions.push(`current_status = $${paramIndex}`);
      queryParams.push(status);
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
      historyConditions.push(`entered_at >= $${historyIndex}`);
      historyParams.push(start_date);
      historyIndex++;
    }
    if (end_date) {
      historyConditions.push(`entered_at <= $${historyIndex}::date + INTERVAL '1 day'`);
      historyParams.push(end_date);
      historyIndex++;
    }

    const historyWhereClause = historyConditions.length > 0 ? `WHERE ${historyConditions.join(" AND ")}` : "";

    // Check if audit_logs table exists
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

    const statusSummary = statusResult.rows.reduce((acc, row) => {
      acc[row.current_status] = parseInt(row.count, 10);
      return acc;
    }, {});

    const categorySummary = categoryResult.rows.reduce((acc, row) => {
      acc[row.category] = parseInt(row.count, 10);
      return acc;
    }, {});

    console.log("✅ Report generated:", { statusSummary, categorySummary, historySummary });
    res.json({ statusSummary, categorySummary, historySummary });
  } catch (err) {
    console.error("🚨 Error generating report:", err.stack);
    res.status(500).json({ error: "Failed to generate report", details: err.message });
  }
});

// [Other routes unchanged...]

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

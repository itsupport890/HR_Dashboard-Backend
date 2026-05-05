require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const pool    = require('./db');

// ── Initialize DB first (async) before routes are loaded ──────────────
async function initializeDatabase() {
  try {
    // Create employees table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR NOT NULL,
        code       VARCHAR UNIQUE NOT NULL,
        branch     VARCHAR DEFAULT '',
        department VARCHAR DEFAULT '',
        join_date  VARCHAR DEFAULT ''
      )
    `);

    // Create attendance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id            SERIAL PRIMARY KEY,
        employee_code VARCHAR NOT NULL,
        date          VARCHAR NOT NULL,
        day           VARCHAR DEFAULT '',
        shift_in      VARCHAR DEFAULT '',
        shift_out     VARCHAR DEFAULT '',
        entry         VARCHAR DEFAULT '',
        exit_time     VARCHAR DEFAULT '',
        status        VARCHAR DEFAULT '',
        UNIQUE(employee_code, date)
      )
    `);

    // Seed only if empty AND seeding is explicitly enabled (set SEED_DATA=true in .env)
    const empCount = await pool.query('SELECT COUNT(*) as c FROM employees');
    if (parseInt(empCount.rows[0].c) === 0 && process.env.SEED_DATA === 'true') {
      console.log('Seeding initial data...');
      const seedEmployees  = require('./seed/employees');
      const seedAttendance = require('./seed/attendance');

      for (const e of seedEmployees) {
        await pool.query(
          `INSERT INTO employees (name, code, branch, department, join_date) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (code) DO NOTHING`,
          [e.name, e.code, e.branch || '', e.department, e.joinDate]
        );
      }

      for (const a of seedAttendance) {
        await pool.query(
          `INSERT INTO attendance (employee_code, date, day, shift_in, shift_out, entry, exit_time, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (employee_code, date) DO NOTHING`,
          [a.code, a.date, a.day, a.shiftIn, a.shiftOut, a.entry, a.exit, a.status]
        );
      }

      console.log(`Seeded ${seedEmployees.length} employees, ${seedAttendance.length} attendance records.`);
    }

    // ── Normalize SPST values in any existing rows (WOP→WO, PHP→PH, etc.) ──
    const normalizeStatus = require('./utils/normalizeStatus');
    const distinctStatuses = await pool.query(
      `SELECT DISTINCT status FROM attendance WHERE status IS NOT NULL AND status != ''`
    );
    let normalizedCount = 0;
    for (const row of distinctStatuses.rows) {
      const original   = row.status;
      const normalized = normalizeStatus(original);
      if (normalized !== original) {
        const result = await pool.query(
          `UPDATE attendance SET status = $1 WHERE status = $2`,
          [normalized, original]
        );
        console.log(`  SPST: '${original}' → '${normalized}' (${result.rowCount} rows)`);
        normalizedCount += result.rowCount;
      }
    }
    if (normalizedCount > 0) {
      console.log(`Normalized ${normalizedCount} attendance row(s).`);
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    process.exit(1);
  }
}

// ── Now require routes (tables exist) ──────────
const dashboardRouter = require('./routes/dashboard');
const employeesRouter = require('./routes/employees');
const reportsRouter   = require('./routes/reports');
const syncRouter      = require('./routes/sync');
const processRouter   = require('./routes/process');

const app = express();

// CORS: allow localhost dev + production Netlify frontend.
// Add more origins to ALLOWED_ORIGINS in .env (comma-separated) to extend.
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://starlit-daifuku-1873eb.netlify.app',
];
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
const allowedOrigins = Array.from(new Set([...DEFAULT_ORIGINS, ...envOrigins]));

app.use(cors({
  origin: function(origin, callback) {
    // Allow non-browser clients (curl, server-to-server) with no Origin header
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS blocked for origin: ' + origin));
  },
  credentials: true,
  exposedHeaders: ['X-Process-Stats', 'Content-Disposition'],
}));

app.use(express.json());
app.get("/", (req, res) => {
  res.send("HR Dashboard Backend API is Running Successfully 🚀");
});
app.use('/api/dashboard', dashboardRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/reports',   reportsRouter);
app.use('/api/sync',      syncRouter);
app.use('/api/process',   processRouter);
app.get('/api/health', function(req, res) { res.json({ status: 'ok' }); });

const PORT = process.env.PORT || 3001;

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(PORT, function() {
    console.log('HR Dashboard server ready at http://localhost:' + PORT);
    console.log(`Database: ${process.env.DB_NAME || 'hr_dashboard'} (PostgreSQL)`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

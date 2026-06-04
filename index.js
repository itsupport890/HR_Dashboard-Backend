require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { db, getCollection } = require('./db');

// ── Initialize DB first (async) before routes are loaded ──────────────
async function initializeDatabase() {
  try {
    // Firestore is schemaless — ensure collections exist by optionally seeding data
    // Seed only if empty AND seeding is explicitly enabled (set SEED_DATA=true in .env)
    const employeesCol = getCollection('employees');
    const attendanceCol = getCollection('attendance');

    const empSnapshot = await employeesCol.limit(1).get();
    if (empSnapshot.empty && process.env.SEED_DATA === 'true') {
      console.log('Seeding initial data into Firestore...');
      const seedEmployees  = require('./seed/employees');
      const seedAttendance = require('./seed/attendance');

      for (const e of seedEmployees) {
        const docId = String(e.code);
        await employeesCol.doc(docId).set({
          name: e.name,
          code: e.code,
          branch: e.branch || '',
          department: e.department || '',
          join_date: e.joinDate || ''
        }, { merge: false });
      }

      for (const a of seedAttendance) {
        const docId = `${a.code}_${a.date}`;
        await attendanceCol.doc(docId).set({
          employee_code: a.code,
          date: a.date,
          day: a.day || '',
          shift_in: a.shiftIn || '',
          shift_out: a.shiftOut || '',
          entry: a.entry || '',
          exit_time: a.exit || '',
          status: a.status || ''
        }, { merge: false });
      }

      console.log(`Seeded ${seedEmployees.length} employees, ${seedAttendance.length} attendance records into Firestore.`);
    }

    // Normalize SPST values in any existing attendance documents
    const normalizeStatus = require('./utils/normalizeStatus');
    const attSnapshot = await attendanceCol.get();
    let normalizedCount = 0;
    for (const doc of attSnapshot.docs) {
      const data = doc.data();
      const original = data.status || '';
      const normalized = normalizeStatus(original);
      if (normalized !== original) {
        await attendanceCol.doc(doc.id).update({ status: normalized });
        normalizedCount++;
        console.log(`  SPST: '${original}' → '${normalized}' (doc ${doc.id})`);
      }
    }
    if (normalizedCount > 0) {
      console.log(`Normalized ${normalizedCount} attendance document(s).`);
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
  'https://royal-chain-hr-dashboard.vercel.app',
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
    console.log(`Database: Firestore`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

const express         = require('express');
const { getCollection } = require('../db');
const normalizeStatus = require('../utils/normalizeStatus');
const router          = express.Router();

const employeesCol = getCollection('employees');
const attendanceCol = getCollection('attendance');

const MONTH_NAMES = ['','January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// GET /api/employees?search=&month=
router.get('/', async function(req, res) {
  try {
    const { search = '', month = '' } = req.query;

    // Fetch all employees and filter in JS (Firestore text-search is limited)
    const snapshot = await employeesCol.get();
    let rows = snapshot.docs.map(d => Object.assign({ id: d.id }, d.data()));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q));
    }

    // Sort by name
    rows.sort((a,b) => (a.name || '').localeCompare(b.name || ''));

    if (month && month !== 'All Months') {
      const idx = MONTH_NAMES.indexOf(month);
      if (idx > 0) {
        rows = rows.filter(function(r) {
          return r.join_date && new Date(r.join_date).getMonth() + 1 === idx;
        });
      }
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/:code/attendance?month=
router.get('/:code/attendance', async function(req, res) {
  try {
    const { code }       = req.params;
    const { month = '' } = req.query;

    // Query attendance for this employee
    const snapshot = await attendanceCol.where('employee_code', '==', code).orderBy('date', 'desc').get();
    // Normalize SPST on read so frontend always sees clean values
    const rows = snapshot.docs.map(d => Object.assign({}, d.data(), { status: normalizeStatus(d.data().status || '') }));

    let records = rows;
    if (month && month !== 'All Months') {
      const idx = MONTH_NAMES.indexOf(month);
      if (idx > 0) {
        records = rows.filter(function(r) {
          return new Date(r.date).getMonth() + 1 === idx;
        });
      }
    }

    // Summary counts from ALL (normalized) records
    const counts = { DP: 0, PL: 0, WO: 0, PH: 0, 'ABS/DP': 0, 'DP/ABS': 0, ABS: 0 };
    rows.forEach(function(r) {
      if (counts[r.status] !== undefined) counts[r.status]++;
      else counts.ABS++;
    });
    const totalPresent = rows.filter(function(r) { return r.status === 'DP' || r.status === 'DP/ABS'; }).length;
    const totalAbsent  = rows.filter(function(r) { return r.status === 'ABS' || r.status === 'ABS/DP'; }).length;

    res.json({ records, summary: { counts, totalPresent, totalAbsent } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

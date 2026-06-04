const express         = require('express');
const { getCollection } = require('../db');
const normalizeStatus = require('../utils/normalizeStatus');
const { parseStoredDate, dateToYMD } = require('../utils/dateUtils');
const router          = express.Router();

const employeesCol = getCollection('employees');
const attendanceCol = getCollection('attendance');

const MONTH_NAMES = ['','January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// GET /api/reports?search=&month=&from=&to=
router.get('/', async function(req, res) {
  try {
    const { search = '', month = '', from = '', to = '' } = req.query;

    // Load attendance and employee maps, then join in JS
    const empSnapshot = await employeesCol.get();
    const empMap = {};
    empSnapshot.docs.forEach(d => { empMap[d.data().code] = d.data(); });

    const attSnapshot = await attendanceCol.get();
    let rows = attSnapshot.docs.map(d => {
      const a = d.data();
      const e = empMap[a.employee_code] || {};
      return {
        name: e.name || '',
        code: a.employee_code,
        branch: e.branch || '',
        department: e.department || '',
        joinDate: e.join_date || '',
        date: a.date,
        day: a.day || '',
        spst: a.status || '',
        shiftIn: a.shift_in || '',
        shiftOut: a.shift_out || '',
        arrv: a.entry || '',
        dept: a.exit_time || ''
      };
    });

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q));
    }

    // Sort by date desc then name
    rows.sort((a,b) => {
      if (a.date === b.date) return (a.name || '').localeCompare(b.name || '');
      return (b.date || '').localeCompare(a.date || '');
    });

    // JS-side month and date range filter + SPST normalization
    // r.date may be an Excel serial (e.g. "45930") or a real date string.
    // We compare via "YYYY-MM-DD" so timezone doesn't shift the day.
    const monthIdx  = MONTH_NAMES.indexOf(month);
    const wantMonth = month && month !== 'All Months' && monthIdx > 0;

    const result = rows
      .filter(function(r) {
        const d = parseStoredDate(r.date);
        if (!d) {
          // Unparseable date — only include when no date filter is active
          return !wantMonth && !from && !to;
        }
        if (wantMonth && d.getMonth() + 1 !== monthIdx) return false;
        const ymd = dateToYMD(d);
        if (from && ymd < from) return false;
        if (to   && ymd > to)   return false;
        return true;
      })
      .map(function(r) {
        return Object.assign({}, r, { spst: normalizeStatus(r.spst) });
      });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

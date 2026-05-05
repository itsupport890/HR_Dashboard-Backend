const express         = require('express');
const pool            = require('../db');
const normalizeStatus = require('../utils/normalizeStatus');
const { parseStoredDate, dateToYMD } = require('../utils/dateUtils');
const router          = express.Router();

const MONTH_NAMES = ['','January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// GET /api/reports?search=&month=&from=&to=
router.get('/', async function(req, res) {
  try {
    const { search = '', month = '', from = '', to = '' } = req.query;

    let rows;
    if (search) {
      const like = '%' + search.toLowerCase() + '%';
      const result = await pool.query(
        `SELECT e.name        AS name,
                a.employee_code AS code,
                e.branch      AS branch,
                e.department  AS department,
                e.join_date   AS "joinDate",
                a.date        AS date,
                a.day         AS day,
                a.status      AS spst,
                a.shift_in    AS "shiftIn",
                a.shift_out   AS "shiftOut",
                a.entry       AS arrv,
                a.exit_time   AS dept
         FROM attendance a
         LEFT JOIN employees e ON e.code = a.employee_code
         WHERE LOWER(e.name) LIKE $1 OR LOWER(a.employee_code) LIKE $2
         ORDER BY a.date DESC, e.name ASC`,
        [like, like]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT e.name        AS name,
                a.employee_code AS code,
                e.branch      AS branch,
                e.department  AS department,
                e.join_date   AS "joinDate",
                a.date        AS date,
                a.day         AS day,
                a.status      AS spst,
                a.shift_in    AS "shiftIn",
                a.shift_out   AS "shiftOut",
                a.entry       AS arrv,
                a.exit_time   AS dept
         FROM attendance a
         LEFT JOIN employees e ON e.code = a.employee_code
         ORDER BY a.date DESC, e.name ASC`
      );
      rows = result.rows;
    }

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

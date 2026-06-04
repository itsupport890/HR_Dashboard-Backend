const express         = require('express');
const multer          = require('multer');
const XLSX            = require('xlsx');
const { getCollection } = require('../db');
const normalizeStatus = require('../utils/normalizeStatus');
const router          = express.Router();

const employeesCol = getCollection('employees');
const attendanceCol = getCollection('attendance');

const upload = multer({ storage: multer.memoryStorage() });

function normalize(str) {
  return String(str).toLowerCase().trim().replace(/[\s_/]+/g, '');
}

// Excel columns: Employee Name | Employee Code | Join Date | Branch |
//                Department | Day | Date | SPST | SHIFT IN | SHIFT OUT | ARRV | DEPT
const COL_MAP = {
  'employeename':  'name',
  'name':          'name',
  'employeecode':  'code',
  'code':          'code',
  'joindate':      'joinDate',
  'joiningdate':   'joinDate',
  'branch':        'branch',
  'department':    'department',
  'day':           'day',
  'date':          'date',
  'spst':          'status',
  'status':        'status',
  'shiftin':       'shiftIn',
  'shiftout':      'shiftOut',
  'arrv':          'entry',
  'arrival':       'entry',
  'entry':         'entry',
};

function mapRow(rawRow) {
  const keys   = Object.keys(rawRow);
  const mapped = {};
  const hasDepartmentCol = keys.some(function(k) { return normalize(k) === 'department'; });

  keys.forEach(function(key) {
    const norm = normalize(key);
    const val  = rawRow[key] == null ? '' : String(rawRow[key]).trim();

    if (norm === 'dept') {
      // DEPT = departure/exit when a separate Department column exists; else = department
      if (hasDepartmentCol) mapped.exit = val;
      else mapped.department = val;
      return;
    }
    const dest = COL_MAP[norm];
    if (dest) mapped[dest] = val;
  });

  return mapped;
}

// POST /api/sync
router.post('/', upload.single('file'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const workbook  = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rawRows   = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty or has no data rows.' });
    }

    let empUpserted = 0, attUpserted = 0, skipped = 0;

    for (const raw of rawRows) {
      const row = mapRow(raw);
      if (!row.code) { skipped++; continue; }

      // Upsert employee — only set fields that have non-empty values
      const empDoc = employeesCol.doc(String(row.code));
      const empUpdate = {};
      if (row.name) empUpdate.name = row.name;
      if (row.branch) empUpdate.branch = row.branch;
      if (row.department) empUpdate.department = row.department;
      if (row.joinDate) empUpdate.join_date = row.joinDate;
      if (Object.keys(empUpdate).length > 0) {
        await empDoc.set(Object.assign({ code: row.code }, empUpdate), { merge: true });
      } else {
        // ensure doc exists with code
        await empDoc.set({ code: row.code }, { merge: true });
      }
      empUpserted++;

      // Upsert attendance if date exists
      if (row.date) {
        const attId = `${row.code}_${row.date}`;
        const attDoc = attendanceCol.doc(attId);
        const attUpdate = {
          employee_code: row.code,
          date: row.date
        };
        if (row.day) attUpdate.day = row.day;
        if (row.shiftIn) attUpdate.shift_in = row.shiftIn;
        if (row.shiftOut) attUpdate.shift_out = row.shiftOut;
        if (row.entry) attUpdate.entry = row.entry;
        if (row.exit) attUpdate.exit_time = row.exit;
        attUpdate.status = normalizeStatus(row.status || '');
        await attDoc.set(attUpdate, { merge: true });
        attUpserted++;
      }
    }

    res.json({
      success: true,
      message: `Sync complete. ${empUpserted} employee record(s) updated, ${attUpserted} attendance record(s) upserted, ${skipped} row(s) skipped (missing Employee Code).`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/clear  — wipe ALL employees and attendance from the database
router.post('/clear', async function(req, res) {
  try {
    // Delete all attendance docs
    const attSnap = await attendanceCol.get();
    let attDeleted = 0;
    const deletePromises = [];
    attSnap.docs.forEach(d => { deletePromises.push(attendanceCol.doc(d.id).delete()); attDeleted++; });
    await Promise.all(deletePromises);

    // Delete all employee docs
    const empSnap = await employeesCol.get();
    let empDeleted = 0;
    const del2 = [];
    empSnap.docs.forEach(d => { del2.push(employeesCol.doc(d.id).delete()); empDeleted++; });
    await Promise.all(del2);

    res.json({ success: true, message: `Cleared ${empDeleted} employee(s) and ${attDeleted} attendance record(s).` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/normalize  — manually clean up SPST values in the DB
router.post('/normalize', async function(req, res) {
  try {
    const attSnap = await attendanceCol.get();
    const changes = [];
    let totalRows = 0;
    for (const doc of attSnap.docs) {
      const original = doc.data().status || '';
      const normalized = normalizeStatus(original);
      if (normalized !== original) {
        await attendanceCol.doc(doc.id).update({ status: normalized });
        changes.push({ from: original, to: normalized, doc: doc.id });
        totalRows++;
      }
    }
    res.json({ success: true, totalRows, changes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

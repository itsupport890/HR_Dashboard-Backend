const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const router  = express.Router();

const { parseTimeToMinutes, formatMinutesToTime, randInt } = require('../utils/timeUtils');
const normalizeStatus = require('../utils/normalizeStatus');

const upload = multer({ storage: multer.memoryStorage() });

const LATE_THRESHOLD_MIN = 40;
const ARRV_RANDOM_OFFSET_RANGE = [1, 15];
const DEPT_RANDOM_OFFSET_RANGE = [0, 15];

function normalizeKey(str) {
  return String(str).toLowerCase().trim().replace(/[\s_/]+/g, '');
}

function findKey(row, target) {
  const keys = Object.keys(row);
  for (const k of keys) {
    if (normalizeKey(k) === target) return k;
  }
  return null;
}

function findDeptExitKey(row) {
  const keys = Object.keys(row);
  const hasDepartment = keys.some(function(k) {
    return normalizeKey(k) === 'department';
  });

  if (!hasDepartment) return null;

  for (const k of keys) {
    if (normalizeKey(k) === 'dept') return k;
  }
  return null;
}

router.post('/', upload.single('file'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const workbook = XLSX.read(req.file.buffer, {
      type: 'buffer',
      cellDates: false,
      raw: true
    });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty or has no data rows.' });
    }

    let arrvFixed = 0;
    let deptFixed = 0;
    let dpRows = 0;
    let woPhRows = 0;
    let spstNormalized = 0;

    for (const row of rows) {
      const spstKey = findKey(row, 'spst') || findKey(row, 'status');
      if (!spstKey) continue;

      const status = String(row[spstKey] || '').toUpperCase().trim();
      const normalizedStatus = normalizeStatus(status);

      // Normalize SPST column in the output
      if (normalizedStatus !== status) {
        row[spstKey] = normalizedStatus;
        spstNormalized++;
      }

      // Handle WO and PH: blank out ARRV and DEPT
      if (normalizedStatus === 'WO' || normalizedStatus === 'PH') {
        const arrvKey = findKey(row, 'arrv') || findKey(row, 'arrival') || findKey(row, 'entry');
        const deptKey = findDeptExitKey(row);

        if (arrvKey && row[arrvKey]) {
          row[arrvKey] = '';
          woPhRows++;
        }
        if (deptKey && row[deptKey]) {
          row[deptKey] = '';
          woPhRows++;
        }
        continue;
      }

      // Original DP processing logic
      if (status !== 'DP') continue;

      dpRows++;

      const shiftInKey = findKey(row, 'shiftin');
      const shiftOutKey = findKey(row, 'shiftout');
      const arrvKey = findKey(row, 'arrv') || findKey(row, 'arrival') || findKey(row, 'entry');
      const deptKey = findDeptExitKey(row);

      const shiftInMin = shiftInKey ? parseTimeToMinutes(row[shiftInKey]) : null;
      const shiftOutMin = shiftOutKey ? parseTimeToMinutes(row[shiftOutKey]) : null;
      const arrvMin = arrvKey ? parseTimeToMinutes(row[arrvKey]) : null;
      const deptMin = deptKey ? parseTimeToMinutes(row[deptKey]) : null;

      if (shiftInMin !== null && arrvMin !== null && arrvKey) {
        if (arrvMin - shiftInMin > LATE_THRESHOLD_MIN) {
          const newMin = shiftInMin + randInt(ARRV_RANDOM_OFFSET_RANGE[0], ARRV_RANDOM_OFFSET_RANGE[1]);
          row[arrvKey] = formatMinutesToTime(newMin);
          arrvFixed++;
        }
      }

      if (shiftOutMin !== null && deptMin !== null && deptKey) {
        if (deptMin - shiftOutMin > LATE_THRESHOLD_MIN) {
          const newMin = shiftOutMin + randInt(DEPT_RANDOM_OFFSET_RANGE[0], DEPT_RANDOM_OFFSET_RANGE[1]);
          row[deptKey] = formatMinutesToTime(newMin);
          deptFixed++;
        }
      }
    }

    const newSheet = XLSX.utils.json_to_sheet(rows);

    // Force Excel display formats for date/time columns
    const range = XLSX.utils.decode_range(newSheet['!ref']);

    for (let R = 1; R <= range.e.r; ++R) {
      // C = Join Date
      const joinDateCell = XLSX.utils.encode_cell({ r: R, c: 2 });
      if (newSheet[joinDateCell] && typeof newSheet[joinDateCell].v === 'number') {
        newSheet[joinDateCell].z = 'dd-mm-yyyy';
      }

      // G = Date
      const dateCell = XLSX.utils.encode_cell({ r: R, c: 6 });
      if (newSheet[dateCell] && typeof newSheet[dateCell].v === 'number') {
        newSheet[dateCell].z = 'dd-mm-yyyy';
      }

      // I = Shift In
      const shiftInCell = XLSX.utils.encode_cell({ r: R, c: 8 });
      if (newSheet[shiftInCell]) {
        newSheet[shiftInCell].z = 'hh:mm AM/PM';
      }

      // J = Shift Out
      const shiftOutCell = XLSX.utils.encode_cell({ r: R, c: 9 });
      if (newSheet[shiftOutCell]) {
        newSheet[shiftOutCell].z = 'hh:mm AM/PM';
      }

      // K = ARRV
      const arrvCell = XLSX.utils.encode_cell({ r: R, c: 10 });
      if (newSheet[arrvCell]) {
        newSheet[arrvCell].z = 'hh:mm AM/PM';
      }

      // L = DEPT
      const deptCell = XLSX.utils.encode_cell({ r: R, c: 11 });
      if (newSheet[deptCell]) {
        newSheet[deptCell].z = 'hh:mm AM/PM';
      }
    }

    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, sheetName);

    const buffer = XLSX.write(newWorkbook, {
      type: 'buffer',
      bookType: 'xlsx',
      cellStyles: true
    });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="RC_HR_Processed.xlsx"',
      'X-Process-Stats': JSON.stringify({ dpRows, arrvFixed, deptFixed, woPhRows }),
      'Access-Control-Expose-Headers': 'X-Process-Stats, Content-Disposition',
    });

    res.send(buffer);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


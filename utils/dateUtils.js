// Convert any stored date value into a real JS Date.
// Handles:
//   - Excel serial numbers (45930 → 02-01-2026), as number or string
//   - ISO strings ("2025-09-20")
//   - Slash strings ("9/20/2025")
// Returns null if it can't be parsed.
function parseStoredDate(val) {
  if (val === null || val === undefined || val === '') return null;

  // Excel serial date — number or numeric string > 1000
  if (!isNaN(val) && Number(val) > 1000) {
    const excelStart = new Date(1899, 11, 30); // Excel epoch (with the 1900 leap-year quirk)
    return new Date(excelStart.getTime() + Number(val) * 86400000);
  }

  // Try generic Date constructor
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d;
}

// "YYYY-MM-DD" — safe lexicographic comparison, no timezone shenanigans
function dateToYMD(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

module.exports = { parseStoredDate, dateToYMD };

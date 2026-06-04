const express = require('express');
const { getCollection } = require('../db');
const router  = express.Router();

const employeesCol = getCollection('employees');
const attendanceCol = getCollection('attendance');

router.get('/', async function(req, res) {
  try {
    // Total employees
    const empSnapshot = await employeesCol.get();
    const total = empSnapshot.size;

    // Latest attendance date
    const latestSnap = await attendanceCol.orderBy('date', 'desc').limit(1).get();
    const latestDate = latestSnap.empty ? '' : latestSnap.docs[0].data().date;

    // Present / absent counts for latestDate
    let present = 0, absent = 0;
    if (latestDate) {
      const presentSnap = await attendanceCol.where('date', '==', latestDate).where('status', 'in', ['DP','DP/ABS']).get();
      present = presentSnap.size;
      const absentSnap = await attendanceCol.where('date', '==', latestDate).where('status', 'in', ['ABS','ABS/DP']).get();
      absent = absentSnap.size;
    }

    // Total employees per department
    const deptTotals = {};
    empSnapshot.docs.forEach(d => {
      const dept = (d.data().department || '').trim();
      deptTotals[dept] = (deptTotals[dept] || 0) + 1;
    });

    // Present / absent per department on latestDate — join in JS
    const departments = {};
    // Initialize departments with totals
    Object.keys(deptTotals).forEach(function(dept) {
      departments[dept] = { total: deptTotals[dept], present: 0, absent: 0 };
    });
    if (latestDate) {
      const attSnap = await attendanceCol.where('date', '==', latestDate).get();
      const codes = attSnap.docs.map(d => d.data());
      const empMap = {};
      // build map of employee code -> department
      empSnapshot.docs.forEach(d => { empMap[d.data().code] = d.data().department || ''; });
      codes.forEach(r => {
        const dept = empMap[r.employee_code] || '';
        if (r.status === 'DP' || r.status === 'DP/ABS') departments[dept] = departments[dept] || { total: 0, present: 0, absent: 0 }, departments[dept].present++;
        if (r.status === 'ABS' || r.status === 'ABS/DP') departments[dept] = departments[dept] || { total: 0, present: 0, absent: 0 }, departments[dept].absent++;
      });
    }

    res.json({ total, present, absent, latestDate, departments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

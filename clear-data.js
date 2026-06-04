require('dotenv').config();
const { getCollection } = require('./db');

async function clearData() {
  try {
    console.log('Connecting to Firestore...');
    const employeesCol = getCollection('employees');
    const attendanceCol = getCollection('attendance');

    const attSnap = await attendanceCol.get();
    let attDeleted = 0;
    const delA = [];
    attSnap.docs.forEach(d => { delA.push(attendanceCol.doc(d.id).delete()); attDeleted++; });
    await Promise.all(delA);
    console.log(`✓ Deleted ${attDeleted} attendance records`);

    const empSnap = await employeesCol.get();
    let empDeleted = 0;
    const delE = [];
    empSnap.docs.forEach(d => { delE.push(employeesCol.doc(d.id).delete()); empDeleted++; });
    await Promise.all(delE);
    console.log(`✓ Deleted ${empDeleted} employees`);

    console.log(`\n✓ Firestore cleared successfully!`);
    process.exit(0);
  } catch (err) {
    console.error('Error clearing Firestore:', err);
    process.exit(1);
  }
}

clearData();

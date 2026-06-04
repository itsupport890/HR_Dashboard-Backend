require('dotenv').config();
// Firestore compatibility helpers
const { db } = require('./firestore');

function getCollection(name) {
  return db.collection(name);
}

module.exports = { db, getCollection };

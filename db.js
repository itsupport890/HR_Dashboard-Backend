require('dotenv').config();
// Prefer the lightweight @google-cloud/firestore client when available (Cloud Run / ADC).
let db;
try {
  const { Firestore } = require('@google-cloud/firestore');
  // No constructor args needed when running on Cloud Run with attached service account
  db = new Firestore();
  console.log('Using @google-cloud/firestore client (ADC)');
} catch (err) {
  // Fallback to firebase-admin based initialization
  const firestoreModule = require('./firestore');
  db = firestoreModule.db;
  console.log('Using firebase-admin Firestore client (fallback)');
}

function getCollection(name) {
  return db.collection(name);
}

module.exports = { db, getCollection };

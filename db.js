require('dotenv').config();
// Prefer the lightweight @google-cloud/firestore client when available (Cloud Run / ADC).
let db;
try {
  // Only prefer @google-cloud/firestore when Application Default Credentials
  // are likely available (Cloud Run / GCE). Check common indicators.
  const adcLikely = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GCLOUD_PROJECT ||
    process.env.K_SERVICE ||
    process.env.GAE_SERVICE ||
    process.env.FUNCTION_NAME
  );

  if (!adcLikely) throw new Error('ADC not detected, falling back to firebase-admin');

  const { Firestore } = require('@google-cloud/firestore');
  // Prefer explicit options so we can target a named database
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || process.env.PROJECT_ID || 'hr-dashboard-backend';
  const databaseId = process.env.DATABASE_ID || process.env.FIRESTORE_DATABASE || 'hr-dashboard';
  db = new Firestore({ projectId, databaseId });
  console.log('Using @google-cloud/firestore client', { projectId, databaseId });
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

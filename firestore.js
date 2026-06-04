// Firestore initialization helper
const admin = require('firebase-admin');
const fs = require('fs');

function initFirebase() {
  if (admin.apps && admin.apps.length > 0) return admin;

  // Prefer explicit service account JSON provided via env var
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('Initialized Firebase Admin from FIREBASE_SERVICE_ACCOUNT env var');
      return admin;
    } catch (err) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
      throw err;
    }
  }

  // If GOOGLE_APPLICATION_CREDENTIALS is set to a path, let the SDK pick it up
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    admin.initializeApp();
    console.log('Initialized Firebase Admin using GOOGLE_APPLICATION_CREDENTIALS');
    return admin;
  }

  // Fallback to default application credentials (development environments)
  try {
    admin.initializeApp();
    console.log('Initialized Firebase Admin with default credentials');
    return admin;
  } catch (err) {
    console.error('Failed to initialize Firebase Admin:', err);
    throw err;
  }
}

const firebaseAdmin = initFirebase();
const db = firebaseAdmin.firestore();

module.exports = { admin: firebaseAdmin, db };

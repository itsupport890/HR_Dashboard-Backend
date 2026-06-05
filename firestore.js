// Firestore initialization helper
const admin = require('firebase-admin');
const fs = require('fs');
const serviceKey = require('./serviceAccountKey.json');

function initFirebase() {
  if (admin.apps && admin.apps.length > 0) return admin;
  

  // Prefer explicit service account JSON provided via env var or local file
  if (serviceKey) {
    try {
      const parsedKey = typeof serviceKey === 'string' ? JSON.parse(serviceKey) : serviceKey;
      console.log('Initializing Firebase Admin with project_id:', parsedKey.project_id || '<unknown>');
      // Explicitly set projectId to avoid ambiguity
      admin.initializeApp({ credential: admin.credential.cert(parsedKey), projectId: parsedKey.project_id });
      console.log('Initialized Firebase Admin from serviceAccountKey.json');
      return admin;
    } catch (err) {
      console.error('Failed to parse serviceAccountKey.json or FIREBASE_SERVICE_ACCOUNT:', err);
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
let db;
try {
  db = firebaseAdmin.firestore();

  // Allow explicit Firestore database name via env vars. Default to 'hr-dashboard' if not provided.
  const dbName = process.env.FIRESTORE_DATABASE || process.env.DB_NAME || 'hr-dashboard';
  // Attempt to set Firestore client settings with the chosen databaseId (no-op if unsupported by client version).
  try {
    const projectId = (firebaseAdmin.app && firebaseAdmin.app().options && firebaseAdmin.app().options.projectId) || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || null;
    db.settings({ projectId: projectId || undefined, databaseId: dbName });
    console.log('Configured Firestore client with', { projectId: projectId || '<auto>', databaseId: dbName });
  } catch (sErr) {
    console.warn('Could not apply Firestore settings (client may not support databaseId):', sErr && sErr.message ? sErr.message : sErr);
  }

} catch (err) {
  console.error('Failed to initialize Firestore client. Common causes: Firestore not enabled for project, or project is in Datastore mode.');
  console.error('Admin app options:', firebaseAdmin && firebaseAdmin.app && firebaseAdmin.app().options);
  throw err;
}

module.exports = { admin: firebaseAdmin, db };

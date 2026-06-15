import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { getAuth, Auth } from 'firebase-admin/auth'

let _db: Firestore | null = null
let _auth: Auth | null = null

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY')
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(getAdminApp())
  return _db
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getAdminApp())
  return _auth
}

// Convenience aliases — only initialized on first access (inside a request handler)
export { getAdminDb as adminDb, getAdminAuth as adminAuth }

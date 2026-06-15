'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { User } from '@/lib/types'
import { toInternalEmail } from '@/lib/utils'

interface AuthContextType {
  user: User | null
  firebaseUser: FirebaseUser | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser)
      if (fbUser) {
        const snap = await getDoc(doc(db, 'users', fbUser.uid))
        if (snap.exists()) {
          const userData = { uid: fbUser.uid, ...snap.data() } as User
          setUser(userData)
          document.cookie = `user-uid=${fbUser.uid}; path=/; max-age=86400`
          document.cookie = `user-role=${userData.role}; path=/; max-age=86400`
        }
      } else {
        setUser(null)
        document.cookie = 'user-uid=; path=/; max-age=0'
        document.cookie = 'user-role=; path=/; max-age=0'
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const signIn = async (username: string, password: string) => {
    const email = toInternalEmail(username)
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
    setUser(null)
    setFirebaseUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

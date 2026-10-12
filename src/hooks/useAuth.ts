import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import type { Resident } from '../types';

export interface AuthState {
  loading: boolean;
  user: User | null;
  resident: Resident | null;
  isAdmin: boolean;
}

/**
 * Combina el usuario de Firebase Auth con su documento `residents/{uid}`.
 * El rol (resident/admin) vive en ese documento, no en el token, así que la
 * fuente de verdad para la UI (mostrar/ocultar la sección Admin) y para las
 * Firestore rules es la misma: el documento del residente.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [resident, setResident] = useState<Resident | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [residentLoading, setResidentLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) {
        setResident(null);
        setResidentLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    setResidentLoading(true);
    const unsub = onSnapshot(doc(db, 'residents', user.uid), (snap) => {
      setResident(snap.exists() ? ({ id: snap.id, ...snap.data() } as Resident) : null);
      setResidentLoading(false);
    });
    return unsub;
  }, [user]);

  return {
    loading: authLoading || (!!user && residentLoading),
    user,
    resident,
    isAdmin: resident?.role === 'admin',
  };
}

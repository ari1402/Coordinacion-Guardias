import {
  collection,
  onSnapshot,
  query,
  type QueryConstraint,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

export interface CollectionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

/** Suscripción en tiempo real a una colección de Firestore, tipada. */
export function useCollection<T>(
  path: string,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = [],
): CollectionState<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, path), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return { data, loading, error };
}

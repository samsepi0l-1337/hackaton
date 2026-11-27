import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/client';

export interface AsyncState<T> {
  data: T | null;
  error: ApiClientError | null;
  loading: boolean;
  reload: () => void;
  setData: (d: T | null) => void;
}

/** deps 가 바뀌면 다시 불러온다. 이전 요청의 늦은 응답은 버린다. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    fnRef.current().then(
      (d) => { if (my === seq.current) { setData(d); setLoading(false); } },
      (e) => { if (my === seq.current) { setError(e as ApiClientError); setLoading(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

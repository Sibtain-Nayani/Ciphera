import { useEffect, useState } from "react";
import { getEntities } from "../lib/api/presidio";

export function usePresidioEntities({ auto = true } = {}) {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(auto);
  const [error, setError] = useState(null);

  const fetchEntities = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const entities = await getEntities();
      setData(entities);
    } catch (err) {
      setError(err?.detail || err?.error || err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (auto) {
      fetchEntities();
    }
  }, [auto]);

  return { data, isLoading, error, refresh: fetchEntities };
}

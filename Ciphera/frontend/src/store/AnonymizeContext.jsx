import { createContext, useContext, useMemo, useState } from "react";

const AnonymizeContext = createContext({
  jobs: [],
  addJob: () => {},
});

export function AnonymizeProvider({ children }) {
  const [jobs, setJobs] = useState([]);

  const addJob = (job) => {
    setJobs((prev) => {
      const entry = {
        id: job.id ?? (crypto.randomUUID?.() ?? String(Date.now())),
        createdAt: job.createdAt ?? new Date().toISOString(),
        ...job,
      };
      return [entry, ...prev].slice(0, 25);
    });
  };

  const value = useMemo(() => ({ jobs, addJob }), [jobs]);

  return <AnonymizeContext.Provider value={value}>{children}</AnonymizeContext.Provider>;
}

export const useAnonymizeLog = () => useContext(AnonymizeContext);

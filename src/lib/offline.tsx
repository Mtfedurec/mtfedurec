import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "maydan.pending.v1";

export type PendingJob = {
  id: string;
  table: string;
  rows: Record<string, unknown>[];
  onConflict: string;
  label: string;
  queuedAt: string;
};

export type SyncState = "idle" | "syncing" | "offline" | "failed";

type SyncContextValue = {
  online: boolean;
  state: SyncState;
  pending: PendingJob[];
  statusLabel: string;
  save: (job: Omit<PendingJob, "id" | "queuedAt">) => Promise<"synced" | "queued">;
  flush: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

function readQueue(): PendingJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingJob[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(jobs: PendingJob[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [state, setState] = useState<SyncState>("idle");
  const flushing = useRef(false);

  useEffect(() => {
    setPending(readQueue());
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const push = useCallback((job: PendingJob) => {
    setPending((current) => {
      const next = [...current, job];
      writeQueue(next);
      return next;
    });
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const jobs = readQueue();
    if (jobs.length === 0) {
      setState("idle");
      return;
    }
    flushing.current = true;
    setState("syncing");
    const remaining: PendingJob[] = [];
    let synced = 0;
    for (const job of jobs) {
      const { error } = await supabase
        .from(job.table as never)
        .upsert(job.rows as never, { onConflict: job.onConflict });
      if (error) remaining.push(job);
      else synced += 1;
    }
    writeQueue(remaining);
    setPending(remaining);
    flushing.current = false;
    if (remaining.length > 0) {
      setState("failed");
    } else {
      setState("idle");
      if (synced > 0) toast.success(`All changes synced (${synced})`);
    }
  }, []);

  useEffect(() => {
    if (!online) {
      setState("offline");
      return;
    }
    void flush();
    const interval = window.setInterval(() => void flush(), 30000);
    return () => window.clearInterval(interval);
  }, [online, flush]);

  const save = useCallback<SyncContextValue["save"]>(
    async (job) => {
      const entry: PendingJob = {
        ...job,
        id: crypto.randomUUID(),
        queuedAt: new Date().toISOString(),
      };
      if (!navigator.onLine) {
        push(entry);
        toast.info("Offline — changes saved locally");
        return "queued";
      }
      setState("syncing");
      const { error } = await supabase
        .from(entry.table as never)
        .upsert(entry.rows as never, { onConflict: entry.onConflict });
      if (error) {
        push(entry);
        setState("failed");
        toast.error("Could not reach the server — saved locally, will retry");
        return "queued";
      }
      setState("idle");
      return "synced";
    },
    [push],
  );

  const statusLabel = useMemo(() => {
    if (!online) return `Offline — ${pending.length} change(s) saved locally`;
    if (state === "syncing") return "Synchronizing…";
    if (state === "failed") return "Synchronization failed. Retry.";
    if (pending.length > 0) return `${pending.length} change(s) pending`;
    return "All changes synced";
  }, [online, state, pending.length]);

  const value = useMemo(
    () => ({ online, state, pending, statusLabel, save, flush }),
    [online, state, pending, statusLabel, save, flush],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}
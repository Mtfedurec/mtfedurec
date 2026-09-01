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
import Dexie, { type Table } from "dexie";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/* =========================================================
 * TYPES
 * ========================================================= */

export type PendingJob = {
  id: string;
  table: string;
  rows: Record<string, unknown>[];
  onConflict: string;
  label: string;
  queuedAt: string;
};

export type SyncState = "idle" | "syncing" | "offline" | "failed";

type SaveResult = "synced" | "queued";

type SyncContextValue = {
  online: boolean;
  state: SyncState;
  pending: PendingJob[];
  statusLabel: string;

  save: (job: Omit<PendingJob, "id" | "queuedAt">) => Promise<SaveResult>;

  flush: () => Promise<void>;
};

/* =========================================================
 * SAFE ID GENERATOR
 * =========================================================
 *
 * Do NOT depend on crypto.randomUUID().
 *
 * Some browsers / WebViews / older environments do not
 * provide crypto.randomUUID().
 *
 * This function uses randomUUID when available and safely
 * falls back to a generated ID when it is not.
 * ========================================================= */

function createJobId(): string {
  if (typeof globalThis !== "undefined" && "crypto" in globalThis) {
    const cryptoObject = globalThis.crypto;

    if (typeof cryptoObject?.randomUUID === "function") {
      return cryptoObject.randomUUID();
    }

    if (typeof cryptoObject?.getRandomValues === "function") {
      const bytes = new Uint8Array(16);

      cryptoObject.getRandomValues(bytes);

      /*
       * RFC 4122-style UUID v4 formatting.
       */
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;

      bytes[8] = (bytes[8]! & 0x3f) | 0x80;

      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
      ].join("-");
    }
  }

  /*
   * Final fallback for environments with no Web Crypto.
   *
   * This is sufficient for the local IndexedDB queue ID.
   * It does NOT become a database record ID.
   */
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join("-");
}

/* =========================================================
 * ERROR MESSAGE
 * ========================================================= */

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const possibleError = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const message = typeof possibleError.message === "string" ? possibleError.message : "";

    const details = typeof possibleError.details === "string" ? possibleError.details : "";

    const hint = typeof possibleError.hint === "string" ? possibleError.hint : "";

    const code = typeof possibleError.code === "string" ? possibleError.code : "";

    const parts = [message, details, hint, code ? `Code: ${code}` : ""].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" — ");
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

/* =========================================================
 * PERMANENT FAILURE DETECTION
 * =========================================================
 *
 * Some errors are permanent and can never succeed by retrying:
 *
 *  - Row-level-security policy violations (the attendance
 *    "today only" INSERT/UPDATE lock). A queued job that targets
 *    a date which has already passed will be rejected by the
 *    database every single time, so it must not be retried
 *    forever.
 *
 * Transient errors (network, timeout, auth expiry) keep the job
 * in the local queue so it can retry later.
 */
function isPermanentPolicyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const e = error as { code?: string; message?: string; details?: string; hint?: string };

  const blob = [e.message, e.details, e.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    e.code === "42501" ||
    blob.includes("row-level security") ||
    blob.includes("violates row-level security")
  );
}

/* =========================================================
 * DEXIE DATABASE
 * ========================================================= */

class MayDanOfflineDatabase extends Dexie {
  pendingJobs!: Table<PendingJob, string>;

  constructor() {
    super("maydan-edurecord");

    this.version(1).stores({
      pendingJobs: "id, queuedAt, table",
    });
  }
}

const offlineDb = new MayDanOfflineDatabase();

/* =========================================================
 * CONTEXT
 * ========================================================= */

const SyncContext = createContext<SyncContextValue | null>(null);

/* =========================================================
 * DEXIE HELPERS
 * ========================================================= */

async function readQueue(): Promise<PendingJob[]> {
  try {
    return await offlineDb.pendingJobs.orderBy("queuedAt").toArray();
  } catch (error) {
    console.error("Unable to read offline queue:", error);

    return [];
  }
}

async function addJob(job: PendingJob): Promise<void> {
  await offlineDb.pendingJobs.put(job);
}

async function deleteJob(jobId: string): Promise<void> {
  await offlineDb.pendingJobs.delete(jobId);
}

/* =========================================================
 * PROVIDER
 * ========================================================= */

export function SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") {
      return true;
    }

    return navigator.onLine;
  });

  const [pending, setPending] = useState<PendingJob[]>([]);

  const [state, setState] = useState<SyncState>("idle");

  const flushing = useRef(false);

  /* =======================================================
   * LOAD LOCAL QUEUE
   * ======================================================= */

  const refreshPending = useCallback(async () => {
    const jobs = await readQueue();

    setPending(jobs);

    return jobs;
  }, []);

  /* =======================================================
   * INITIALIZATION
   * ======================================================= */

  useEffect(() => {
    void refreshPending();

    if (typeof navigator !== "undefined") {
      setOnline(navigator.onLine);
    }

    const handleOnline = () => {
      setOnline(true);
    };

    const handleOffline = () => {
      setOnline(false);
      setState("offline");
    };

    /*
     * Explicitly use window from the browser
     * environment only.
     *
     * This avoids TypeScript complaining that
     * window may be undefined.
     */
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);

      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);

        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [refreshPending]);

  /* =======================================================
   * PUSH JOB
   * ======================================================= */

  const push = useCallback(
    async (job: PendingJob) => {
      await addJob(job);
      await refreshPending();
    },
    [refreshPending],
  );

  /* =======================================================
   * REMOVE JOB
   * ======================================================= */

  const removeJob = useCallback(
    async (jobId: string) => {
      await deleteJob(jobId);
      await refreshPending();
    },
    [refreshPending],
  );

  /* =======================================================
   * FLUSH QUEUE
   * ======================================================= */

  const flush = useCallback(async () => {
    if (flushing.current) {
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOnline(false);
      setState("offline");
      return;
    }

    const jobs = await readQueue();

    setPending(jobs);

    if (jobs.length === 0) {
      setState("idle");
      return;
    }

    flushing.current = true;
    setState("syncing");

    let successful = 0;
    let failed = 0;

    try {
      for (const job of jobs) {
        try {
          /*
           * Use the locally persisted Supabase
           * session.
           */
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            throw sessionError;
          }

          if (!sessionData.session) {
            throw new Error("Your login session has expired. Please sign in again.");
          }

          /*
           * Upload queued records.
           */
          const { error } = await supabase.from(job.table as never).upsert(job.rows as never, {
            onConflict: job.onConflict,
          });

          if (error) {
            throw error;
          }

          /*
           * Only remove the job after Supabase
           * confirms success.
           */
          await removeJob(job.id);

          successful += 1;
        } catch (error) {
          /*
           * Permanent failures (RLS policy denials such as the
           * attendance "today only" lock) can never succeed by
           * retrying. Remove them from the queue and surface a
           * clear, non-retriable error so the user is not told
           * the record "saved" when it was in fact rejected.
           */
          if (isPermanentPolicyError(error)) {
            await removeJob(job.id);

            console.error(`Permanent rejection for ${job.label}:`, error);

            toast.error(
              `${job.label} could not be saved — this record was rejected by a database policy and will not be retried.`,
            );

            failed += 1;
          } else {
            failed += 1;

            console.error(`Offline sync failed for ${job.label}:`, error);

            /*
             * Transient failures remain in IndexedDB so they
             * can retry on the next flush cycle.
             */
          }
        }
      }
    } finally {
      flushing.current = false;
    }

    const remaining = await readQueue();

    setPending(remaining);

    if (failed > 0) {
      setState("failed");

      /*
       * Report the actual error from the first
       * remaining failed job.
       */
      const failedJob = jobs.find((job) =>
        remaining.some((remainingJob) => remainingJob.id === job.id),
      );

      if (failedJob) {
        try {
          const { error } = await supabase
            .from(failedJob.table as never)
            .upsert(failedJob.rows as never, {
              onConflict: failedJob.onConflict,
            });

          if (error) {
            toast.error(`${failedJob.label} sync failed: ${getErrorMessage(error)}`);
          }
        } catch (error) {
          toast.error(`${failedJob.label} sync failed: ${getErrorMessage(error)}`);
        }
      }

      return;
    }

    setState("idle");

    if (successful > 0) {
      toast.success(`All changes synced (${successful})`);
    }
  }, [removeJob]);

  /* =======================================================
   * AUTOMATIC SYNCHRONIZATION
   * ======================================================= */

  useEffect(() => {
    if (!online) {
      setState("offline");
      return;
    }

    void flush();

    if (typeof window === "undefined") {
      return;
    }

    const interval = window.setInterval(() => {
      void flush();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [online, flush]);

  /* =======================================================
   * SAVE
   * ======================================================= */

  const save = useCallback<SyncContextValue["save"]>(
    async (job) => {
      /*
       * IMPORTANT:
       *
       * Never use crypto.randomUUID()
       * directly here.
       *
       * createJobId() handles browsers where
       * randomUUID is unavailable.
       */
      const entry: PendingJob = {
        ...job,
        id: createJobId(),
        queuedAt: new Date().toISOString(),
      };

      /* =================================================
       * OFFLINE
       * ================================================= */

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await push(entry);

        setState("offline");

        toast.info(`${job.label} saved on this device. It will sync when you are online.`);

        return "queued";
      }

      /* =================================================
       * ONLINE
       * ================================================= */

      setState("syncing");

      try {
        /*
         * Check locally persisted Supabase session.
         */
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!sessionData.session) {
          throw new Error("Your login session has expired. Please sign in again.");
        }

        /*
         * Upload immediately.
         */
        const { error } = await supabase.from(entry.table as never).upsert(entry.rows as never, {
          onConflict: entry.onConflict,
        });

        if (error) {
          throw error;
        }

        setState("idle");

        return "synced";
      } catch (error) {
        /*
         * Do not lose data when an online upload
         * fails unexpectedly.
         *
         * Save the job locally so it can retry.
         */
        console.error(`Save failed for ${job.label}:`, error);

        try {
          await push(entry);
        } catch (queueError) {
          console.error("Unable to save failed job to local queue:", queueError);
        }

        setState("failed");

        const message = getErrorMessage(error);

        toast.error(`${job.label} could not be uploaded. Saved locally instead. ${message}`);

        return "queued";
      }
    },
    [push],
  );

  /* =======================================================
   * STATUS LABEL
   * ======================================================= */

  const statusLabel = useMemo(() => {
    if (!online) {
      return `Offline — ${pending.length} change(s) saved locally`;
    }

    if (state === "syncing") {
      return "Synchronizing…";
    }

    if (state === "failed") {
      return pending.length > 0
        ? `${pending.length} change(s) waiting to sync`
        : "Synchronization failed. Retry.";
    }

    if (pending.length > 0) {
      return `${pending.length} change(s) pending`;
    }

    return "All changes synced";
  }, [online, state, pending.length]);

  /* =======================================================
   * CONTEXT VALUE
   * ======================================================= */

  const value = useMemo(
    () => ({
      online,
      state,
      pending,
      statusLabel,
      save,
      flush,
    }),
    [online, state, pending, statusLabel, save, flush],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/* =========================================================
 * HOOK
 * ========================================================= */

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);

  if (!ctx) {
    throw new Error("useSync must be used inside SyncProvider");
  }

  return ctx;
}

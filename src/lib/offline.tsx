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
import Dexie, {
  type Table,
} from "dexie";
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

export type SyncState =
  | "idle"
  | "syncing"
  | "offline"
  | "failed";

type SaveResult =
  | "synced"
  | "queued";

type SyncContextValue = {
  online: boolean;
  state: SyncState;
  pending: PendingJob[];
  statusLabel: string;
  save: (
    job: Omit<
      PendingJob,
      "id" | "queuedAt"
    >,
  ) => Promise<SaveResult>;
  flush: () => Promise<void>;
};

/* =========================================================
 * DEXIE DATABASE
 * ========================================================= */

class MayDanOfflineDatabase extends Dexie {
  pendingJobs!: Table<
    PendingJob,
    string
  >;

  constructor() {
    super("maydan-edurecord");

    this.version(1).stores({
      pendingJobs: "id, queuedAt, table",
    });
  }
}

const offlineDb =
  new MayDanOfflineDatabase();

/* =========================================================
 * CONTEXT
 * ========================================================= */

const SyncContext =
  createContext<SyncContextValue | null>(
    null,
  );

/* =========================================================
 * ERROR MESSAGE
 * ========================================================= */

function getErrorMessage(
  error: unknown,
): string {
  if (
    error &&
    typeof error === "object"
  ) {
    const possibleError =
      error as {
        message?: unknown;
        details?: unknown;
        hint?: unknown;
        code?: unknown;
      };

    const message =
      typeof possibleError.message ===
      "string"
        ? possibleError.message
        : "";

    const details =
      typeof possibleError.details ===
      "string"
        ? possibleError.details
        : "";

    const hint =
      typeof possibleError.hint ===
      "string"
        ? possibleError.hint
        : "";

    const code =
      typeof possibleError.code ===
      "string"
        ? possibleError.code
        : "";

    const parts = [
      message,
      details,
      hint,
      code
        ? `Code: ${code}`
        : "",
    ].filter(Boolean);

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
 * DEXIE HELPERS
 * ========================================================= */

async function readQueue(): Promise<
  PendingJob[]
> {
  try {
    return await offlineDb.pendingJobs
      .orderBy("queuedAt")
      .toArray();
  } catch (error) {
    console.error(
      "Unable to read offline queue:",
      error,
    );

    return [];
  }
}

async function addJob(
  job: PendingJob,
): Promise<void> {
  await offlineDb.pendingJobs.put(job);
}

async function removeJob(
  jobId: string,
): Promise<void> {
  await offlineDb.pendingJobs.delete(
    jobId,
  );
}

/* =========================================================
 * PROVIDER
 * ========================================================= */

export function SyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [online, setOnline] =
    useState<boolean>(() => {
      if (
        typeof navigator ===
        "undefined"
      ) {
        return true;
      }

      return navigator.onLine;
    });

  const [pending, setPending] =
    useState<PendingJob[]>([]);

  const [state, setState] =
    useState<SyncState>("idle");

  const flushing =
    useRef(false);

  /* =======================================================
   * LOAD LOCAL QUEUE
   * ======================================================= */

  const refreshPending =
    useCallback(async () => {
      const jobs =
        await readQueue();

      setPending(jobs);

      return jobs;
    }, []);

  /* =======================================================
   * INITIALIZATION
   * ======================================================= */

  useEffect(() => {
    void refreshPending();

    if (
      typeof navigator !==
      "undefined"
    ) {
      setOnline(
        navigator.onLine,
      );
    }

    const handleOnline = () => {
      setOnline(true);
    };

    const handleOffline = () => {
      setOnline(false);
      setState("offline");
    };

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "offline",
      handleOffline,
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline,
      );

      window.removeEventListener(
        "offline",
        handleOffline,
      );
    };
  }, [refreshPending]);

  /* =======================================================
   * ADD JOB
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

  const removeJob =
    useCallback(
      async (jobId: string) => {
        await removeJobFromDatabase(
          jobId,
        );

        await refreshPending();
      },
      [refreshPending],
    );

  /* =======================================================
   * SYNC QUEUE
   * ======================================================= */

  const flush =
    useCallback(async () => {
      if (flushing.current) {
        return;
      }

      if (
        typeof navigator !==
          "undefined" &&
        !navigator.onLine
      ) {
        setOnline(false);
        setState("offline");
        return;
      }

      const jobs =
        await readQueue();

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
             * Read the locally persisted Supabase
             * session. This does not require getUser().
             */
            const {
              data: sessionData,
              error:
                sessionError,
            } =
              await supabase.auth.getSession();

            if (sessionError) {
              throw sessionError;
            }

            if (
              !sessionData.session
            ) {
              throw new Error(
                "Your login session has expired. Please sign in again.",
              );
            }

            /*
             * Upload the queued records.
             */
            const {
              error,
            } = await supabase
              .from(
                job.table as never,
              )
              .upsert(
                job.rows as never,
                {
                  onConflict:
                    job.onConflict,
                },
              );

            if (error) {
              throw error;
            }

            /*
             * Upload succeeded.
             * It is now safe to delete the
             * local copy.
             */
            await removeJob(
              job.id,
            );

            successful += 1;
          } catch (error) {
            failed += 1;

            console.error(
              `Offline sync failed for ${job.label}:`,
              error,
            );

            /*
             * IMPORTANT:
             * Do NOT delete failed jobs.
             */
          }
        }
      } finally {
        flushing.current =
          false;
      }

      const remaining =
        await readQueue();

      setPending(remaining);

      if (failed > 0) {
        setState("failed");

        /*
         * Find the first failed job and
         * report the actual Supabase error.
         */
        const failedJob =
          jobs.find((job) =>
            remaining.some(
              (remainingJob) =>
                remainingJob.id ===
                job.id,
            ),
          );

        if (failedJob) {
          try {
            const {
              error,
            } = await supabase
              .from(
                failedJob.table as never,
              )
              .upsert(
                failedJob.rows as never,
                {
                  onConflict:
                    failedJob.onConflict,
                },
              );

            if (error) {
              toast.error(
                `${failedJob.label} sync failed: ${getErrorMessage(
                  error,
                )}`,
              );
            }
          } catch (error) {
            toast.error(
              `${failedJob.label} sync failed: ${getErrorMessage(
                error,
              )}`,
            );
          }
        }

        return;
      }

      setState("idle");

      if (successful > 0) {
        toast.success(
          `All changes synced (${successful})`,
        );
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

    const interval =
      window.setInterval(
        () => {
          void flush();
        },
        30000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, [online, flush]);

  /* =======================================================
   * SAVE
   * ======================================================= */

  const save =
    useCallback<
      SyncContextValue["save"]
    >(
      async (job) => {
        const entry: PendingJob =
          {
            ...job,
            id: crypto.randomUUID(),
            queuedAt:
              new Date().toISOString(),
          };

        /*
         * ---------------------------------------------------
         * OFFLINE
         * ---------------------------------------------------
         */

        if (
          typeof navigator !==
            "undefined" &&
          !navigator.onLine
        ) {
          await push(entry);

          setState("offline");

          toast.info(
            `${job.label} saved on this device. It will sync when you are online.`,
          );

          return "queued";
        }

        /*
         * ---------------------------------------------------
         * ONLINE
         * ---------------------------------------------------
         */

        setState("syncing");

        try {
          /*
           * Check locally persisted Supabase session.
           */
          const {
            data: sessionData,
            error:
              sessionError,
          } =
            await supabase.auth.getSession();

          if (sessionError) {
            throw sessionError;
          }

          if (
            !sessionData.session
          ) {
            throw new Error(
              "Your login session has expired. Please sign in again.",
            );
          }

          /*
           * Try immediate upload.
           */
          const {
            error,
          } = await supabase
            .from(
              entry.table as never,
            )
            .upsert(
              entry.rows as never,
              {
                onConflict:
                  entry.onConflict,
              },
            );

          if (error) {
            throw error;
          }

          setState("idle");

          return "synced";
        } catch (error) {
          /*
           * Network/database failure while
           * online must NOT lose the data.
           *
           * Put it into IndexedDB instead.
           */
          console.error(
            `Save failed for ${job.label}:`,
            error,
          );

          await push(entry);

          setState("failed");

          const message =
            getErrorMessage(
              error,
            );

          toast.error(
            `${job.label} could not be uploaded. Saved locally instead. ${message}`,
          );

          return "queued";
        }
      },
      [push],
    );

  /* =======================================================
   * STATUS LABEL
   * ======================================================= */

  const statusLabel =
    useMemo(() => {
      if (!online) {
        return `Offline — ${pending.length} change(s) saved locally`;
      }

      if (
        state === "syncing"
      ) {
        return "Synchronizing…";
      }

      if (
        state === "failed"
      ) {
        return pending.length > 0
          ? `${pending.length} change(s) waiting to sync`
          : "Synchronization failed. Retry.";
      }

      if (
        pending.length > 0
      ) {
        return `${pending.length} change(s) pending`;
      }

      return "All changes synced";
    }, [
      online,
      state,
      pending.length,
    ]);

  /* =======================================================
   * CONTEXT
   * ======================================================= */

  const value =
    useMemo(
      () => ({
        online,
        state,
        pending,
        statusLabel,
        save,
        flush,
      }),
      [
        online,
        state,
        pending,
        statusLabel,
        save,
        flush,
      ],
    );

  return (
    <SyncContext.Provider
      value={value}
    >
      {children}
    </SyncContext.Provider>
  );
}

/* =========================================================
 * DATABASE REMOVE HELPER
 * ========================================================= */

async function removeJobFromDatabase(
  jobId: string,
) {
  await offlineDb.pendingJobs.delete(
    jobId,
  );
}

/* =========================================================
 * HOOK
 * ========================================================= */

export function useSync(): SyncContextValue {
  const ctx =
    useContext(
      SyncContext,
    );

  if (!ctx) {
    throw new Error(
      "useSync must be used inside SyncProvider",
    );
  }

  return ctx;
}
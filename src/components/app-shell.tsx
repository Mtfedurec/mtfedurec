import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSchool } from "@/lib/data";
import { useSync } from "@/lib/offline";
import { initials } from "@/lib/academic";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UserRole =
  | "admin"
  | "head_teacher"
  | "teacher";

type NavItem = {
  to:
    | "/dashboard"
    | "/attendance"
    | "/assessment"
    | "/behaviour"
    | "/reports"
    | "/students"
    | "/classes"
    | "/approvals"
    | "/audit"
    | "/settings";
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
};

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "head_teacher", "teacher"],
  },
  {
    to: "/attendance",
    label: "Attendance",
    icon: CalendarCheck,
    roles: ["admin", "head_teacher", "teacher"],
  },
  {
    to: "/assessment",
    label: "Assessment",
    icon: ClipboardList,
    roles: ["admin", "head_teacher", "teacher"],
  },
  {
    to: "/behaviour",
    label: "Behaviour",
    icon: Heart,
    roles: ["admin", "head_teacher", "teacher"],
  },
  {
    to: "/reports",
    label: "Report cards",
    icon: FileText,
    roles: ["admin", "head_teacher", "teacher"],
  },
  {
    to: "/students",
    label: "Students",
    icon: Users,
    roles: ["admin", "head_teacher"],
  },
  {
    to: "/classes",
    label: "Classes & subjects",
    icon: GraduationCap,
    roles: ["admin", "head_teacher", "teacher"],
  },
  {
    to: "/approvals",
    label: "Approvals",
    icon: ShieldCheck,
    roles: ["admin", "head_teacher"],
  },
  {
    to: "/audit",
    label: "Audit log",
    icon: ScrollText,
    roles: ["admin"],
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    roles: ["admin"],
  },
];

function getPrimaryRole(
  roles: string[] | undefined,
): UserRole {
  if (!roles || roles.length === 0) {
    return "teacher";
  }

  if (roles.includes("admin")) {
    return "admin";
  }

  if (roles.includes("head_teacher")) {
    return "head_teacher";
  }

  return "teacher";
}

function roleLabel(
  role: UserRole,
): string {
  switch (role) {
    case "admin":
      return "Administrator";

    case "head_teacher":
      return "Head Teacher";

    default:
      return "Teacher";
  }
}

function SyncBadge() {
  const {
    online,
    state,
    statusLabel,
    flush,
  } = useSync();

  const Icon =
    !online
      ? WifiOff
      : state === "syncing"
        ? RefreshCw
        : Wifi;

  return (
    <button
      type="button"
      onClick={() => void flush()}
      title="Click to synchronize pending changes"
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        !online
          ? "border-warning/40 bg-warning/15 text-warning-foreground"
          : state === "failed"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-success/30 bg-success/10 text-success",
      )}
    >
      <Icon
        className={cn(
          "size-3.5",
          state === "syncing" &&
            "animate-spin",
        )}
      />

      {statusLabel}
    </button>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const {
    data: profile,
  } = useProfile();

  const {
    data: school,
  } = useSchool();

  const navigate =
    useNavigate();

  const queryClient =
    useQueryClient();

  const [open, setOpen] =
    useState(false);

  const pathname =
    useRouterState({
      select: (s) =>
        s.location.pathname,
    });

  /*
   * ---------------------------------------------------------
   * DETERMINE CURRENT USER ROLE
   * ---------------------------------------------------------
   */

  const currentRole =
    useMemo(
      () =>
        getPrimaryRole(
          profile?.roles,
        ),
      [profile?.roles],
    );

  /*
   * ---------------------------------------------------------
   * FILTER NAVIGATION BY ROLE
   * ---------------------------------------------------------
   *
   * Teacher:
   *   Dashboard
   *   Attendance
   *   Assessment
   *   Behaviour
   *   Report cards
   *   Classes & subjects
   *
   * Head Teacher:
   *   Everything above
   *   Students
   *   Approvals
   *
   * Admin:
   *   Everything
   *
   * ---------------------------------------------------------
   */

  const visibleNav =
    useMemo(() => {
      return NAV.filter(
        (item) =>
          item.roles.includes(
            currentRole,
          ),
      );
    }, [currentRole]);

  /*
   * ---------------------------------------------------------
   * SIGN OUT
   * ---------------------------------------------------------
   */

  async function signOut() {
    await queryClient.cancelQueries();

    queryClient.clear();

    await supabase.auth.signOut();

    navigate({
      to: "/auth",
      replace: true,
    });
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* =====================================================
          SIDEBAR
          ===================================================== */}

      <aside
        className={cn(
          "brand-gradient fixed inset-y-0 left-0 z-40 flex w-72 flex-col text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open
            ? "translate-x-0"
            : "-translate-x-full",
        )}
      >
        {/* ---------------------------------------------------
            BRAND
            --------------------------------------------------- */}

        <div className="flex items-center gap-3 border-b border-sidebar-border/60 px-5 py-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <GraduationCap className="size-5" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">
              MayDan EduRecord
            </p>

            <p className="truncate text-xs text-sidebar-foreground/70">
              {school?.name ??
                "Academic records"}
            </p>
          </div>
        </div>

        {/* ---------------------------------------------------
            ROLE INDICATOR
            --------------------------------------------------- */}

        <div className="border-b border-sidebar-border/60 px-4 py-3">
          <div className="rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              Signed in as
            </p>

            <p className="mt-0.5 text-sm font-semibold text-sidebar-foreground">
              {roleLabel(
                currentRole,
              )}
            </p>
          </div>
        </div>

        {/* ---------------------------------------------------
            NAVIGATION
            --------------------------------------------------- */}

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleNav.map(
            ({
              to,
              label,
              icon: Icon,
            }) => {
              const active =
                pathname === to;

              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() =>
                    setOpen(false)
                  }
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-raised"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />

                  {label}
                </Link>
              );
            },
          )}
        </nav>

        {/* ---------------------------------------------------
            USER / SIGN OUT
            --------------------------------------------------- */}

        <div className="border-t border-sidebar-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
              {initials(
                profile?.fullName ??
                  "MD",
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {profile?.fullName ||
                  "Staff member"}
              </p>

              <p className="truncate text-xs text-sidebar-foreground/70">
                {roleLabel(
                  currentRole,
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void signOut()
              }
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* =====================================================
          MOBILE OVERLAY
          ===================================================== */}

      {open && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={() =>
            setOpen(false)
          }
        />
      )}

      {/* =====================================================
          MAIN CONTENT
          ===================================================== */}

      <main className="min-w-0 flex-1">
        {/* ---------------------------------------------------
            HEADER
            --------------------------------------------------- */}

        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() =>
                setOpen(
                  (value) =>
                    !value,
                )
              }
              aria-label="Toggle navigation"
            >
              <Menu className="size-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold sm:text-xl">
                {title}
              </h1>

              {description && (
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  {description}
                </p>
              )}
            </div>

            {/* Desktop sync status */}
            <div className="hidden sm:block">
              <SyncBadge />
            </div>

            {actions}
          </div>

          {/* Mobile sync status */}
          <div className="px-4 pb-3 sm:hidden">
            <SyncBadge />
          </div>
        </header>

        {/* ---------------------------------------------------
            PAGE CONTENT
            --------------------------------------------------- */}

        <div className="space-y-6 px-4 py-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}

/* ===========================================================
   STAT CARD
   =========================================================== */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon = BarChart3,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: typeof BarChart3;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>

        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4" />
        </span>
      </div>

      <p className="mt-3 text-2xl font-bold">
        {value}
      </p>

      {hint && (
        <p className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
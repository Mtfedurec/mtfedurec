import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  GraduationCap,
  Loader2,
  ShieldCheck,
  UserRound,
  ArrowLeft,
  UserPlus,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — MayDan EduRecord" },
      {
        name: "description",
        content:
          "Secure administrator and teacher access to MayDan EduRecord.",
      },
      {
        property: "og:title",
        content: "Sign in — MayDan EduRecord",
      },
      {
        property: "og:description",
        content:
          "Secure administrator and teacher access to MayDan EduRecord.",
      },
    ],
  }),
  component: AuthPage,
});

type LoginRole = "admin" | "teacher";
type View = "roles" | "login" | "signup" | "forgot" | "reset";

function authErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("rate") || message.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (message.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  return fallback;
}

function AuthPage() {
  const navigate = useNavigate();

  const [view, setView] = useState<View>("roles");
  const [selectedRole, setSelectedRole] = useState<LoginRole | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("reset");
        setBusy(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function resetFields() {
    setEmail("");
    setPassword("");
    setFullName("");
    setConfirmPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  }

  function chooseRole(role: LoginRole) {
    setSelectedRole(role);
    resetFields();
    setView("login");
  }

  function goBack() {
    resetFields();

    if (view === "roles") {
      return;
    }

    setView("roles");
    setSelectedRole(null);
  }

  function openSignup() {
    resetFields();
    setSelectedRole("teacher");
    setView("signup");
  }

  function openForgotPassword() {
    setPassword("");
    setConfirmPassword("");
    setView("forgot");
  }

  async function verifyRole(userId: string, loginRole: LoginRole) {
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    const userRoles = (roles ?? []).map((item) => String(item.role));

    const isAdmin = userRoles.includes("admin");

    const isTeacher =
      userRoles.includes("teacher") ||
      userRoles.includes("head_teacher");

    if (loginRole === "admin" && !isAdmin) {
      await supabase.auth.signOut();

      throw new Error(
        "This account is not registered as an administrator. Please use Teacher Login or contact the school administrator.",
      );
    }

    if (loginRole === "teacher" && !isTeacher) {
      await supabase.auth.signOut();

      throw new Error(
        "This account is not registered as a teacher. Please use Administrator Login or contact the school administrator.",
      );
    }

    return true;
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRole) {
      toast.error("Please select Administrator or Teacher first.");
      return;
    }

    if (!email.trim() || !password) {
      toast.error("Enter your email address and password.");
      return;
    }

    setBusy(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error(
          "Login succeeded but no user account was returned.",
        );
      }

      await verifyRole(data.user.id, selectedRole);

      toast.success(
        selectedRole === "admin"
          ? "Administrator login successful."
          : "Teacher login successful.",
      );

      navigate({
        to: "/dashboard",
        replace: true,
      });
    } catch (error) {
      await supabase.auth.signOut();
      toast.error(
        authErrorMessage(error, "Unable to sign in. Please check your details and try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRole) {
      toast.error("Please select Administrator or Teacher first.");
      return;
    }

    if (!fullName.trim()) {
      toast.error("Enter your full name.");
      return;
    }

    if (!email.trim()) {
      toast.error("Enter your email address.");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: "teacher",
          },
        },
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error(
          "Account creation did not return a user account.",
        );
      }

      if (data.session) {
        await verifyRole(data.user.id, selectedRole);

        toast.success("Account created successfully.");

        navigate({
          to: "/dashboard",
          replace: true,
        });

        return;
      }

      toast.success(
        "Account created. Check your email to confirm your account before signing in.",
      );

      setView("login");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(
        authErrorMessage(error, "Unable to create the account. Please check your details and try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      toast.error("Enter the email address for your account.");
      return;
    }

    setBusy(true);

    try {
      const redirectTo = `${window.location.origin}/auth`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo,
        },
      );

      if (error) {
        throw error;
      }

      toast.success(
        "Password reset instructions have been sent to your email.",
      );

      setView("login");
      setPassword("");
    } catch (error) {
      toast.error(authErrorMessage(error, "Unable to process that request. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Password updated. Please sign in again.");
      resetFields();
      setSelectedRole(null);
      setView("roles");
    } catch (error) {
      toast.error(authErrorMessage(error, "This reset link is invalid or expired. Request a new one."));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!selectedRole) {
      toast.error("Please select Administrator or Teacher first.");
      return;
    }

    setBusy(true);

    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });

      if (result.error) {
        throw new Error(
          "Google sign-in failed. Try again or use your email and password.",
        );
      }

      if (result.redirected) {
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "Unable to identify your account after Google login.",
        );
      }

      await verifyRole(user.id, selectedRole);

      toast.success("Google login successful.");

      navigate({
        to: "/dashboard",
        replace: true,
      });
    } catch (error) {
      toast.error(authErrorMessage(error, "Google sign-in failed. Try again or use your email and password."));

      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-md">
        {/* BRAND */}

        <Link
          to="/"
          className="mb-6 flex items-center justify-center gap-3"
        >
          <span className="brand-gradient flex size-10 items-center justify-center rounded-xl text-primary-foreground">
            <GraduationCap className="size-5" />
          </span>

          <span className="text-base font-bold">
            MayDan EduRecord
          </span>
        </Link>

        <div className="surface-card p-6">
          {/* =========================================================
              ROLE SELECTION
             ========================================================= */}

          {view === "roles" && (
            <>
              <div className="text-center">
                <h1 className="text-xl font-bold">
                  Welcome to MayDan EduRecord
                </h1>

                <p className="mt-2 text-sm text-muted-foreground">
                  Select the type of account you are using.
                </p>
              </div>

              <div className="mt-6 grid gap-4">
                {/* ADMIN */}

                <button
                  type="button"
                  onClick={() => chooseRole("admin")}
                  className="group rounded-xl border border-border p-5 text-left transition-all hover:border-primary hover:bg-primary/5"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ShieldCheck className="size-5" />
                    </span>

                    <div>
                      <h2 className="font-semibold">
                        Administrator
                      </h2>

                      <p className="mt-1 text-sm text-muted-foreground">
                        School management, staff, students,
                        classes, subjects, reports and settings.
                      </p>
                    </div>
                  </div>
                </button>

                {/* TEACHER */}

                <button
                  type="button"
                  onClick={() => chooseRole("teacher")}
                  className="group rounded-xl border border-border p-5 text-left transition-all hover:border-primary hover:bg-primary/5"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <UserRound className="size-5" />
                    </span>

                    <div>
                      <h2 className="font-semibold">
                        Teacher
                      </h2>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Attendance, assessments, behaviour,
                        students and assigned classes.
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Your account permissions are controlled by the
                school administrator.
              </p>
            </>
          )}

          {/* =========================================================
              LOGIN
             ========================================================= */}

          {view === "login" && selectedRole && (
            <>
              <button
                type="button"
                onClick={goBack}
                className="mb-5 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Change account type
              </button>

              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {selectedRole === "admin" ? (
                    <ShieldCheck className="size-5" />
                  ) : (
                    <UserRound className="size-5" />
                  )}
                </span>

                <div>
                  <h1 className="text-xl font-bold">
                    {selectedRole === "admin"
                      ? "Administrator Login"
                      : "Teacher Login"}
                  </h1>

                  <p className="text-sm text-muted-foreground">
                    {selectedRole === "admin"
                      ? "Sign in to manage the school."
                      : "Sign in to access your teaching workspace."}
                  </p>
                </div>
              </div>

              <form
                onSubmit={submitLogin}
                className="mt-6 space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="login-email">
                    Email address
                  </Label>

                  <Input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder={
                      selectedRole === "admin"
                        ? "admin@school.com"
                        : "teacher@school.com"
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">
                      Password
                    </Label>

                    <button
                      type="button"
                      onClick={openForgotPassword}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <Input
                    id="login-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy}
                >
                  {busy && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}

                  {selectedRole === "admin"
                    ? "Sign in as Administrator"
                    : "Sign in as Teacher"}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => void google()}
              >
                {busy && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}

                Continue with Google
              </Button>

              {/* CREATE ACCOUNT */}

              <button
                type="button"
                onClick={openSignup}
                className="mt-5 flex w-full items-center justify-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <UserPlus className="size-4" />
                Create a new account
              </button>

              <div className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">
                  Important:
                </strong>{" "}
                Choosing a login type does not change your
                permissions. MayDan checks your actual role in
                the school database after authentication.
              </div>
            </>
          )}

          {/* =========================================================
              CREATE ACCOUNT
             ========================================================= */}

          {view === "signup" && selectedRole && (
            <>
              <button
                type="button"
                onClick={() => {
                  resetFields();
                  setView("login");
                }}
                className="mb-5 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Back to login
              </button>

              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <UserPlus className="size-5" />
                </span>

                <div>
                  <h1 className="text-xl font-bold">
                    Create Account
                  </h1>

                  <p className="text-sm text-muted-foreground">
                    Create your teacher account.
                  </p>
                </div>
              </div>

              <form
                onSubmit={createAccount}
                className="mt-6 space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="signup-name">
                    Full name
                  </Label>

                  <Input
                    id="signup-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) =>
                      setFullName(event.target.value)
                    }
                    placeholder="Your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">
                    Email address
                  </Label>

                  <Input
                    id="signup-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="you@school.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">
                    Password
                  </Label>

                  <Input
                    id="signup-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="At least 6 characters"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">
                    Confirm password
                  </Label>

                  <Input
                    id="signup-confirm-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Enter the password again"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy}
                >
                  {busy && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}

                  Create Teacher Account
                </Button>
              </form>

              <div className="mt-5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">
                  Account role:
                </strong>{" "}
                This account will be created as <strong>Teacher</strong>. Administrator and head
                teacher roles can only be assigned by school management.
              </div>
            </>
          )}

          {/* =========================================================
              FORGOT PASSWORD
             ========================================================= */}

          {view === "forgot" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPassword("");
                  setView("login");
                }}
                className="mb-5 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Back to login
              </button>

              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <KeyRound className="size-5" />
                </span>

                <div>
                  <h1 className="text-xl font-bold">
                    Forgot Password?
                  </h1>

                  <p className="text-sm text-muted-foreground">
                    We will send a password reset link to your
                    email.
                  </p>
                </div>
              </div>

              <form
                onSubmit={resetPassword}
                className="mt-6 space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">
                    Email address
                  </Label>

                  <Input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="you@school.com"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy}
                >
                  {busy && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}

                  Send Reset Link
                </Button>
              </form>

              <p className="mt-5 text-center text-xs text-muted-foreground">
                Check your inbox and spam folder after
                requesting the reset link.
              </p>
            </>
          )}

          {view === "reset" && (
            <form onSubmit={updatePassword} className="space-y-4">
              <h1 className="text-xl font-bold">Set a new password</h1>
              <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
              <Input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 6 characters"
              />
              <Input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                placeholder="Enter the password again"
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          MayDan EduRecord • Secure school records
        </p>
      </div>
    </div>
  );
}
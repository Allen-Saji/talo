"use client";
import { useState, type FormEvent } from "react";
let client: ReturnType<typeof import("@neondatabase/auth/next").createAuthClient> | undefined;
export async function authClient() {
  if (!client) {
    const { createAuthClient } = await import("@neondatabase/auth/next");
    client = createAuthClient();
  }
  return client;
}

export default function AuthPanel({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<"signin" | "signup" | "verify" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function googleSignIn() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await (await authClient()).signIn.social({ provider: "google", callbackURL: window.location.origin });
      if (result.error) throw new Error("Google sign-in could not start. Try again.");
    } catch { setError("Google sign-in could not start. Try again or use email."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "signup") {
        const result = await (await authClient()).signUp.email({ email, password, name });
        if (result.error) throw new Error("Account creation failed. Check your details or try signing in.");
        setMode("verify"); setNotice("Check your email for a verification code.");
      } else if (mode === "verify") {
        const result = await (await authClient()).emailOtp.verifyEmail({ email, otp });
        if (result.error) throw new Error("The verification code is invalid or expired.");
        const signedIn = await (await authClient()).signIn.email({ email, password });
        if (signedIn.error) { setMode("signin"); setNotice("Email verified. Sign in to continue."); return; }
        setPassword(""); setOtp(""); await onSignedIn();
      } else if (mode === "reset") {
        const result = await (await authClient()).emailOtp.resetPassword({ email, otp, password });
        if (result.error) throw new Error("Password reset failed. Check the code and password.");
        setPassword(""); setOtp(""); setMode("signin"); setNotice("Password updated. Sign in to continue.");
      } else {
        const result = await (await authClient()).signIn.email({ email, password });
        if (result.error) {
          if (result.error.code === "EMAIL_NOT_VERIFIED") { setMode("verify"); setNotice("Check your email for a verification code."); return; }
          throw new Error("Sign-in failed. Check your email and password.");
        }
        setPassword(""); await onSignedIn();
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Sign-in is unavailable. Try again."); }
    finally { setBusy(false); }
  }
  async function sendCode(type: "email-verification" | "forget-password") {
    if (!email || busy) return;
    setBusy(true); setError("");
    try {
      const result = await (await authClient()).emailOtp.sendVerificationOtp({ email, type });
      if (result.error) throw new Error("A code could not be sent. Try again later.");
      if (type === "forget-password") { setMode("reset"); setPassword(""); }
      setNotice("If this address is eligible, a code will arrive shortly.");
    } catch (error) { setError(error instanceof Error ? error.message : "A code could not be sent."); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="signin-title">
    <h3 id="signin-title">{mode === "signup" ? "Create your account" : mode === "verify" ? "Verify your email" : mode === "reset" ? "Reset your password" : "Sign in to Talo"}</h3>
    <p className="muted">Your account gets a private synthetic support case. Saved preferences are scoped to you.</p>
    {(mode === "signin" || mode === "signup") && <>
      <button type="button" disabled={busy} onClick={() => void googleSignIn()}>Continue with Google</button>
      <p className="muted">Or use your email and password</p>
    </>}
    <form onSubmit={submit}>
      {mode === "signup" && <><label htmlFor="auth-name">Name</label><input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required disabled={busy} autoComplete="name" /></>}
      <label htmlFor="auth-email">Email</label><input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy || mode === "verify"} autoComplete="email" />
      {mode !== "verify" && <><label htmlFor="auth-password">{mode === "reset" ? "New password" : "Password"}</label><input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} required disabled={busy} autoComplete={mode === "signin" ? "current-password" : "new-password"} /></>}
      {(mode === "verify" || mode === "reset") && <><label htmlFor="auth-code">Email code</label><input id="auth-code" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required maxLength={10} disabled={busy} /></>}
      <button disabled={busy}>{busy ? "Working..." : mode === "signup" ? "Create account" : mode === "verify" ? "Verify email" : mode === "reset" ? "Reset password" : "Sign in"}</button>
    </form>
    <div className="memory-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}>{mode === "signin" ? "Create an account" : "Back to sign in"}</button>
      {mode === "signin" && <button type="button" className="secondary" disabled={busy || !email} onClick={() => void sendCode("forget-password")}>Forgot password</button>}
      {mode === "verify" && <button type="button" className="secondary" disabled={busy} onClick={() => void sendCode("email-verification")}>Resend code</button>}
    </div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="error">{error}</p>}
  </section>;
}

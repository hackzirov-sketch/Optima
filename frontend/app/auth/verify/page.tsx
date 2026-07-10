'use client';

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Mail, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { authApi, setTokens } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { AuthField, PrimaryButton } from "../shared";

export default function VerifyPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('pending_verify_email') || '';
    const storedToken = sessionStorage.getItem('pending_verify_token') || '';
    setEmail(storedEmail);
    setVerifyToken(storedToken);

    // No email at all → nothing to verify, send back to register.
    if (!storedEmail) {
      router.replace('/auth/register');
    }
  }, [router]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = (seconds: number) => {
    setResendCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const verifyReady = code.trim().length === 6 && verifyToken.length > 0;

  const finishLogin = async (payload: { accessToken: string; refreshToken: string; user?: { firstName: string; lastName: string; email: string; username?: string }; redirect?: string }) => {
    setTokens(payload.accessToken, payload.refreshToken);

    const apiUser = payload.user;
    if (apiUser) {
      login({
        name: `${apiUser.firstName} ${apiUser.lastName}`.trim(),
        profession: 'developer',
        goal: 'build_portfolio',
        experience: 'intermediate',
        joinedAt: Date.now(),
        email: apiUser.email,
        username: apiUser.username,
        authProvider: 'email',
      });
    } else {
      try {
        const meRes = await authApi.me();
        if (meRes?.data) {
          login({
            name: `${meRes.data.firstName} ${meRes.data.lastName}`.trim(),
            profession: 'developer',
            goal: 'build_portfolio',
            experience: 'intermediate',
            joinedAt: Date.now(),
            email: meRes.data.email,
            username: meRes.data.username,
            authProvider: 'email',
          });
        }
      } catch {
        // ignore — user will land on /app/home and refetch there
      }
    }

    sessionStorage.removeItem('pending_verify_email');
    sessionStorage.removeItem('pending_verify_token');

    setSuccess(true);
    const target = payload.redirect === '/set-password' ? '/auth/set-password' : '/app/home';
    setTimeout(() => router.push(target), 1200);
  };

  const handleVerify = async () => {
    if (!verifyReady) return;
    setLoading(true);
    setError("");
    try {
      const res = await authApi.verifyEmail(verifyToken, code.trim());
      const payload = res?.data;

      if (payload?.accessToken && payload?.refreshToken) {
        await finishLogin(payload);
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string; status?: number; retryAfter?: number };
      if (apiErr?.status === 429) {
        setError(apiErr?.message ?? 'Too many attempts. Please wait before trying again.');
        if (apiErr?.retryAfter) startCooldown(apiErr.retryAfter);
      } else {
        setError(apiErr?.message ?? 'Incorrect code. Please check your email and try again.');
      }
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending || !email) return;
    setResending(true);
    setError("");
    try {
      const res = await authApi.resendVerification(email);
      if (res?.data?.verifyToken) {
        setVerifyToken(res.data.verifyToken);
        sessionStorage.setItem('pending_verify_token', res.data.verifyToken);
      }
      startCooldown(60);
    } catch (err: unknown) {
      const apiErr = err as { message?: string; status?: number; retryAfter?: number };
      if (apiErr?.retryAfter) startCooldown(apiErr.retryAfter);
      setError(apiErr?.message ?? 'Could not resend the code. Please try again shortly.');
    } finally {
      setResending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-4"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/auth/register")}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm font-bold
            text-slate-500 shadow-sm transition-all
            hover:-translate-y-0.5 hover:text-foreground
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      {success ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center gap-4 py-12 text-center"
        >
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="text-2xl font-black text-foreground">Email verified!</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Logging you in automatically…
          </p>
          <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted dark:bg-slate-800">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.5, ease: "linear" }}
              className="h-full bg-emerald-500"
            />
          </div>
        </motion.div>
      ) : (
        <>
          <div className="mb-7 text-center sm:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
              <Sparkles className="h-4 w-4" />
              Verify Email
            </span>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              Check your inbox
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              We&apos;ve sent a 6-digit verification code to your email address. Please enter it below to verify your account.
            </p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <Mail className="h-4 w-4 text-indigo-500" />
              {email || 'Check the email you registered with'}
            </div>
          </div>

          <div className="space-y-4">
            <AuthField
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Verification Code"
              value={code}
              onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              type="text"
            />

            {error && (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20">
                {error}
              </p>
            )}

            <PrimaryButton onClick={handleVerify} disabled={!verifyReady || loading}>
              {loading ? "Verifying…" : <><span>Verify &amp; Continue</span> <ArrowRight className="h-4 w-4" /></>}
            </PrimaryButton>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending || !email}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold text-slate-500 transition-all hover:-translate-y-0.5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${resending ? 'animate-spin' : ''}`} />
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : resending
                  ? 'Sending…'
                  : 'Resend code'}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

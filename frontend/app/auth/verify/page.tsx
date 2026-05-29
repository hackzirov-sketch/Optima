'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { authApi, setTokens } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { AuthField, PrimaryButton } from "../shared";

export default function VerifyPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const verifyReady = code.trim().length === 6;

  const handleVerify = async () => {
    if (!verifyReady) return;
    setLoading(true);
    try {
      const res = await authApi.verifyEmail(code) as any;

      setSuccess(true);

      // Try to auto-login with stored credentials
      const pendingEmail = sessionStorage.getItem('pending_verify_email');
      const pendingPassword = sessionStorage.getItem('pending_verify_password');

      if (pendingEmail && pendingPassword) {
        sessionStorage.removeItem('pending_verify_email');
        sessionStorage.removeItem('pending_verify_password');

        try {
          const loginRes = await authApi.login({ email: pendingEmail, password: pendingPassword });
          if (loginRes?.data?.accessToken) {
            setTokens(loginRes.data.accessToken, loginRes.data.refreshToken);
            const { user: apiUser } = loginRes.data;
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
            // Go to onboarding to fill in profession/goal/experience
            router.push('/onboarding');
            return;
          }
        } catch {
          // Login failed after verify — redirect to login
        }
      }

      // Fallback if auto-login fails
      setTimeout(() => {
        router.push('/auth/login');
      }, 1500);
    } catch {
      alert("Invalid code or verification failed.");
    } finally {
      setLoading(false);
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
              We've sent a 6-digit verification code to your email address. Please enter it below to verify your account.
            </p>

            {/* Email hint if we have it stored */}
            <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <Mail className="h-4 w-4 text-indigo-500" />
              Check the email you registered with
            </div>
          </div>

          <div className="space-y-4">
            <AuthField
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Verification Code"
              value={code}
              onChange={setCode}
              placeholder="123456"
              type="text"
            />

            <PrimaryButton onClick={handleVerify} disabled={!verifyReady || loading}>
              {loading ? "Verifying..." : "Verify & Continue"} <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
          </div>
        </>
      )}
    </motion.div>
  );
}

'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { authApi } from '@/lib/api';
import { AuthField, EyeToggle, PrimaryButton } from '../shared';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const ready = password.length >= 8 && passwordsMatch && !!token;

  const handleReset = async () => {
    if (!ready) return;
    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.push('/auth/login'), 2000);
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      setError((e?.message as string) || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 py-4">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/40 dark:bg-rose-500/10">
          <p className="font-bold text-rose-600 dark:text-rose-400">Invalid reset link</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            This password reset link is invalid or has expired.
          </p>
          <button
            type="button"
            onClick={() => router.push('/auth/forgot-password')}
            className="mt-4 text-sm font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Request a new link
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-4"
    >
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/auth/login')}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm font-bold text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:text-foreground dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="mb-7 text-center sm:text-left">
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
          <ShieldCheck className="h-4 w-4" />
          Reset Password
        </span>
        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Create a new password
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Enter and confirm your new password below.
        </p>
      </div>

      {success ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900/40 dark:bg-emerald-500/10"
        >
          <div className="grid h-14 w-14 place-items-center rounded-3xl bg-emerald-100 dark:bg-emerald-500/20">
            <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-emerald-700 dark:text-emerald-300">Password updated!</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Redirecting to login…</p>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-4">
          <AuthField
            icon={<Lock className="h-4 w-4" />}
            label="New password"
            value={password}
            onChange={setPassword}
            placeholder="Create a strong password (min 8 chars)"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            action={<EyeToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
          />

          <AuthField
            icon={<Lock className="h-4 w-4" />}
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Repeat your password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            action={<EyeToggle show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />}
          />

          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-sm font-bold text-rose-500 dark:text-rose-400">
              Passwords do not match.
            </p>
          )}

          {error && (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20">
              {error}
            </p>
          )}

          <PrimaryButton onClick={handleReset} disabled={!ready || loading}>
            {loading ? 'Saving…' : <><span>Save new password</span> <ArrowRight className="h-4 w-4" /></>}
          </PrimaryButton>
        </div>
      )}
    </motion.div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}

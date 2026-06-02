'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/lib/api';
import { AuthField, EyeToggle, PrimaryButton } from '../shared';

export default function SetPasswordPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const ready = password.length >= 8 && passwordsMatch;

  const handleSetPassword = async () => {
    if (!ready) return;
    setError('');
    setLoading(true);
    try {
      await authApi.setPassword(password);
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
      router.push('/app/home');
    } catch {
      setError('Unable to set password. Please sign in again.');
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
          onClick={() => router.push('/auth/login')}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm font-bold text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:text-foreground dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="mb-7 text-center sm:text-left">
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
          <Sparkles className="h-4 w-4" />
          Set Password
        </span>
        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Create a secure password
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Finish your account setup by adding a password. This will let you sign in directly next time.
        </p>
      </div>

      <div className="space-y-4">
        <AuthField
          icon={<Lock className="h-4 w-4" />}
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Create a strong password"
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

        {!passwordsMatch && confirmPassword.length > 0 && (
          <p className="text-sm font-bold text-rose-500 dark:text-rose-400">
            Passwords must match.
          </p>
        )}

        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20">
            {error}
          </p>
        )}

        <PrimaryButton onClick={handleSetPassword} disabled={!ready || loading}>
          {loading ? 'Saving…' : <><span>Save password</span> <ArrowRight className="h-4 w-4" /></>}
        </PrimaryButton>
      </div>
    </motion.div>
  );
}

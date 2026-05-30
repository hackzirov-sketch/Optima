'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { AuthField, PrimaryButton } from '../shared';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const ready = email.includes('@');

  const handleSubmit = () => {
    if (!ready) return;
    setSubmitted(true);
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
          <ShieldCheck className="h-4 w-4" />
          Forgot password
        </span>
        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Reset your account access
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Enter your email and we will send instructions for how to reset your password.
        </p>
      </div>

      {submitted ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-500/10 dark:text-emerald-200">
          <p className="font-bold">Request sent</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            If an account exists for <span className="font-semibold">{email}</span>, instructions will be sent to that address.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AuthField
            icon={<Mail className="h-4 w-4" />}
            label="Email address"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
          />
          <PrimaryButton onClick={handleSubmit} disabled={!ready}>
            Send reset instructions
          </PrimaryButton>
        </div>
      )}
    </motion.div>
  );
}

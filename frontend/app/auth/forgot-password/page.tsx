'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Mail, RefreshCw, ShieldCheck, KeyRound } from 'lucide-react';
import { authApi } from '@/lib/api';
import { AuthField, PrimaryButton } from '../shared';

type Step = 'email' | 'otp';

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const emailReady = email.includes('@');
  const otpReady = otp.trim().length === 6;

  // Step 1: Send OTP
  const handleSendOtp = async () => {
    if (!emailReady) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      const token = res?.data?.resetToken;
      if (token) {
        setResetToken(token);
        setStep('otp');
        startCooldown(60);
      } else {
        // Account not found — show generic OTP screen to avoid leaking emails
        setStep('otp');
        startCooldown(60);
      }
    } catch {
      // Always go to OTP screen (don't reveal whether email is registered)
      setStep('otp');
      startCooldown(60);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    if (!otpReady || !resetToken) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await authApi.verifyResetOtp(resetToken, otp.trim());
      const confirmedToken = res?.data?.confirmedToken;
      if (confirmedToken) {
        // Pass confirmedToken via sessionStorage so reset-password page can read it
        sessionStorage.setItem('pwd_reset_confirmed_token', confirmedToken);
        router.push('/auth/reset-password');
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string; attemptsLeft?: number };
      setError(apiErr?.message ?? 'Incorrect code. Please check your email and try again.');
      setOtp('');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    if (resendCooldown > 0 || resending || !emailReady) return;
    setResending(true);
    setError('');
    try {
      const res = await authApi.forgotPassword(email);
      const token = res?.data?.resetToken;
      if (token) setResetToken(token);
      startCooldown(60);
      setOtp('');
    } catch (err: unknown) {
      const apiErr = err as { message?: string; retryAfter?: number };
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
          onClick={() => step === 'otp' ? setStep('email') : router.push('/auth/login')}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm font-bold text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:text-foreground dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 'otp' ? 'Change email' : 'Back'}
        </button>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {(['email', 'otp'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-6 bg-indigo-500'
                  : i < (['email', 'otp'] as Step[]).indexOf(step)
                    ? 'w-2 bg-indigo-300 dark:bg-indigo-700'
                    : 'w-2 bg-muted dark:bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── STEP 1: Email ── */}
        {step === 'email' && (
          <motion.div
            key="email"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="mb-7 text-center sm:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
                <ShieldCheck className="h-4 w-4" />
                Forgot password
              </span>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                Reset your password
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Enter your email address and we&apos;ll send a 6-digit verification code to reset your password.
              </p>
            </div>

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

              {error && (
                <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20">
                  {error}
                </p>
              )}

              <PrimaryButton onClick={handleSendOtp} disabled={!emailReady || isLoading}>
                {isLoading ? 'Sending…' : <><span>Send reset code</span> <ArrowRight className="h-4 w-4" /></>}
              </PrimaryButton>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: OTP ── */}
        {step === 'otp' && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="mb-7 text-center sm:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
                <KeyRound className="h-4 w-4" />
                Enter code
              </span>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                Check your inbox
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                We&apos;ve sent a 6-digit code to{' '}
                <span className="font-semibold text-foreground">{email}</span>.
                Enter it below to continue.
              </p>
            </div>

            <div className="space-y-4">
              <AuthField
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Verification code"
                value={otp}
                onChange={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                type="text"
                autoComplete="one-time-code"
              />

              {error && (
                <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20">
                  {error}
                </p>
              )}

              <PrimaryButton onClick={handleVerifyOtp} disabled={!otpReady || isLoading}>
                {isLoading ? 'Verifying…' : <><span>Verify code</span> <ArrowRight className="h-4 w-4" /></>}
              </PrimaryButton>

              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || resending}
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

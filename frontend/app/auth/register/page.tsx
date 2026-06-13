'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Chrome,
  Github,
  Lock,
  Mail,
  Phone,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { authApi, type RegisterDto } from "@/lib/api";
import { AuthField, EyeToggle, ProviderButton, TabButton, PrimaryButton } from "../shared";

export default function RegisterPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | string[]>("");
  const [isLoading, setIsLoading] = useState(false);

  const passwordMismatch = confirmPw.length > 0 && password !== confirmPw;
  const usernameInvalid = username.length > 0 && !username.match(/^[a-zA-Z0-9_-]+$/);
  const signupReady =
    fullName.trim().length > 1 &&
    email.includes("@") &&
    username.trim().length >= 3 &&
    !!username.match(/^[a-zA-Z0-9_-]+$/) &&
    password.length >= 8 &&
    password.length <= 32 &&
    password === confirmPw &&
    acceptedTerms;

  const handleCreateAccount = async () => {
    if (!signupReady) return;
    setError("");
    setIsLoading(true);
    try {
      const registerPayload: RegisterDto = {
        email,
        password,
        username: username.trim(),
        firstName: fullName.split(' ')[0] || '',
        lastName: fullName.split(' ').slice(1).join(' '),
      };

      if (phone.trim().length > 0) {
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits.length >= 10 && phoneDigits.length <= 15) {
          registerPayload.phoneNumber = parseInt(phoneDigits, 10);
        }
      }

      await authApi.register(registerPayload);
      sessionStorage.setItem('pending_verify_email', email);
      sessionStorage.setItem('pending_verify_password', password);
      router.push("/auth/verify");
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const errorObj = (e?.error && typeof e.error === 'object') ? e.error as Record<string, unknown> : null;
      const details = errorObj?.details ?? e?.details;
      if (Array.isArray(details) && details.length > 0) {
        setError(details.map(String));
      } else {
        setError((e?.message as string) || "Registration failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialDemo = (provider: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';
    window.location.href = `${backendUrl}/auth/${provider.toLowerCase()}`;
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="auth-signup"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.22 }}
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-4"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm font-bold
              text-slate-500 shadow-sm transition-all
              hover:-translate-y-0.5 hover:text-foreground
              dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {/* Heading */}
        <div className="mb-7 text-center sm:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
            <Sparkles className="h-4 w-4" />
            UPZ account
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Create your productivity account
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Register with both email and phone so future backend login, verification, and team invites are ready.
          </p>
        </div>

        {/* Sign in / Create account tabs */}
        <div className="mb-5 flex rounded-[22px] border border-border bg-muted p-1 dark:border-slate-700/60 dark:bg-slate-900">
          <TabButton active={false} onClick={() => router.push("/auth/login")}>Sign in</TabButton>
          <TabButton active={true} onClick={() => {}}>Create account</TabButton>
        </div>

        {/* ── Sign-up form ── */}
        <div className="space-y-4">
          <AuthField icon={<User className="h-4 w-4" />}  label="Full name" value={fullName} onChange={setFullName} placeholder="Jasur Karimov" autoComplete="name" />

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField icon={<Mail className="h-4 w-4" />}  label="Email" value={email}    onChange={setEmail}    placeholder="your@email.com"       type="email" autoComplete="email" />
            <AuthField icon={<Phone className="h-4 w-4" />} label="Phone" value={phone} onChange={v => setPhone(v.replace(/[^0-9+ ]/g, ''))} placeholder="+998 90 123 45 67" type="tel" autoComplete="tel" />
          </div>

          <AuthField icon={<AtSign className="h-4 w-4" />} label="Username" value={username} onChange={v => setUsername(v.replace(/^@+/, '').toLowerCase())} placeholder="jasur-karimov" autoComplete="username" />

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField
              icon={<Lock className="h-4 w-4" />}
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="Create a strong password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              action={<EyeToggle show={showPassword} onToggle={() => setShowPassword(v => !v)} />}
            />
            <AuthField
              icon={<Lock className="h-4 w-4" />}
              label="Confirm password"
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder="Repeat your password"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              action={<EyeToggle show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />}
            />
          </div>

          {usernameInvalid && (
            <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <span>⚠</span> Username faqat harf, raqam, <code className="font-mono">_</code> va <code className="font-mono">-</code> dan iborat bo'lishi kerak.
            </p>
          )}

          {passwordMismatch && (
            <p className="text-sm font-bold text-rose-500 dark:text-rose-400">
              Passwords do not match yet.
            </p>
          )}

          {/* Terms checkbox */}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-muted p-3 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setAcceptedTerms(v => !v)}
              className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-lg border transition-all ${
                acceptedTerms
                  ? "border-indigo-500 bg-indigo-500 text-white"
                  : "border-slate-300 bg-card dark:border-slate-600 dark:bg-slate-800"
              }`}
              aria-label="Accept terms"
            >
              {acceptedTerms && <Check className="h-3.5 w-3.5" />}
            </button>
            <span>
              I agree to the{" "}
              <span className="font-black text-indigo-600 dark:text-indigo-400">Terms of Service</span>
              {" "}and{" "}
              <span className="font-black text-indigo-600 dark:text-indigo-400">Privacy Policy</span>.
            </span>
          </label>

          {error && (Array.isArray(error) ? error.length > 0 : error) && (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/20">
              {Array.isArray(error) ? (
                <ul className="space-y-1">
                  {error.map((msg, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
                      <span className="mt-0.5 shrink-0">•</span>
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
              )}
            </div>
          )}

          <PrimaryButton onClick={handleCreateAccount} disabled={!signupReady || isLoading}>
            {isLoading ? 'Creating account…' : <><span>Create account</span> <ArrowRight className="h-4 w-4" /></>}
          </PrimaryButton>
        </div>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3 text-xs font-bold text-slate-400 dark:text-slate-600">
          <span className="h-px flex-1 bg-border dark:bg-slate-800" />
          or sign up with
          <span className="h-px flex-1 bg-border dark:bg-slate-800" />
        </div>

        {/* Social buttons */}
        <div className="grid grid-cols-2 gap-3">
          <ProviderButton label="Google" icon={<Chrome className="h-5 w-5" />} onClick={() => handleSocialDemo("Google")} />
          <ProviderButton label="GitHub" icon={<Github className="h-5 w-5" />} onClick={() => handleSocialDemo("GitHub")} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

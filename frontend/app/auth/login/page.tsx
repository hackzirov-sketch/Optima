'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Chrome,
  Github,
  Lock,
  Mail,
  Phone,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthField, EyeToggle, ProviderButton, TabButton, PrimaryButton } from "../shared";
import { IS_DEMO, DEMO_USER_PROFILE } from "@/lib/demoData";

type LoginMethod = "email" | "phone";

export default function LoginPage() {
  const router = useRouter();
  const { loginWithBackend, login } = useAuth();
  
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [showPassword, setShowPassword] = useState(false);
  const [signinId, setSigninId] = useState("");
  const [signinPw, setSigninPw] = useState("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const signinReady = signinId.trim().length > 3 && signinPw.length >= 4;

  const handleSignin = async () => {
    if (!signinReady) return;
    
    setError("");
    setIsLoading(true);
    
    try {
      const result = await loginWithBackend(signinId, signinPw);
      if (result.success) {
        router.push('/app/home');
        return;
      }

      if (result.redirect) {
        // Save email + verifyToken so the verify page can submit without another resend
        sessionStorage.setItem('pending_verify_email', signinId);
        if (result.verifyToken) {
          sessionStorage.setItem('pending_verify_token', result.verifyToken);
        }
        router.push(`/auth${result.redirect}`);
        return;
      }

      setError(result.message || 'Login failed');
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
        key="auth-login"
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

        {/* Demo mode bypass */}
        {IS_DEMO && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 p-px shadow-xl shadow-indigo-500/20"
          >
            <div className="rounded-3xl bg-gradient-to-br from-indigo-950/90 to-violet-950/90 px-6 py-5 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-black uppercase tracking-widest text-indigo-300 ring-1 ring-indigo-500/30">
                <Zap className="h-3.5 w-3.5" /> Demo Mode
              </span>
              <p className="mt-3 text-base font-bold text-white">Backend kerak emas</p>
              <p className="mt-1 text-sm text-indigo-200/70">Barcha ma&apos;lumotlar sinov rejimida ishlaydi</p>
              <button
                onClick={() => { login(DEMO_USER_PROFILE); router.push('/app/home'); }}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 hover:shadow-indigo-400/30 active:scale-95"
              >
                Appga kirish <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Heading */}
        <div className="mb-7 text-center sm:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
            <Sparkles className="h-4 w-4" />
            UPZ account
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Welcome back to UPZ
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Choose email or phone, enter your password, and continue into the local MVP workspace.
          </p>
        </div>

        {/* Sign in / Create account tabs */}
        <div className="mb-5 flex rounded-[22px] border border-border bg-muted p-1 dark:border-slate-700/60 dark:bg-slate-900">
          <TabButton active={true} onClick={() => {}}>Sign in</TabButton>
          <TabButton active={false} onClick={() => router.push("/auth/register")}>Create account</TabButton>
        </div>

        {/* ── Sign-in form ── */}
        <div className="space-y-4">
          {/* Email / Phone toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1 dark:bg-slate-900">
            {(["email", "phone"] as LoginMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setLoginMethod(method)}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
                  loginMethod === method
                    ? "bg-card text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {method === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                {method === "email" ? "Email" : "Phone"}
              </button>
            ))}
          </div>

          <AuthField
            icon={loginMethod === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            label={loginMethod === "email" ? "Email address" : "Phone number"}
            value={signinId}
            onChange={setSigninId}
            placeholder={loginMethod === "email" ? "you@example.com" : "+998 90 123 45 67"}
            type={loginMethod === "email" ? "email" : "tel"}
            autoComplete={loginMethod === "email" ? "email" : "tel"}
          />
          <AuthField
            icon={<Lock className="h-4 w-4" />}
            label="Password"
            value={signinPw}
            onChange={setSigninPw}
            placeholder="Enter your password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            action={<EyeToggle show={showPassword} onToggle={() => setShowPassword(v => !v)} />}
          />

          <div className="flex justify-end">
            <button type="button" onClick={() => router.push('/auth/forgot-password')} className="text-sm font-black text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
              Forgot password?
            </button>
          </div>

          {error && (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20">
              {error}
            </p>
          )}

          <PrimaryButton onClick={handleSignin} disabled={!signinReady || isLoading}>
            {isLoading ? 'Signing in…' : <><span>Sign in</span> <ArrowRight className="h-4 w-4" /></>}
          </PrimaryButton>
        </div>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3 text-xs font-bold text-slate-400 dark:text-slate-600">
          <span className="h-px flex-1 bg-border dark:bg-slate-800" />
          or continue with
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

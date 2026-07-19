import { ArrowLeft, ArrowRight, Check, Crown, Eye, EyeOff, Github, LoaderCircle, LockKeyhole, Mail, PlayCircle, ShieldCheck, UsersRound, Video } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ApiError, api, oauthStartUrl, type OAuthProvider } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Logo } from "../components/ui";
import { useToast } from "../components/Toast";

type Mode = "login" | "register" | "verify" | "forgot" | "resetCode" | "newPassword" | "oauth";

/** Modes that can be reached by navigating straight to their URL (no
 * server-issued token from a prior step required to render them). */
const DEEP_LINKABLE_MODES: Mode[] = ["login", "register", "forgot"];

const PATH_FOR_MODE: Record<Mode, string> = {
  login: "/auth/login",
  register: "/auth/register",
  verify: "/auth/verify",
  forgot: "/auth/forgot-password",
  resetCode: "/auth/reset-password",
  newPassword: "/auth/reset-password",
  oauth: "/auth/callback",
};

function modeFromPath(pathname: string): Mode | null {
  const entry = (Object.entries(PATH_FOR_MODE) as [Mode, string][]).find(([, path]) => path === pathname);
  return entry ? entry[0] : null;
}

function SocialAuthButtons({ disabled }: { disabled: boolean }) {
  const start = (provider: OAuthProvider) => {
    window.location.assign(oauthStartUrl(provider));
  };
  return (
    <div className="social-auth" aria-label="Ijtimoiy tarmoq orqali kirish">
      <button type="button" onClick={() => start("google")} disabled={disabled}>
        <span className="google-mark" aria-hidden="true">G</span>
        Google orqali davom etish
      </button>
      <button type="button" onClick={() => start("github")} disabled={disabled}>
        <Github size={18} aria-hidden="true" />
        GitHub orqali davom etish
      </button>
    </div>
  );
}

function detailValue(error: ApiError, key: string): string | undefined {
  const details = error.details as Record<string, unknown> | undefined;
  if (typeof details?.[key] === "string") return details[key] as string;
  const nestedError = details?.error && typeof details.error === "object" ? details.error as Record<string, unknown> : undefined;
  if (typeof nestedError?.[key] === "string") return nestedError[key] as string;
  const nestedDetails = nestedError?.details && typeof nestedError.details === "object" ? nestedError.details as Record<string, unknown> : undefined;
  if (typeof nestedDetails?.[key] === "string") return nestedDetails[key] as string;
  const message = details?.message;
  if (message && typeof message === "object" && typeof (message as Record<string, unknown>)[key] === "string") {
    return (message as Record<string, string>)[key];
  }
  return undefined;
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>(() => {
    const fromPath = modeFromPath(window.location.pathname);
    return fromPath && DEEP_LINKABLE_MODES.includes(fromPath) ? fromPath : "login";
  });
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [devVerificationCode, setDevVerificationCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [devResetCode, setDevResetCode] = useState("");
  const [confirmedToken, setConfirmedToken] = useState("");
  const { login, completeAuth, completeOAuth } = useAuth();
  const { show } = useToast();
  const callbackStarted = useRef(false);
  const showDemoAccess = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true";

  async function enterDemo(kind: "demo" | "premium") {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const email = kind === "premium"
        ? "premium-demo-1783843698@optima.local"
        : "realtime-qa@optima.local";
      await login(email, "OptimaDemo9!");
      show(kind === "premium" ? "Premium demo ochildi" : "Demo ochildi");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demo ochilmadi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Keep the address bar in sync with the current step — covers direct
    // loads of a non-deep-linkable step (e.g. /auth/verify with no pending
    // verification) and any other stray path, which both fall back to login.
    if (window.location.pathname === "/auth/callback") return;
    if (window.location.pathname !== PATH_FOR_MODE[mode]) {
      navigate(PATH_FOR_MODE[mode], { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (window.location.pathname !== "/auth/callback" || callbackStarted.current) return;
    callbackStarted.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || "";
    window.history.replaceState({}, "", "/");
    if (!/^[0-9a-f-]{36}$/i.test(code)) {
      setMode("login");
      setError("Ijtimoiy tarmoq orqali kirish yakunlanmadi. Qayta urinib ko‘ring.");
      return;
    }
    setMode("oauth");
    setLoading(true);
    void completeOAuth(code)
      .catch(() => {
        setMode("login");
        setError("Google yoki GitHub orqali kirishda xatolik yuz berdi. Qayta urinib ko‘ring.");
      })
      .finally(() => setLoading(false));
  }, [completeOAuth]);

  const title = useMemo(() => ({
    login: "Qaytganingiz yaxshi",
    register: "Jamoangizni boshlang",
    verify: "Emailni tasdiqlang",
    forgot: "Parolni tiklash",
    resetCode: "Kodni kiriting",
    newPassword: "Yangi parol",
    oauth: "Hisob tekshirilmoqda",
  })[mode], [mode]);

  const goTo = (next: Mode, options?: { replace?: boolean }) => {
    setMode(next);
    navigate(PATH_FOR_MODE[next], options);
  };

  const switchMode = (next: Mode) => {
    goTo(next);
    setError("");
    if (next === "login") {
      setDevVerificationCode("");
      setDevResetCode("");
    }
  };

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    try {
      await login(email, String(data.get("password") || ""));
    } catch (caught) {
      if (caught instanceof ApiError) {
        const token = detailValue(caught, "verifyToken");
        if (token) {
          setVerifyToken(token);
          setVerificationEmail(email);
          setDevVerificationCode(detailValue(caught, "devVerificationCode") || "");
          goTo("verify");
          setError("");
        } else setError(caught.message);
      } else setError("Server bilan aloqa bo‘lmadi");
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    if (password !== String(data.get("confirmation") || "")) {
      setError("Parollar bir xil emas");
      setLoading(false);
      return;
    }
    try {
      const result = await api.auth.register({
        firstName: String(data.get("firstName") || "").trim(),
        lastName: String(data.get("lastName") || "").trim(),
        username: String(data.get("username") || "").trim(),
        email,
        password,
        occupation: String(data.get("occupation") || "other"),
      });
      setVerifyToken(result.verifyToken);
      setVerificationEmail(email);
      setDevVerificationCode(result.devVerificationCode || "");
      goTo("verify");
      show("Tasdiqlash kodi yuborildi");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ro‘yxatdan o‘tib bo‘lmadi");
    } finally {
      setLoading(false);
    }
  }

  async function submitVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await completeAuth(await api.auth.verify(verifyToken, String(data.get("code") || "").replace(/\D/g, "")));
      show("Email tasdiqlandi");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kod noto‘g‘ri");
    } finally {
      setLoading(false);
    }
  }

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api.auth.forgotPassword(String(data.get("email") || "").trim());
      show(result.message);
      if (result.resetToken) {
        setResetToken(result.resetToken);
        setDevResetCode(result.devResetCode || "");
        goTo("resetCode");
      } else goTo("login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "So‘rov yuborilmadi");
    } finally {
      setLoading(false);
    }
  }

  async function submitResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api.auth.verifyResetOtp(resetToken, String(data.get("code") || "").replace(/\D/g, ""));
      setConfirmedToken(result.confirmedToken);
      goTo("newPassword");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kod noto‘g‘ri");
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("confirmation") || "");
    if (password !== confirmation) {
      setError("Parollar bir xil emas");
      setLoading(false);
      return;
    }
    try {
      const result = await api.auth.resetPassword(confirmedToken, password);
      show(result.message);
      goTo("login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Parol yangilanmadi");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!verificationEmail || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.auth.resendVerification(verificationEmail);
      setVerifyToken(result.verifyToken);
      setDevVerificationCode(result.devVerificationCode || "");
      show("Yangi tasdiqlash kodi yuborildi");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kod qayta yuborilmadi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Optima haqida">
        <Logo />
        <div className="auth-story-copy">
          <p className="eyebrow">Bir joyda ishlang</p>
          <h1>Jamoa ishi,<br />ortiqcha shovqinsiz.</h1>
          <p>Chat, meeting va vazifalar bir workspace ichida. Kim nima qilayotgani doim aniq.</p>
        </div>
        <div className="auth-proof">
          <span><UsersRound size={18} /> Guruh va shaxsiy chat</span>
          <span><Video size={18} /> Real meeting</span>
          <span><ShieldCheck size={18} /> Himoyalangan sessiya</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          {mode !== "login" && <button className="back-button" onClick={() => switchMode("login")}><ArrowLeft size={17} /> Kirishga qaytish</button>}
          <header className="auth-heading">
            <span className="auth-kicker">OPTIMA WORKSPACE</span>
            <h2>{title}</h2>
            <p>
              {mode === "login" && "Workspace’ingizga kirish uchun ma’lumotlarni kiriting."}
              {mode === "register" && "Bir daqiqada hisob va birinchi workspace yarating."}
              {mode === "verify" && <>{verificationEmail} manziliga yuborilgan 6 xonali kodni kiriting.</>}
              {mode === "forgot" && "Emailni kiriting. Tiklash kodi shu manzilga yuboriladi."}
              {mode === "resetCode" && "Emailga yuborilgan 6 xonali kodni kiriting."}
              {mode === "newPassword" && "Hisobingiz uchun kuchli yangi parol belgilang."}
              {mode === "oauth" && "Xavfsiz kirish yakunlanmoqda. Bu oynani yopmang."}
            </p>
          </header>

          {error && <div className="form-error" role="alert">{error}</div>}

          {mode === "login" && (
            <form className="auth-form" onSubmit={submitLogin}>
              {showDemoAccess && (
                <div className="demo-access" aria-label="Demo ko‘rinishlar">
                  <button type="button" onClick={() => void enterDemo("demo")} disabled={loading}>
                    <PlayCircle size={18} aria-hidden="true" />
                    <span><strong>Demo</strong><small>Asosiy MVP</small></span>
                  </button>
                  <button type="button" className="premium" onClick={() => void enterDemo("premium")} disabled={loading}>
                    <Crown size={18} aria-hidden="true" />
                    <span><strong>Premium demo</strong><small>To‘liq ma’lumotlar</small></span>
                  </button>
                </div>
              )}
              <SocialAuthButtons disabled={loading} />
              <div className="auth-divider"><span>yoki</span></div>
              <label>Email<input name="email" type="email" autoComplete="email" placeholder="name@company.com" required /></label>
              <label>Parol<span className="password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Parolingiz" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
              <button type="button" className="text-button auth-forgot" onClick={() => switchMode("forgot")}>Parol esdan chiqdimi?</button>
              <Button type="submit" loading={loading} icon={<ArrowRight size={17} />}>Workspace’ga kirish</Button>
              <p className="auth-switch">Hisobingiz yo‘qmi? <button type="button" onClick={() => switchMode("register")}>Ro‘yxatdan o‘ting</button></p>
            </form>
          )}

          {mode === "register" && (
            <form className="auth-form" onSubmit={submitRegister}>
              <SocialAuthButtons disabled={loading} />
              <div className="auth-divider"><span>yoki</span></div>
              <div className="form-grid-2"><label>Ism<input name="firstName" autoComplete="given-name" required maxLength={50} /></label><label>Familiya<input name="lastName" autoComplete="family-name" required maxLength={50} /></label></div>
              <label>Username<input name="username" autoComplete="username" placeholder="ahmad_dev" pattern="[A-Za-z0-9_\-]{3,50}" required /></label>
              <label>Email<input name="email" type="email" autoComplete="email" placeholder="name@company.com" required /></label>
              <label>Kasbingiz<select name="occupation" defaultValue="developer"><option value="developer">Dasturchi</option><option value="designer">Dizayner</option><option value="project_manager">Project manager</option><option value="freelancer">Freelancer</option><option value="student">Talaba</option><option value="other">Boshqa</option></select></label>
              <label>Parol<span className="password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} placeholder="Kamida 8 belgi" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Parolni ko‘rsatish"><Eye size={18} /></button></span><small>1 katta harf, 1 kichik harf, raqam va maxsus belgi.</small></label>
              <label>Parolni takrorlang<input name="confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={32} required /></label>
              <Button type="submit" loading={loading} icon={<ArrowRight size={17} />}>Hisob yaratish</Button>
            </form>
          )}

          {mode === "oauth" && (
            <div className="oauth-loading" role="status" aria-live="polite">
              <LoaderCircle className="spin" size={24} />
              <span>Session yaratilmoqda…</span>
            </div>
          )}

          {mode === "verify" && (
            <form className="auth-form verify-form" onSubmit={submitVerify}>
              <label>Tasdiqlash kodi<input key={devVerificationCode} className="code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" defaultValue={devVerificationCode} autoFocus required /></label>
              <Button type="submit" loading={loading} icon={<Check size={17} />}>Tasdiqlash va davom etish</Button>
              <button type="button" className="text-button resend-button" onClick={() => void resendVerification()} disabled={loading}>Kodni qayta yuborish</button>
              <p className="security-note"><LockKeyhole size={16} /> Kod 10 daqiqa amal qiladi.</p>
            </form>
          )}

          {mode === "forgot" && (
            <form className="auth-form" onSubmit={submitForgot}>
              <label>Email<input name="email" type="email" autoComplete="email" placeholder="name@company.com" required /></label>
              <Button type="submit" loading={loading} icon={<Mail size={17} />}>Tiklash kodini yuborish</Button>
            </form>
          )}

          {mode === "resetCode" && (
            <form className="auth-form verify-form" onSubmit={submitResetCode}>
              <label>Tiklash kodi<input key={devResetCode} className="code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" defaultValue={devResetCode} autoFocus required /></label>
              <Button type="submit" loading={loading} icon={<Check size={17} />}>Kodni tasdiqlash</Button>
              <p className="security-note"><LockKeyhole size={16} /> Kod 15 daqiqa amal qiladi.</p>
            </form>
          )}

          {mode === "newPassword" && (
            <form className="auth-form" onSubmit={submitNewPassword}>
              <label>Yangi parol<span className="password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={32} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span><small>1 katta harf, 1 kichik harf, raqam va maxsus belgi.</small></label>
              <label>Parolni takrorlang<input name="confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={32} required /></label>
              <Button type="submit" loading={loading} icon={<Check size={17} />}>Parolni yangilash</Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

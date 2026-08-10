import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Github, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UsersRound, Video } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, oauthStartUrl, type OAuthProvider } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { Button, Logo } from "../components/ui";
import { useToast } from "../components/Toast";

type Mode = "login" | "register" | "verify" | "forgot" | "resetCode" | "newPassword" | "oauth";

function SocialAuthButtons({ disabled }: { disabled: boolean }) {
  const { t } = useI18n();
  const start = (provider: OAuthProvider) => {
    window.location.assign(oauthStartUrl(provider));
  };
  return (
    <div className="social-auth" aria-label={t("auth.socialAria")}>
      <button type="button" onClick={() => start("google")} disabled={disabled}>
        <span className="google-mark" aria-hidden="true">G</span>
        {t("auth.googleContinue")}
      </button>
      <button type="button" onClick={() => start("github")} disabled={disabled}>
        <Github size={18} aria-hidden="true" />
        {t("auth.githubContinue")}
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
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
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

  useEffect(() => {
    if (window.location.pathname !== "/auth/callback" || callbackStarted.current) return;
    callbackStarted.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || "";
    window.history.replaceState({}, "", "/");
    if (!/^[0-9a-f-]{36}$/i.test(code)) {
      setMode("login");
      setError(t("auth.oauthCallbackFailed"));
      return;
    }
    setMode("oauth");
    setLoading(true);
    void completeOAuth(code)
      .catch(() => {
        setMode("login");
        setError(t("auth.oauthError"));
      })
      .finally(() => setLoading(false));
  }, [completeOAuth, t]);

  const title = useMemo(() => ({
    login: t("auth.titleLogin"),
    register: t("auth.titleRegister"),
    verify: t("auth.titleVerify"),
    forgot: t("auth.titleForgot"),
    resetCode: t("auth.titleResetCode"),
    newPassword: t("auth.titleNewPassword"),
    oauth: t("auth.titleOauth"),
  })[mode], [mode, t]);

  const switchMode = (next: Mode) => {
    setMode(next);
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
          setMode("verify");
          setError("");
        } else setError(caught.message);
      } else setError(t("auth.serverUnreachable"));
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
      setError(t("auth.passwordsMismatch"));
      setLoading(false);
      return;
    }
    try {
      const result = await api.auth.register({
        firstName: String(data.get("firstName") || "").trim(),
        lastName: String(data.get("lastName") || "").trim(),
        ...(String(data.get("username") || "").trim() ? { username: String(data.get("username") || "").trim() } : {}),
        email,
        password,
        occupation: String(data.get("occupation") || "other"),
      });
      setVerifyToken(result.verifyToken);
      setVerificationEmail(email);
      setDevVerificationCode(result.devVerificationCode || "");
      setMode("verify");
      show(t("auth.verificationSent"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.registerFailed"));
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
      show(t("auth.emailVerified"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.codeInvalid"));
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
        setMode("resetCode");
      } else setMode("login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.requestFailed"));
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
      setMode("newPassword");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.codeInvalid"));
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
      setError(t("auth.passwordsMismatch"));
      setLoading(false);
      return;
    }
    try {
      const result = await api.auth.resetPassword(confirmedToken, password);
      show(result.message);
      setMode("login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.passwordNotUpdated"));
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
      show(t("auth.newCodeSent"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.codeResendFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Optima">
        <Logo />
        <div className="auth-story-copy">
          <p className="eyebrow">{t("auth.storyEyebrow")}</p>
          <h1>{t("auth.storyTitleLine1")}<br />{t("auth.storyTitleLine2")}</h1>
          <p>{t("auth.storyDescription")}</p>
        </div>
        <div className="auth-proof">
          <span><UsersRound size={18} /> {t("auth.proofGroupChat")}</span>
          <span><Video size={18} /> {t("auth.proofVideo")}</span>
          <span><ShieldCheck size={18} /> {t("auth.proofSecurity")}</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <Logo />
          {mode !== "login" && <button className="back-button" onClick={() => switchMode("login")}><ArrowLeft size={17} /> {t("auth.backToLogin")}</button>}
          <header className="auth-heading">
            <span className="auth-kicker">OPTIMA</span>
            <h2>{title}</h2>
            <p>
              {mode === "login" && t("auth.subtitleLogin")}
              {mode === "register" && t("auth.subtitleRegister")}
              {mode === "verify" && t("auth.subtitleVerify", { email: verificationEmail })}
              {mode === "forgot" && t("auth.subtitleForgot")}
              {mode === "resetCode" && t("auth.subtitleResetCode")}
              {mode === "newPassword" && t("auth.subtitleNewPassword")}
              {mode === "oauth" && t("auth.subtitleOauth")}
            </p>
          </header>

          {error && <div className="form-error" role="alert">{error}</div>}

          {mode === "login" && (
            <form className="auth-form" onSubmit={submitLogin}>
              <SocialAuthButtons disabled={loading} />
              <div className="auth-divider"><span>{t("auth.or")}</span></div>
              <label>{t("auth.emailLabel")}<input name="email" type="email" autoComplete="email" placeholder="name@company.com" required /></label>
              <label>{t("auth.passwordLabel")}<span className="password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={t("auth.passwordPlaceholder")} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
              <button type="button" className="text-button auth-forgot" onClick={() => switchMode("forgot")}>{t("auth.forgotPassword")}</button>
              <Button type="submit" loading={loading} icon={<ArrowRight size={17} />}>{t("auth.loginButton")}</Button>
              <p className="auth-switch">{t("auth.noAccount")} <button type="button" onClick={() => switchMode("register")}>{t("auth.registerLink")}</button></p>
            </form>
          )}

          {mode === "register" && (
            <form className="auth-form" onSubmit={submitRegister}>
              <SocialAuthButtons disabled={loading} />
              <div className="auth-divider"><span>{t("auth.or")}</span></div>
              <div className="form-grid-2"><label>{t("auth.firstNameLabel")}<input name="firstName" autoComplete="given-name" required maxLength={50} /></label><label>{t("auth.lastNameLabel")}<input name="lastName" autoComplete="family-name" required maxLength={50} /></label></div>
              <label>{t("auth.usernameLabel")} <small>{t("common.optional")}</small><input name="username" autoComplete="username" placeholder={t("auth.usernamePlaceholder")} pattern="[A-Za-z0-9_-]{3,50}" /></label>
              <label>{t("auth.emailLabel")}<input name="email" type="email" autoComplete="email" placeholder="name@company.com" required /></label>
              <label>{t("auth.occupationLabel")}<select name="occupation" defaultValue="developer">
                <option value="developer">{t("common.occupations.developer")}</option>
                <option value="designer">{t("common.occupations.designer")}</option>
                <option value="project_manager">{t("common.occupations.project_manager")}</option>
                <option value="freelancer">{t("common.occupations.freelancer")}</option>
                <option value="student">{t("common.occupations.student")}</option>
                <option value="other">{t("common.occupations.other")}</option>
              </select></label>
              <label>{t("auth.passwordLabel")}<span className="password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} placeholder={t("auth.passwordMinPlaceholder")} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={t("auth.showPassword")}><Eye size={18} /></button></span><small>{t("auth.passwordHint")}</small></label>
              <label>{t("auth.repeatPassword")}<input name="confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={32} required /></label>
              <Button type="submit" loading={loading} icon={<ArrowRight size={17} />}>{t("auth.createAccount")}</Button>
            </form>
          )}

          {mode === "oauth" && (
            <div className="oauth-loading" role="status" aria-live="polite">
              <LoaderCircle className="spin" size={24} />
              <span>{t("auth.sessionCreating")}</span>
            </div>
          )}

          {mode === "verify" && (
            <form className="auth-form verify-form" onSubmit={submitVerify}>
              <label>{t("auth.verificationCodeLabel")}<input key={devVerificationCode} className="code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" defaultValue={devVerificationCode} autoFocus required /></label>
              <Button type="submit" loading={loading} icon={<Check size={17} />}>{t("auth.verifyContinue")}</Button>
              <button type="button" className="text-button resend-button" onClick={() => void resendVerification()} disabled={loading}>{t("auth.resendCode")}</button>
              <p className="security-note"><LockKeyhole size={16} /> {t("auth.codeValidMinutes", { minutes: 10 })}</p>
            </form>
          )}

          {mode === "forgot" && (
            <form className="auth-form" onSubmit={submitForgot}>
              <label>{t("auth.emailLabel")}<input name="email" type="email" autoComplete="email" placeholder="name@company.com" required /></label>
              <Button type="submit" loading={loading} icon={<Mail size={17} />}>{t("auth.sendResetCode")}</Button>
            </form>
          )}

          {mode === "resetCode" && (
            <form className="auth-form verify-form" onSubmit={submitResetCode}>
              <label>{t("auth.resetCodeLabel")}<input key={devResetCode} className="code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" defaultValue={devResetCode} autoFocus required /></label>
              <Button type="submit" loading={loading} icon={<Check size={17} />}>{t("auth.confirmCode")}</Button>
              <p className="security-note"><LockKeyhole size={16} /> {t("auth.codeValidMinutes", { minutes: 15 })}</p>
            </form>
          )}

          {mode === "newPassword" && (
            <form className="auth-form" onSubmit={submitNewPassword}>
              <label>{t("auth.newPasswordLabel")}<span className="password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={32} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span><small>{t("auth.passwordHint")}</small></label>
              <label>{t("auth.repeatPassword")}<input name="confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={32} required /></label>
              <Button type="submit" loading={loading} icon={<Check size={17} />}>{t("auth.updatePassword")}</Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

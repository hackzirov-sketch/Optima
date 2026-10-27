import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import TutorAvatar from '../components/TutorAvatar.jsx';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';

function Shell({ children, side }) {
  return (
    <div className="auth">
      <section className="auth-form">
        <Link className="brand" to="/" style={{ color: 'var(--ink)', padding: 0 }}><span className="logo">O</span><span>OPTIMA <em style={{ color: 'var(--primary)' }}>Ta’lim</em></span></Link>
        {children}
      </section>
      <aside className="auth-side" aria-hidden="true">
        <TutorAvatar id={side} size={260} state="talking" />
        <p className="h2" style={{ color: '#fff', maxWidth: 360, textAlign: 'center' }}>
          {side === 'malika' ? '“Har kuni 10 daqiqa — bir yilda butun bir til.”' : '“Xato — bu o‘rganishning bir qadami. Davom etamiz!”'}
        </p>
      </aside>
    </div>
  );
}

function SocialRow() {
  const { notify } = useApp();
  return (
    <div className="stack-sm">
      <div className="divider"><span>yoki</span></div>
      <div className="row-wrap" style={{ gap: 10 }}>
        <button type="button" className="btn ghost grow" onClick={() => notify('Google orqali kirish — backend ulanganda ishlaydi')}>Google</button>
        <button type="button" className="btn ghost grow" onClick={() => notify('Telegram orqali kirish — backend ulanganda ishlaydi')}>Telegram</button>
        <button type="button" className="btn ghost grow" onClick={() => notify('OneID orqali kirish — backend ulanganda ishlaydi')}>OneID</button>
      </div>
    </div>
  );
}

export function Login() {
  const { auth } = useApp();
  const { t } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');

  function submit(e) {
    e.preventDefault();
    const res = auth.login(login, pass);
    if (res) setErr(res); else nav(loc.state?.from || '/', { replace: true });
  }

  return (
    <Shell side="kamron">
      <form className="stack-lg" onSubmit={submit} noValidate>
        <div className="stack-sm"><h1 className="h1">{t('auth.welcome')}</h1><p className="muted">{t('auth.sub')}</p></div>
        <label className="stack-sm"><span className="small" style={{ fontWeight: 600 }}>{t('auth.login')}</span>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="+998 90 123 45 67" required />
        </label>
        <label className="stack-sm"><span className="small" style={{ fontWeight: 600 }}>{t('auth.password')}</span>
          <span className="field" style={{ minHeight: 48, padding: '0 6px 0 14px' }}>
            <input type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required style={{ fontSize: 17 }} />
            <button type="button" className="act" onClick={() => setShow(!show)}>{show ? 'Yashirish' : 'Ko‘rsatish'}</button>
          </span>
        </label>
        {err && <p className="feedback bad" role="alert" style={{ padding: '10px 14px' }}>{err}</p>}
        <button className="btn" type="submit" style={{ minHeight: 50 }}>{t('c.login')}</button>
        <button className="btn ghost" type="button" onClick={() => { auth.demo(); nav('/', { replace: true }); }}><Icon name="sparkle" />{t('auth.demo')}</button>
        <SocialRow />
        <p className="muted small">{t('auth.noAccount')} <Link to="/royxat" style={{ fontWeight: 600 }}>{t('c.register')}</Link></p>
      </form>
    </Shell>
  );
}

export function Register() {
  const { auth } = useApp();
  const { t } = useT();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [agree, setAgree] = useState(true);
  const [err, setErr] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!agree) { setErr('Foydalanish shartlariga rozilik bering'); return; }
    const res = auth.register(name, login, pass);
    if (res) setErr(res); else nav('/boshlash', { replace: true });
  }

  const strength = pass.length >= 10 && /\d/.test(pass) ? 3 : pass.length >= 6 ? 2 : pass ? 1 : 0;

  return (
    <Shell side="malika">
      <form className="stack-lg" onSubmit={submit} noValidate>
        <div className="stack-sm"><h1 className="h1">{t('c.register')}</h1><p className="muted">1 daqiqa — va ustozingiz sizni kutadi.</p></div>
        <label className="stack-sm"><span className="small" style={{ fontWeight: 600 }}>{t('auth.name')}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Masalan: Dilnoza Karimova" />
        </label>
        <label className="stack-sm"><span className="small" style={{ fontWeight: 600 }}>{t('auth.login')}</span>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="+998 90 123 45 67" />
        </label>
        <label className="stack-sm"><span className="small" style={{ fontWeight: 600 }}>{t('auth.password')}</span>
          <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" placeholder="Kamida 6 belgi" />
          <span className="row" style={{ gap: 6 }}>
            {[1, 2, 3].map((i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: strength >= i ? ['', '#E8742A', '#F4B32C', '#1F8A5B'][strength] : 'var(--track)' }} />)}
            <span className="muted xs" style={{ minWidth: 60, textAlign: 'right' }}>{['', 'Kuchsiz', 'Yaxshi', 'Kuchli'][strength]}</span>
          </span>
        </label>
        <label className="row small" style={{ gap: 10 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20 }} />
          Foydalanish shartlari va maxfiylik siyosatiga roziman
        </label>
        {err && <p className="feedback bad" role="alert" style={{ padding: '10px 14px' }}>{err}</p>}
        <button className="btn" type="submit" style={{ minHeight: 50 }}>{t('c.register')}</button>
        <SocialRow />
        <p className="muted small">{t('auth.haveAccount')} <Link to="/kirish" style={{ fontWeight: 600 }}>{t('c.login')}</Link></p>
      </form>
    </Shell>
  );
}

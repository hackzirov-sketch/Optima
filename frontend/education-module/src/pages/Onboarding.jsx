import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import TutorAvatar from '../components/TutorAvatar.jsx';
import { TUTORS } from '../data/avatars.js';
import { useApp } from '../store.jsx';
import { speak } from '../lib/speech.js';

const ROLES = [['student', 'O‘quvchiman', 'user'], ['parent', 'Ota-onaman', 'users'], ['teacher', 'O‘qituvchiman', 'cap']];
const GOALS = [['en', 'Ingliz tili'], ['math', 'Matematika'], ['ielts', 'IELTS'], ['dtm', 'DTM / attestatsiya']];
const PACE = [[50, 'Yengil', '5 daqiqa'], [100, 'O‘rtacha', '10 daqiqa'], [150, 'Jiddiy', '20 daqiqa'], [250, 'Intensiv', '30+ daqiqa']];

export default function Onboarding() {
  const { profile, updateProfile, auth } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ role: profile.role, grade: profile.grade, goals: profile.goals, tutorId: profile.tutorId, goalXp: profile.goalXp });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const steps = ['Siz kimsiz?', 'Nimani o‘rganamiz?', 'O‘z ustozingni tanla', 'Kunlik maqsad'];

  function finish() {
    updateProfile({ ...form, onboarded: true });
    nav('/', { replace: true });
  }

  function chooseTutor(tu) {
    set({ tutorId: tu.id });
    speak(tu.hello, { lang: 'uz-UZ', gender: tu.gender });
  }

  return (
    <div className="onboard">
      <div className="onboard-card">
        <div className="between">
          <span className="muted small">{step + 1} / {steps.length}</span>
          <button type="button" className="act" onClick={() => auth.logout()}>Chiqish</button>
        </div>
        <div className="row" style={{ gap: 6 }}>{steps.map((s, i) => <span key={s} style={{ flex: 1, height: 6, borderRadius: 6, background: i <= step ? 'var(--primary)' : 'var(--track)' }} />)}</div>
        <h1 className="h1">{steps[step]}</h1>

        {step === 0 && (
          <div className="stack-lg">
            <div className="grid" style={{ '--min': '160px' }}>
              {ROLES.map(([v, l, ic]) => (
                <button key={v} type="button" className={'choice-card' + (form.role === v ? ' on' : '')} aria-pressed={form.role === v} onClick={() => set({ role: v })}>
                  <Icon name={ic} size={28} /><b>{l}</b>
                </button>
              ))}
            </div>
            <div className="stack-sm">
              <b>Sinf</b>
              <div className="row-wrap">{Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                <button key={g} type="button" className={'grade' + (form.grade === g ? ' on' : '')} aria-pressed={form.grade === g} onClick={() => set({ grade: g })}>{g}</button>
              ))}</div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid" style={{ '--min': '180px' }}>
            {GOALS.map(([v, l]) => {
              const on = form.goals.includes(v);
              return (
                <button key={v} type="button" className={'choice-card' + (on ? ' on' : '')} aria-pressed={on} onClick={() => set({ goals: on ? form.goals.filter((x) => x !== v) : [...form.goals, v] })}>
                  <b>{l}</b><span className="muted xs">{on ? 'Tanlangan' : 'Tanlash'}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="grid" style={{ '--min': '200px' }}>
            {TUTORS.map((tu) => (
              <article key={tu.id} className={'tutor-card' + (form.tutorId === tu.id ? ' on' : '')}>
                <div className="tutor-pic" style={{ background: tu.bg }}>
                  <span className="tag" style={{ position: 'absolute', left: 12, top: 12, background: '#fff' }}>{tu.trait}</span>
                  <TutorAvatar id={tu.id} size={170} state={form.tutorId === tu.id ? 'talking' : 'idle'} />
                </div>
                <div className="stack" style={{ padding: 16 }}>
                  <h3 className="h2">{tu.name}</h3>
                  <span className="muted small">{tu.role} · {tu.gender === 'male' ? 'erkak ovozi' : 'ayol ovozi'}</span>
                  <button type="button" className={'btn ' + (form.tutorId === tu.id ? 'ghost' : 'ink')} onClick={() => chooseTutor(tu)}>
                    {form.tutorId === tu.id ? <><Icon name="tick" />Tanlangan</> : <><Icon name="user" />Tanlash</>}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="grid" style={{ '--min': '160px' }}>
            {PACE.map(([v, l, d]) => (
              <button key={v} type="button" className={'choice-card' + (form.goalXp === v ? ' on' : '')} aria-pressed={form.goalXp === v} onClick={() => set({ goalXp: v })}>
                <b>{l}</b><span className="muted small">{d} / kun · {v} XP</span>
              </button>
            ))}
          </div>
        )}

        <div className="between" style={{ marginTop: 8 }}>
          <button type="button" className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Orqaga</button>
          {step < steps.length - 1
            ? <button type="button" className="btn" disabled={step === 1 && !form.goals.length} onClick={() => setStep(step + 1)}>Keyingi<Icon name="arrow" /></button>
            : <button type="button" className="btn" onClick={finish}>Boshladik!<Icon name="arrow" /></button>}
        </div>
      </div>
    </div>
  );
}

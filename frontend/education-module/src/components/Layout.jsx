import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Avatar, fmt } from './ui.jsx';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';

const NAV = [
  { group: null, items: [
    { to: '/', key: 'nav.home', icon: 'home', end: true },
    { to: '/avatar', key: 'nav.avatar', icon: 'smile' },
    { to: '/ustoz-ai', key: 'nav.chat', icon: 'chat' },
  ] },
  { group: 'grp.learn', items: [
    { to: '/darslar', key: 'nav.lessons', icon: 'book' },
    { to: '/sozlar', key: 'nav.words', icon: 'words' },
    { to: '/lugatlar', key: 'nav.dictionary', icon: 'dict' },
    { to: '/matematika', key: 'nav.math', icon: 'math' },
    { to: '/videolar', key: 'nav.videos', icon: 'video' },
    { to: '/kurslar', key: 'nav.courses', icon: 'cap' },
  ] },
  { group: 'grp.practice', items: [
    { to: '/mashq', key: 'nav.practice', icon: 'game' },
    { to: '/xatolar', key: 'nav.mistakes', icon: 'alert', badge: 'mistakes' },
  ] },
  { group: 'grp.community', items: [
    { to: '/reyting', key: 'nav.rating', icon: 'trophy' },
    { to: '/fikrlar', key: 'nav.community', icon: 'bulb' },
  ] },
];

const PRIMARY = ['/', '/darslar', '/lugatlar', '/matematika', '/sozlar', '/ustoz-ai'];
const primaryItems = PRIMARY.map(to => NAV.flatMap(group => group.items).find(item => item.to === to));

export default function Layout() {
  const { totalXp, profile, stats } = useApp();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const navRef = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector('a.active');
    if (nav && active) nav.scrollLeft = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.clientWidth) / 2;
  }, [pathname]);
  const initials = (profile.name || 'O').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="learning-shell">
      <header className="learning-navigation">
        <nav ref={navRef} aria-label="Ta’lim navigatsiyasi">
          {primaryItems.map(item => <NavLink key={item.to} to={item.to} end={item.end}>
            <span className="learning-nav-icon"><Icon name={item.icon} /></span><span>{t(item.key)}</span>
          </NavLink>)}
        </nav>
        <button className="learning-more-toggle" type="button" aria-label="Barcha ta’lim bo‘limlari" aria-expanded={open} aria-controls="learning-more" onClick={() => setOpen(!open)}>
          <Icon name={open ? 'close' : 'menu'} /><span>Bo‘limlar</span>
        </button>
      </header>
      {open && <nav id="learning-more" className="learning-more" aria-label="Qo‘shimcha ta’lim bo‘limlari">
        {NAV.flatMap(group => group.items).filter(item => !PRIMARY.includes(item.to)).map(item => (
          <NavLink key={item.to} to={item.to}><Icon name={item.icon} /><span>{t(item.key)}</span>
            {item.badge === 'mistakes' && stats.mistakes > 0 && <span className="nav-badge">{stats.mistakes}</span>}
          </NavLink>
        ))}
        <NavLink className="learning-profile-link" to="/profil">
          <Avatar initials={initials} /><span><strong>{profile.name || 'O‘quvchi'}</strong><small>{profile.grade}-sinf · {fmt(totalXp)} XP</small></span>
        </NavLink>
      </nav>}
      <main className="main learning-main"><Outlet /></main>
    </div>
  );
}

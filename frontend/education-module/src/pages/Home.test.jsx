// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Home from './Home.jsx';
import LessonDetail from './LessonDetail.jsx';
import Layout from '../components/Layout.jsx';

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../store.jsx', () => ({ useApp: () => mocks.app }));
vi.mock('../i18n.jsx', () => ({ useT: () => ({ t: key => key, lang: 'en' }) }));
vi.mock('../lib/speech.js', () => ({ speak: vi.fn() }));
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = vi.fn();
  mocks.app = {
    profile: { name: 'Test Student', grade: 9, tutorId: 'kamron', goalXp: 100 },
    stats: { week: [], doneToday: [], dueCount: 0, streak: 0, todayXp: 0, learnedCount: 0, accuracy: 0, lessonsDone: 0, storiesDone: 0, mathDone: 0, weekXp: 0, mistakes: 0 },
    lessonsDone: {}, storiesDone: {}, mathDone: {}, savedWords: [], totalXp: 0,
    quiz: { correct: 0, answered: 0 }, updateProfile: vi.fn(),
  };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function home() { await act(async () => root.render(<MemoryRouter><Home /></MemoryRouter>)); }

it('puts the lesson and subjects ahead of statistics', async () => {
  await home();
  const focus = host.querySelector('.learning-focus');
  const stats = host.querySelector('[aria-label="Statistika"]');
  expect(focus.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(host.querySelector('.learning-subjects').compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(host.querySelector('.learning-focus-actions > a').getAttribute('href')).toBe('/darslar/1');
});
it('resumes the last opened unfinished lesson', async () => {
  mocks.app.profile.lastLessonId = 5;
  await home();
  const link = host.querySelector('.learning-focus-actions > a');
  expect(link.getAttribute('href')).toBe('/darslar/5');
  expect(link.textContent).toContain('Davom ettirish');
});
it('recommends an unfinished lesson instead of a completed last lesson', async () => {
  mocks.app.profile.lastLessonId = 5; mocks.app.lessonsDone[5] = 100;
  await home();
  expect(host.querySelector('.learning-focus-actions > a').getAttribute('href')).toBe('/darslar/1');
  expect(host.querySelector('.learning-focus-actions > a').textContent).toContain('Darsni boshlash');
});
it('keeps secondary sections accessible and closes their menu after navigation', async () => {
  await act(async () => root.render(<MemoryRouter><Layout /></MemoryRouter>));
  const button = host.querySelector('.learning-more-toggle');
  expect(host.querySelector('.learning-more')).toBeNull();
  await act(async () => button.click());
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('.learning-navigation a[href="/lugatlar"]')).not.toBeNull();
  for (const path of ['/avatar', '/videolar', '/kurslar', '/mashq', '/xatolar', '/reyting', '/fikrlar', '/profil']) {
    expect(host.querySelector(`.learning-more a[href="${path}"]`)).not.toBeNull();
  }
  await act(async () => host.querySelector('.learning-more a[href="/mashq"]').click());
  expect(host.querySelector('.learning-more')).toBeNull();
});
it('records a real lesson visit for the resume action', async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/darslar/5']}><Routes><Route path="/darslar/:id" element={<LessonDetail />} /></Routes></MemoryRouter>));
  expect(mocks.app.updateProfile).toHaveBeenCalledWith({ lastLessonId: 5 });
});

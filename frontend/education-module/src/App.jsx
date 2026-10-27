import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useApp } from './store.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Home from './pages/Home.jsx';
import AvatarTalk from './pages/AvatarTalk.jsx';
import Chat from './pages/Chat.jsx';
import Lessons from './pages/Lessons.jsx';
import LessonDetail from './pages/LessonDetail.jsx';
import StoryDetail from './pages/StoryDetail.jsx';
import Words from './pages/Words.jsx';
import Dictionary from './pages/Dictionary.jsx';
import MathPage from './pages/Math.jsx';
import MathChapter from './pages/MathChapter.jsx';
import Practice from './pages/Practice.jsx';
import CloudGame from './pages/CloudGame.jsx';
import WordQuiz from './pages/WordQuiz.jsx';
import Mistakes from './pages/Mistakes.jsx';
import Videos from './pages/Videos.jsx';
import Courses from './pages/Courses.jsx';
import Rating from './pages/Rating.jsx';
import Community from './pages/Community.jsx';
import Profile from './pages/Profile.jsx';

function NotFound() {
  return (
    <div className="card stack" style={{ alignItems: 'flex-start' }}>
      <h1 className="h1">Sahifa topilmadi</h1>
      <Link className="btn" to="/">Bosh sahifaga qaytish</Link>
    </div>
  );
}

function Gate() {
  const { profile } = useApp();
  if (!profile.onboarded) return <Navigate to="/boshlash" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/kirish" element={<Navigate to="/" replace />} />
        <Route path="/royxat" element={<Navigate to="/" replace />} />
        <Route path="/boshlash" element={<Onboarding />} />
        <Route path="/" element={<Gate />}>
          <Route index element={<Home />} />
          <Route path="avatar" element={<AvatarTalk />} />
          <Route path="ustoz-ai" element={<Chat />} />
          <Route path="darslar" element={<Lessons />} />
          <Route path="darslar/:id" element={<LessonDetail />} />
          <Route path="hikoya/:id" element={<StoryDetail />} />
          <Route path="sozlar" element={<Words />} />
          <Route path="lugatlar" element={<Dictionary />} />
          <Route path="matematika" element={<MathPage />} />
          <Route path="matematika/:grade/:chapter" element={<MathChapter />} />
          <Route path="mashq" element={<Practice />} />
          <Route path="mashq/bulutlar" element={<CloudGame />} />
          <Route path="mashq/soz-testi" element={<WordQuiz />} />
          <Route path="xatolar" element={<Mistakes />} />
          <Route path="videolar" element={<Videos />} />
          <Route path="kurslar" element={<Courses />} />
          <Route path="reyting" element={<Rating />} />
          <Route path="fikrlar" element={<Community />} />
          <Route path="profil" element={<Profile />} />
          <Route path="quiz" element={<Navigate to="/mashq" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}

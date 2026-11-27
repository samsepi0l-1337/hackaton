import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { Home } from './pages/Home';
import { Programs } from './pages/Programs';
import { ProgramDetail } from './pages/ProgramDetail';
import { Mentor } from './pages/Mentor';
import { Forgot, Login, Signup, Verify } from './pages/Auth';
import { TypeTest } from './pages/TypeTest';
import { MentorGate } from './components/MentorGate';
import { Me } from './pages/Me';
import { Admin } from './pages/Admin';
import { Licenses, NotFound } from './pages/Misc';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/programs/:id" element={<ProgramDetail />} />
          <Route path="/mentor" element={<MentorGate><Mentor /></MentorGate>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/test" element={<TypeTest />} />
          <Route path="/me" element={<RequireAuth><Me /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          <Route path="/licenses" element={<Licenses />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}

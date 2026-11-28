import { lazy } from 'react';

export const loadMentor = () => import('./pages/Mentor');
export const Mentor = lazy(() => loadMentor().then((m) => ({ default: m.Mentor })));
export const MentorHistory = lazy(() => import('./mentor/History').then((m) => ({ default: m.MentorHistory })));
export const Bufs = lazy(() => import('./pages/Bufs').then((m) => ({ default: m.Bufs })));
export const TypeTest = lazy(() => import('./pages/TypeTest').then((m) => ({ default: m.TypeTest })));
export const Me = lazy(() => import('./pages/Me').then((m) => ({ default: m.Me })));
export const Guide = lazy(() => import('./pages/Guide').then((m) => ({ default: m.Guide })));
export const Apply = lazy(() => import('./pages/Apply').then((m) => ({ default: m.Apply })));
export const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
export const Licenses = lazy(() => import('./pages/Misc').then((m) => ({ default: m.Licenses })));
export const NotFound = lazy(() => import('./pages/Misc').then((m) => ({ default: m.NotFound })));

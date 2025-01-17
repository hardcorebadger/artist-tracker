import {Suspense, lazy, useEffect} from 'react';
import { Navigate, useRoutes, useLocation } from 'react-router-dom';
// layouts
import DashboardLayout from '../layouts/DashboardLayout';
import SplashLayout from '../layouts/SplashLayout';
import SiteLayout from '../layouts/SiteLayout';
import OnboardingLayout from '../layouts/OnboardingLayout';
import AuthGuard from './AuthGuard';
import GuestGuard from './GuestGuard';
import AccessGuard from './AccessGuard';

import LoadingScreen from './LoadingScreen';
import PageCallback from "../pages/PageCallback";
// ----------------------------------------------------------------------

function path(root, sublink) {
  return `${root}${sublink}`;
}

// ----------------------------------------------------------------------

const Loadable = (Component) => (props) => {

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Component {...props} />
    </Suspense>
  );
};


export default function Router() {
  const location = useLocation();

  return useRoutes([
    {
      path: '/',
      element: <SiteLayout/>,
      children: [
        { element: <PageLanding/>, index: true },   
      ],
    },
    {
      path: 'app',
      element: <AuthGuard><DashboardLayout /></AuthGuard>,
      children: [
        { index: true, element: <Navigate to="home" replace />   },
        { path: 'home', element: <PageHome />},
        // { path: 'report/:id', element: <PageArtistReport />},
        { path: 'upgrade', element: <PageUpgrade />},
        { path: 'callback', children: [
            { path: 'spotify', element: <PageCallback /> },
            // { path: '*', element: <Navigate to="/404" replace /> },
          ]},

        { path: 'paywalled', element: <AccessGuard level="elite"><PagePaywalled /></AccessGuard> },
        { path: 'settings',
          children: [
            { index: true, element: <Navigate to="account" replace />   },
            { path: 'account', element: <PageSettings /> },
            { path: 'billing', element: <PageBilling /> },
          ]
        },
        { path: 'reports',
          children: [
            { index: true, element: <Navigate to="all" replace />   },
            { path: 'all', element: <PageReports /> },
            { path: ':id', children: [
                { index: true, element: <PageArtistReport/>},
                { path: 'artists/:artistId', element: <PageArtist/>}
              ] },
          ]
        },
        { path: 'artists',
          children: [
            // { path: 'new', element: <PageAddArtist /> },
            { path: ':artistId', element: <PageArtist /> },
          ]
        },
      ],
    },
    {
      path: 'auth',
      element: <GuestGuard><SiteLayout /></GuestGuard>,
      children: [
        { path: 'login', element: <PageLogin /> },
        { path: 'register', element: <PageCreateAccount /> },
        { path: 'recover', element: <PageResetPassword /> },
        { path: 'join-team', element: <PageNoOrg /> },
      ],
    },
    {
      path: 'onboarding',
      element: <AuthGuard onboarding={true}><OnboardingLayout /></AuthGuard>,
      children: [
        { path: 'join-team', element: <PageNoOrg /> },
      ],
    },
    {
      path: '*',
      element: <SplashLayout />,
      children: [
        { path: '404', element: <Page404 /> },

        { path: '*', element: <Navigate to="/404" replace /> },
      ],
    },
    { path: '*', element: <Navigate to="/404" replace /> },
  ]);
}

const PageArtistReport = Loadable(lazy(() => import('../pages/PageArtistReport')));
const PageReports = Loadable(lazy(() => import('../pages/PageReports')));
const PageAddArtist = Loadable(lazy(() => import('../pages/PageAddArtist')));
const PageHome = Loadable(lazy(() => import('../pages/PageHome')));
const PageArtist = Loadable(lazy(() => import('../pages/PageArtist')));
const PageNoOrg = Loadable(lazy(() => import('../pages/PageNoOrg')));


const PageDefault = Loadable(lazy(() => import('../pages/PageDefault')));
const PageSettings = Loadable(lazy(() => import('../pages/PageSettings')));
const PageUpgrade = Loadable(lazy(() => import('../pages/PageUpgrade')));
const PagePaywalled = Loadable(lazy(() => import('../pages/PagePaywalled')));
const PageBilling = Loadable(lazy(() => import('../pages/PageBilling')));

const PageResetPassword = Loadable(lazy(() => import('../pages/PageResetPassword')));
const PageCreateAccount = Loadable(lazy(() => import('../pages/PageCreateAccount')));
const PageLogin = Loadable(lazy(() => import('../pages/PageLogin')));
const Page404 = Loadable(lazy(() => import('../pages/Page404')));

const PageLanding = Loadable(lazy(() => import('../pages/PageLanding')));

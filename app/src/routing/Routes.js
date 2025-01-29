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
import AdminGuard from "./AdminGuard";
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
        { path: 'home', element: <AccessGuard><PageHome /></AccessGuard>},
        { path: 'admin', element: <AdminGuard><PageAdmin/></AdminGuard>},
        // { path: 'report/:id', element: <PageArtistReport />},
        { path: 'upgrade', element: <PageUpgrade />},
        { path: 'callback', children: [
            { path: 'spotify', element: <PageCallback /> },

            // { path: '*', element: <Navigate to="/404" replace /> },
          ]},

        { path: 'settings',
          children: [
            { index: true, element: <Navigate to="account" replace />   },
            { path: 'account', element: <PageSettings /> },
            { path: 'billing', element: <PageBillingNew /> },
          ]
        },
        { path: 'playlists', element: <PagePlaylists/>},
        { path: 'imports', children: [
            { index: true, element:  <PageImports/>  },
            { path: ':importId', element: <PageImportDetails /> },

          ]},
        { path: 'reports',
          children: [
            { index: true, element: <Navigate to="all" replace />   },
            { path: 'all', element: <AccessGuard><PageReports /></AccessGuard> },
            { path: ':id', children: [
                { index: true, element: <AccessGuard><PageArtistReport/></AccessGuard>},
                { path: 'artists/:artistId', element: <AccessGuard><PageArtist/></AccessGuard>}
              ] },
          ]
        },
        { path: 'artists',
          children: [
            // { path: 'new', element: <PageAddArtist /> },
            { path: ':artistId', element: <AccessGuard><PageArtist /></AccessGuard> },
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
// const PageBilling = Loadable(lazy(() => import('../pages/PageBilling')));
const PageBillingNew = Loadable(lazy(() => import('../pages/PageBillingNew')));

const PageResetPassword = Loadable(lazy(() => import('../pages/PageResetPassword')));
const PageCreateAccount = Loadable(lazy(() => import('../pages/PageCreateAccount')));
const PageLogin = Loadable(lazy(() => import('../pages/PageLogin')));
const Page404 = Loadable(lazy(() => import('../pages/Page404')));

const PageLanding = Loadable(lazy(() => import('../pages/PageLanding')));
const PageCallback = Loadable(lazy(() => import('../pages/PageCallback')));
const PageAdmin = Loadable(lazy(() => import('../pages/PageAdmin')));
const PagePlaylists = Loadable(lazy(() => import('../pages/PagePlaylists')));
const PageImports = Loadable(lazy(() => import('../pages/PageImports')));
const PageImportDetails = Loadable(lazy(() => import('../pages/PageImportDetails')));

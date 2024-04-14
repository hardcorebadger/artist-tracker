import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import LoadingScreen from './LoadingScreen';
import { useAuth } from '../firebase';

export default function GuestGuard({ children }) {
  const [user, loading, error] = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Navigate to='/app' />;
  }

  return <>{children}</>;
}

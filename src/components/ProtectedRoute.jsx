import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userRole } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // If role is not set yet, try to get it from localStorage
  const effectiveRole = userRole || localStorage.getItem('userRole');

  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    console.log('Access denied. User role:', effectiveRole, 'Allowed roles:', allowedRoles);
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;

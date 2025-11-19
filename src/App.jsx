import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import DoctorLayout from './components/DoctorLayout';
import StaffLayout from './components/StaffLayout';

// Pages
import Login from './pages/Login';
import DoctorDashboard from './pages/Doctor/DoctorDashboard';
import DoctorAppointments from './pages/Doctor/DoctorAppointments';
import PatientRecords from './pages/Doctor/PatientRecords';
import DoctorCallQueue from './pages/Doctor/CallQueue';
import StaffDashboard from './pages/Staff/StaffDashboard';
import PatientManagement from './pages/Staff/PatientManagement';
import AppointmentBooking from './pages/Staff/AppointmentBooking';
import Reminders from './pages/Staff/Reminders';
import CallQueue from './pages/Staff/CallQueue';

import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Doctor Routes */}
          <Route
            path="/doctor"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/doctor/dashboard" replace />} />
            <Route path="dashboard" element={<DoctorDashboard />} />
            <Route path="appointments" element={<DoctorAppointments />} />
            <Route path="patients" element={<PatientRecords />} />
            <Route path="call-queue" element={<DoctorCallQueue />} />
          </Route>

          {/* Staff Routes */}
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={['staff']}>
                <StaffLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/staff/dashboard" replace />} />
            <Route path="dashboard" element={<StaffDashboard />} />
            <Route path="patients" element={<PatientManagement />} />
            <Route path="appointments" element={<AppointmentBooking />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="call-queue" element={<CallQueue />} />
          </Route>

          {/* Unauthorized */}
          <Route
            path="/unauthorized"
            element={
              <div style={{ textAlign: 'center', marginTop: '50px' }}>
                <h1>Unauthorized Access</h1>
                <p>You do not have permission to access this page.</p>
              </div>
            }
          />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;

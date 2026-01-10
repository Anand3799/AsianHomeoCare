import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  FaUserPlus,
  FaCalendarAlt,
  FaBell,
  FaPhoneVolume,
  FaSignOutAlt,
  FaHospital,
  FaUserTie,
  FaHistory,
  FaClipboardList
} from 'react-icons/fa';
import '../styles/StaffLayout.css';

const StaffLayout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="staff-layout">
      <aside className="sidebar staff-sidebar">
        <div className="sidebar-header">
          <FaHospital className="logo-icon" />
          <h2>Staff Portal</h2>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/staff/dashboard" className="nav-link">
            <FaUserTie className="nav-icon" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/staff/patients" className="nav-link">
            <FaUserPlus className="nav-icon" />
            <span>Patient Management</span>
          </NavLink>

          <NavLink to="/staff/appointments" className="nav-link">
            <FaCalendarAlt className="nav-icon" />
            <span>Appointments</span>
          </NavLink>

          <NavLink to="/staff/reminders" className="nav-link">
            <FaBell className="nav-icon" />
            <span>Reminders</span>
          </NavLink>

          <NavLink to="/staff/call-queue" className="nav-link">
            <FaPhoneVolume className="nav-icon" />
            <span>Call Queue</span>
          </NavLink>

          <NavLink to="/staff/call-logs" className="nav-link">
            <FaHistory className="nav-icon" />
            <span>Call Logs</span>
          </NavLink>

          <NavLink to="/staff/appointment-logs" className="nav-link">
            <FaClipboardList className="nav-icon" />
            <span>Appointment Logs</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default StaffLayout;

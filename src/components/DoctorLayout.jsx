import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  FaUserMd,
  FaCalendarCheck,
  FaPhoneAlt,
  FaFolderOpen,
  FaSignOutAlt,
  FaHospital
} from 'react-icons/fa';
import '../styles/DoctorLayout.css';

const DoctorLayout = () => {
  const { logout, currentUser } = useAuth();
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
    <div className="doctor-layout">
      <aside className="sidebar doctor-sidebar">
        <div className="sidebar-header">
          <FaHospital className="logo-icon" />
          <h2>Doctor Portal</h2>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/doctor/dashboard" className="nav-link">
            <FaUserMd className="nav-icon" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/doctor/appointments" className="nav-link">
            <FaCalendarCheck className="nav-icon" />
            <span>Appointments</span>
          </NavLink>

          <NavLink to="/doctor/patients" className="nav-link">
            <FaFolderOpen className="nav-icon" />
            <span>Patient Records</span>
          </NavLink>

          <NavLink to="/doctor/call-queue" className="nav-link">
            <FaPhoneAlt className="nav-icon" />
            <span>Call Queue</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <FaUserMd />
            <div>
              <p className="user-name">Dr. {currentUser?.email?.split('@')[0]}</p>
              <p className="user-role">Doctor</p>
            </div>
          </div>
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

export default DoctorLayout;

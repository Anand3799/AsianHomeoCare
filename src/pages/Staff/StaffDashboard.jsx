import { useState, useEffect } from 'react';
import { FaCalendarAlt, FaBell, FaPhoneVolume, FaUserPlus } from 'react-icons/fa';
import { getAllAppointments, getReminders, getCallQueue } from '../../firebase/firestore';
import { format, addDays } from 'date-fns';
import '../../styles/StaffDashboard.css';

// Helper function to convert 24hr time to 12hr with AM/PM
const formatTime = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const StaffDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [callQueue, setCallQueue] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingReminders, setUpcomingReminders] = useState([]);

  // Function to remove duplicate reminders
  const removeDuplicateReminders = (remindersList) => {
    const seen = new Set();
    const unique = [];
    
    remindersList.forEach(reminder => {
      // Create a unique key based on name, date, type, and message
      const key = `${reminder.patientName}-${reminder.date}-${reminder.type}-${reminder.message || ''}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(reminder);
      }
    });
    
    return unique;
  };

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

    const unsubscribeAppointments = getAllAppointments((data) => {
      setAppointments(data);
      const todayAppts = data.filter(apt => apt.date === today);
      setTodayAppointments(todayAppts);
    });

    const unsubscribeReminders = getReminders((data) => {
      // Remove duplicates before filtering
      const uniqueReminders = removeDuplicateReminders(data);
      setReminders(uniqueReminders);
      const upcoming = uniqueReminders.filter(
        reminder => reminder.status === 'pending' && 
        (reminder.date === today || reminder.date === tomorrow)
      );
      setUpcomingReminders(upcoming);
    });

    const unsubscribeQueue = getCallQueue((data) => {
      setCallQueue(data);
    });

    return () => {
      unsubscribeAppointments();
      unsubscribeReminders();
      unsubscribeQueue();
    };
  }, []);

  return (
    <div className="staff-dashboard">
      <h1>Staff Dashboard</h1>
      
      <div className="dashboard-grid">
        <div className="dashboard-card staff-card-1">
          <div className="card-header">
            <FaCalendarAlt className="card-icon" />
            <h2>Today's Appointments</h2>
          </div>
          <div className="card-count">{todayAppointments.length}</div>
          <p className="card-subtitle">Scheduled for today</p>
        </div>

        <div className="dashboard-card staff-card-2">
          <div className="card-header">
            <FaBell className="card-icon" />
            <h2>Pending Reminders</h2>
          </div>
          <div className="card-count">{upcomingReminders.length}</div>
          <p className="card-subtitle">Requires attention</p>
        </div>

        <div className="dashboard-card staff-card-3">
          <div className="card-header">
            <FaPhoneVolume className="card-icon" />
            <h2>Call Queue</h2>
          </div>
          <div className="card-count">{callQueue.length}</div>
          <p className="card-subtitle">Waiting calls</p>
        </div>

        <div className="dashboard-card staff-card-4">
          <div className="card-header">
            <FaUserPlus className="card-icon" />
            <h2>Total Appointments</h2>
          </div>
          <div className="card-count">{appointments.length}</div>
          <p className="card-subtitle">All time</p>
        </div>
      </div>

      <div className="quick-overview">
        <div className="overview-section">
          <h2>Today's Schedule</h2>
          {todayAppointments.length === 0 ? (
            <p className="empty-message">No appointments today</p>
          ) : (
            <div className="schedule-list">
              {todayAppointments.map((apt) => (
                <div key={apt.id} className="schedule-item">
                  <div className="schedule-time">{formatTime(apt.time)}</div>
                  <div className="schedule-details">
                    <h4>{apt.patientName}</h4>
                    <span className={`status-badge ${apt.status}`}>{apt.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overview-section">
          <h2>Urgent Reminders</h2>
          {upcomingReminders.length === 0 ? (
            <p className="empty-message">No urgent reminders</p>
          ) : (
            <div className="reminders-list">
              {upcomingReminders.map((reminder) => (
                <div key={reminder.id} className="reminder-item">
                  <FaBell className="reminder-icon" />
                  <div>
                    <h4>{reminder.patientName}</h4>
                    <p>{reminder.type === 'medicine' ? 'Medicine Reminder' : 'General Reminder'}</p>
                    <small>{reminder.date}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffDashboard;

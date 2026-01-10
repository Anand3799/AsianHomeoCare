import { useState, useEffect } from 'react';
import { FaCalendarCheck, FaPhoneAlt, FaClock, FaCheckCircle } from 'react-icons/fa';
import { getAllAppointments, getCallQueue, updateAppointment, deleteFromCallQueue } from '../../firebase/firestore';
import { format } from 'date-fns';
import '../../styles/DoctorDashboard.css';

// Helper function to convert 24hr time to 12hr with AM/PM
const formatTime = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const DoctorDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [callQueue, setCallQueue] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const unsubscribeAppointments = getAllAppointments((data) => {
      setAppointments(data);
      const todayAppts = data.filter(apt => apt.date === today && apt.status !== 'completed');
      
      // Group appointments by patient
      const groupedAppts = [];
      const patientMap = new Map();
      
      todayAppts.forEach(apt => {
        const key = `${apt.patientName}-${apt.patientPhone}`;
        if (patientMap.has(key)) {
          const existing = patientMap.get(key);
          existing.slots.push({ time: apt.time, subSlot: apt.subSlot, id: apt.id });
          existing.slots.sort((a, b) => a.time.localeCompare(b.time));
        } else {
          const grouped = {
            ...apt,
            slots: [{ time: apt.time, subSlot: apt.subSlot, id: apt.id }],
            isGrouped: false
          };
          patientMap.set(key, grouped);
          groupedAppts.push(grouped);
        }
      });
      
      // Mark grouped appointments
      groupedAppts.forEach(apt => {
        if (apt.slots.length > 1) {
          apt.isGrouped = true;
        }
      });
      
      setTodayAppointments(groupedAppts);
    });

    const unsubscribeQueue = getCallQueue((data) => {
      setCallQueue(data);
    });

    return () => {
      unsubscribeAppointments();
      unsubscribeQueue();
    };
  }, []);

  const handleCompleteCall = async (callId) => {
    try {
      await deleteFromCallQueue(callId);
    } catch (error) {
      console.error('Error completing call:', error);
    }
  };

  return (
    <div className="doctor-dashboard">
      <h1>Doctor Dashboard</h1>
      
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="card-header">
            <FaCalendarCheck className="card-icon" />
            <h2>Today's Appointments</h2>
          </div>
          <div className="card-count">{todayAppointments.length}</div>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <FaPhoneAlt className="card-icon" />
            <h2>Call Queue</h2>
          </div>
          <div className="card-count">{callQueue.length}</div>
        </div>
      </div>

      <div className="content-section">
        <div className="appointments-section">
          <h2>
            <FaClock /> Today's Schedule
          </h2>
          {todayAppointments.length === 0 ? (
            <p className="empty-message">No appointments scheduled for today</p>
          ) : (
            <div className="appointments-list">
              {todayAppointments.map((apt) => (
                <div key={apt.id} className="appointment-item">
                  <div className="appointment-time">
                    {apt.isGrouped ? (
                      <div className="grouped-times">
                        {apt.slots.map((slot, idx) => (
                          <span key={slot.id}>
                            {formatTime(slot.time)}
                            {idx < apt.slots.length - 1 && <span className="time-separator"> • </span>}
                          </span>
                        ))}
                      </div>
                    ) : (
                      formatTime(apt.time)
                    )}
                  </div>
                  <div className="appointment-details">
                    <h3>
                      {apt.patientName}
                      {apt.isNewPatient && (
                        <span className="new-patient-badge" style={{ marginLeft: '8px', fontSize: '0.75rem' }}>✨ NEW PATIENT</span>
                      )}
                    </h3>
                    {apt.patientAge && <p>👤 {apt.patientAge} yrs</p>}
                    {apt.patientGender && <p>⚥ {apt.patientGender}</p>}
                    <span className={`status-badge ${apt.status}`}>
                      {apt.status}
                    </span>
                  </div>
                  <div className="appointment-duration">
                    {apt.isGrouped ? `${apt.slots.length * 15}` : apt.duration} mins
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="queue-section">
          <h2>
            <FaPhoneAlt /> Current Call Queue
          </h2>
          {callQueue.length === 0 ? (
            <p className="empty-message">No calls in queue</p>
          ) : (
            <div className="queue-list">
              {callQueue.map((call, index) => (
                <div key={call.id} className="queue-item">
                  <div className="queue-number">{index + 1}</div>
                  <div className="queue-details">
                    <h3>{call.patientName}</h3>
                    <p>📞 {call.phone}</p>
                    {call.isNewPatient && (
                      <span className="new-patient-indicator">✨ New Patient</span>
                    )}
                    <small>
                      {call.timestamp?.toDate && 
                        format(call.timestamp.toDate(), 'hh:mm a')}
                    </small>
                  </div>
                  <button
                    className="complete-btn"
                    onClick={() => handleCompleteCall(call.id)}
                  >
                    <FaCheckCircle /> Complete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;

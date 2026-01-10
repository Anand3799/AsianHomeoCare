import { useState, useEffect } from 'react';
import { getAllAppointments } from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { FaCalendarAlt, FaUserPlus, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { format, isSameDay, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addDays } from 'date-fns';
import '../../styles/DoctorAppointments.css';

// Helper function to convert 24hr time to 12hr with AM/PM
const formatTime = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const DoctorAppointments = () => {
  const toast = useToast();
  const [appointments, setAppointments] = useState([]);
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const unsubscribe = getAllAppointments((data) => {
      setAppointments(data);
    });

    return unsubscribe;
  }, []);

  // Calendar functions
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Add empty cells for proper alignment
  const startDayOfWeek = monthStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const emptyDays = Array(startDayOfWeek).fill(null);

  const previousMonth = () => {
    setCurrentMonth(addDays(currentMonth, -30));
  };

  const nextMonth = () => {
    setCurrentMonth(addDays(currentMonth, 30));
  };

  const selectDate = (date) => {
    setSelectedDate(format(date, 'yyyy-MM-dd'));
  };

  const getAppointmentCountForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return upcomingAppointments.filter(apt => apt.date === dateStr).length;
  };

  const upcomingAppointments = appointments.filter(apt => 
    apt.status === 'scheduled' || apt.status === 'rescheduled'
  );

  const selectedDateAppointments = upcomingAppointments.filter(
    apt => apt.date === selectedDate
  );

  const completedAppointments = appointments.filter(apt => 
    apt.status === 'completed' && apt.date === selectedDate
  );

  // Group appointments by patient (same phone and name)
  const groupAppointmentsByPatient = (appointments) => {
    const grouped = {};
    
    appointments.forEach(apt => {
      const key = `${apt.patientPhone}-${apt.patientName}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(apt);
    });

    // Convert to array and sort slots within each group
    return Object.values(grouped).map(group => {
      const sortedGroup = group.sort((a, b) => {
        const timeCompare = a.time.localeCompare(b.time);
        if (timeCompare !== 0) return timeCompare;
        return a.subSlot.localeCompare(b.subSlot);
      });
      return sortedGroup;
    });
  };

  const groupedAppointments = groupAppointmentsByPatient(selectedDateAppointments);

  return (
    <div className="doctor-appointments">
      <h1>Appointments Management</h1>

      <div className="appointments-container">
        {/* Calendar View */}
        <div className="appointments-calendar-view">
          <div className="calendar-widget-large">
            <div className="calendar-header">
              <button onClick={previousMonth} className="month-nav-btn">
                <FaChevronLeft />
              </button>
              <h3>
                <FaCalendarAlt />
                {format(currentMonth, 'MMMM yyyy')}
              </h3>
              <button onClick={nextMonth} className="month-nav-btn">
                <FaChevronRight />
              </button>
            </div>
            
            <div className="calendar-grid">
              <div className="calendar-day-names">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>
              
              <div className="calendar-days">
                {/* Empty cells for proper alignment */}
                {emptyDays.map((_, index) => (
                  <div key={`empty-${index}`} className="calendar-day empty"></div>
                ))}
                
                {/* Actual days */}
                {daysInMonth.map((day) => {
                  const isSelected = isSameDay(day, parseISO(selectedDate));
                  const isToday = isSameDay(day, new Date());
                  const appointmentCount = getAppointmentCountForDate(day);
                  
                  return (
                    <div
                      key={day.toString()}
                      className={`calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${appointmentCount > 0 ? 'has-appointments' : ''}`}
                      onClick={() => selectDate(day)}
                    >
                      <span className="day-number">{format(day, 'd')}</span>
                      {appointmentCount > 0 && (
                        <div className="dots-indicator">
                          <span className="dot"></span>
                          <span className="dot"></span>
                          <span className="dot"></span>
                        </div>
                      )}
                      {appointmentCount > 0 && (
                        <span className="appointment-count-text">
                          +{appointmentCount}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Selected Date Appointments Below Calendar */}
        <div className="appointments-and-details-wrapper">
          <div className="selected-date-appointments-below">
            <h2>
              Appointments for {format(parseISO(selectedDate), 'dd-MM-yyyy')}
            </h2>
            
            {selectedDateAppointments.length === 0 ? (
              <div className="empty-state">
                <FaCalendarAlt className="empty-icon" />
                <p>No appointments scheduled for this date</p>
              </div>
            ) : (
              <div className="appointments-cards-horizontal">
                {groupedAppointments.map((group, groupIndex) => {
                  const firstApt = group[0];
                  return (
                    <div
                      key={`${firstApt.id}-${groupIndex}`}
                      className="appointment-card"
                    >
                      {/* Time Section - Left */}
                      <div className="apt-time-section">
                        {group.map((apt, index) => (
                          <div key={apt.id} className="time-slot">
                            {formatTime(apt.time)}
                            {apt.subSlot && <span className="time-dot">•</span>}
                          </div>
                        ))}
                      </div>

                      {/* Patient Info - Center */}
                      <div className="apt-patient-section">
                        <div className="patient-name-row">
                          <h3>{firstApt.patientName}</h3>
                          {firstApt.isNewPatient && (
                            <span className="new-patient-badge-doctor">
                              <FaUserPlus /> NEW PATIENT
                            </span>
                          )}
                        </div>
                        <div className="patient-details">
                          <span className="detail-item">
                            <span className="detail-icon">👤</span>
                            {firstApt.patientAge || 'N/A'} yrs
                          </span>
                          <span className="detail-item">
                            <span className="detail-icon">⚥</span>
                            {firstApt.patientGender || 'N/A'}
                          </span>
                        </div>
                        <div className="apt-status-badge">
                          <span className={`status-pill ${firstApt.status}`}>
                            {firstApt.status === 'scheduled' ? 'Scheduled' : firstApt.status}
                          </span>
                        </div>
                      </div>

                      {/* Duration - Right */}
                      <div className="apt-duration-section">
                        {firstApt.duration * group.length} mins
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="completed-section">
        <h2>Recently Completed</h2>
        {completedAppointments.slice(0, 5).length === 0 ? (
          <p className="empty-message">No completed appointments for this date</p>
        ) : (
          <div className="completed-list">
            {completedAppointments.slice(0, 5).map((apt) => (
              <div key={apt.id} className="completed-item">
                <div>
                  <h4>{apt.patientName}</h4>
                  <p>{format(parseISO(apt.date), 'dd-MM-yyyy')} at {formatTime(apt.time)}</p>
                </div>
                <div className="completed-badge">✓ Completed</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorAppointments;

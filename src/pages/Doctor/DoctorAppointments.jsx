import { useState, useEffect } from 'react';
import { getAllAppointments, updateAppointment, updatePatient, createMedicineReminderIfNeeded } from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { FaCheckCircle, FaCalendarAlt, FaStickyNote, FaUserPlus, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
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
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [nextVisitDate, setNextVisitDate] = useState('');
  const [notes, setNotes] = useState('');
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const unsubscribe = getAllAppointments((data) => {
      setAppointments(data);
    });

    return unsubscribe;
  }, []);

  const handleSelectAppointment = (apt) => {
    setSelectedAppointment(apt);
    setReasonForVisit(apt.reasonForVisit || '');
    setNextVisitDate(apt.nextVisit || '');
    setNotes(apt.notes || '');
  };

  const handleCompleteAppointment = async () => {
    if (!selectedAppointment) return;

    try {
      // Update appointment
      await updateAppointment(selectedAppointment.id, {
        status: 'completed',
        reasonForVisit,
        nextVisit: nextVisitDate,
        notes,
        completedAt: new Date().toISOString()
      });

      // Update patient record with visit reason and mark as old patient
      if (selectedAppointment.patientId) {
        const patientRef = selectedAppointment.patientId;
        const updateData = {
          reasons: [...(selectedAppointment.patientReasons || []), reasonForVisit],
          previousVisits: [
            ...(selectedAppointment.patientPreviousVisits || []),
            selectedAppointment.date
          ]
        };
        
        // Mark as old patient after first visit
        if (selectedAppointment.isNewPatient) {
          updateData.isNewPatient = false;
        }
        
        await updatePatient(patientRef, updateData);
      }

      // Create medicine reminder if next visit date is set
      if (nextVisitDate) {
        const reminderResult = await createMedicineReminderIfNeeded({
          patientName: selectedAppointment.patientName,
          patientPhone: selectedAppointment.patientPhone,
          patientId: selectedAppointment.patientId,
          nextVisit: nextVisitDate
        });

        if (reminderResult.created) {
          console.log('Medicine reminder created successfully');
        } else {
          console.log('Reminder creation skipped:', reminderResult.reason);
        }
      }

      const completionMessage = selectedAppointment.isNewPatient 
        ? 'Appointment completed successfully! Patient has been marked as returning patient for future visits.' 
        : 'Appointment completed successfully!';
      
      toast.success(completionMessage);
      setSelectedAppointment(null);
      setReasonForVisit('');
      setNextVisitDate('');
      setNotes('');
    } catch (error) {
      console.error('Error completing appointment:', error);
      toast.error('Failed to complete appointment');
    }
  };

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
              Appointments for {format(parseISO(selectedDate), 'MMMM d, yyyy')}
            </h2>
            
            {selectedDateAppointments.length === 0 ? (
              <div className="empty-state">
                <FaCalendarAlt className="empty-icon" />
                <p>No appointments scheduled for this date</p>
              </div>
            ) : (
              <div className="appointments-cards-horizontal">
                {selectedDateAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className={`appointment-card ${selectedAppointment?.id === apt.id ? 'selected' : ''}`}
                    onClick={() => handleSelectAppointment(apt)}
                  >
                    <div className="apt-header">
                      <div className="apt-title-row">
                        <h3>{apt.patientName}</h3>
                        {apt.isNewPatient && (
                          <span className="new-patient-badge-doctor">
                            <FaUserPlus /> New
                          </span>
                        )}
                      </div>
                      <span className={`status-badge ${apt.status}`}>{apt.status}</span>
                    </div>
                    <div className="apt-info">
                      <p><FaCalendarAlt /> {apt.date} at {formatTime(apt.time)}</p>
                      <p>📞 {apt.patientPhone}</p>
                      {apt.patientAge && <p>👤 Age: {apt.patientAge}</p>}
                      {apt.patientGender && <p>⚥ Gender: {apt.patientGender}</p>}
                      <p>⏱️ Duration: {apt.duration} mins</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedAppointment && (
            <div className="appointment-details-section">
              <h2>Appointment Details</h2>
              <div className="details-form">
                <div className="form-group">
                  <label>Patient Name</label>
                  <input type="text" value={selectedAppointment.patientName} disabled />
                </div>

                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" value={selectedAppointment.patientPhone} disabled />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Age</label>
                    <input type="text" value={selectedAppointment.patientAge || 'N/A'} disabled />
                  </div>

                  <div className="form-group">
                    <label>Gender</label>
                    <input type="text" value={selectedAppointment.patientGender || 'N/A'} disabled />
                  </div>
                </div>

                <div className="form-group">
                  <label>Date & Time</label>
                  <input
                    type="text"
                    value={`${selectedAppointment.date} at ${formatTime(selectedAppointment.time)}`}
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label>
                    <FaStickyNote /> Reason for Visit *
                  </label>
                  <textarea
                    value={reasonForVisit}
                    onChange={(e) => setReasonForVisit(e.target.value)}
                    placeholder="Enter the reason for this visit..."
                    rows="3"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>
                    <FaCalendarAlt /> Next Visit Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={nextVisitDate}
                    onChange={(e) => setNextVisitDate(e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                  />
                  <small>Setting this will create a reminder for staff one day before</small>
                </div>

                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any additional notes..."
                    rows="2"
                  />
                </div>

                <button
                  className="complete-appointment-btn"
                  onClick={handleCompleteAppointment}
                  disabled={!reasonForVisit}
                >
                  <FaCheckCircle /> Mark as Completed
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="completed-section">
        <h2>Recently Completed</h2>
        {completedAppointments.slice(0, 5).length === 0 ? (
          <p className="empty-message">No completed appointments</p>
        ) : (
          <div className="completed-list">
            {completedAppointments.slice(0, 5).map((apt) => (
              <div key={apt.id} className="completed-item">
                <div>
                  <h4>{apt.patientName}</h4>
                  <p>{apt.date} at {formatTime(apt.time)}</p>
                </div>
                <div className="completed-badge">
                  <FaCheckCircle /> Completed
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorAppointments;

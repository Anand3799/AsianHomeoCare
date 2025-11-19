import { useState, useEffect } from 'react';
import {
  getAllPatients,
  getPatientByPhone,
  addAppointment,
  updateAppointment,
  getAllAppointments,
  addPatient,
  bookAppointmentWithTransaction,
  updateAppointmentWithTransaction
} from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import { FaCalendarPlus, FaEdit, FaStickyNote, FaChevronLeft, FaChevronRight, FaTrash, FaClock, FaCalendarAlt } from 'react-icons/fa';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import '../../styles/AppointmentBooking.css';

// Helper function to convert 24hr time to 12hr with AM/PM
const formatTime = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const AppointmentBooking = () => {
  const toast = useToast();
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isBooking, setIsBooking] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, appointmentId: null, patientName: '' });
  
  const [formData, setFormData] = useState({
    patientPhone: '',
    patientName: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    timeSlots: [],
    notes: '',
    status: 'scheduled'
  });

  const [availableSlots, setAvailableSlots] = useState([]);
  const [isNewPatient, setIsNewPatient] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState([]);

  useEffect(() => {
    const unsubscribePatients = getAllPatients((data) => {
      setPatients(data);
    });

    const unsubscribeAppointments = getAllAppointments((data) => {
      setAppointments(data);
    });

    return () => {
      unsubscribePatients();
      unsubscribeAppointments();
    };
  }, []);

  useEffect(() => {
    if (selectedDate) {
      generateTimeSlots();
    }
  }, [selectedDate, appointments]);

  const handlePhoneChange = async (phone) => {
    setFormData({ ...formData, patientPhone: phone });

    if (phone.length >= 10) {
      const patient = await getPatientByPhone(phone);
      if (patient) {
        setIsNewPatient(patient.isNewPatient || false);
        setFormData(prev => ({
          ...prev,
          patientName: patient.name,
          patientId: patient.id,
          patientAge: patient.age || '',
          patientGender: patient.gender || '',
          patientPreviousVisits: patient.previousVisits,
          patientReasons: patient.reasons,
          isNewPatient: patient.isNewPatient || false
        }));
      } else {
        setIsNewPatient(true);
        setFormData(prev => ({ 
          ...prev, 
          patientName: '',
          patientAge: '',
          patientGender: '',
          isNewPatient: true
        }));
      }
    }
  };

  const generateTimeSlots = () => {
    const slots = [];
    const slotDuration = 15; // 15 minutes per slot

    // Define two time slots
    // Slot 1: 10:30 AM to 1:30 PM (10:30 - 13:30)
    // Slot 2: 5:00 PM to 9:00 PM (17:00 - 21:00)
    const timeSlots = [
      { start: { hour: 10, minute: 30 }, end: { hour: 13, minute: 30 } }, // Morning slot
      { start: { hour: 17, minute: 0 }, end: { hour: 21, minute: 0 } }    // Evening slot
    ];

    // Get booked appointments for selected date
    const bookedAppointments = appointments.filter(
      apt => apt.date === selectedDate && apt.status !== 'cancelled'
    );

    // Create a set of booked slot times
    const bookedSlotTimes = new Set();
    bookedAppointments.forEach(apt => {
      const [hours, minutes] = apt.time.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      const duration = apt.duration || 15;
      const slotsNeeded = Math.ceil(duration / slotDuration);
      
      for (let i = 0; i < slotsNeeded; i++) {
        const slotMinutes = startMinutes + (i * slotDuration);
        const slotHour = Math.floor(slotMinutes / 60);
        const slotMin = slotMinutes % 60;
        const timeStr = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
        bookedSlotTimes.add(timeStr);
      }
    });

    // Generate slots for each time period
    timeSlots.forEach(timeSlot => {
      const startMinutes = timeSlot.start.hour * 60 + timeSlot.start.minute;
      const endMinutes = timeSlot.end.hour * 60 + timeSlot.end.minute;

      for (let currentMinutes = startMinutes; currentMinutes < endMinutes; currentMinutes += slotDuration) {
        const hour = Math.floor(currentMinutes / 60);
        const minute = currentMinutes % 60;
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        slots.push({
          time: timeStr,
          available: !bookedSlotTimes.has(timeStr),
          display: format(new Date(2000, 0, 1, hour, minute), 'h:mm a')
        });
      }
    });

    setAvailableSlots(slots);
  };

  const handleSlotClick = (slot) => {
    if (!slot.available) return;

    // If clicking the same slot, deselect it
    if (selectedSlots.includes(slot.time)) {
      setSelectedSlots([]);
      setFormData({ ...formData, timeSlots: [], date: selectedDate });
      return;
    }

    const slotsNeeded = isNewPatient ? 3 : 1; // 45 min for new, 15 min for old
    const slotIndex = availableSlots.findIndex(s => s.time === slot.time);
    
    // Check if we can book the required consecutive slots
    let canBook = true;
    const slotsToBook = [];
    
    for (let i = 0; i < slotsNeeded; i++) {
      const checkSlot = availableSlots[slotIndex + i];
      if (!checkSlot || !checkSlot.available) {
        canBook = false;
        break;
      }
      slotsToBook.push(checkSlot.time);
    }

    if (canBook) {
      setSelectedSlots(slotsToBook);
      setFormData({ ...formData, timeSlots: slotsToBook, date: selectedDate });
    } else {
      toast.warning(`Cannot book ${slotsNeeded} consecutive slots. Please select another time.`);
    }
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();

    if (selectedSlots.length === 0) {
      toast.warning('Please select a time slot');
      return;
    }

    if (isBooking) {
      return; // Prevent double submission
    }

    const duration = selectedSlots.length * 15;
    const startTime = selectedSlots[0];

    setIsBooking(true);

    try {
      if (isRescheduling && selectedAppointment) {
        // Use transaction-based update for rescheduling
        await updateAppointmentWithTransaction(selectedAppointment.id, {
          date: selectedDate,
          time: startTime,
          duration: duration,
          notes: formData.notes,
          status: 'rescheduled'
        });
        toast.success('Appointment rescheduled successfully!');
      } else {
        let patientId = formData.patientId;

        // If new patient, add to patient management first
        if (isNewPatient && !formData.patientId) {
          const newPatient = {
            name: formData.patientName,
            phone: formData.patientPhone,
            age: formData.patientAge || '',
            gender: formData.patientGender || '',
            email: '',
            address: '',
            dateOfBirth: '',
            registrationDate: format(new Date(), 'yyyy-MM-dd'),
            lastVisit: selectedDate,
            previousVisits: [],
            reasons: [],
            notes: formData.notes || 'Patient registered during appointment booking',
            isNewPatient: true
          };
          
          const newPatientId = await addPatient(newPatient);
          patientId = newPatientId;
          
          console.log('New patient added to database:', newPatientId);
        }

        // Use transaction-based booking to prevent double bookings
        await bookAppointmentWithTransaction({
          patientId: patientId || null,
          patientName: formData.patientName,
          patientPhone: formData.patientPhone,
          patientAge: formData.patientAge || '',
          patientGender: formData.patientGender || '',
          patientPreviousVisits: formData.patientPreviousVisits || [],
          patientReasons: formData.patientReasons || [],
          date: selectedDate,
          time: startTime,
          duration: duration,
          status: 'scheduled',
          notes: formData.notes || '',
          isNewPatient: isNewPatient
        });
        
        if (isNewPatient && !formData.patientId) {
          toast.success('New patient added and appointment booked successfully!');
        } else {
          toast.success('Appointment booked successfully!');
        }
      }

      resetForm();
      generateTimeSlots();
    } catch (error) {
      console.error('Error booking appointment:', error);
      
      // Handle specific slot conflict errors
      if (error.message && error.message.includes('SLOT_CONFLICT:')) {
        const message = error.message.replace('SLOT_CONFLICT:', '');
        toast.error(message + ' The slots have been refreshed. Please select a different time.');
        generateTimeSlots(); // Refresh slots to show current availability
      } else {
        toast.error('Failed to book appointment. Please try again.');
      }
    } finally {
      setIsBooking(false);
    }
  };

  const handleReschedule = (appointment) => {
    setSelectedAppointment(appointment);
    setIsRescheduling(true);
    setIsNewPatient(false); // Existing appointment, so not a new patient
    setFormData({
      patientPhone: appointment.patientPhone,
      patientName: appointment.patientName,
      patientId: appointment.patientId,
      patientAge: appointment.patientAge || '',
      patientGender: appointment.patientGender || '',
      patientPreviousVisits: appointment.patientPreviousVisits || [],
      patientReasons: appointment.patientReasons || [],
      date: appointment.date,
      timeSlots: [],
      notes: appointment.notes || '',
      status: appointment.status,
      isNewPatient: false
    });
    setSelectedDate(appointment.date);
    setSelectedSlots([]);
    setShowBookingForm(false); // Don't show modal
    setIsNewPatient(appointment.duration > 15);
    // Scroll to top to show the booking form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAppointment = (appointmentId, patientName) => {
    setConfirmDialog({ isOpen: true, appointmentId, patientName });
  };

  const confirmDeleteAppointment = async () => {
    const { appointmentId } = confirmDialog;
    setConfirmDialog({ isOpen: false, appointmentId: null, patientName: '' });
    
    try {
      await deleteDoc(doc(db, 'appointments', appointmentId));
      toast.success('Appointment deleted successfully!');
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('Failed to delete appointment');
    }
  };

  const cancelDeleteAppointment = () => {
    setConfirmDialog({ isOpen: false, appointmentId: null, patientName: '' });
  };

  const resetForm = () => {
    setFormData({
      patientPhone: '',
      patientName: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      timeSlots: [],
      notes: '',
      status: 'scheduled'
    });
    setShowBookingForm(false);
    setIsRescheduling(false);
    setSelectedAppointment(null);
    setIsNewPatient(true);
    setSelectedSlots([]);
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

  const upcomingAppointments = appointments.filter(
    apt => apt.status === 'scheduled' || apt.status === 'rescheduled' || apt.status === 'missed'
  );

  // Filter appointments for selected date
  const selectedDateAppointments = upcomingAppointments.filter(
    apt => apt.date === selectedDate
  );

  // Get appointment count per date for calendar badges
  const getAppointmentCountForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return upcomingAppointments.filter(apt => apt.date === dateStr).length;
  };

  return (
    <div className="appointment-booking">
      <div className="page-header">
        <h1>Appointment Booking</h1>
        {!showBookingForm && !isRescheduling && (
          <button
            className="book-appointment-btn"
            onClick={() => setShowBookingForm(true)}
          >
            <FaCalendarPlus /> Book New Appointment
          </button>
        )}
        {(showBookingForm || isRescheduling) && (
          <button
            className="cancel-booking-btn"
            onClick={resetForm}
          >
            Cancel
          </button>
        )}
      </div>

      {(showBookingForm || isRescheduling) && (
        <div className="booking-section">
          <div className="section-header">
            <h2>{isRescheduling ? 'Reschedule Appointment' : 'Book New Appointment'}</h2>
          </div>

          <div className="booking-container">
            {/* Left side - Calendar and Slots */}
            <div className="calendar-section">

              <div className="calendar-widget">
                <div className="calendar-header">
                  <button onClick={previousMonth}><FaChevronLeft /></button>
                  <h3>{format(currentMonth, 'MMMM yyyy')}</h3>
                  <button onClick={nextMonth}><FaChevronRight /></button>
                </div>
                <div className="calendar-grid">
                  <div className="calendar-day-header">Sun</div>
                  <div className="calendar-day-header">Mon</div>
                  <div className="calendar-day-header">Tue</div>
                  <div className="calendar-day-header">Wed</div>
                  <div className="calendar-day-header">Thu</div>
                  <div className="calendar-day-header">Fri</div>
                  <div className="calendar-day-header">Sat</div>
                  
                  {/* Empty cells for days before month starts */}
                  {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} className="calendar-day empty"></div>
                  ))}
                  
                  {daysInMonth.map((day) => (
                    <div
                      key={day.toString()}
                      className={`calendar-day ${isSameDay(parseISO(selectedDate), day) ? 'selected' : ''} ${
                        day < new Date().setHours(0,0,0,0) ? 'past' : ''
                      }`}
                      onClick={() => day >= new Date().setHours(0,0,0,0) && selectDate(day)}
                    >
                      {format(day, 'd')}
                    </div>
                  ))}
                </div>
              </div>

              <div className="time-slots-section">
                <h4>
                  {format(parseISO(selectedDate), 'EEEE, MMMM dd')}
                  <span className="slot-legend">
                    <span><span className="legend-free"></span> Free</span>
                    <span><span className="legend-booked"></span> Booked</span>
                    <span className="realtime-indicator" title="Real-time updates active">
                      <span className="realtime-dot"></span> Live
                    </span>
                  </span>
                </h4>
                <div className="slots-grid">
                  {availableSlots.map((slot, index) => {
                    const isSelected = selectedSlots.includes(slot.time);
                    const isInSelectedRange = selectedSlots.length > 0 && 
                      selectedSlots.includes(slot.time);
                    
                    // Check if this is the last afternoon slot (1:15 PM / 13:15)
                    const isLastAfternoonSlot = slot.time === "13:15";
                    
                    return (
                      <>
                        <button
                          key={slot.time}
                          className={`time-slot-btn ${!slot.available ? 'booked' : 'free'} ${
                            isSelected || isInSelectedRange ? 'selected' : ''
                          }`}
                          onClick={() => handleSlotClick(slot)}
                          disabled={!slot.available}
                        >
                          <div className="slot-time">{slot.display}</div>
                          <div className="slot-status">
                            {!slot.available ? 'Booked' : isInSelectedRange ? 'Selected' : 'Free'}
                          </div>
                        </button>
                        {isLastAfternoonSlot && (
                          <div className="slot-separator">
                            <span>Evening Slots</span>
                          </div>
                        )}
                      </>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right side - Form */}
            <div className="form-section">
              <form onSubmit={handleBookAppointment} className="booking-form">
                <div className="form-group">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    value={formData.patientPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="Enter phone number"
                    required
                    disabled={isRescheduling}
                  />
                  {formData.patientPhone.length >= 10 && (
                    <small className={isNewPatient ? 'new-patient-badge' : 'returning-patient-badge'}>
                      {isNewPatient ? '✨ New Patient (45 min - 3 slots)' : '✓ Returning Patient (15 min - 1 slot)'}
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label>Patient Name *</label>
                  <input
                    type="text"
                    value={formData.patientName}
                    onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                    placeholder="Enter patient name"
                    required
                    disabled={!isNewPatient}
                    readOnly={!isNewPatient}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Age *</label>
                    <input
                      type="number"
                      value={formData.patientAge}
                      onChange={(e) => setFormData({ ...formData, patientAge: e.target.value })}
                      placeholder="Enter age"
                      required
                      min="0"
                      max="150"
                      disabled={!isNewPatient}
                      readOnly={!isNewPatient}
                    />
                  </div>

                  <div className="form-group">
                    <label>Gender *</label>
                    <select
                      value={formData.patientGender}
                      onChange={(e) => setFormData({ ...formData, patientGender: e.target.value })}
                      required
                      disabled={!isNewPatient}
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Selected Date & Time</label>
                  <div className="selected-info">
                    <p><strong>Date:</strong> {format(parseISO(selectedDate), 'MMMM dd, yyyy')}</p>
                    {selectedSlots.length > 0 && (
                      <>
                        <p><strong>Time:</strong> {availableSlots.find(s => s.time === selectedSlots[0])?.display}</p>
                        <p><strong>Duration:</strong> {selectedSlots.length * 15} minutes</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    <FaStickyNote /> Notes (Optional)
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add any additional notes..."
                    rows="3"
                  />
                </div>

                <div className="form-actions">
                  <button 
                    type="submit" 
                    className="save-btn" 
                    disabled={selectedSlots.length === 0 || isBooking}
                  >
                    {isBooking ? 'Processing...' : (isRescheduling ? 'Reschedule' : 'Book')} Appointment
                  </button>
                  <button type="button" className="cancel-btn" onClick={resetForm} disabled={isBooking}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {!showBookingForm && !isRescheduling && (
        <div className="appointments-list-section">
          <h2>Upcoming Appointments</h2>
          
          {/* Calendar View */}
          <div className="appointments-calendar-view">
            <div className="calendar-widget-large">
              <div className="calendar-header">
                <button onClick={previousMonth} className="month-nav-btn">
                  <FaChevronLeft />
                </button>
                <h3>
                  <FaCalendarAlt /> {format(currentMonth, 'MMMM yyyy')}
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
          <div className="selected-date-appointments-below">
            <h3>
              Appointments for {format(parseISO(selectedDate), 'MMMM d, yyyy')}
            </h3>
            
            {selectedDateAppointments.length === 0 ? (
              <div className="empty-state">
                <FaCalendarPlus className="empty-icon" />
                <p>No appointments scheduled for this date</p>
              </div>
            ) : (
              <div className="appointments-cards-horizontal">
                {selectedDateAppointments.map((apt) => (
                  <div key={apt.id} className="appointment-card">
                    <div className="appointment-card-header">
                      <div className="patient-info">
                        <h4>{apt.patientName}</h4>
                        <p className="phone">{apt.patientPhone}</p>
                      </div>
                    </div>
                    
                    <div className="appointment-card-body">
                      <div className="appointment-detail">
                        <FaClock className="detail-icon" />
                        <span>{formatTime(apt.time)} • {apt.duration} mins</span>
                      </div>
                      {apt.notes && (
                        <div className="appointment-detail">
                          <FaStickyNote className="detail-icon" />
                          <span>{apt.notes}</span>
                        </div>
                      )}
                      <span className={`status-badge ${apt.status}`}>
                        {apt.status}
                      </span>
                    </div>
                    
                    <div className="appointment-card-actions">
                      <button
                        className="reschedule-btn"
                        onClick={() => handleReschedule(apt)}
                      >
                        <FaEdit /> Reschedule
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteAppointment(apt.id, apt.patientName)}
                      >
                        <FaTrash /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Delete Appointment"
        message={confirmDialog.patientName ? `Are you sure you want to delete the appointment for ${confirmDialog.patientName}?` : ''}
        onConfirm={confirmDeleteAppointment}
        onCancel={cancelDeleteAppointment}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default AppointmentBooking;

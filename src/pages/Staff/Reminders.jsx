import { useState, useEffect } from 'react';
import { getReminders, addReminder, updateReminder, getAllAppointments, bookAppointmentWithTransaction, getPatientByName } from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { FaBell, FaPlus, FaCalendarAlt, FaPhone, FaCalendarCheck, FaTimes } from 'react-icons/fa';
import { format, subDays, addDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import '../../styles/Reminders.css';

const Reminders = () => {
  const toast = useToast();
  const [reminders, setReminders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [medicineReminders, setMedicineReminders] = useState([]);
  const [generalReminders, setGeneralReminders] = useState([]);
  const [reminderCheckDone, setReminderCheckDone] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  
  // Booking form state
  const [bookingDate, setBookingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isNewPatient, setIsNewPatient] = useState(false);
  
  const [formData, setFormData] = useState({
    patientName: '',
    patientPhone: '',
    type: 'general',
    date: format(new Date(), 'yyyy-MM-dd'),
    message: '',
    status: 'pending'
  });

  useEffect(() => {
    let unsubscribeReminders;
    let unsubscribeAppointments;

    const setupListeners = async () => {
      unsubscribeReminders = getReminders((data) => {
        // Remove duplicates from the data before setting state
        const uniqueReminders = removeDuplicateReminders(data);
        setReminders(uniqueReminders);
        setMedicineReminders(uniqueReminders.filter(r => r.type === 'medicine'));
        setGeneralReminders(uniqueReminders.filter(r => r.type === 'general'));
      });

      unsubscribeAppointments = getAllAppointments((data) => {
        setAppointments(data);
      });
    };

    setupListeners();

    return () => {
      if (unsubscribeReminders) unsubscribeReminders();
      if (unsubscribeAppointments) unsubscribeAppointments();
    };
  }, []);

  // Function to remove duplicate reminders
  const removeDuplicateReminders = (remindersList) => {
    const seen = new Set();
    const unique = [];
    
    remindersList.forEach(reminder => {
      // Create a unique key based on phone, date, type, and message
      const key = `${reminder.patientName}-${reminder.date}-${reminder.type}-${reminder.message}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(reminder);
      }
    });
    
    return unique;
  };

  // Separate useEffect to check for medicine reminders when reminders or appointments change
  // DISABLED for now to prevent duplicate creation
  /*
  useEffect(() => {
    if (!reminderCheckDone && reminders.length >= 0 && appointments.length > 0) {
      checkForMedicineReminders(appointments, reminders);
      setReminderCheckDone(true);
    }
  }, [appointments, reminders, reminderCheckDone]);
  */

  const checkForMedicineReminders = async (appointmentsList, currentReminders) => {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    
    for (const apt of appointmentsList) {
      if (apt.nextVisit === tomorrow && apt.status === 'completed') {
        // Check if reminder already exists in current reminders list
        const existingReminder = reminders.find(
          r => r.patientName === apt.patientName && 
          r.date === tomorrow && 
          r.type === 'medicine' &&
          r.message === 'Next visit scheduled for tomorrow'
        );
        
        if (!existingReminder) {
          try {
            await addReminder({
              patientName: apt.patientName,
              patientPhone: apt.patientPhone,
              patientId: apt.patientId,
              type: 'medicine',
              date: tomorrow,
              message: 'Next visit scheduled for tomorrow',
              status: 'pending'
            });
          } catch (error) {
            console.error('Error adding medicine reminder:', error);
          }
        }
      }
    }
  };

  const handleAddReminder = async (e) => {
    e.preventDefault();

    try {
      await addReminder(formData);
      toast.success('Reminder added successfully!');
      setFormData({
        patientName: '',
        patientPhone: '',
        type: 'general',
        date: format(new Date(), 'yyyy-MM-dd'),
        message: '',
        status: 'pending'
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding reminder:', error);
      toast.error('Failed to add reminder');
    }
  };

  const handleMarkComplete = async (reminderId) => {
    try {
      await updateReminder(reminderId, { status: 'completed' });
      toast.success('Reminder marked as complete!');
    } catch (error) {
      console.error('Error updating reminder:', error);
      toast.error('Failed to update reminder');
    }
  };

  // Open booking modal for a reminder
  const handleBookAppointment = async (reminder) => {
    setSelectedReminder(reminder);
    setBookingDate(reminder.date); // Pre-fill with reminder date
    setBookingNotes(`Follow-up from reminder: ${reminder.message}`);
    
    // Check if patient is new and get patient details
    try {
      const patient = await getPatientByName(reminder.patientName);
      if (patient) {
        setIsNewPatient(patient.isNewPatient || false);
        // Store patient details for booking
        setSelectedReminder({
          ...reminder,
          patientAge: patient.age || '',
          patientGender: patient.gender || ''
        });
      } else {
        setIsNewPatient(true);
      }
    } catch (error) {
      console.error('Error checking patient:', error);
      setIsNewPatient(true);
    }
    
    setShowBookingModal(true);
  };

  // Generate time slots whenever date changes
  useEffect(() => {
    if (showBookingModal && bookingDate) {
      generateTimeSlots();
    }
  }, [showBookingModal, bookingDate, appointments]);

  const generateTimeSlots = () => {
    const slots = [];
    const slotDuration = 15;

    const timeSlots = [
      { start: { hour: 10, minute: 30 }, end: { hour: 13, minute: 30 } },
      { start: { hour: 17, minute: 0 }, end: { hour: 21, minute: 0 } }
    ];

    const bookedAppointments = appointments.filter(
      apt => apt.date === bookingDate && apt.status !== 'cancelled'
    );

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

    timeSlots.forEach(timeSlot => {
      const startMinutes = timeSlot.start.hour * 60 + timeSlot.start.minute;
      const endMinutes = timeSlot.end.hour * 60 + timeSlot.end.minute;

      for (let currentMinutes = startMinutes; currentMinutes < endMinutes; currentMinutes += slotDuration) {
        const hour = Math.floor(currentMinutes / 60);
        const minute = currentMinutes % 60;
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHours = hour % 12 || 12;
        
        slots.push({
          time: timeStr,
          available: !bookedSlotTimes.has(timeStr),
          display: `${displayHours}:${minute.toString().padStart(2, '0')} ${period}`
        });
      }
    });

    setAvailableSlots(slots);
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot) {
      toast.warning('Please select a time slot');
      return;
    }

    if (!selectedReminder) return;

    setIsBooking(true);

    try {
      const duration = isNewPatient ? 45 : 15;

      await bookAppointmentWithTransaction({
        patientId: selectedReminder.patientId || null,
        patientName: selectedReminder.patientName,
        patientPhone: selectedReminder.patientPhone,
        patientAge: selectedReminder.patientAge || '',
        patientGender: selectedReminder.patientGender || '',
        patientPreviousVisits: [],
        date: bookingDate,
        time: selectedSlot,
        duration: duration,
        status: 'scheduled',
        notes: bookingNotes,
        bookedFrom: 'reminder',
        isNewPatient: isNewPatient
      });

      // Mark reminder as completed
      await updateReminder(selectedReminder.id, { status: 'completed' });

      toast.success('Appointment booked successfully from reminder!');
      setShowBookingModal(false);
      setSelectedReminder(null);
      setSelectedSlot('');
      setBookingNotes('');
    } catch (error) {
      console.error('Error booking appointment:', error);
      
      if (error.message && error.message.includes('SLOT_CONFLICT:')) {
        const message = error.message.replace('SLOT_CONFLICT:', '');
        toast.error(message + ' Please select a different time.');
        generateTimeSlots();
      } else {
        toast.error('Failed to book appointment. Please try again.');
      }
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="reminders-page">
      <div className="page-header">
        <h1>
          <FaBell /> Reminders
        </h1>
        <button
          className="add-reminder-btn"
          onClick={() => setShowAddForm(true)}
        >
          <FaPlus /> Add Reminder
        </button>
      </div>

      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add New Reminder</h2>
              <button className="close-btn" onClick={() => setShowAddForm(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleAddReminder} className="reminder-form">
              <div className="form-group">
                <label>Patient Name *</label>
                <input
                  type="text"
                  value={formData.patientName}
                  onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  value={formData.patientPhone}
                  onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Reminder Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Message *</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Follow-up call, callback request, etc."
                  rows="3"
                  required
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="save-btn">
                  Add Reminder
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="reminders-sections">
        <div className="reminder-section">
          <h2>Medicine Reminders (Next Visit Tomorrow)</h2>
          {medicineReminders.filter(r => {
            if (r.status !== 'pending') return false;
            // Only show reminders for tomorrow
            const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
            return r.date === tomorrow;
          }).length === 0 ? (
            <p className="empty-message">No medicine reminders</p>
          ) : (
            <div className="reminders-list">
              {medicineReminders
                .filter(r => {
                  if (r.status !== 'pending') return false;
                  // Only show reminders for tomorrow
                  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
                  return r.date === tomorrow;
                })
                .map((reminder) => (
                  <div key={reminder.id} className="reminder-card medicine">
                    <div className="reminder-icon">
                      <FaBell />
                    </div>
                    <div className="reminder-info">
                      <h3>{reminder.patientName}</h3>
                      <p>📞 {reminder.patientPhone}</p>
                      <p>
                        <FaCalendarAlt /> {format(parseISO(reminder.date), 'dd-MM-yyyy')}
                      </p>
                      <p className="reminder-message">{reminder.message}</p>
                    </div>
                    <div className="reminder-actions">
                      <button
                        className="book-btn"
                        onClick={() => handleBookAppointment(reminder)}
                        title="Book Appointment"
                      >
                        <FaCalendarCheck /> Book
                      </button>
                      <button
                        className="complete-btn"
                        onClick={() => handleMarkComplete(reminder.id)}
                        title="Mark as Complete"
                      >
                        Complete
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="reminder-section">
          <h2>General Reminders</h2>
          {generalReminders.filter(r => {
            if (r.status !== 'pending') return false;
            // Show reminders for today or tomorrow
            const today = format(new Date(), 'yyyy-MM-dd');
            const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
            return r.date === today || r.date === tomorrow;
          }).length === 0 ? (
            <p className="empty-message">No general reminders</p>
          ) : (
            <div className="reminders-list">
              {generalReminders
                .filter(r => {
                  if (r.status !== 'pending') return false;
                  // Show reminders for today or tomorrow
                  const today = format(new Date(), 'yyyy-MM-dd');
                  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
                  return r.date === today || r.date === tomorrow;
                })
                .map((reminder) => (
                  <div key={reminder.id} className="reminder-card general">
                    <div className="reminder-icon">
                      <FaBell />
                    </div>
                    <div className="reminder-info">
                      <h3>{reminder.patientName}</h3>
                      <p>📞 {reminder.patientPhone}</p>
                      <p>
                        <FaCalendarAlt /> {format(parseISO(reminder.date), 'dd-MM-yyyy')}
                      </p>
                      <p className="reminder-message">{reminder.message}</p>
                    </div>
                    <button
                      className="complete-btn"
                      onClick={() => handleMarkComplete(reminder.id)}
                    >
                      Mark Complete
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && selectedReminder && (
        <div className="modal-overlay">
          <div className="modal-content booking-modal">
            <div className="modal-header">
              <h2>Book Appointment for {selectedReminder.patientName}</h2>
              <button 
                className="close-btn" 
                onClick={() => {
                  setShowBookingModal(false);
                  setSelectedReminder(null);
                  setSelectedSlot('');
                }}
              >
                <FaTimes />
              </button>
            </div>

            <div className="booking-modal-body">
              <div className="patient-info-box">
                <h3>Patient Information</h3>
                <p><strong>Name:</strong> {selectedReminder.patientName}</p>
                <p><strong>Phone:</strong> {selectedReminder.patientPhone}</p>
                <p><strong>Type:</strong> {isNewPatient ? 'New Patient (45 min)' : 'Follow-up (15 min)'}</p>
              </div>

              <div className="form-group">
                <label>Select Date *</label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>

              <div className="form-group">
                <label>Select Time Slot *</label>
                <div className="time-slots-grid">
                  {availableSlots.length === 0 ? (
                    <p className="empty-message">No slots available for this date</p>
                  ) : (
                    availableSlots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        className={`time-slot-btn ${!slot.available ? 'booked' : 'free'} ${
                          selectedSlot === slot.time ? 'selected' : ''
                        }`}
                        onClick={() => slot.available && setSelectedSlot(slot.time)}
                        disabled={!slot.available}
                      >
                        {slot.display}
                        <div className="slot-status">
                          {!slot.available ? 'Booked' : selectedSlot === slot.time ? 'Selected' : 'Free'}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  rows="3"
                  placeholder="Add any additional notes..."
                />
              </div>

              <div className="modal-actions">
                <button
                  className="confirm-booking-btn"
                  onClick={handleConfirmBooking}
                  disabled={!selectedSlot || isBooking}
                >
                  {isBooking ? 'Booking...' : 'Confirm Booking'}
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setShowBookingModal(false);
                    setSelectedReminder(null);
                    setSelectedSlot('');
                  }}
                  disabled={isBooking}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reminders;

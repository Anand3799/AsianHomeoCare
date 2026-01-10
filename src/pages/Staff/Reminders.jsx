import { useState, useEffect } from 'react';
import { getReminders, addReminder, updateReminder, getAllAppointments, bookAppointmentWithTransaction, getPatientByName } from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { FaBell, FaPlus, FaCalendarAlt, FaPhone, FaCalendarCheck, FaTimes } from 'react-icons/fa';
import { format, addDays, parseISO } from 'date-fns';
import '../../styles/Reminders.css';

const Reminders = () => {
  const toast = useToast();
  // eslint-disable-next-line no-unused-vars
  const [reminders, setReminders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [medicineReminders, setMedicineReminders] = useState([]);
  const [generalReminders, setGeneralReminders] = useState([]);
  const [isBooking, setIsBooking] = useState(false);
  
  // Booking form state
  const [bookingDate, setBookingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedSubSlot, setSelectedSubSlot] = useState('');
  const [selectedSubSlotType, setSelectedSubSlotType] = useState('walkin');
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
  */

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBookingModal, bookingDate, appointments]);

  const generateTimeSlots = () => {
    const slots = [];
    const slotDuration = 15;

    // Continuous slots from 09:30 AM to 08:45 PM (09:30 - 20:45)
    const startMinutes = 9 * 60 + 30; // 09:30
    const endMinutes = 20 * 60 + 45; // 20:45

    const bookedAppointments = appointments.filter(
      apt => apt.date === bookingDate && (apt.status === 'scheduled' || apt.status === 'rescheduled')
    );

    // Create a map of booked sub-slots: time -> { A: appointment, B: appointment }
    const bookedSubSlots = new Map();
    bookedAppointments.forEach(apt => {
      const timeKey = apt.time;
      if (!bookedSubSlots.has(timeKey)) {
        bookedSubSlots.set(timeKey, { A: null, B: null });
      }
      const subSlot = apt.subSlot || 'A';
      bookedSubSlots.get(timeKey)[subSlot] = apt;
    });

    // Generate continuous time slots with dual sub-slots (A and B)
    for (let currentMinutes = startMinutes; currentMinutes <= endMinutes; currentMinutes += slotDuration) {
      const hour = Math.floor(currentMinutes / 60);
      const minute = currentMinutes % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      const booked = bookedSubSlots.get(timeStr) || { A: null, B: null };
      
      slots.push({
        time: timeStr,
        display: format(new Date(2000, 0, 1, hour, minute), 'h:mm a'),
        subSlotA: {
          available: !booked.A,
          appointment: booked.A,
          type: 'walkin' // A is always walk-in only
        },
        subSlotB: {
          available: !booked.B,
          appointment: booked.B,
          type: booked.B?.subSlotType || 'both' // B can be walk-in or call
        }
      });
    }

    setAvailableSlots(slots);
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !selectedSubSlot) {
      toast.warning('Please select a time slot and sub-slot');
      return;
    }

    if (!selectedReminder) return;

    setIsBooking(true);

    try {
      await bookAppointmentWithTransaction({
        patientId: selectedReminder.patientId || null,
        patientName: selectedReminder.patientName,
        patientPhone: selectedReminder.patientPhone,
        patientAge: selectedReminder.patientAge || '',
        patientGender: selectedReminder.patientGender || '',
        patientPreviousVisits: [],
        date: bookingDate,
        time: selectedSlot,
        subSlot: selectedSubSlot,
        subSlotType: selectedSubSlotType,
        status: 'scheduled',
        notes: bookingNotes,
        bookedFrom: 'reminder',
        bookedBy: 'staff',
        isNewPatient: isNewPatient
      });

      // Mark reminder as completed
      await updateReminder(selectedReminder.id, { status: 'completed' });

      toast.success('Appointment booked successfully from reminder!');
      setShowBookingModal(false);
      setSelectedReminder(null);
      setSelectedSlot('');
      setSelectedSubSlot('');
      setSelectedSubSlotType('walkin');
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
                  setSelectedSubSlot('');
                  setSelectedSubSlotType('walkin');
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
                <p><strong>Type:</strong> {isNewPatient ? 'New Patient' : 'Follow-up'}</p>
                {selectedSlot && selectedSubSlot && (
                  <>
                    <p><strong>Selected Time:</strong> {format(new Date(2000, 0, 1, ...selectedSlot.split(':').map(Number)), 'h:mm a')}</p>
                    <p><strong>Sub-slot:</strong> {selectedSubSlot} - {selectedSubSlotType === 'walkin' ? 'Walk-in' : selectedSubSlotType === 'call' ? 'Call' : 'Booking'}</p>
                  </>
                )}
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
                    availableSlots.map((slot) => {
                      const isASelected = selectedSlot === slot.time && selectedSubSlot === 'A';
                      const isBSelected = selectedSlot === slot.time && selectedSubSlot === 'B';
                      
                      return (
                        <div key={slot.time} className="dual-slot-container">
                          <div className="slot-time-label">{slot.display}</div>
                          <div className="sub-slots">
                            {/* Sub-slot A */}
                            <button
                              type="button"
                              className={`sub-slot-btn sub-slot-a ${!slot.subSlotA.available ? 'booked' : 'free'} ${
                                isASelected ? 'selected' : ''
                              }`}
                              onClick={() => {
                                if (slot.subSlotA.available) {
                                  setSelectedSlot(slot.time);
                                  setSelectedSubSlot('A');
                                }
                              }}
                              disabled={!slot.subSlotA.available}
                              title="Sub-slot A"
                            >
                              <span className="sub-slot-badge">A</span>
                              <span className="sub-slot-status">
                                {!slot.subSlotA.available ? 'Booked' : isASelected ? 'Selected' : 'Free'}
                              </span>
                            </button>

                            {/* Sub-slot B */}
                            <button
                              type="button"
                              className={`sub-slot-btn sub-slot-b ${!slot.subSlotB.available ? 'booked' : 'free'} ${
                                isBSelected ? 'selected' : ''
                              }`}
                              onClick={() => {
                                if (slot.subSlotB.available) {
                                  setSelectedSlot(slot.time);
                                  setSelectedSubSlot('B');
                                }
                              }}
                              disabled={!slot.subSlotB.available}
                              title="Sub-slot B"
                            >
                              <span className="sub-slot-badge">B</span>
                              <span className="sub-slot-status">
                                {!slot.subSlotB.available ? 'Booked' : isBSelected ? 'Selected' : 'Free'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Show appointment type selector for both A and B */}
              {selectedSubSlot && (
                <div className="form-group">
                  <label>Appointment Type *</label>
                  <div className="appointment-type-selector">
                    <button
                      type="button"
                      className={`type-btn ${selectedSubSlotType === 'walkin' ? 'active' : ''}`}
                      onClick={() => setSelectedSubSlotType('walkin')}
                    >
                      Walk-in
                    </button>
                    <button
                      type="button"
                      className={`type-btn ${selectedSubSlotType === 'call' ? 'active' : ''}`}
                      onClick={() => setSelectedSubSlotType('call')}
                    >
                      Call
                    </button>
                    <button
                      type="button"
                      className={`type-btn ${selectedSubSlotType === 'booking' ? 'active' : ''}`}
                      onClick={() => setSelectedSubSlotType('booking')}
                    >
                      Booking
                    </button>
                  </div>
                </div>
              )}

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
                  disabled={!selectedSlot || !selectedSubSlot || isBooking}
                >
                  {isBooking ? 'Booking...' : 'Confirm Booking'}
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setShowBookingModal(false);
                    setSelectedReminder(null);
                    setSelectedSlot('');
                    setSelectedSubSlot('');
                    setSelectedSubSlotType('walkin');
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

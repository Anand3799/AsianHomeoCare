import { useState, useEffect, useCallback } from 'react';
import {
  getAllPatients,
  updateAppointment,
  getAllAppointments,
  addPatient,
  bookAppointmentWithTransaction,
  updateAppointmentWithTransaction,
  updatePatient,
  createMedicineReminderIfNeeded
} from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import PatientNameTypeahead from '../../components/PatientNameTypeahead';
import { FaCalendarPlus, FaEdit, FaStickyNote, FaChevronLeft, FaChevronRight, FaTrash, FaClock, FaCalendarAlt, FaCheckCircle } from 'react-icons/fa';
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
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [appointmentToComplete, setAppointmentToComplete] = useState(null);
  const [completionData, setCompletionData] = useState({ nextVisitDate: '', notes: '' });
  
  const [formData, setFormData] = useState({
    patientName: '',
    patientPhone: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '',
    subSlot: '',
    subSlotType: 'walkin',
    notes: '',
    status: 'scheduled'
  });

  const [availableSlots, setAvailableSlots] = useState([]);
  const [isNewPatient, setIsNewPatient] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState([]); // Array of { time, subSlot } for new patients, single for returning

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
  }, [selectedDate, generateTimeSlots]);

  const handleNameChange = (name) => {
    setFormData({ ...formData, patientName: name });
  };

  const handlePatientSelect = (patient) => {
    // Check if this is a brand new patient being added (not in database)
    if (patient.isNew) {
      setIsNewPatient(true);
      setFormData(prev => ({
        ...prev,
        patientName: patient.name,
        patientPhone: '',
        patientId: null,
        patientAge: '',
        patientGender: '',
        patientPreviousVisits: [],
        isNewPatient: true
      }));
    } else {
      // Check if patient has completed any visits
      const hasCompletedVisits = patient.previousVisits && patient.previousVisits.length > 0;
      // Patient is new if they have no previous visits OR if explicitly marked as new
      const patientIsNew = !hasCompletedVisits;
      
      setIsNewPatient(patientIsNew);
      setFormData(prev => ({
        ...prev,
        patientName: patient.name,
        patientPhone: patient.phone,
        patientId: patient.id,
        patientAge: patient.age || '',
        patientGender: patient.gender || '',
        patientPreviousVisits: patient.previousVisits || [],
        isNewPatient: patientIsNew
      }));
    }
  };

  const generateTimeSlots = useCallback(() => {
    const slots = [];
    const slotDuration = 15; // 15 minutes per slot

    // Continuous slots from 09:30 AM to 08:45 PM (09:30 - 20:45)
    const startMinutes = 9 * 60 + 30; // 09:30
    const endMinutes = 20 * 60 + 45; // 20:45

    // Get booked appointments for selected date
    const bookedAppointments = appointments.filter(
      apt => apt.date === selectedDate && (apt.status === 'scheduled' || apt.status === 'rescheduled')
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
  }, [appointments, selectedDate]);

  const handleSubSlotClick = (time, subSlot, isAvailable) => {
    if (!isAvailable) {
      toast.warning(`Sub-slot ${subSlot} at ${format(parseISO(`2000-01-01T${time}`), 'h:mm a')} is already booked.`);
      return;
    }

    const isAlreadySelected = selectedSlots.some(s => s.time === time && s.subSlot === subSlot);

    if (isNewPatient) {
      // New patients can select multiple slots
      if (isAlreadySelected) {
        // Deselect this slot
        const updatedSlots = selectedSlots.filter(s => !(s.time === time && s.subSlot === subSlot));
        setSelectedSlots(updatedSlots);
        if (updatedSlots.length === 0) {
          setFormData({ ...formData, time: '', subSlot: '', subSlotType: 'walkin', date: selectedDate });
        }
      } else {
        // Add this slot
        const slotType = subSlot === 'A' ? 'walkin' : formData.subSlotType || 'walkin';
        const newSlots = [...selectedSlots, { time, subSlot, subSlotType: slotType }];
        setSelectedSlots(newSlots);
        // Update formData with first slot details for display
        if (!formData.time) {
          setFormData({ 
            ...formData, 
            time, 
            subSlot, 
            subSlotType: slotType,
            date: selectedDate 
          });
        }
      }
    } else {
      // Returning patients can only select one slot
      if (isAlreadySelected) {
        // Deselect
        setSelectedSlots([]);
        setFormData({ ...formData, time: '', subSlot: '', subSlotType: 'walkin', date: selectedDate });
      } else {
        // Select single slot
        const slotType = subSlot === 'A' ? 'walkin' : formData.subSlotType || 'walkin';
        setSelectedSlots([{ time, subSlot, subSlotType: slotType }]);
        setFormData({ 
          ...formData, 
          time, 
          subSlot, 
          subSlotType: slotType,
          date: selectedDate 
        });
      }
    }
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();

    if (selectedSlots.length === 0) {
      toast.warning('Please select at least one time slot and sub-slot (A or B)');
      return;
    }

    if (isBooking) {
      return; // Prevent double submission
    }

    setIsBooking(true);

    try {
      if (isRescheduling && selectedAppointment) {
        // Update patient details if they were changed
        if (selectedAppointment.patientId) {
          await updatePatient(selectedAppointment.patientId, {
            phone: formData.patientPhone,
            age: formData.patientAge || '',
            gender: formData.patientGender || ''
          });
        }
        
        // Use transaction-based update for rescheduling (single slot only)
        const firstSlot = selectedSlots[0];
        await updateAppointmentWithTransaction(selectedAppointment.id, {
          date: selectedDate,
          time: firstSlot.time,
          subSlot: firstSlot.subSlot,
          subSlotType: firstSlot.subSlotType,
          notes: formData.notes,
          status: 'rescheduled',
          patientPhone: formData.patientPhone,
          patientAge: formData.patientAge || '',
          patientGender: formData.patientGender || ''
        });
        toast.success('Appointment rescheduled and patient details updated successfully!');
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
            notes: formData.notes || 'Patient registered during appointment booking',
            isNewPatient: true
          };
          
          const newPatientId = await addPatient(newPatient);
          patientId = newPatientId.id;
          
          console.log('New patient added to database:', newPatientId);
        } else if (formData.patientId) {
          // Update existing patient details if they were changed
          await updatePatient(formData.patientId, {
            phone: formData.patientPhone,
            age: formData.patientAge || '',
            gender: formData.patientGender || ''
          });
          console.log('Patient details updated in database');
        }

        // Book all selected slots
        const bookingPromises = selectedSlots.map(slot => 
          bookAppointmentWithTransaction({
            patientId: patientId || null,
            patientName: formData.patientName,
            patientPhone: formData.patientPhone,
            patientAge: formData.patientAge || '',
            patientGender: formData.patientGender || '',
            patientPreviousVisits: formData.patientPreviousVisits || [],
            date: selectedDate,
            time: slot.time,
            subSlot: slot.subSlot,
            subSlotType: slot.subSlotType,
            status: 'scheduled',
            notes: formData.notes || '',
            isNewPatient: isNewPatient,
            bookedBy: 'staff'
          })
        );

        await Promise.all(bookingPromises);
        
        if (isNewPatient && !formData.patientId) {
          toast.success(`New patient added and ${selectedSlots.length} appointment${selectedSlots.length > 1 ? 's' : ''} booked successfully!`);
        } else {
          toast.success(`${selectedSlots.length} appointment${selectedSlots.length > 1 ? 's' : ''} booked successfully!`);
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
      patientName: appointment.patientName,
      patientPhone: appointment.patientPhone,
      patientId: appointment.patientId,
      patientAge: appointment.patientAge || '',
      patientGender: appointment.patientGender || '',
      patientPreviousVisits: appointment.patientPreviousVisits || [],
      date: appointment.date,
      time: '',
      subSlot: '',
      subSlotType: appointment.subSlotType || 'walkin',
      notes: appointment.notes || '',
      status: appointment.status,
      isNewPatient: false
    });
    setSelectedDate(appointment.date);
    setSelectedSlots([]);
    setShowBookingForm(false); // Don't show modal
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

  const handleOpenCompletionModal = (apt) => {
    setAppointmentToComplete(apt);
    setCompletionData({ nextVisitDate: apt.nextVisit || '', notes: apt.notes || '' });
    setShowCompletionModal(true);
  };

  const handleCompleteAppointment = async () => {
    if (!appointmentToComplete) return;

    try {
      // Update appointment
      await updateAppointment(appointmentToComplete.id, {
        status: 'completed',
        nextVisit: completionData.nextVisitDate,
        notes: completionData.notes,
        completedAt: new Date().toISOString()
      });

      // Update patient record and mark as old patient
      if (appointmentToComplete.patientId) {
        const patientRef = appointmentToComplete.patientId;
        
        // Find the patient in the patients array to get current previousVisits
        const currentPatient = patients.find(p => p.id === patientRef);
        const existingVisits = currentPatient?.previousVisits || [];
        
        // Only add the visit date if it's not already in the array
        const visitDate = appointmentToComplete.date;
        const updatedVisits = existingVisits.includes(visitDate) 
          ? existingVisits 
          : [...existingVisits, visitDate];
        
        const updateData = {
          previousVisits: updatedVisits
        };
        
        // Mark as old patient after first visit
        if (appointmentToComplete.isNewPatient) {
          updateData.isNewPatient = false;
        }
        
        await updatePatient(patientRef, updateData);
      }

      // Create medicine reminder if next visit date is set
      if (completionData.nextVisitDate) {
        const reminderResult = await createMedicineReminderIfNeeded({
          patientName: appointmentToComplete.patientName,
          patientPhone: appointmentToComplete.patientPhone,
          patientId: appointmentToComplete.patientId,
          nextVisit: completionData.nextVisitDate
        });

        if (reminderResult.created) {
          console.log('Medicine reminder created successfully');
        } else {
          console.log('Reminder creation skipped:', reminderResult.reason);
        }
      }

      const completionMessage = appointmentToComplete.isNewPatient 
        ? 'Appointment completed successfully! Patient has been marked as returning patient for future visits.' 
        : 'Appointment completed successfully!';
      
      toast.success(completionMessage);
      setShowCompletionModal(false);
      setAppointmentToComplete(null);
      setCompletionData({ nextVisitDate: '', notes: '' });
    } catch (error) {
      console.error('Error completing appointment:', error);
      toast.error('Failed to complete appointment');
    }
  };

  const resetForm = () => {
    setFormData({
      patientName: '',
      patientPhone: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      time: '',
      subSlot: '',
      subSlotType: 'walkin',
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

  // Group appointments by patient (phone number + name)
  const groupAppointmentsByPatient = () => {
    const grouped = [];
    const processed = new Set();

    selectedDateAppointments
      .sort((a, b) => {
        // First sort by time
        const timeCompare = a.time.localeCompare(b.time);
        if (timeCompare !== 0) return timeCompare;
        // Then sort by subSlot (A before B)
        return a.subSlot.localeCompare(b.subSlot);
      })
      .forEach((apt) => {
        if (processed.has(apt.id)) return;

        const patientKey = `${apt.patientPhone}-${apt.patientName}`;
        const samePatientAppointments = selectedDateAppointments
          .filter(a => 
            `${a.patientPhone}-${a.patientName}` === patientKey &&
            !processed.has(a.id)
          )
          .sort((a, b) => {
            // First sort by time
            const timeCompare = a.time.localeCompare(b.time);
            if (timeCompare !== 0) return timeCompare;
            // Then sort by subSlot (A before B)
            return a.subSlot.localeCompare(b.subSlot);
          });

        samePatientAppointments.forEach(a => processed.add(a.id));

        grouped.push({
          ...apt,
          allSlots: samePatientAppointments,
          isGrouped: samePatientAppointments.length > 1
        });
      });

    return grouped;
  };

  const groupedAppointments = groupAppointmentsByPatient();

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
                      className={`calendar-day ${selectedDate && isSameDay(new Date(selectedDate + 'T00:00:00'), day) ? 'selected' : ''} ${
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
                  {selectedDate && format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM dd')}
                  <span className="slot-legend">
                    <span><span className="legend-free"></span> Free</span>
                    <span><span className="legend-booked"></span> Booked</span>
                    <span className="realtime-indicator" title="Real-time updates active">
                      <span className="realtime-dot"></span> Live
                    </span>
                  </span>
                </h4>
                {isNewPatient && (
                  <p style={{ fontSize: '0.875rem', color: '#0ea5e9', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                    💡 New patients can select multiple time slots (click multiple slots to book consecutive appointments)
                  </p>
                )}
                <div className="slots-grid-dual">
                  {availableSlots.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                      <p>Loading time slots...</p>
                      <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        Select a date from the calendar above
                      </p>
                    </div>
                  ) : (
                    availableSlots.map((slot) => {
                      const isSlotASelected = selectedSlots.some(s => s.time === slot.time && s.subSlot === 'A');
                      const isSlotBSelected = selectedSlots.some(s => s.time === slot.time && s.subSlot === 'B');
                      
                      return (
                        <div key={slot.time} className="dual-slot-container">
                        <div className="slot-time-label">{slot.display}</div>
                        <div className="sub-slots-row">
                          {/* Sub-slot A - Walk-in only */}
                          <button
                            type="button"
                            className={`sub-slot-btn sub-slot-a ${
                              !slot.subSlotA.available ? 'booked' : ''
                            } ${isSlotASelected ? 'selected' : ''}`}
                            onClick={() => handleSubSlotClick(slot.time, 'A', slot.subSlotA.available)}
                            disabled={!slot.subSlotA.available}
                            title={slot.subSlotA.available ? 'Sub-slot A - Walk-in only' : `Booked: ${slot.subSlotA.appointment?.patientName}`}
                          >
                            <div className="sub-slot-header">
                              <span className="sub-slot-label">A</span>
                              <span className="sub-slot-type-badge walkin">Walk-in</span>
                            </div>
                            {!slot.subSlotA.available && slot.subSlotA.appointment ? (
                              <div className="sub-slot-patient">{slot.subSlotA.appointment.patientName}</div>
                            ) : (
                              <div className="sub-slot-status">
                                {isSlotASelected ? 'Selected' : 'Available'}
                              </div>
                            )}
                          </button>

                          {/* Sub-slot B - Walk-in or Call */}
                          <button
                            type="button"
                            className={`sub-slot-btn sub-slot-b ${
                              !slot.subSlotB.available ? 'booked' : ''
                            } ${isSlotBSelected ? 'selected' : ''}`}
                            onClick={() => handleSubSlotClick(slot.time, 'B', slot.subSlotB.available)}
                            disabled={!slot.subSlotB.available}
                            title={slot.subSlotB.available ? 'Sub-slot B - Walk-in or Call' : `Booked: ${slot.subSlotB.appointment?.patientName} (${slot.subSlotB.appointment?.subSlotType})`}
                          >
                            <div className="sub-slot-header">
                              <span className="sub-slot-label">B</span>
                              <span className="sub-slot-type-badge both">Walk-in/Call</span>
                            </div>
                            {!slot.subSlotB.available && slot.subSlotB.appointment ? (
                              <>
                                <div className="sub-slot-patient">{slot.subSlotB.appointment.patientName}</div>
                                <span className={`appointment-type-badge ${slot.subSlotB.appointment.subSlotType}`}>
                                  {slot.subSlotB.appointment.subSlotType === 'walkin' ? 'Walk-in' : 'Call'}
                                </span>
                              </>
                            ) : (
                              <div className="sub-slot-status">
                                {isSlotBSelected ? 'Selected' : 'Available'}
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Form */}
            <div className="form-section">
              <form onSubmit={handleBookAppointment} className="booking-form">
                <div className="form-group">
                  <label>Patient Name *</label>
                  <PatientNameTypeahead
                    value={formData.patientName}
                    onChange={handleNameChange}
                    onSelect={handlePatientSelect}
                    placeholder="Type patient name (2+ characters for suggestions)"
                    disabled={isRescheduling}
                    required={true}
                  />
                  {formData.patientId && (
                    <small className={isNewPatient ? 'new-patient-badge' : 'returning-patient-badge'}>
                      {isNewPatient ? '✨ New Patient' : '✓ Returning Patient'}
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    value={formData.patientPhone}
                    onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                    placeholder="Enter phone number"
                    required
                  />
                </div>

                {selectedSlots.length > 0 && selectedSlots.some(s => s.subSlot === 'B') && (
                  <div className="form-group">
                    <label>Appointment Type * (Sub-slot B only)</label>
                    <div className="type-selector">
                      <label className="type-option">
                        <input
                          type="radio"
                          name="subSlotType"
                          value="walkin"
                          checked={formData.subSlotType === 'walkin'}
                          onChange={(e) => {
                            const newType = e.target.value;
                            setFormData({ ...formData, subSlotType: newType });
                            // Update all B slots in selectedSlots
                            setSelectedSlots(selectedSlots.map(slot => 
                              slot.subSlot === 'B' ? { ...slot, subSlotType: newType } : slot
                            ));
                          }}
                        />
                        <span className="type-label">Walk-in</span>
                      </label>
                      <label className="type-option">
                        <input
                          type="radio"
                          name="subSlotType"
                          value="call"
                          checked={formData.subSlotType === 'call'}
                          onChange={(e) => {
                            const newType = e.target.value;
                            setFormData({ ...formData, subSlotType: newType });
                            // Update all B slots in selectedSlots
                            setSelectedSlots(selectedSlots.map(slot => 
                              slot.subSlot === 'B' ? { ...slot, subSlotType: newType } : slot
                            ));
                          }}
                        />
                        <span className="type-label">Call</span>
                      </label>
                    </div>
                  </div>
                )}

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
                    />
                  </div>

                  <div className="form-group">
                    <label>Gender *</label>
                    <select
                      value={formData.patientGender}
                      onChange={(e) => setFormData({ ...formData, patientGender: e.target.value })}
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Selected Date & Time {isNewPatient && selectedSlots.length > 0 && `(${selectedSlots.length} slot${selectedSlots.length > 1 ? 's' : ''})`}</label>
                  <div className="selected-info">
                    <p><strong>Date:</strong> {selectedDate && format(new Date(selectedDate + 'T00:00:00'), 'dd-MM-yyyy')}</p>
                    {selectedSlots.length > 0 && (
                      <>
                        {selectedSlots.map((slot, idx) => (
                          <div key={`${slot.time}-${slot.subSlot}`} style={{ marginTop: idx > 0 ? '0.5rem' : '0', paddingTop: idx > 0 ? '0.5rem' : '0', borderTop: idx > 0 ? '1px solid #e5e7eb' : 'none' }}>
                            <p><strong>Time {selectedSlots.length > 1 ? `${idx + 1}:` : ':'}</strong> {availableSlots.find(s => s.time === slot.time)?.display}</p>
                            <p><strong>Sub-slot:</strong> {slot.subSlot}</p>
                            <p><strong>Type:</strong> {slot.subSlotType === 'walkin' ? 'Walk-in' : 'Call'}</p>
                          </div>
                        ))}
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
                    {isBooking ? 'Processing...' : (isRescheduling ? 'Reschedule' : 'Book')} Appointment{selectedSlots.length > 1 ? 's' : ''}
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
                    const isSelected = selectedDate && isSameDay(day, new Date(selectedDate + 'T00:00:00'));
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
              Appointments for {selectedDate && format(new Date(selectedDate + 'T00:00:00'), 'dd-MM-yyyy')}
            </h3>
            
            {groupedAppointments.length === 0 ? (
              <div className="empty-state">
                <FaCalendarPlus className="empty-icon" />
                <p>No appointments scheduled for this date</p>
              </div>
            ) : (
              <div className="appointments-cards-horizontal">
                {groupedAppointments.map((apt) => (
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
                        {apt.isGrouped ? (
                          <div className="grouped-slots">
                            {apt.allSlots.map((slot, idx) => (
                              <span key={slot.id} className="slot-time-group">
                                {formatTime(slot.time)}
                                {slot.subSlot && (
                                  <span className={`sub-slot-badge slot-${slot.subSlot.toLowerCase()}`}>
                                    {slot.subSlot}
                                  </span>
                                )}
                                {slot.subSlotType && (
                                  <span className={`type-badge ${slot.subSlotType}`}>
                                    {slot.subSlotType === 'walkin' ? 'Walk-in' : 'Call'}
                                  </span>
                                )}
                                {idx < apt.allSlots.length - 1 && <span className="slot-separator">•</span>}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <>
                            <span>{formatTime(apt.time)}</span>
                            {apt.subSlot && (
                              <span className={`sub-slot-badge slot-${apt.subSlot.toLowerCase()}`}>
                                Sub-slot {apt.subSlot}
                              </span>
                            )}
                            {apt.subSlotType && (
                              <span className={`type-badge ${apt.subSlotType}`}>
                                {apt.subSlotType === 'walkin' ? 'Walk-in' : 'Call'}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {apt.nextVisit && (
                        <div className="appointment-detail">
                          <FaCalendarAlt className="detail-icon" />
                          <span>Next Visit: {format(parseISO(apt.nextVisit), 'dd-MM-yyyy')}</span>
                        </div>
                      )}
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
                      {apt.status !== 'completed' && (
                        <button
                          className="complete-btn"
                          onClick={() => handleOpenCompletionModal(apt)}
                        >
                          <FaCheckCircle /> Complete
                        </button>
                      )}
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

      {/* Completion Modal */}
      {showCompletionModal && appointmentToComplete && (
        <div className="modal-overlay" onClick={() => setShowCompletionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Complete Appointment</h2>
              <button className="close-btn" onClick={() => setShowCompletionModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="patient-summary">
                <h3>{appointmentToComplete.patientName}</h3>
                <p>{appointmentToComplete.patientPhone}</p>
                <p>{format(parseISO(appointmentToComplete.date), 'dd-MM-yyyy')} at {formatTime(appointmentToComplete.time)}</p>
              </div>

              <div className="form-group">
                <label>
                  <FaCalendarAlt /> Next Visit Date (Optional)
                </label>
                <input
                  type="date"
                  value={completionData.nextVisitDate}
                  onChange={(e) => setCompletionData({ ...completionData, nextVisitDate: e.target.value })}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
                <small>Setting this will create a reminder for staff one day before</small>
              </div>

              <div className="form-group">
                <label><FaStickyNote /> Notes (Optional)</label>
                <textarea
                  value={completionData.notes}
                  onChange={(e) => setCompletionData({ ...completionData, notes: e.target.value })}
                  placeholder="Add any additional notes..."
                  rows="4"
                />
              </div>

              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowCompletionModal(false)}>
                  Cancel
                </button>
                <button className="complete-appointment-btn" onClick={handleCompleteAppointment}>
                  <FaCheckCircle /> Mark as Completed
                </button>
              </div>
            </div>
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

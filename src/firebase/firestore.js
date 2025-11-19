import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  orderBy,
  onSnapshot,
  Timestamp,
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import { db } from './config';

// Patients
export const addPatient = async (patientData) => {
  return await addDoc(collection(db, 'patients'), {
    ...patientData,
    createdAt: Timestamp.now()
  });
};

// Create new patient from call queue with new patient flag
export const createPatientFromCallQueue = async (patientData) => {
  const { name, phone, age, gender, address } = patientData;
  
  // Check if patient already exists
  const existingPatient = await getPatientByPhone(phone);
  if (existingPatient) {
    return existingPatient;
  }
  
  // Create new patient record
  const newPatientRef = await addDoc(collection(db, 'patients'), {
    name,
    phone,
    age: age || '',
    gender: gender || '',
    address: address || '',
    isNewPatient: true,
    createdAt: Timestamp.now()
  });
  
  return { id: newPatientRef.id, name, phone, age, gender, address, isNewPatient: true };
};

export const updatePatient = async (patientId, updates) => {
  const patientRef = doc(db, 'patients', patientId);
  return await updateDoc(patientRef, updates);
};

export const getPatientByPhone = async (phone) => {
  const q = query(collection(db, 'patients'), where('phone', '==', phone));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }
  return null;
};

export const getAllPatients = (callback) => {
  const q = query(collection(db, 'patients'));
  return onSnapshot(q, (snapshot) => {
    const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Sort by name in memory
    patients.sort((a, b) => a.name.localeCompare(b.name));
    callback(patients);
  });
};

// Appointments
export const addAppointment = async (appointmentData) => {
  return await addDoc(collection(db, 'appointments'), {
    ...appointmentData,
    createdAt: Timestamp.now()
  });
};

export const updateAppointment = async (appointmentId, updates) => {
  const appointmentRef = doc(db, 'appointments', appointmentId);
  return await updateDoc(appointmentRef, updates);
};

export const getAppointmentsByDate = (date, callback) => {
  const q = query(
    collection(db, 'appointments'),
    where('date', '==', date)
  );
  return onSnapshot(q, (snapshot) => {
    const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Sort by time in memory instead of Firestore
    appointments.sort((a, b) => a.time.localeCompare(b.time));
    callback(appointments);
  });
};

export const getAllAppointments = (callback) => {
  const q = query(collection(db, 'appointments'));
  return onSnapshot(q, (snapshot) => {
    const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Sort in memory to avoid composite index requirement
    appointments.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
    callback(appointments);
  });
};

// Transaction-based appointment booking to prevent double bookings
export const bookAppointmentWithTransaction = async (appointmentData) => {
  const { date, time, duration = 15, ...restData } = appointmentData;
  
  // Calculate all time slots that will be occupied
  const [hours, minutes] = time.split(':').map(Number);
  const startMinutes = hours * 60 + minutes;
  const slotsNeeded = Math.ceil(duration / 15);
  const occupiedSlots = [];
  
  for (let i = 0; i < slotsNeeded; i++) {
    const slotMinutes = startMinutes + (i * 15);
    const slotHour = Math.floor(slotMinutes / 60);
    const slotMin = slotMinutes % 60;
    const timeStr = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
    occupiedSlots.push(timeStr);
  }

  return await runTransaction(db, async (transaction) => {
    // Query for conflicting appointments
    const appointmentsRef = collection(db, 'appointments');
    const conflictQuery = query(
      appointmentsRef,
      where('date', '==', date),
      where('status', 'in', ['scheduled', 'rescheduled'])
    );
    
    const snapshot = await getDocs(conflictQuery);
    const existingAppointments = snapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    }));

    // Check for conflicts
    for (const apt of existingAppointments) {
      const [aptHours, aptMinutes] = apt.time.split(':').map(Number);
      const aptStartMinutes = aptHours * 60 + aptMinutes;
      const aptDuration = apt.duration || 15;
      const aptSlotsNeeded = Math.ceil(aptDuration / 15);
      
      // Get all slots occupied by this existing appointment
      for (let i = 0; i < aptSlotsNeeded; i++) {
        const aptSlotMinutes = aptStartMinutes + (i * 15);
        const aptSlotHour = Math.floor(aptSlotMinutes / 60);
        const aptSlotMin = aptSlotMinutes % 60;
        const aptTimeStr = `${aptSlotHour.toString().padStart(2, '0')}:${aptSlotMin.toString().padStart(2, '0')}`;
        
        // Check if any of our slots conflict with existing appointment slots
        if (occupiedSlots.includes(aptTimeStr)) {
          throw new Error(`SLOT_CONFLICT:Time slot ${aptTimeStr} is already booked. Please select another time.`);
        }
      }
    }

    // If no conflicts, create the appointment
    const newAppointmentRef = doc(collection(db, 'appointments'));
    transaction.set(newAppointmentRef, {
      ...restData,
      date,
      time,
      duration,
      createdAt: Timestamp.now()
    });

    return { id: newAppointmentRef.id, success: true };
  });
};

// Transaction-based appointment update/reschedule
export const updateAppointmentWithTransaction = async (appointmentId, updates) => {
  const { date, time, duration, ...restUpdates } = updates;
  
  // If not updating time-related fields, use regular update
  if (!date && !time && !duration) {
    return await updateAppointment(appointmentId, updates);
  }

  return await runTransaction(db, async (transaction) => {
    const appointmentRef = doc(db, 'appointments', appointmentId);
    const appointmentDoc = await transaction.get(appointmentRef);
    
    if (!appointmentDoc.exists()) {
      throw new Error('Appointment not found');
    }

    const currentData = appointmentDoc.data();
    const newDate = date || currentData.date;
    const newTime = time || currentData.time;
    const newDuration = duration || currentData.duration || 15;

    // Calculate all time slots that will be occupied
    const [hours, minutes] = newTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const slotsNeeded = Math.ceil(newDuration / 15);
    const occupiedSlots = [];
    
    for (let i = 0; i < slotsNeeded; i++) {
      const slotMinutes = startMinutes + (i * 15);
      const slotHour = Math.floor(slotMinutes / 60);
      const slotMin = slotMinutes % 60;
      const timeStr = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
      occupiedSlots.push(timeStr);
    }

    // Query for conflicting appointments (excluding this one)
    const appointmentsRef = collection(db, 'appointments');
    const conflictQuery = query(
      appointmentsRef,
      where('date', '==', newDate),
      where('status', 'in', ['scheduled', 'rescheduled'])
    );
    
    const snapshot = await getDocs(conflictQuery);
    const existingAppointments = snapshot.docs
      .filter(doc => doc.id !== appointmentId) // Exclude current appointment
      .map(doc => ({ id: doc.id, ...doc.data() }));

    // Check for conflicts
    for (const apt of existingAppointments) {
      const [aptHours, aptMinutes] = apt.time.split(':').map(Number);
      const aptStartMinutes = aptHours * 60 + aptMinutes;
      const aptDuration = apt.duration || 15;
      const aptSlotsNeeded = Math.ceil(aptDuration / 15);
      
      for (let i = 0; i < aptSlotsNeeded; i++) {
        const aptSlotMinutes = aptStartMinutes + (i * 15);
        const aptSlotHour = Math.floor(aptSlotMinutes / 60);
        const aptSlotMin = aptSlotMinutes % 60;
        const aptTimeStr = `${aptSlotHour.toString().padStart(2, '0')}:${aptSlotMin.toString().padStart(2, '0')}`;
        
        if (occupiedSlots.includes(aptTimeStr)) {
          throw new Error(`SLOT_CONFLICT:Time slot ${aptTimeStr} is already booked. Please select another time.`);
        }
      }
    }

    // If no conflicts, update the appointment
    transaction.update(appointmentRef, {
      ...restUpdates,
      date: newDate,
      time: newTime,
      duration: newDuration,
      updatedAt: Timestamp.now()
    });

    return { success: true };
  });
};

// Reminders
export const addReminder = async (reminderData) => {
  return await addDoc(collection(db, 'reminders'), {
    ...reminderData,
    createdAt: Timestamp.now()
  });
};

export const updateReminder = async (reminderId, updates) => {
  const reminderRef = doc(db, 'reminders', reminderId);
  return await updateDoc(reminderRef, updates);
};

export const getReminders = (callback) => {
  const q = query(collection(db, 'reminders'));
  return onSnapshot(q, (snapshot) => {
    const reminders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Sort by date in memory
    reminders.sort((a, b) => a.date.localeCompare(b.date));
    callback(reminders);
  });
};

// Check if medicine reminder already exists and create if not
export const createMedicineReminderIfNeeded = async (appointmentData) => {
  const { patientName, patientPhone, patientId, nextVisit } = appointmentData;
  
  if (!nextVisit) {
    return { created: false, reason: 'No next visit date' };
  }

  try {
    // Query for existing reminders with same phone, date, and type
    const remindersRef = collection(db, 'reminders');
    const q = query(
      remindersRef,
      where('patientPhone', '==', patientPhone),
      where('date', '==', nextVisit),
      where('type', '==', 'medicine')
    );
    
    const snapshot = await getDocs(q);
    
    // If reminder already exists, don't create duplicate
    if (!snapshot.empty) {
      return { created: false, reason: 'Reminder already exists' };
    }

    // Create new medicine reminder
    const reminderData = {
      patientName,
      patientPhone,
      patientId: patientId || null,
      type: 'medicine',
      date: nextVisit,
      message: `Follow-up visit scheduled`,
      status: 'pending',
      createdAt: Timestamp.now(),
      createdFrom: 'doctor_completion'
    };

    const docRef = await addDoc(remindersRef, reminderData);
    
    return { 
      created: true, 
      reminderId: docRef.id,
      message: 'Medicine reminder created successfully' 
    };
  } catch (error) {
    console.error('Error creating medicine reminder:', error);
    return { 
      created: false, 
      reason: 'Error creating reminder',
      error: error.message 
    };
  }
};

// Delete a reminder
export const deleteReminder = async (reminderId) => {
  const reminderRef = doc(db, 'reminders', reminderId);
  return await deleteDoc(reminderRef);
};

// Call Queue
export const addToCallQueue = async (callData) => {
  return await addDoc(collection(db, 'callQueue'), {
    ...callData,
    timestamp: Timestamp.now(),
    addedDate: new Date().toISOString().split('T')[0], // Store date for duplicate checking
    isNewPatient: callData.isNewPatient || false
  });
};

// Check if patient already in queue today
export const checkPatientInQueueToday = async (phone) => {
  const today = new Date().toISOString().split('T')[0];
  const q = query(
    collection(db, 'callQueue'),
    where('phone', '==', phone),
    where('status', '==', 'waiting'),
    where('addedDate', '==', today)
  );
  
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

// Get all call queue entries (for checking duplicates)
export const getAllCallQueueEntries = async () => {
  const q = query(collection(db, 'callQueue'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const updateCallQueue = async (callId, updates) => {
  const callRef = doc(db, 'callQueue', callId);
  return await updateDoc(callRef, updates);
};

export const deleteFromCallQueue = async (callId) => {
  const callRef = doc(db, 'callQueue', callId);
  return await deleteDoc(callRef);
};

export const getCallQueue = (callback) => {
  const q = query(
    collection(db, 'callQueue'),
    where('status', '==', 'waiting')
  );
  return onSnapshot(q, (snapshot) => {
    const queue = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Sort by timestamp in memory
    queue.sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0;
      return a.timestamp.toMillis() - b.timestamp.toMillis();
    });
    callback(queue);
  });
};

// Users
export const getUserByEmail = async (email) => {
  const q = query(collection(db, 'users'), where('email', '==', email));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }
  return null;
};

export const addUser = async (userData) => {
  return await addDoc(collection(db, 'users'), userData);
};

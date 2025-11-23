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
  const existingPatient = await getPatientByName(name);
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

export const getPatientByName = async (name) => {
  const q = query(collection(db, 'patients'), where('name', '==', name));
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

// Transaction-based appointment booking with dual sub-slots (A and B)
export const bookAppointmentWithTransaction = async (appointmentData) => {
  const { date, time, subSlot, subSlotType, ...restData } = appointmentData;
  
  // Validate sub-slot
  if (!subSlot || !['A', 'B'].includes(subSlot)) {
    throw new Error('Invalid sub-slot. Must be A or B.');
  }
  
  // Validate sub-slot type
  if (!subSlotType || !['walkin', 'call'].includes(subSlotType)) {
    throw new Error('Invalid sub-slot type. Must be walkin or call.');
  }
  
  // Sub-slot A is always walk-in only
  if (subSlot === 'A' && subSlotType !== 'walkin') {
    throw new Error('Sub-slot A can only be booked as walk-in.');
  }

  return await runTransaction(db, async (transaction) => {
    // Query for conflicting appointments at the same time and sub-slot
    const appointmentsRef = collection(db, 'appointments');
    const conflictQuery = query(
      appointmentsRef,
      where('date', '==', date),
      where('time', '==', time),
      where('subSlot', '==', subSlot),
      where('status', 'in', ['scheduled', 'rescheduled'])
    );
    
    const snapshot = await getDocs(conflictQuery);
    
    // Check if sub-slot is already booked
    if (!snapshot.empty) {
      throw new Error(`SLOT_CONFLICT:Sub-slot ${subSlot} at ${time} is already booked. Please select another slot.`);
    }

    // If no conflicts, create the appointment
    const newAppointmentRef = doc(collection(db, 'appointments'));
    transaction.set(newAppointmentRef, {
      ...restData,
      date,
      time,
      subSlot,
      subSlotType,
      duration: 15, // Always 15 minutes per slot
      createdAt: Timestamp.now()
    });

    return { id: newAppointmentRef.id, success: true };
  });
};

// Transaction-based appointment update/reschedule with dual sub-slots
export const updateAppointmentWithTransaction = async (appointmentId, updates) => {
  const { date, time, subSlot, subSlotType, ...restUpdates } = updates;
  
  // If not updating time/slot-related fields, use regular update
  if (!date && !time && !subSlot && !subSlotType) {
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
    const newSubSlot = subSlot || currentData.subSlot;
    const newSubSlotType = subSlotType || currentData.subSlotType;

    // Validate sub-slot A is always walk-in
    if (newSubSlot === 'A' && newSubSlotType !== 'walkin') {
      throw new Error('Sub-slot A can only be booked as walk-in.');
    }

    // Query for conflicting appointments at new time/slot (excluding this one)
    const appointmentsRef = collection(db, 'appointments');
    const conflictQuery = query(
      appointmentsRef,
      where('date', '==', newDate),
      where('time', '==', newTime),
      where('subSlot', '==', newSubSlot),
      where('status', 'in', ['scheduled', 'rescheduled'])
    );
    
    const snapshot = await getDocs(conflictQuery);
    const conflictingAppointments = snapshot.docs
      .filter(doc => doc.id !== appointmentId)
      .map(doc => ({ id: doc.id, ...doc.data() }));

    // Check if sub-slot is already booked
    if (conflictingAppointments.length > 0) {
      throw new Error(`SLOT_CONFLICT:Sub-slot ${newSubSlot} at ${newTime} is already booked. Please select another slot.`);
    }

    // If no conflicts, update the appointment
    transaction.update(appointmentRef, {
      ...restUpdates,
      date: newDate,
      time: newTime,
      subSlot: newSubSlot,
      subSlotType: newSubSlotType,
      duration: 15,
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
    // Query for existing reminders with same name, date, and type
    const remindersRef = collection(db, 'reminders');
    const q = query(
      remindersRef,
      where('patientName', '==', patientName),
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
  // Add to call queue
  const queueRef = await addDoc(collection(db, 'callQueue'), {
    ...callData,
    status: 'pending',
    timestamp: Timestamp.now(),
    addedDate: new Date().toISOString().split('T')[0],
    isNewPatient: callData.isNewPatient || false,
    reasonForCall: callData.reasonForCall || ''
  });

  // Create call log entry
  await addDoc(collection(db, 'callLogs'), {
    queueId: queueRef.id,
    patientName: callData.patientName,
    phone: callData.phone,
    reasonForCall: callData.reasonForCall || '',
    isNewPatient: callData.isNewPatient || false,
    action: 'added',
    actionBy: callData.addedBy || 'staff',
    timestamp: Timestamp.now(),
    status: 'pending'
  });

  return queueRef;
};

// Check if patient already in queue (active entry exists)
export const checkPatientInQueueToday = async (phone) => {
  const q = query(
    collection(db, 'callQueue'),
    where('phone', '==', phone),
    where('status', '==', 'pending')
  );
  
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

export const updateCallQueue = async (callId, updates) => {
  const callRef = doc(db, 'callQueue', callId);
  return await updateDoc(callRef, updates);
};

export const deleteFromCallQueue = async (callId, deletedBy = 'staff') => {
  const callRef = doc(db, 'callQueue', callId);
  const callDoc = await getDoc(callRef);
  
  if (callDoc.exists()) {
    const callData = callDoc.data();
    
    // Create call log entry for deletion
    await addDoc(collection(db, 'callLogs'), {
      queueId: callId,
      patientName: callData.patientName,
      phone: callData.phone,
      reasonForCall: callData.reasonForCall || '',
      isNewPatient: callData.isNewPatient || false,
      action: 'deleted',
      actionBy: deletedBy,
      timestamp: Timestamp.now(),
      status: 'deleted'
    });
  }
  
  return await deleteDoc(callRef);
};

export const completeCallQueue = async (callId, completedBy, staffNotes = '') => {
  const callRef = doc(db, 'callQueue', callId);
  const callDoc = await getDoc(callRef);
  
  if (!callDoc.exists()) {
    throw new Error('Call queue entry not found');
  }
  
  const callData = callDoc.data();
  
  // Update call queue status
  await updateDoc(callRef, {
    status: 'completed',
    completedBy,
    completedAt: Timestamp.now(),
    staffNotes: staffNotes || ''
  });
  
  // Create call log entry for completion
  await addDoc(collection(db, 'callLogs'), {
    queueId: callId,
    patientName: callData.patientName,
    phone: callData.phone,
    reasonForCall: callData.reasonForCall || '',
    isNewPatient: callData.isNewPatient || false,
    action: 'completed',
    actionBy: completedBy,
    staffNotes: staffNotes || '',
    timestamp: Timestamp.now(),
    status: 'completed'
  });
  
  return true;
};

export const getCallQueue = (callback) => {
  const q = query(
    collection(db, 'callQueue'),
    where('status', '==', 'pending')
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

export const getAllCallQueueEntries = (callback) => {
  const q = query(collection(db, 'callQueue'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(entries);
  });
};

export const getCallLogs = (callback) => {
  const q = query(collection(db, 'callLogs'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(logs);
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

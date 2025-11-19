# New Patient Workflow System

## Overview
The New Patient Workflow system automatically identifies, tracks, and manages new patients throughout their first visit lifecycle. When a patient's phone number is not found in the system, staff can manually enter their details, which automatically creates a patient record and marks them as a "New Patient" for the doctor.

## Key Features

### 1. **Automatic Patient Record Creation**
- When staff encounters an unknown phone number in Call Queue
- System allows manual entry of patient details
- Automatically creates patient record with `isNewPatient: true` flag
- No need to navigate to Patient Records separately

### 2. **New Patient Identification**
- Visual badges throughout the system identify new patients
- Doctors can see which patients are visiting for the first time
- Different treatment duration (45 min for new, 15 min for returning)

### 3. **Automatic Status Conversion**
- After doctor completes first appointment, patient becomes "returning patient"
- `isNewPatient` flag automatically set to `false`
- Future appointments automatically show correct patient type

---

## System Flow

### Step 1: Staff Adds Unknown Patient to Call Queue

```
1. Staff opens Call Queue
2. Clicks "Add to Queue" button
3. Enters phone number (10 digits)
4. System checks patient database
   ├─ If FOUND: Auto-fills name, marks as returning patient
   └─ If NOT FOUND: Shows manual entry form
5. Staff enters:
   - Patient Name (required)
   - Age (required)
   - Gender (required - Male/Female/Other)
   - Address (optional)
6. Clicks "Create Patient & Add to Queue"
7. System:
   - Creates patient record in Firestore
   - Sets isNewPatient = true
   - Adds to call queue with new patient flag
   - Shows golden badge: "✨ New Patient"
```

### Step 2: Staff Books Appointment for New Patient

```
1. Staff opens Appointment Booking
2. Enters phone number
3. System auto-fills details from patient record
4. Shows "✨ New Patient (45 min - 3 slots)" badge
5. Appointment duration automatically set to 45 minutes
6. Staff books appointment
7. Appointment created with isNewPatient: true
```

### Step 3: Doctor Sees New Patient

```
1. Doctor opens Appointments Management
2. Sees appointment card with:
   - Patient name
   - Golden badge: "🆕 NEW" with user-plus icon
   - 45-minute duration
3. Doctor knows this is first-time patient
4. Doctor completes appointment and sets:
   - Reason for visit
   - Next visit date (if needed)
   - Notes
5. On completion:
   - System updates patient record: isNewPatient = false
   - Shows message: "Patient has been marked as returning patient"
   - Future appointments will be 15 minutes
```

### Step 4: Future Visits (Automatic)

```
1. Patient calls again for appointment
2. Staff enters phone number
3. System shows: "✓ Returning Patient (15 min - 1 slot)"
4. No new patient badge shown
5. Appointment duration: 15 minutes
6. Normal workflow continues
```

---

## Code Architecture

### Database Schema

#### Patients Collection
```javascript
{
  id: "auto-generated",
  name: "John Doe",
  phone: "9494438698",
  age: "35",
  gender: "Male",
  address: "123 Main St",
  isNewPatient: true,  // ← Key field
  createdAt: Timestamp,
  previousVisits: [],
  reasons: []
}
```

#### Call Queue Collection
```javascript
{
  id: "auto-generated",
  patientName: "John Doe",
  phone: "9494438698",
  patientId: "patient-doc-id",
  status: "waiting",
  isNewPatient: true,  // ← Passed from patient record
  timestamp: Timestamp,
  addedDate: "2025-11-01"
}
```

#### Appointments Collection
```javascript
{
  id: "auto-generated",
  patientName: "John Doe",
  patientPhone: "9494438698",
  patientId: "patient-doc-id",
  date: "2025-11-05",
  time: "10:30",
  duration: 45,  // 45 for new, 15 for returning
  isNewPatient: true,  // ← Tracked throughout
  status: "scheduled",
  createdAt: Timestamp
}
```

---

## Key Functions

### 1. `createPatientFromCallQueue()` (firestore.js)

**Purpose:** Creates new patient record with new patient flag

```javascript
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
    isNewPatient: true,  // ← Mark as new
    createdAt: Timestamp.now()
  });
  
  return { 
    id: newPatientRef.id, 
    name, 
    phone, 
    age, 
    gender, 
    address, 
    isNewPatient: true 
  };
};
```

**Usage:**
- Called from CallQueue.jsx when phone not found
- Creates complete patient record
- Returns patient data with ID

---

### 2. Call Queue Form - Manual Entry (CallQueue.jsx)

**Phone Validation:**
```javascript
const handlePhoneChange = async (phone) => {
  if (phone.length >= 10) {
    const patient = await getPatientByPhone(phone);
    
    if (patient) {
      // Existing patient - auto-fill
      setFormData({
        phone,
        patientName: patient.name,
        patientId: patient.id,
        age: patient.age,
        gender: patient.gender,
        address: patient.address,
        isNewPatient: patient.isNewPatient || false
      });
      setPatientFound(true);
      setValidationMessage(`✓ Patient found: ${patient.name}...`);
    } else {
      // New patient - show manual form
      setPatientFound(false);
      setFormData({
        phone,
        isNewPatient: true
      });
      setValidationMessage('⚠ Phone number not found. Enter details below...');
    }
  }
};
```

**Form Submission:**
```javascript
const handleAddToQueue = async (e) => {
  e.preventDefault();
  
  let patientId = formData.patientId;
  let isNewPatient = formData.isNewPatient;

  // If patient not found, create new record
  if (patientFound === false) {
    const newPatient = await createPatientFromCallQueue({
      name: formData.patientName.trim(),
      phone: formData.phone,
      age: formData.age,
      gender: formData.gender,
      address: formData.address || ''
    });
    
    patientId = newPatient.id;
    isNewPatient = true;
    
    alert(`New patient record created for ${formData.patientName}!`);
  }

  // Add to queue with new patient flag
  await addToCallQueue({
    patientName: formData.patientName,
    phone: formData.phone,
    patientId: patientId,
    status: 'waiting',
    isNewPatient: isNewPatient  // ← Pass flag
  });

  alert(`Added to queue!${isNewPatient ? ' (Marked as New Patient)' : ''}`);
};
```

---

### 3. Doctor Appointment Completion (DoctorAppointments.jsx)

**Converting New to Returning Patient:**
```javascript
const handleCompleteAppointment = async () => {
  // Update appointment as completed
  await updateAppointment(selectedAppointment.id, {
    status: 'completed',
    reasonForVisit,
    nextVisit: nextVisitDate,
    notes,
    completedAt: new Date().toISOString()
  });

  // Update patient record
  if (selectedAppointment.patientId) {
    const updateData = {
      reasons: [...existingReasons, reasonForVisit],
      previousVisits: [...existingVisits, selectedAppointment.date]
    };
    
    // Mark as returning patient after first visit
    if (selectedAppointment.isNewPatient) {
      updateData.isNewPatient = false;  // ← Convert to returning
    }
    
    await updatePatient(selectedAppointment.patientId, updateData);
  }

  const message = selectedAppointment.isNewPatient 
    ? 'Appointment completed! Patient marked as returning patient.' 
    : 'Appointment completed successfully!';
  
  alert(message);
};
```

---

## UI Components

### Call Queue - New Patient Badge
```css
.new-patient-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 6px rgba(251, 191, 36, 0.3);
  animation: shine 2s ease-in-out infinite;
}
```

**Renders as:** `✨ New Patient` in golden gradient

### Doctor Appointments - New Patient Badge
```css
.new-patient-badge-doctor {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  color: white;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}
```

**Renders as:** `👤 NEW` next to patient name

### Conditional Form Fields (Call Queue)
```jsx
{patientFound === false && (
  <>
    <div className="form-group">
      <label>Age *</label>
      <input type="number" required />
    </div>

    <div className="form-group">
      <label>Gender *</label>
      <select required>
        <option value="">Select gender</option>
        <option value="Male">Male</option>
        <option value="Female">Female</option>
        <option value="Other">Other</option>
      </select>
    </div>

    <div className="form-group">
      <label>Address</label>
      <textarea rows="2" />
    </div>
  </>
)}
```

---

## Validation Rules

### Call Queue Form Validation

1. **Phone Number**
   - Must be exactly 10 digits
   - Pattern: `[0-9]{10}`
   - Required field

2. **Patient Name**
   - Required for all patients
   - For existing patients: Read-only (auto-filled)
   - For new patients: Manual entry required

3. **Age** (New Patients Only)
   - Required for new patients
   - Type: number
   - Range: 0-150

4. **Gender** (New Patients Only)
   - Required for new patients
   - Options: Male, Female, Other

5. **Address** (New Patients Only)
   - Optional field
   - Multi-line text input

### Duplicate Prevention
- Only one entry per patient per day
- Checked by phone number + date + status
- Error message if duplicate attempt

---

## User Interface Flow

### Call Queue Modal - Unknown Phone

```
┌─────────────────────────────────────────────┐
│  Add Patient to Call Queue              [×] │
├─────────────────────────────────────────────┤
│                                             │
│  Phone Number * (Enter phone first)         │
│  ┌─────────────────────────────────────┐   │
│  │ 9494438698                          │   │
│  └─────────────────────────────────────┘   │
│  ⚠ Phone number not found. Please enter    │
│     patient details below to create new     │
│     record.                                 │
│                                             │
│  Patient Name *                             │
│  ┌─────────────────────────────────────┐   │
│  │ John Doe                            │   │
│  └─────────────────────────────────────┘   │
│  👤 New patient - Will be added to records  │
│                                             │
│  Age *                                      │
│  ┌─────────────────────────────────────┐   │
│  │ 35                                  │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Gender *                                   │
│  ┌─────────────────────────────────────┐   │
│  │ Male                          ▼     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Address                                    │
│  ┌─────────────────────────────────────┐   │
│  │ 123 Main Street                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────┐  ┌──────────┐   │
│  │ Create Patient &     │  │  Cancel  │   │
│  │ Add to Queue         │  └──────────┘   │
│  └──────────────────────┘                  │
└─────────────────────────────────────────────┘
```

### Call Queue - Queue List Display

```
┌─────────────────────────────────────────────┐
│  Waiting Calls (2)        [Live Updates]    │
├─────────────────────────────────────────────┤
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ #1  John Doe  ✨ New Patient          │ │
│  │     📞 9494438698                      │ │
│  │     🕐 Added: Nov 01, 2025 • 10:30 AM │ │
│  │     [Waiting]           [Remove]      │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ #2  Jane Smith                        │ │
│  │     📞 9876543210                      │ │
│  │     🕐 Added: Nov 01, 2025 • 10:45 AM │ │
│  │     [Waiting]           [Remove]      │ │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Doctor Appointments - Card Display

```
┌───────────────────────────────────────┐
│  John Doe  [✨ NEW]      [Scheduled]  │
│                                       │
│  📅 2025-11-05 at 10:30 AM            │
│  📞 9494438698                         │
│  ⏱️ Duration: 45 mins                 │
└───────────────────────────────────────┘
```

---

## Testing Checklist

### Test 1: Create New Patient from Call Queue
- [ ] Enter unknown phone number (e.g., 9999999999)
- [ ] Verify "Phone number not found" message appears
- [ ] Verify manual entry fields appear (Name, Age, Gender, Address)
- [ ] Fill all required fields
- [ ] Click "Create Patient & Add to Queue"
- [ ] Verify success message: "New patient record created"
- [ ] Verify patient appears in queue with "✨ New Patient" badge
- [ ] Verify patient added to Patients collection in Firestore

### Test 2: Book Appointment for New Patient
- [ ] Open Appointment Booking
- [ ] Enter new patient's phone number
- [ ] Verify auto-fill works (name appears)
- [ ] Verify "✨ New Patient (45 min - 3 slots)" badge shows
- [ ] Select date and time slot
- [ ] Verify 3 consecutive slots are highlighted
- [ ] Book appointment
- [ ] Verify appointment created with duration: 45

### Test 3: Doctor Completes New Patient Appointment
- [ ] Doctor opens appointment list
- [ ] Verify appointment shows "[✨ NEW]" badge
- [ ] Click appointment to view details
- [ ] Enter reason for visit
- [ ] Set next visit date (optional)
- [ ] Add notes
- [ ] Click "Complete Appointment"
- [ ] Verify message: "Patient has been marked as returning patient"
- [ ] Check Firestore: `patients/{id}/isNewPatient` should be `false`

### Test 4: Returning Patient Flow
- [ ] Staff adds same patient to queue again
- [ ] Verify NO "New Patient" badge
- [ ] Book appointment
- [ ] Verify duration is 15 minutes (1 slot)
- [ ] Verify "✓ Returning Patient (15 min - 1 slot)" shows

### Test 5: Duplicate Prevention
- [ ] Add new patient to call queue
- [ ] Try to add same patient again (same day)
- [ ] Verify error: "already in the call queue for today"
- [ ] Doctor marks appointment complete
- [ ] Try adding patient again
- [ ] Verify successful addition (new day or after completion)

### Test 6: Edge Cases
- [ ] Test with phone having leading/trailing spaces
- [ ] Test age validation (0, 150, negative, letters)
- [ ] Test gender selection (all options)
- [ ] Test address with special characters
- [ ] Test form reset after submission
- [ ] Test cancel button functionality

---

## Troubleshooting

### Issue: Patient not showing as "New Patient"

**Possible Causes:**
1. `isNewPatient` field not set during creation
2. Patient record already exists
3. Cache issue

**Solutions:**
1. Check Firestore Console: `patients/{id}/isNewPatient` field exists
2. Verify `createPatientFromCallQueue()` is called
3. Check phone number format (no spaces, exactly 10 digits)
4. Refresh browser and try again

### Issue: Manual form fields not appearing

**Possible Causes:**
1. Phone validation not triggered
2. `patientFound` state not set to `false`
3. React state update issue

**Solutions:**
1. Ensure phone is exactly 10 digits
2. Check browser console for errors
3. Verify `handlePhoneChange()` is called
4. Check `patientFound` state in React DevTools

### Issue: Patient not converting to returning patient

**Possible Causes:**
1. `updatePatient()` not called in `handleCompleteAppointment()`
2. Firestore security rules blocking update
3. Patient ID missing

**Solutions:**
1. Check browser console for errors
2. Verify `selectedAppointment.patientId` exists
3. Check Firestore security rules
4. Verify `updatePatient()` function implementation

### Issue: Duration not correct (45 vs 15 minutes)

**Possible Causes:**
1. `isNewPatient` flag not passed to booking
2. Slot calculation issue
3. State not synced

**Solutions:**
1. Verify `isNewPatient` in appointment document
2. Check `bookAppointmentWithTransaction()` parameters
3. Verify `generateTimeSlots()` logic
4. Check `slotsNeeded` calculation

---

## Firebase Security Rules

### Ensure patients collection allows updates:

```javascript
match /patients/{patientId} {
  allow read: if true;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
  allow delete: if request.auth != null;
}
```

### Ensure appointments collection includes isNewPatient:

```javascript
match /appointments/{appointmentId} {
  allow read: if true;
  allow create: if request.auth != null 
    && request.resource.data.keys().hasAll([
      'patientName', 
      'patientPhone', 
      'date', 
      'time', 
      'duration',
      'status'
    ]);
  allow update: if request.auth != null;
  allow delete: if request.auth != null;
}
```

---

## Performance Considerations

### Database Queries

**Optimized:**
- `getPatientByPhone()` uses indexed query on `phone` field
- Call queue checks are single document lookups
- Real-time listeners only on active collections

**Recommendations:**
1. Create Firestore index on `patients.phone`
2. Create composite index on `callQueue (phone, addedDate, status)`
3. Limit real-time listeners scope
4. Use pagination for large patient lists

### Form Validation

**Client-Side:**
- Phone pattern validation (regex)
- Required field validation
- Age range validation

**Server-Side:**
- Duplicate phone check (getPatientByPhone)
- Queue duplicate check (checkPatientInQueueToday)
- Data sanitization

---

## Future Enhancements

### Potential Improvements

1. **SMS Notifications**
   - Send welcome SMS to new patients
   - Include clinic details and appointment info

2. **Patient Portal Integration**
   - Allow patients to fill details via online form
   - Auto-create account for new patients

3. **Analytics Dashboard**
   - Track new patient conversion rate
   - Monitor first-visit completion rate
   - Calculate average new patient wait time

4. **Advanced Validation**
   - Email verification
   - OTP for phone verification
   - Address auto-complete

5. **Batch Operations**
   - Import multiple new patients from CSV
   - Bulk status updates

---

## Summary

The New Patient Workflow system provides:

✅ **Seamless Integration** - No need to switch between screens
✅ **Automatic Tracking** - isNewPatient flag throughout lifecycle
✅ **Visual Indicators** - Clear badges for staff and doctors
✅ **Smart Conversion** - Automatic status change after first visit
✅ **Duplicate Prevention** - Ensures data integrity
✅ **Real-Time Sync** - All portals update instantly

**Key Benefit:** Staff can immediately add walk-in patients to the queue without pre-registration, while doctors automatically see which patients need extended consultation time.

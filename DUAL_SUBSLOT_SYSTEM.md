# Dual Sub-Slot Appointment System

## Overview
The appointment booking system has been updated to implement a dual sub-slot system with continuous time slots from 09:30 AM to 08:45 PM.

## Key Features

### 1. Continuous Time Slots
- **Schedule**: 09:30 AM to 08:45 PM (09:30 - 20:45)
- **Interval**: 15 minutes
- **Total Slots**: 46 time slots per day
- **No Gaps**: Continuous timeline (removed morning/evening split)

### 2. Dual Sub-Slot System
Each 15-minute interval has TWO independent sub-slots:

#### Sub-slot A
- **Type**: Walk-in ONLY
- **Restriction**: Cannot be booked for calls
- **Visual**: Blue border and badge
- **Purpose**: Reserved for walk-in patients

#### Sub-slot B
- **Type**: Walk-in OR Call
- **Flexibility**: Staff can choose type at booking
- **Visual**: Orange border and badge
- **Purpose**: Flexible booking for either walk-in or call appointments

### 3. Data Model

#### Firestore Document Structure
```javascript
{
  patientId: string,
  patientName: string,
  patientPhone: string,
  date: string, // yyyy-MM-dd
  time: string, // HH:mm (24-hour format)
  subSlot: string, // "A" or "B"
  subSlotType: string, // "walkin" or "call"
  status: string, // "scheduled", "rescheduled", "completed", "cancelled"
  notes: string,
  bookedBy: string, // "staff" or "doctor"
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 4. Booking Rules

#### Conflict Prevention
- Transaction-based booking prevents double-booking
- Each sub-slot can only have ONE appointment
- Sub-slot A validation: must be "walkin"
- Sub-slot B validation: can be "walkin" or "call"

#### Validation
```javascript
// Sub-slot must be A or B
if (!['A', 'B'].includes(subSlot)) {
  throw new Error('Invalid sub-slot');
}

// Sub-slot type must be walkin or call
if (!['walkin', 'call'].includes(subSlotType)) {
  throw new Error('Invalid sub-slot type');
}

// Sub-slot A is always walk-in
if (subSlot === 'A' && subSlotType !== 'walkin') {
  throw new Error('Sub-slot A can only be walk-in');
}
```

### 5. User Interface

#### Staff Portal - Booking View
```
09:30 AM
┌─────────────────┬─────────────────┐
│   Sub-slot A    │   Sub-slot B    │
│   [Walk-in]     │ [Walk-in/Call]  │
│   Available     │   Available     │
└─────────────────┴─────────────────┘
```

**Features**:
- Continuous scrollable list of time slots
- Each slot shows both sub-slots side-by-side
- Visual indicators:
  - Green = Available
  - Red = Booked (shows patient name)
  - Highlighted = Selected
- Click sub-slot to select
- For Sub-slot B: Radio buttons to choose Walk-in or Call

#### Doctor Portal - View
- Shows all booked appointments
- Displays sub-slot (A or B) badge
- Shows appointment type (Walk-in or Call) badge
- Color-coded for easy identification

### 6. Firestore Functions

#### bookAppointmentWithTransaction
```javascript
// Transaction-based booking
await bookAppointmentWithTransaction({
  patientName: "John Doe",
  patientPhone: "1234567890",
  date: "2025-11-23",
  time: "10:30",
  subSlot: "B",
  subSlotType: "call",
  status: "scheduled",
  bookedBy: "staff"
});
```

#### updateAppointmentWithTransaction
```javascript
// Reschedule with conflict check
await updateAppointmentWithTransaction(appointmentId, {
  date: "2025-11-24",
  time: "14:00",
  subSlot: "A",
  subSlotType: "walkin"
});
```

### 7. Real-Time Updates
- **onSnapshot listeners**: Both Staff and Doctor views update instantly
- **Toast notifications**: Immediate feedback on booking/conflict
- **No refresh needed**: Changes appear automatically

### 8. Styling

#### Color Scheme
- **Sub-slot A**: Blue (#3b82f6)
- **Sub-slot B**: Orange (#f59e0b)
- **Walk-in badge**: Light blue background
- **Call badge**: Pink background
- **Available**: Green text
- **Booked**: Red background

#### Responsive Design
- Mobile-friendly layout
- Stacked sub-slots on small screens
- Scrollable time slot list
- Touch-friendly tap targets

### 9. Migration Notes

#### Breaking Changes
- Old appointments without `subSlot` field will need migration
- Duration-based booking (45 min for new patients) removed
- Each appointment is now exactly 15 minutes
- Single slot selection (no multi-slot consecutive booking)

#### Backward Compatibility
- Existing appointments display correctly
- Missing `subSlot` defaults to showing time only
- Missing `subSlotType` assumed as "walkin"

### 10. Testing Checklist

- [ ] Book Sub-slot A as walk-in → Success
- [ ] Try to book Sub-slot A as call → Error
- [ ] Book Sub-slot B as walk-in → Success
- [ ] Book Sub-slot B as call → Success
- [ ] Book same sub-slot twice → Conflict error
- [ ] Book A and B at same time → Both succeed
- [ ] Reschedule appointment → Success with validation
- [ ] Real-time update test (two browsers) → Both update
- [ ] Complete appointment → Previous visits updated
- [ ] Doctor view shows sub-slot and type → Verified

### 11. Files Modified

#### Firebase
- `src/firebase/firestore.js`
  - `bookAppointmentWithTransaction()` - Updated for sub-slots
  - `updateAppointmentWithTransaction()` - Updated for sub-slots

#### Staff Portal
- `src/pages/Staff/AppointmentBooking.jsx`
  - Updated state management
  - New sub-slot selection UI
  - Continuous slot generation (09:30-20:45)
  - Sub-slot type selector for B

#### Doctor Portal
- `src/pages/Doctor/DoctorAppointments.jsx`
  - Display sub-slot and type badges

#### Styles
- `src/styles/AppointmentBooking.css` - Dual sub-slot grid, badges
- `src/styles/DoctorAppointments.css` - Doctor view badges

### 12. Future Enhancements
- [ ] Bulk booking/blocking feature
- [ ] Sub-slot templates/rules per day
- [ ] SMS notification with sub-slot info
- [ ] Analytics: Walk-in vs Call ratio
- [ ] Wait time calculation per sub-slot
- [ ] Patient preferences (preferred sub-slot)

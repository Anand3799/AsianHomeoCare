# 🏥 Asian Homeo Care - Hospital Management Portal

A comprehensive hospital management system built with React, Firebase, and React Icons for a small hospital with one doctor and multiple staff members.

## ✨ Features

### 👨‍⚕️ Doctor Portal
- **Dashboard**: View today's appointments and call queue in real-time
- **Appointments Management**: 
  - View appointment details (read-only)
  - Track patient information and consultation history
- **Patient Records**: View complete patient history including visit dates
- **Call Queue**: See waiting calls in first-come-first-serve order

### 👩‍💼 Staff Portal
- **Dashboard**: Overview of appointments, reminders, and call queue
- **Patient Management**: 
  - Add new patients with contact details
  - Edit existing patient information
  - View patient visit history
- **Appointment Booking**:
  - Automatic duration based on patient type (New: 40min, Returning: 15min)
  - Visual time slot selection
  - Real-time availability checking
  - Reschedule appointments (same-day allowed)
  - **Complete appointments** after doctor consultation
  - Set next visit date (creates automatic reminder)
  - Add consultation notes
- **Reminders**:
  - Medicine reminders (auto-generated for next-day visits)
  - General reminders for callbacks/follow-ups
- **Call Queue**: Add incoming calls to queue for doctor

## 🚀 Tech Stack

- **Frontend**: React 19 + Vite
- **Routing**: React Router DOM v6
- **Styling**: Pure CSS (no frameworks)
- **Icons**: React Icons
- **Authentication**: Firebase Authentication
- **Database**: Firebase Firestore (real-time updates)
- **Date Handling**: date-fns

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Firebase account

### Step 1: Clone and Install

```bash
cd asian-homeo-care
npm install
```

### Step 2: Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Enable **Authentication** → Email/Password sign-in method
4. Enable **Firestore Database** → Start in production mode
5. Get your Firebase config from Project Settings

### Step 3: Environment Configuration

1. Copy the example environment file:
```bash
copy .env.example .env
```

2. Edit `.env` and add your Firebase credentials:
```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Step 4: Create Initial Users

You need to manually create users in Firebase:

1. Go to Firebase Console → Authentication → Users
2. Add users manually with these roles:

**Doctor Account:**
- Email: doctor@asianhomeocare.com
- Password: (create a secure password)

**Staff Account:**
- Email: staff@asianhomeocare.com
- Password: (create a secure password)

3. After creating users, add their roles to Firestore:
   - Go to Firestore Database
   - Create a collection named `users`
   - Add documents with these fields:
     ```
     {
       email: "doctor@asianhomeocare.com",
       name: "Dr. Smith",
       role: "doctor"
     }
     ```
     ```
     {
       email: "staff@asianhomeocare.com",
       name: "Staff Member",
       role: "staff"
     }
     ```

### Step 5: Firestore Security Rules

Add these security rules in Firebase Console → Firestore → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Patients collection
    match /patients/{patientId} {
      allow read, write: if request.auth != null;
    }
    
    // Appointments collection
    match /appointments/{appointmentId} {
      allow read, write: if request.auth != null;
    }
    
    // Reminders collection
    match /reminders/{reminderId} {
      allow read, write: if request.auth != null;
    }
    
    // Call Queue collection
    match /callQueue/{callId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Step 6: Run the Application

```bash
npm run dev
```

The application will start at `http://localhost:5173`

## 🎯 Usage

### Login Credentials
Use the credentials you created in Step 4:
- **Doctor**: doctor@asianhomeocare.com
- **Staff**: staff@asianhomeocare.com

### Workflow

1. **Staff** adds new patient or searches existing patient by name
2. **Staff** books appointment (system auto-detects if new/returning patient)
3. **Staff** can add patient to call queue when they call
4. **Doctor** sees appointments and call queue in real-time
5. **Doctor** conducts consultation
6. **Staff** marks appointment complete and sets next visit date
6. **Doctor** can set next visit date (auto-creates reminder for staff)
7. **Staff** sees medicine reminders one day before next visit
8. **Staff** can reschedule missed appointments

## 📁 Project Structure

```
asian-homeo-care/
├── src/
│   ├── components/          # Reusable components
│   │   ├── DoctorLayout.jsx
│   │   ├── StaffLayout.jsx
│   │   └── ProtectedRoute.jsx
│   ├── contexts/            # React contexts
│   │   └── AuthContext.jsx
│   ├── firebase/            # Firebase config and utilities
│   │   ├── config.js
│   │   └── firestore.js
│   ├── pages/              # Page components
│   │   ├── Login.jsx
│   │   ├── Doctor/
│   │   │   ├── DoctorDashboard.jsx
│   │   │   ├── DoctorAppointments.jsx
│   │   │   └── PatientRecords.jsx
│   │   └── Staff/
│   │       ├── StaffDashboard.jsx
│   │       ├── PatientManagement.jsx
│   │       ├── AppointmentBooking.jsx
│   │       ├── Reminders.jsx
│   │       └── CallQueue.jsx
│   ├── styles/             # CSS files
│   ├── App.jsx             # Main app component
│   └── main.jsx            # Entry point
├── .env                    # Environment variables (create from .env.example)
├── .env.example           # Example environment file
├── package.json
└── README.md
```

## 🔒 Security Features

- Firebase Authentication for secure login
- Role-based access control (Doctor/Staff)
- Protected routes prevent unauthorized access
- Firestore security rules
- No medication details stored or displayed
- Password reset functionality

## 🎨 UI/UX Features

- Modern, professional design with soft color palette
- Distinct color themes for Doctor (Blue) and Staff (Teal) portals
- Real-time updates across all dashboards
- Responsive design for desktop and tablet
- Smooth animations and hover effects
- Icon-based navigation with React Icons
- Modal-based forms for better UX

## 🔄 Real-time Features

All data updates in real-time using Firestore's `onSnapshot`:
- Appointments sync instantly between portals
- Call queue updates live
- Reminders appear automatically
- Patient records update immediately

## 📱 Responsive Design

The application is fully responsive and works on:
- Desktop (1920px+)
- Laptop (1366px - 1920px)
- Tablet (768px - 1366px)

## 🚢 Deployment (Optional)

### Deploy to Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase Hosting
firebase init hosting

# Build the project
npm run build

# Deploy
firebase deploy
```

## 📝 Notes

- **Patient Identification**: Patients are uniquely identified by phone number
- **Appointment Duration**: 
  - New patients: 40 minutes
  - Returning patients: 15 minutes
- **Working Hours**: 9 AM - 6 PM (configurable in AppointmentBooking.jsx)
- **Medicine Reminders**: Auto-generated one day before next visit
- **No Medication Storage**: System does not store or display medication details
- **Same-day Rescheduling**: Allowed for flexibility

## 🐛 Troubleshooting

### Firebase Connection Issues
- Verify all environment variables are correctly set in `.env`
- Check Firebase project settings match your `.env` values
- Ensure Firestore and Authentication are enabled in Firebase Console

### Authentication Errors
- Verify users exist in Firebase Authentication
- Check user roles are added to Firestore `users` collection
- Ensure email/password sign-in is enabled

### Real-time Updates Not Working
- Check Firestore security rules are properly configured
- Verify internet connection
- Check browser console for errors

## 📄 License

This project is created for Asian Homeo Care. All rights reserved.

## 👨‍💻 Developer

Built with ❤️ using React, Firebase, and modern web technologies.

---

**Version**: 1.0.0  
**Last Updated**: October 29, 2025

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

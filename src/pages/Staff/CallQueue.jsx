import { useState, useEffect } from 'react';
import { getCallQueue, addToCallQueue, deleteFromCallQueue, getPatientByPhone, checkPatientInQueueToday, getAllPatients, createPatientFromCallQueue } from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import { FaPhoneVolume, FaPlus, FaClock, FaTrash, FaCheckCircle, FaExclamationTriangle, FaUserPlus } from 'react-icons/fa';
import { format } from 'date-fns';
import '../../styles/CallQueue.css';

const CallQueue = () => {
  const toast = useToast();
  const [callQueue, setCallQueue] = useState([]);
  const [patients, setPatients] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [patientFound, setPatientFound] = useState(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, call: null });
  const [formData, setFormData] = useState({
    patientName: '',
    phone: '',
    patientId: null,
    age: '',
    gender: '',
    address: '',
    status: 'waiting',
    isNewPatient: false
  });

  useEffect(() => {
    const unsubscribeQueue = getCallQueue((data) => {
      setCallQueue(data);
    });

    const unsubscribePatients = getAllPatients((data) => {
      setPatients(data);
    });

    return () => {
      unsubscribeQueue();
      unsubscribePatients();
    };
  }, []);

  // Validate phone number and auto-fill patient name
  const handlePhoneChange = async (phone) => {
    setFormData({ 
      ...formData, 
      phone, 
      patientName: '', 
      patientId: null,
      age: '',
      gender: '',
      address: '',
      isNewPatient: false
    });
    setValidationMessage('');
    setPatientFound(null);

    // Only validate if phone has at least 10 digits
    if (phone.length >= 10) {
      setIsChecking(true);
      
      try {
        // Check if patient exists in database
        const patient = await getPatientByPhone(phone);
        
        if (patient) {
          // Patient found - auto-fill all details
          setFormData({
            ...formData,
            phone,
            patientName: patient.name,
            patientId: patient.id,
            age: patient.age || '',
            gender: patient.gender || '',
            address: patient.address || '',
            isNewPatient: patient.isNewPatient || false
          });
          setPatientFound(true);
          setValidationMessage(`✓ Patient found: ${patient.name}${patient.isNewPatient ? ' (New Patient)' : ' (Returning Patient)'}`);
        } else {
          // Patient not found - allow manual entry
          setPatientFound(false);
          setFormData({
            ...formData,
            phone,
            isNewPatient: true
          });
          setValidationMessage('⚠ Phone number not found. Please enter patient details below to create new record.');
        }
      } catch (error) {
        console.error('Error checking patient:', error);
        setValidationMessage('Error checking patient. Please try again.');
      } finally {
        setIsChecking(false);
      }
    }
  };

  // Validate name-phone consistency
  const validateNamePhoneConsistency = () => {
    const { phone, patientName } = formData;
    
    // Check if this phone is linked to a different name
    const phoneMatch = patients.find(p => p.phone === phone);
    if (phoneMatch && phoneMatch.name !== patientName) {
      return {
        valid: false,
        message: `⚠ Phone ${phone} is registered to "${phoneMatch.name}", not "${patientName}"`
      };
    }

    // Check if this name is linked to a different phone
    const nameMatch = patients.find(p => p.name === patientName);
    if (nameMatch && nameMatch.phone !== phone) {
      return {
        valid: false,
        message: `⚠ Patient "${patientName}" is registered with phone ${nameMatch.phone}, not ${phone}`
      };
    }

    return { valid: true };
  };

  const handleAddToQueue = async (e) => {
    e.preventDefault();

    // Validate phone number is entered and checked
    if (!formData.phone || formData.phone.length < 10) {
      toast.warning('Please enter a valid 10-digit phone number.');
      return;
    }

    if (isChecking) {
      toast.info('Please wait while we check the patient details.');
      return;
    }

    // Validate patient name is entered
    if (!formData.patientName || formData.patientName.trim() === '') {
      toast.warning('Please enter the patient name.');
      return;
    }

    // For new patients, validate required fields
    if (patientFound === false) {
      if (!formData.age || !formData.gender) {
        toast.warning('Please enter age and gender for the new patient.');
        return;
      }
    }

    setIsAdding(true);

    try {
      // Check if patient already in queue today
      const alreadyInQueue = await checkPatientInQueueToday(formData.phone);
      
      if (alreadyInQueue) {
        toast.warning(`${formData.patientName} is already in the call queue for today. They can only be added again after their current visit is marked as completed by the doctor.`);
        setIsAdding(false);
        return;
      }

      let patientId = formData.patientId;
      let isNewPatient = formData.isNewPatient;

      // If patient not found, create new patient record
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
        
        toast.success(`New patient record created for ${formData.patientName}!`);
      }

      // Add to queue
      await addToCallQueue({
        patientName: formData.patientName,
        phone: formData.phone,
        patientId: patientId,
        age: formData.age || '',
        gender: formData.gender || '',
        status: 'waiting',
        isNewPatient: isNewPatient
      });

      toast.success(`${formData.patientName} added to call queue successfully!${isNewPatient ? ' (Marked as New Patient)' : ''}`);
      
      // Reset form
      setFormData({
        patientName: '',
        phone: '',
        patientId: null,
        age: '',
        gender: '',
        address: '',
        status: 'waiting',
        isNewPatient: false
      });
      setPatientFound(null);
      setValidationMessage('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding to queue:', error);
      toast.error('Failed to add call to queue. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteFromQueue = (call) => {
    setConfirmDialog({ isOpen: true, call });
  };

  const confirmDeleteFromQueue = async () => {
    const call = confirmDialog.call;
    setConfirmDialog({ isOpen: false, call: null });
    
    try {
      await deleteFromCallQueue(call.id);
      toast.success(`${call.patientName} removed from queue.`);
    } catch (error) {
      console.error('Error removing from queue:', error);
      toast.error('Failed to remove from queue');
    }
  };

  const cancelDeleteFromQueue = () => {
    setConfirmDialog({ isOpen: false, call: null });
  };

  return (
    <div className="call-queue-page">
      <div className="page-header">
        <h1>
          <FaPhoneVolume /> Call Queue
        </h1>
        <button
          className="add-call-btn"
          onClick={() => setShowAddForm(true)}
        >
          <FaPlus /> Add to Queue
        </button>
      </div>

      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add Patient to Call Queue</h2>
              <button className="close-btn" onClick={() => {
                setShowAddForm(false);
                setFormData({ 
                  patientName: '', 
                  phone: '', 
                  patientId: null, 
                  age: '', 
                  gender: '', 
                  address: '', 
                  status: 'waiting',
                  isNewPatient: false
                });
                setValidationMessage('');
                setPatientFound(null);
              }}>
                ×
              </button>
            </div>

            <form onSubmit={handleAddToQueue} className="call-form">
              <div className="form-group">
                <label>Phone Number * (Enter phone first)</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="Enter 10-digit phone number"
                  required
                  pattern="[0-9]{10}"
                  maxLength="10"
                />
                {isChecking && (
                  <small className="validation-message checking">
                    🔍 Checking patient records...
                  </small>
                )}
                {validationMessage && (
                  <small className={`validation-message ${patientFound ? 'success' : 'error'}`}>
                    {validationMessage}
                  </small>
                )}
              </div>

              <div className="form-group">
                <label>Patient Name *</label>
                <input
                  type="text"
                  value={formData.patientName}
                  onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                  readOnly={patientFound === true}
                  placeholder={patientFound === false ? "Enter patient name" : "Name will auto-fill after entering phone"}
                  className={patientFound === true ? "readonly-input" : ""}
                  required
                />
                <small className="field-note">
                  {patientFound === true && (
                    <>
                      <FaCheckCircle style={{ color: '#10b981' }} />
                      {' '}Existing patient - Name auto-filled
                    </>
                  )}
                  {patientFound === false && (
                    <>
                      <FaUserPlus style={{ color: '#f59e0b' }} />
                      {' '}New patient - Will be added to records
                    </>
                  )}
                </small>
              </div>

              {patientFound === false && (
                <>
                  <div className="form-group">
                    <label>Age *</label>
                    <input
                      type="number"
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      placeholder="Enter age"
                      required
                      min="0"
                      max="150"
                    />
                  </div>

                  <div className="form-group">
                    <label>Gender *</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Enter address (optional)"
                      rows="2"
                    />
                  </div>
                </>
              )}

              <div className="form-actions">
                <button 
                  type="submit" 
                  className="save-btn"
                  disabled={isAdding || isChecking || patientFound === null}
                >
                  {isAdding ? 'Adding...' : patientFound === false ? 'Create Patient & Add to Queue' : 'Add to Queue'}
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ 
                      patientName: '', 
                      phone: '', 
                      patientId: null, 
                      age: '', 
                      gender: '', 
                      address: '', 
                      status: 'waiting',
                      isNewPatient: false
                    });
                    setValidationMessage('');
                    setPatientFound(null);
                  }}
                  disabled={isAdding}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="queue-container">
        <div className="queue-header">
          <h2>Waiting Calls ({callQueue.length})</h2>
          <div className="realtime-indicator">
            <span className="realtime-dot"></span>
            <span>Live Updates</span>
          </div>
        </div>
        <p className="queue-info">
          <FaClock /> Doctor will attend calls in first-come-first-serve order
        </p>

        {callQueue.length === 0 ? (
          <div className="empty-state">
            <FaPhoneVolume className="empty-icon" />
            <p className="empty-message">No calls in queue</p>
            <small>Add patients to the queue using the button above</small>
          </div>
        ) : (
          <div className="queue-list">
            {callQueue.map((call, index) => (
              <div key={call.id} className="queue-item">
                <div className="queue-position">#{index + 1}</div>
                <div className="call-details">
                  <div className="patient-name-row">
                    <h3>{call.patientName}</h3>
                    {call.isNewPatient && (
                      <span className="new-patient-badge">✨ New Patient</span>
                    )}
                  </div>
                  <p className="phone-number">📞 {call.phone}</p>
                  <div className="call-time">
                    <FaClock className="time-icon" />
                    <span>
                      Added: {call.timestamp?.toDate 
                        ? format(call.timestamp.toDate(), 'MMM dd, yyyy • hh:mm a')
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="queue-actions">
                  <div className="status-indicator waiting">
                    <span className="status-dot"></span>
                    Waiting
                  </div>
                  <button
                    className="delete-queue-btn"
                    onClick={() => handleDeleteFromQueue(call)}
                    title="Remove from queue"
                  >
                    <FaTrash /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="queue-note">
        <h3>📋 Queue Rules:</h3>
        <ul>
          <li><strong>Duplicate Prevention:</strong> A patient can only appear once in the queue per day</li>
          <li><strong>Re-entry:</strong> Patient can be re-added only after doctor marks their visit as "Completed"</li>
          <li><strong>First-Come-First-Serve:</strong> Queue is sorted by time added</li>
          <li><strong>Real-Time:</strong> Doctor's view updates automatically when you add/remove entries</li>
          <li><strong>Data Consistency:</strong> Phone numbers and names are validated against patient records</li>
        </ul>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Remove from Queue"
        message={confirmDialog.call ? `Remove ${confirmDialog.call.patientName} from the call queue?` : ''}
        onConfirm={confirmDeleteFromQueue}
        onCancel={cancelDeleteFromQueue}
        confirmText="Remove"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default CallQueue;

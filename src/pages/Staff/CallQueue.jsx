import { useState, useEffect } from 'react';
import { getCallQueue, addToCallQueue, deleteFromCallQueue, completeCallQueue, checkPatientInQueueToday, createPatientFromCallQueue } from '../../firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import PatientNameTypeahead from '../../components/PatientNameTypeahead';
import { FaPhoneVolume, FaPlus, FaClock, FaTrash, FaCheckCircle, FaExclamationTriangle, FaUserPlus } from 'react-icons/fa';
import { format } from 'date-fns';
import '../../styles/CallQueue.css';

const CallQueue = () => {
  const toast = useToast();
  const [callQueue, setCallQueue] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [patientFound, setPatientFound] = useState(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, call: null });
  const { currentUser } = useAuth();
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const [staffNotes, setStaffNotes] = useState('');
  const [formData, setFormData] = useState({
    patientName: '',
    phone: '',
    patientId: null,
    age: '',
    gender: '',
    address: '',
    reasonForCall: '',
    status: 'waiting',
    isNewPatient: false
  });

  useEffect(() => {
    const unsubscribeQueue = getCallQueue((data) => {
      setCallQueue(data);
    });

    return () => {
      unsubscribeQueue();
    };
  }, []);

  const handleNameChange = (name) => {
    setFormData({ ...formData, patientName: name });
  };

  const handlePatientSelect = (patient) => {
    // Check if this is a brand new patient being added (not in database)
    if (patient.isNew) {
      setPatientFound(false);
      setFormData(prev => ({
        ...prev,
        patientName: patient.name,
        phone: '',
        patientId: null,
        age: '',
        gender: '',
        address: '',
        isNewPatient: true
      }));
      setValidationMessage('⚠ New patient. Please enter phone number and other details.');
    } else {
      setPatientFound(true);
      setFormData(prev => ({
        ...prev,
        patientName: patient.name,
        phone: patient.phone,
        patientId: patient.id,
        age: patient.age || '',
        gender: patient.gender || '',
        address: patient.address || '',
        isNewPatient: patient.isNewPatient || false
      }));
      setValidationMessage(`✓ Patient found${patient.isNewPatient ? ' (New Patient)' : ' (Returning Patient)'}`);
    }
  };

  const handleAddToQueue = async (e) => {
    e.preventDefault();

    // Validate patient name is entered
    if (!formData.patientName || formData.patientName.trim() === '') {
      toast.warning('Please enter the patient name.');
      return;
    }

    // Validate phone number is entered
    if (!formData.phone || formData.phone.length < 10) {
      toast.warning('Please enter a valid 10-digit phone number.');
      return;
    }

    // Validate reason for call
    if (!formData.reasonForCall || formData.reasonForCall.trim() === '') {
      toast.warning('Please enter the reason for call.');
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
        formData.isNewPatient = true;
        
        toast.success(`New patient record created for ${formData.patientName}!`);
      }

      // Add to queue
      await addToCallQueue({
        patientName: formData.patientName,
        phone: formData.phone,
        patientId: patientId,
        age: formData.age || '',
        gender: formData.gender || '',
        reasonForCall: formData.reasonForCall.trim(),
        status: 'waiting',
        isNewPatient: formData.isNewPatient,
        addedBy: currentUser?.email || 'staff'
      });

      toast.success(`${formData.patientName} added to call queue successfully!${formData.isNewPatient ? ' (Marked as New Patient)' : ''}`);
      
      // Reset form
      setFormData({
        patientName: '',
        phone: '',
        patientId: null,
        age: '',
        gender: '',
        address: '',
        reasonForCall: '',
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

  const handleCompleteCall = (call) => {
    setSelectedCall(call);
    setStaffNotes('');
    setShowCompleteModal(true);
  };

  const confirmCompleteCall = async () => {
    if (!selectedCall) return;

    try {
      await completeCallQueue(
        selectedCall.id,
        currentUser?.email || 'staff',
        staffNotes
      );
      toast.success(`Call with ${selectedCall.patientName} marked as completed.`);
      setShowCompleteModal(false);
      setSelectedCall(null);
      setStaffNotes('');
    } catch (error) {
      console.error('Error completing call:', error);
      toast.error('Failed to complete call');
    }
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
                <label>Patient Name * (Search by name)</label>
                <PatientNameTypeahead
                  value={formData.patientName}
                  onChange={handleNameChange}
                  onSelect={handlePatientSelect}
                  placeholder="Type patient name (2+ characters for suggestions)"
                  disabled={false}
                  required={true}
                />
                {validationMessage && (
                  <small className={`validation-message ${patientFound ? 'success' : 'error'}`}>
                    {validationMessage}
                  </small>
                )}
              </div>

              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter 10-digit phone number"
                  required
                  pattern="[0-9]{10}"
                  maxLength="10"
                  readOnly={patientFound === true}
                  className={patientFound === true ? "readonly-input" : ""}
                />
                <small className="field-note">
                  {patientFound === true && (
                    <>
                      <FaCheckCircle style={{ color: '#10b981' }} />
                      {' '}Existing patient - Phone auto-filled
                    </>
                  )}
                  {patientFound === false && (
                    <>
                      <FaUserPlus style={{ color: '#f59e0b' }} />
                      {' '}New patient - Enter phone number
                    </>
                  )}
                </small>
              </div>

              <div className="form-group">
                <label>Reason for Call *</label>
                <textarea
                  value={formData.reasonForCall}
                  onChange={(e) => setFormData({ ...formData, reasonForCall: e.target.value })}
                  placeholder="Why is the patient calling? (e.g., Follow-up, New complaint, Medicine refill)"
                  rows="3"
                  required
                  className="reason-textarea"
                />
                <small className="field-note">
                  Provide a brief description so the doctor knows the purpose of the call
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
                  disabled={isAdding}
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
                      reasonForCall: '',
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
                  {call.reasonForCall && (
                    <div className="reason-for-call">
                      <strong>Reason:</strong> {call.reasonForCall}
                    </div>
                  )}
                  <div className="call-time">
                    <FaClock className="time-icon" />
                    <span>
                      Added: {call.timestamp?.toDate 
                        ? format(call.timestamp.toDate(), 'dd-MM-yyyy • hh:mm a')
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
                    className="complete-queue-btn"
                    onClick={() => handleCompleteCall(call)}
                    title="Mark as completed"
                  >
                    <FaCheckCircle /> Complete
                  </button>
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

      {showCompleteModal && selectedCall && (
        <div className="modal-overlay">
          <div className="modal-content complete-modal">
            <div className="modal-header">
              <h2>Complete Call</h2>
              <button className="close-btn" onClick={() => setShowCompleteModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="call-summary">
                <h3>{selectedCall.patientName}</h3>
                <p>📞 {selectedCall.phone}</p>
                {selectedCall.reasonForCall && (
                  <div className="reason-display">
                    <strong>Reason for Call:</strong>
                    <p>{selectedCall.reasonForCall}</p>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Staff Notes (Optional)</label>
                <textarea
                  value={staffNotes}
                  onChange={(e) => setStaffNotes(e.target.value)}
                  placeholder="Add any notes about this call (e.g., action taken, follow-up needed)"
                  rows="4"
                  className="staff-notes-textarea"
                />
              </div>

              <div className="form-actions">
                <button className="save-btn" onClick={confirmCompleteCall}>
                  <FaCheckCircle /> Mark as Completed
                </button>
                <button className="cancel-btn" onClick={() => setShowCompleteModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

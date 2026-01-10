import { useState, useEffect } from 'react';
import { getCallQueue, getPatientByName, addToCallQueue, completeCallQueue, checkPatientInQueueToday, createPatientFromCallQueue } from '../../firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import PatientNameTypeahead from '../../components/PatientNameTypeahead';
import { FaPhoneVolume, FaCheckCircle, FaUserPlus, FaPlus } from 'react-icons/fa';
import { format } from 'date-fns';
import '../../styles/DoctorCallQueue.css';

const CallQueue = () => {
  const toast = useToast();
  const { currentUser } = useAuth();
  const [callQueue, setCallQueue] = useState([]);
  const [enrichedQueue, setEnrichedQueue] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [patientFound, setPatientFound] = useState(null);
  const [validationMessage, setValidationMessage] = useState('');
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

  // Enrich queue data with patient details if missing
  useEffect(() => {
    const enrichQueueData = async () => {
      const enriched = await Promise.all(
        callQueue.map(async (call) => {
          // If age or gender is missing, fetch from patient record
          if ((!call.age || !call.gender) && call.phone) {
            try {
              const patient = await getPatientByName(call.name);
              if (patient) {
                return {
                  ...call,
                  age: call.age || patient.age,
                  gender: call.gender || patient.gender
                };
              }
            } catch (error) {
              console.error('Error fetching patient details:', error);
            }
          }
          return call;
        })
      );
      setEnrichedQueue(enriched);
    };

    if (callQueue.length > 0) {
      enrichQueueData();
    } else {
      setEnrichedQueue([]);
    }
  }, [callQueue]);

  const handleNameChange = (name) => {
    setFormData({ ...formData, patientName: name });
  };

  const handlePatientSelect = (patient) => {
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

    if (!formData.patientName || formData.patientName.trim() === '') {
      toast.warning('Please enter the patient name.');
      return;
    }

    if (!formData.phone || formData.phone.length < 10) {
      toast.warning('Please enter a valid 10-digit phone number.');
      return;
    }

    if (!formData.reasonForCall || formData.reasonForCall.trim() === '') {
      toast.warning('Please enter the reason for call.');
      return;
    }

    if (patientFound === false) {
      if (!formData.age || !formData.gender) {
        toast.warning('Please enter age and gender for the new patient.');
        return;
      }
    }

    setIsAdding(true);

    try {
      const alreadyInQueue = await checkPatientInQueueToday(formData.phone);
      
      if (alreadyInQueue) {
        toast.warning(`${formData.patientName} is already in the call queue for today.`);
        setIsAdding(false);
        return;
      }

      let patientId = formData.patientId;
      let isNewPatient = formData.isNewPatient;

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

      await addToCallQueue({
        patientName: formData.patientName,
        phone: formData.phone,
        patientId: patientId,
        age: formData.age || '',
        gender: formData.gender || '',
        reasonForCall: formData.reasonForCall.trim(),
        status: 'waiting',
        isNewPatient: isNewPatient,
        addedBy: currentUser?.email || 'doctor'
      });

      toast.success(`${formData.patientName} added to call queue successfully!${isNewPatient ? ' (Marked as New Patient)' : ''}`);
      
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
        currentUser?.email || 'doctor',
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

  const cancelCompleteCall = () => {
    setShowCompleteModal(false);
    setSelectedCall(null);
    setStaffNotes('');
  };

  return (
    <div className="doctor-call-queue-page">
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
                  reasonForCall: '', 
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
                  Provide a brief description for the purpose of the call
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
        </div>

        {enrichedQueue.length === 0 ? (
          <div className="empty-state">
            <FaPhoneVolume className="empty-icon" />
            <p className="empty-message">No calls in queue</p>
            <small>Staff will add patients to the queue</small>
          </div>
        ) : (
          <div className="queue-list">
            {enrichedQueue.map((call, index) => (
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
                  <div className="patient-demographics">
                    {call.age && <span className="demo-item">👤 {call.age} years</span>}
                    {call.gender && <span className="demo-item">⚥ {call.gender}</span>}
                  </div>
                  {call.reasonForCall && (
                    <div className="reason-for-call">
                      <strong>Reason for Call:</strong> {call.reasonForCall}
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
                    className="complete-call-btn"
                    onClick={() => handleCompleteCall(call)}
                    title="Mark call as completed"
                  >
                    <FaCheckCircle /> Complete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCompleteModal && selectedCall && (
        <div className="modal-overlay">
          <div className="modal-content complete-modal">
            <div className="modal-header">
              <h2>Complete Call</h2>
              <button className="close-btn" onClick={cancelCompleteCall}>×</button>
            </div>
            
            <div className="complete-modal-body">
              <div className="call-summary">
                <h3>Call Summary</h3>
                <div className="summary-item">
                  <strong>Patient:</strong> {selectedCall.patientName}
                </div>
                <div className="summary-item">
                  <strong>Phone:</strong> {selectedCall.phone}
                </div>
                <div className="summary-item">
                  <strong>Reason:</strong> 
                  <div className="reason-display">
                    {selectedCall.reasonForCall}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Notes (Optional)</label>
                <textarea
                  value={staffNotes}
                  onChange={(e) => setStaffNotes(e.target.value)}
                  placeholder="Add any notes about this call..."
                  rows="4"
                  className="staff-notes-input"
                />
              </div>

              <div className="form-actions">
                <button 
                  className="save-btn"
                  onClick={confirmCompleteCall}
                >
                  <FaCheckCircle /> Confirm Complete
                </button>
                <button 
                  className="cancel-btn"
                  onClick={cancelCompleteCall}
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

export default CallQueue;

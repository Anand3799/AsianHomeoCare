import { useState, useEffect } from 'react';
import { getCallQueue, deleteFromCallQueue, getPatientByPhone } from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import { FaPhoneVolume, FaClock, FaCheckCircle, FaUserPlus } from 'react-icons/fa';
import { format } from 'date-fns';
import '../../styles/DoctorCallQueue.css';

const CallQueue = () => {
  const toast = useToast();
  const [callQueue, setCallQueue] = useState([]);
  const [enrichedQueue, setEnrichedQueue] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, call: null });

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
              const patient = await getPatientByPhone(call.phone);
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

  const handleCompleteCall = (call) => {
    setConfirmDialog({ isOpen: true, call });
  };

  const confirmCompleteCall = async () => {
    const call = confirmDialog.call;
    setConfirmDialog({ isOpen: false, call: null });
    
    try {
      await deleteFromCallQueue(call.id);
      toast.success(`Call with ${call.patientName} marked as completed.`);
    } catch (error) {
      console.error('Error completing call:', error);
      toast.error('Failed to mark call as completed');
    }
  };

  const cancelCompleteCall = () => {
    setConfirmDialog({ isOpen: false, call: null });
  };

  return (
    <div className="doctor-call-queue-page">
      <div className="page-header">
        <h1>
          <FaPhoneVolume /> Call Queue
        </h1>
      </div>

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

      <div className="queue-note">
        <h3>📋 Queue Information:</h3>
        <ul>
          <li><strong>First-Come-First-Serve:</strong> Attend patients in order</li>
          <li><strong>New Patient Indicator:</strong> Gold badge shows first-time patients (45 min consultation)</li>
          <li><strong>Returning Patients:</strong> Regular patients (15 min consultation)</li>
          <li><strong>Complete Button:</strong> Click after attending to patient to remove from queue</li>
          <li><strong>Real-Time:</strong> Queue updates automatically as staff adds patients</li>
        </ul>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Complete Call"
        message={confirmDialog.call ? `Mark call with ${confirmDialog.call.patientName} as completed?` : ''}
        onConfirm={confirmCompleteCall}
        onCancel={cancelCompleteCall}
        confirmText="Complete"
        cancelText="Cancel"
        type="success"
      />
    </div>
  );
};

export default CallQueue;

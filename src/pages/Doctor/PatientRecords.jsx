import { useState, useEffect } from 'react';
import { getAllPatients } from '../../firebase/firestore';
import { FaSearch, FaFolderOpen, FaCalendarAlt } from 'react-icons/fa';
import { format, parseISO } from 'date-fns';
import '../../styles/PatientRecords.css';

const PatientRecords = () => {
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);

  useEffect(() => {
    const unsubscribe = getAllPatients((data) => {
      setPatients(data);
    });

    return unsubscribe;
  }, []);

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.phone.includes(searchTerm)
  );

  return (
    <div className="patient-records">
      <h1>
        <FaFolderOpen /> Patient Records
      </h1>

      <div className="search-section">
        <div className="search-box">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search by patient name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="records-container">
        <div className="patients-list">
          <h2>All Patients ({filteredPatients.length})</h2>
          {filteredPatients.length === 0 ? (
            <p className="empty-message">No patients found</p>
          ) : (
            <div className="patient-cards">
              {filteredPatients.map((patient) => (
                <div
                  key={patient.id}
                  className={`patient-card ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                  onClick={() => setSelectedPatient(patient)}
                >
                  <h3>{patient.name}</h3>
                  <p>📞 {patient.phone}</p>
                  {patient.age && <p>👤 Age: {patient.age}</p>}
                  {patient.gender && <p>⚥ {patient.gender}</p>}
                  <p className="visit-count">
                    <FaCalendarAlt /> {patient.previousVisits?.length || 0} visits
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedPatient && (
          <div className="patient-details">
            <h2>Patient Details</h2>
            <div className="details-content">
              <div className="info-group">
                <label>Name</label>
                <p>{selectedPatient.name}</p>
              </div>

              <div className="info-group">
                <label>Phone Number</label>
                <p>{selectedPatient.phone}</p>
              </div>

              <div className="info-row">
                <div className="info-group">
                  <label>Age</label>
                  <p>{selectedPatient.age || 'N/A'}</p>
                </div>

                <div className="info-group">
                  <label>Gender</label>
                  <p>{selectedPatient.gender || 'N/A'}</p>
                </div>
              </div>

              <div className="info-group">
                <label>Total Visits</label>
                <p>{selectedPatient.previousVisits?.length || 0}</p>
              </div>

              <div className="info-group">
                <label>Previous Visit Dates</label>
                {selectedPatient.previousVisits && selectedPatient.previousVisits.length > 0 ? (
                  <ul className="visit-list">
                    {selectedPatient.previousVisits.map((date, index) => (
                      <li key={index}>{format(parseISO(date), 'dd-MM-yyyy')}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-data">No previous visits recorded</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientRecords;

import { useState, useEffect } from 'react';
import { getAllPatients, addPatient, updatePatient } from '../../firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { FaUserPlus, FaEdit, FaSearch, FaSave, FaTimes } from 'react-icons/fa';
import '../../styles/PatientManagement.css';

const PatientManagement = () => {
  const toast = useToast();
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
    gender: '',
    previousVisits: []
  });

  useEffect(() => {
    const unsubscribe = getAllPatients((data) => {
      setPatients(data);
    });

    return unsubscribe;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingPatient) {
        await updatePatient(editingPatient.id, formData);
        toast.success('Patient updated successfully!');
      } else {
        await addPatient({
          ...formData,
          reasons: []
        });
        toast.success('Patient added successfully!');
      }

      setFormData({ name: '', phone: '', age: '', gender: '', previousVisits: [] });
      setShowAddForm(false);
      setEditingPatient(null);
    } catch (error) {
      console.error('Error saving patient:', error);
      toast.error('Failed to save patient');
    }
  };

  const handleEdit = (patient) => {
    setEditingPatient(patient);
    setFormData({
      name: patient.name,
      phone: patient.phone,
      age: patient.age || '',
      gender: patient.gender || '',
      previousVisits: patient.previousVisits || []
    });
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingPatient(null);
    setFormData({ name: '', phone: '', age: '', gender: '', previousVisits: [] });
  };

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.phone.includes(searchTerm)
  );

  return (
    <div className="patient-management">
      <div className="page-header">
        <h1>Patient Management</h1>
        <button
          className="add-patient-btn"
          onClick={() => setShowAddForm(true)}
        >
          <FaUserPlus /> Add New Patient
        </button>
      </div>

      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingPatient ? 'Edit Patient' : 'Add New Patient'}</h2>
              <button className="close-btn" onClick={handleCancel}>
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="patient-form">
              <div className="form-group">
                <label>Patient Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter patient name"
                  required
                />
              </div>

              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter phone number"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Age</label>
                  <input
                    type="number"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    placeholder="Enter age"
                    min="0"
                    max="150"
                  />
                </div>

                <div className="form-group">
                  <label>Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Previous Visit Dates (Optional)</label>
                <small>Add dates of previous visits (one per line)</small>
                <textarea
                  value={formData.previousVisits.join('\n')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      previousVisits: e.target.value.split('\n').filter(d => d.trim())
                    })
                  }
                  placeholder="2025-01-15&#10;2025-02-20"
                  rows="4"
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="save-btn">
                  <FaSave /> {editingPatient ? 'Update' : 'Save'} Patient
                </button>
                <button type="button" className="cancel-btn" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="search-section">
        <div className="search-box">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search by name or phone number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="patients-table-container">
        <table className="patients-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Total Visits</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-row">
                  No patients found
                </td>
              </tr>
            ) : (
              filteredPatients.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.name}</td>
                  <td>{patient.phone}</td>
                  <td>{patient.age || 'N/A'}</td>
                  <td>{patient.gender || 'N/A'}</td>
                  <td>{patient.previousVisits?.length || 0}</td>
                  <td>
                    <button
                      className="edit-btn"
                      onClick={() => handleEdit(patient)}
                    >
                      <FaEdit /> Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PatientManagement;

import { useState, useEffect } from 'react';
import { getAllAppointments } from '../../firebase/firestore';
import { FaCalendarCheck, FaCalendarAlt, FaClock, FaSearch, FaFilter } from 'react-icons/fa';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import '../../styles/AppointmentLogs.css';

// Helper function to convert 24hr time to 12hr with AM/PM
const formatTime = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const AppointmentLogs = () => {
  const [appointments, setAppointments] = useState([]);
  const [filteredAppointments, setFilteredAppointments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const unsubscribe = getAllAppointments((data) => {
      // Sort by date and time descending (newest first)
      const sortedData = data.sort((a, b) => {
        const aDateTime = new Date(`${a.date} ${a.time}`);
        const bDateTime = new Date(`${b.date} ${b.time}`);
        return bDateTime - aDateTime;
      });
      setAppointments(sortedData);
      setFilteredAppointments(sortedData);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let filtered = [...appointments];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(apt =>
        apt.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        apt.patientPhone.includes(searchTerm)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(apt => apt.status === filterStatus);
    }

    // Date filter
    if (dateFilter.start || dateFilter.end) {
      filtered = filtered.filter(apt => {
        if (dateFilter.start && apt.date < dateFilter.start) return false;
        if (dateFilter.end && apt.date > dateFilter.end) return false;
        return true;
      });
    }

    setFilteredAppointments(filtered);
  }, [searchTerm, filterStatus, dateFilter, appointments]);

  const getStatusBadgeClass = (status) => {
    switch(status) {
      case 'completed': return 'status-completed';
      case 'scheduled': return 'status-scheduled';
      case 'cancelled': return 'status-cancelled';
      case 'rescheduled': return 'status-rescheduled';
      default: return 'status-scheduled';
    }
  };

  return (
    <div className="appointment-logs">
      <div className="page-header">
        <h1>
          <FaCalendarCheck /> Appointment Logs
        </h1>
      </div>

      <div className="filters-section">
        <div className="search-box">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search by patient name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-controls">
          <div className="filter-group">
            <FaFilter />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rescheduled">Rescheduled</option>
            </select>
          </div>

          <div className="date-filter">
            <input
              type="date"
              value={dateFilter.start}
              onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
              placeholder="Start Date"
            />
            <span>to</span>
            <input
              type="date"
              value={dateFilter.end}
              onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
              placeholder="End Date"
            />
          </div>
        </div>
      </div>

      <div className="logs-stats">
        <div className="stat-card">
          <h3>Total Appointments</h3>
          <p className="stat-number">{filteredAppointments.length}</p>
        </div>
        <div className="stat-card">
          <h3>Completed</h3>
          <p className="stat-number completed">{filteredAppointments.filter(a => a.status === 'completed').length}</p>
        </div>
        <div className="stat-card">
          <h3>Scheduled</h3>
          <p className="stat-number scheduled">{filteredAppointments.filter(a => a.status === 'scheduled').length}</p>
        </div>
        <div className="stat-card">
          <h3>Cancelled</h3>
          <p className="stat-number cancelled">{filteredAppointments.filter(a => a.status === 'cancelled').length}</p>
        </div>
      </div>

      <div className="logs-table-container">
        {filteredAppointments.length === 0 ? (
          <div className="empty-state">
            <FaCalendarCheck className="empty-icon" />
            <p>No appointment logs found</p>
          </div>
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Patient Name</th>
                <th>Phone</th>
                <th>Duration</th>
                <th>Type</th>
                <th>Status</th>
                <th>Next Visit</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((apt) => (
                <tr key={apt.id}>
                  <td>
                    <div className="datetime-cell">
                      <FaCalendarAlt className="cell-icon" />
                      <span>{format(parseISO(apt.date), 'dd-MM-yyyy')}</span>
                      <small>{formatTime(apt.time)}</small>
                    </div>
                  </td>
                  <td>
                    <strong>{apt.patientName}</strong>
                    {apt.isNewPatient && (
                      <span className="new-patient-tag">✨ New</span>
                    )}
                  </td>
                  <td>
                    <a href={`tel:${apt.patientPhone}`} className="phone-link">
                      {apt.patientPhone}
                    </a>
                  </td>
                  <td>
                    <span className="duration-badge">
                      <FaClock /> {apt.duration} mins
                    </span>
                  </td>
                  <td>
                    <span className={`type-badge ${apt.isNewPatient ? 'new' : 'existing'}`}>
                      {apt.isNewPatient ? 'New Patient' : 'Follow-up'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${getStatusBadgeClass(apt.status)}`}>
                      {apt.status}
                    </span>
                  </td>
                  <td>
                    {apt.nextVisit ? (
                      <span className="next-visit">
                        {format(parseISO(apt.nextVisit), 'dd-MM-yyyy')}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <span className="notes-text">{apt.notes || '-'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AppointmentLogs;

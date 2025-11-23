import { useState, useEffect } from 'react';
import { getCallLogs } from '../../firebase/firestore';
import { FaPhoneAlt, FaCalendarAlt, FaClock, FaSearch, FaFilter } from 'react-icons/fa';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import '../../styles/CallLogs.css';

const CallLogs = () => {
  const [callLogs, setCallLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const unsubscribe = getCallLogs((data) => {
      setCallLogs(data);
      setFilteredLogs(data);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let filtered = [...callLogs];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.phone.includes(searchTerm)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(log => log.status === filterStatus);
    }

    // Date filter
    if (dateFilter.start || dateFilter.end) {
      filtered = filtered.filter(log => {
        if (!log.timestamp?.toDate) return false;
        const logDate = format(log.timestamp.toDate(), 'yyyy-MM-dd');
        
        if (dateFilter.start && logDate < dateFilter.start) return false;
        if (dateFilter.end && logDate > dateFilter.end) return false;
        
        return true;
      });
    }

    setFilteredLogs(filtered);
  }, [searchTerm, filterStatus, dateFilter, callLogs]);

  const getStatusBadgeClass = (status) => {
    switch(status) {
      case 'completed': return 'status-completed';
      case 'pending': return 'status-pending';
      case 'missed': return 'status-missed';
      default: return 'status-pending';
    }
  };

  return (
    <div className="call-logs">
      <div className="page-header">
        <h1>
          <FaPhoneAlt /> Call Logs
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
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
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
          <h3>Total Calls</h3>
          <p className="stat-number">{filteredLogs.length}</p>
        </div>
        <div className="stat-card">
          <h3>Pending</h3>
          <p className="stat-number pending">{filteredLogs.filter(l => l.status === 'pending').length}</p>
        </div>
        <div className="stat-card">
          <h3>Completed</h3>
          <p className="stat-number completed">{filteredLogs.filter(l => l.status === 'completed').length}</p>
        </div>
      </div>

      <div className="logs-table-container">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <FaPhoneAlt className="empty-icon" />
            <p>No call logs found</p>
          </div>
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Patient Name</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <div className="datetime-cell">
                      <FaCalendarAlt className="cell-icon" />
                      {log.timestamp?.toDate ? (
                        <>
                          <span>{format(log.timestamp.toDate(), 'dd-MM-yyyy')}</span>
                          <small>{format(log.timestamp.toDate(), 'hh:mm a')}</small>
                        </>
                      ) : (
                        'N/A'
                      )}
                    </div>
                  </td>
                  <td>
                    <strong>{log.patientName}</strong>
                    {log.isNewPatient && (
                      <span className="new-patient-tag">✨ New</span>
                    )}
                  </td>
                  <td>
                    <a href={`tel:${log.phone}`} className="phone-link">
                      {log.phone}
                    </a>
                  </td>
                  <td>
                    <span className={`type-badge ${log.isNewPatient ? 'new' : 'existing'}`}>
                      {log.isNewPatient ? 'New Patient' : 'Existing Patient'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${getStatusBadgeClass(log.status || 'pending')}`}>
                      {log.status || 'pending'}
                    </span>
                  </td>
                  <td>
                    <span className="notes-text">{log.notes || '-'}</span>
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

export default CallLogs;

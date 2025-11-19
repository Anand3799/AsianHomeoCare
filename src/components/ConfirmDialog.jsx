import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import '../styles/ConfirmDialog.css';

const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel', type = 'warning' }) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    onCancel();
  };

  const handleBackdropClick = (e) => {
    if (e.target.className === 'confirm-dialog-backdrop') {
      handleCancel();
    }
  };

  return (
    <div className="confirm-dialog-backdrop" onClick={handleBackdropClick}>
      <div className={`confirm-dialog confirm-dialog-${type}`}>
        <button className="confirm-dialog-close" onClick={handleCancel} aria-label="Close">
          <FaTimes />
        </button>
        
        <div className="confirm-dialog-icon">
          <FaExclamationTriangle />
        </div>
        
        <div className="confirm-dialog-content">
          <h3 className="confirm-dialog-title">{title}</h3>
          <p className="confirm-dialog-message">{message}</p>
        </div>
        
        <div className="confirm-dialog-actions">
          <button 
            className="confirm-dialog-btn confirm-dialog-btn-cancel" 
            onClick={handleCancel}
          >
            {cancelText}
          </button>
          <button 
            className="confirm-dialog-btn confirm-dialog-btn-confirm" 
            onClick={handleConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

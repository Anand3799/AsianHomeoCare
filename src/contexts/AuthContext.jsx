/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUserByEmail } from '../firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Try to fetch user role from Firestore, fallback to localStorage
        try {
          const userData = await getUserByEmail(user.email);
          setCurrentUser(user);
          setUserRole(userData?.role || localStorage.getItem('userRole') || null);
        } catch (_error) {
          console.error('Error fetching user role:', _error);
          // Fallback to localStorage if Firestore fails
          setCurrentUser(user);
          setUserRole(localStorage.getItem('userRole') || null);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email, password, rememberMe, selectedRole = null) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      let role = selectedRole;
      
      // Try to get role from Firestore first
      try {
        const userData = await getUserByEmail(email);
        role = userData?.role;
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
      
      // Fallback: Detect role from email if not found in Firestore
      if (!role) {
        const emailLower = email.toLowerCase();
        if (emailLower.includes('doctor')) {
          role = 'doctor';
        } else if (emailLower.includes('staff')) {
          role = 'staff';
        } else {
          // Default to staff if can't determine
          role = 'staff';
        }
      }
      
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberMe');
      }
      
      // Store role in localStorage for fallback
      if (role) {
        localStorage.setItem('userRole', role);
      }
      
      // Set the role in state immediately
      setUserRole(role);
      
      return { user: result.user, role };
    } catch {
      throw new Error('Invalid username or password');
    }
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('userRole');
  };

  const resetPassword = async (email) => {
    await sendPasswordResetEmail(auth, email);
  };

  const value = {
    currentUser,
    userRole,
    login,
    logout,
    resetPassword,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

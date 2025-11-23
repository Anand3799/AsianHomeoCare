import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/PatientNameTypeahead.css';

const PatientNameTypeahead = ({ value, onChange, onSelect, placeholder, disabled, required }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const cacheRef = useRef(new Map()); // In-session cache

  // Fetch patient suggestions from Firestore
  const fetchSuggestions = useCallback(async (searchText) => {
    if (searchText.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    // Check cache first
    const cacheKey = searchText.toLowerCase();
    if (cacheRef.current.has(cacheKey)) {
      const cached = cacheRef.current.get(cacheKey);
      setSuggestions(cached);
      setShowDropdown(cached.length > 0);
      return;
    }

    setIsLoading(true);

    try {
      const searchLower = searchText.toLowerCase();
      const searchUpper = searchText.toUpperCase();
      
      // Create a range for prefix search
      const endChar = searchText.slice(0, -1) + String.fromCharCode(searchText.charCodeAt(searchText.length - 1) + 1);

      // Query 1: Prefix match (case-insensitive approximation using range)
      const prefixQuery = query(
        collection(db, 'patients'),
        where('name', '>=', searchText),
        where('name', '<', endChar),
        orderBy('name'),
        limit(8)
      );

      const prefixSnapshot = await getDocs(prefixQuery);
      const prefixResults = prefixSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter for case-insensitive prefix and substring matches
      const allPatients = [...prefixResults];
      
      // If we need more results, fetch additional patients for substring matching
      if (prefixResults.length < 8) {
        const allQuery = query(
          collection(db, 'patients'),
          orderBy('name'),
          limit(50) // Get a larger set for substring matching
        );
        
        const allSnapshot = await getDocs(allQuery);
        allSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (!prefixResults.find(p => p.id === doc.id)) {
            allPatients.push({ id: doc.id, ...data });
          }
        });
      }

      // Filter and rank results
      const prefixMatches = [];
      const substringMatches = [];

      allPatients.forEach(patient => {
        const patientNameLower = patient.name.toLowerCase();
        
        if (patientNameLower.startsWith(searchLower)) {
          prefixMatches.push(patient);
        } else if (patientNameLower.includes(searchLower)) {
          substringMatches.push(patient);
        }
      });

      // Combine: prefix first, then substring, limit to 8
      const combinedResults = [...prefixMatches, ...substringMatches].slice(0, 8);

      // Cache the results
      cacheRef.current.set(cacheKey, combinedResults);

      setSuggestions(combinedResults);
      setShowDropdown(true);
    } catch (error) {
      console.error('Error fetching patient suggestions:', error);
      setSuggestions([]);
      setShowDropdown(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setActiveIndex(-1);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 250);
  };

  // Highlight matched substring
  const highlightMatch = (text, search) => {
    if (!search || search.length < 2) return text;

    const searchLower = search.toLowerCase();
    const textLower = text.toLowerCase();
    const index = textLower.indexOf(searchLower);

    if (index === -1) return text;

    const before = text.substring(0, index);
    const match = text.substring(index, index + search.length);
    const after = text.substring(index + search.length);

    return (
      <>
        {before}
        <strong className="highlight">{match}</strong>
        {after}
      </>
    );
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const maxIndex = suggestions.length > 0 ? suggestions.length : 0;
        setActiveIndex(prev => 
          prev < maxIndex ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => prev > 0 ? prev - 1 : -1);
        break;

      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          handleSelectSuggestion(suggestions[activeIndex]);
        } else if (activeIndex === suggestions.length && value.trim().length >= 2) {
          // Select "Add as new patient" option
          handleAddNewPatient();
        } else if (value.trim().length >= 2 && suggestions.length === 0) {
          // No suggestions, directly add as new patient
          handleAddNewPatient();
        }
        break;

      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        setActiveIndex(-1);
        break;

      default:
        break;
    }
  };

  // Handle adding new patient
  const handleAddNewPatient = () => {
    onSelect({
      name: value.trim(),
      phone: '',
      isNewPatient: true,
      isNew: true // Flag to indicate this is a new patient being added
    });
    setShowDropdown(false);
    setActiveIndex(-1);
    setSuggestions([]);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (patient) => {
    onChange(patient.name);
    onSelect(patient);
    setShowDropdown(false);
    setActiveIndex(-1);
    setSuggestions([]);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !inputRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && dropdownRef.current) {
      const activeElement = dropdownRef.current.querySelector(`[data-index="${activeIndex}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [activeIndex]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="typeahead-container">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.length >= 2 && suggestions.length > 0) {
            setShowDropdown(true);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className="typeahead-input"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls="typeahead-listbox"
        aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
      />

      {showDropdown && (
        <div
          ref={dropdownRef}
          id="typeahead-listbox"
          className="typeahead-dropdown"
          role="listbox"
        >
          {isLoading ? (
            <div className="typeahead-loading">Searching...</div>
          ) : suggestions.length > 0 ? (
            <>
              {suggestions.map((patient, index) => (
                <div
                  key={patient.id}
                  id={`suggestion-${index}`}
                  data-index={index}
                  className={`typeahead-option ${index === activeIndex ? 'active' : ''}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => handleSelectSuggestion(patient)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <div className="option-name">
                    {highlightMatch(patient.name, value)}
                  </div>
                  <div className="option-details">
                    <span className="option-phone">{patient.phone}</span>
                    {patient.lastVisit && (
                      <span className="option-last-visit">Last: {patient.lastVisit}</span>
                    )}
                  </div>
                </div>
              ))}
              {value.trim().length >= 2 && (
                <div
                  id={`suggestion-${suggestions.length}`}
                  data-index={suggestions.length}
                  className={`typeahead-option new-patient-option ${suggestions.length === activeIndex ? 'active' : ''}`}
                  role="option"
                  aria-selected={suggestions.length === activeIndex}
                  onClick={handleAddNewPatient}
                  onMouseEnter={() => setActiveIndex(suggestions.length)}
                >
                  <div className="option-name">
                    ✨ Add "{value.trim()}" as new patient
                  </div>
                </div>
              )}
            </>
          ) : value.trim().length >= 2 ? (
            <div
              id="suggestion-0"
              data-index={0}
              className={`typeahead-option new-patient-option ${0 === activeIndex ? 'active' : ''}`}
              role="option"
              aria-selected={0 === activeIndex}
              onClick={handleAddNewPatient}
              onMouseEnter={() => setActiveIndex(0)}
            >
              <div className="option-name">
                ✨ Add "{value.trim()}" as new patient
              </div>
            </div>
          ) : (
            <div className="typeahead-no-results">Type at least 2 characters</div>
          )}
        </div>
      )}
    </div>
  );
};

export default PatientNameTypeahead;

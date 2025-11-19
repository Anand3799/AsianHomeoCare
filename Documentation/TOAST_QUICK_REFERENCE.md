# 🚀 Quick Reference: Toast Notifications

## Import
```jsx
import { useToast } from '../../contexts/ToastContext';
```

## Initialize
```jsx
const toast = useToast();
```

## Usage

### Success (Green)
```jsx
toast.success('Operation completed successfully!');
```

### Error (Red)
```jsx
toast.error('Something went wrong!');
```

### Warning (Orange)
```jsx
toast.warning('Please check your input!');
```

### Info (Blue)
```jsx
toast.info('Here is some information.');
```

### Custom Duration
```jsx
// 6 seconds
toast.success('Custom duration message', 6000);

// No auto-dismiss (manual close only)
toast.info('Persistent message', 0);
```

## Best Practices

### ✅ DO
- Use success for completed actions
- Use error for failures
- Use warning for validation issues
- Use info for neutral information
- Keep messages concise (< 100 characters)
- Use proper grammar and punctuation

### ❌ DON'T
- Don't show toasts for every minor action
- Don't use all caps
- Don't include technical error codes (log them instead)
- Don't stack more than 5 toasts at once

## Common Patterns

### After Successful Save
```jsx
try {
  await saveData();
  toast.success('Data saved successfully!');
} catch (error) {
  toast.error('Failed to save data');
}
```

### Form Validation
```jsx
if (!phoneNumber || phoneNumber.length < 10) {
  toast.warning('Please enter a valid 10-digit phone number.');
  return;
}
```

### Loading State
```jsx
if (isLoading) {
  toast.info('Please wait while we process your request...');
  return;
}
```

### Dynamic Messages
```jsx
toast.success(`${patientName} added to queue successfully!`);
```

## Migration from alert()

### Before
```jsx
alert('Patient added successfully!');
```

### After
```jsx
toast.success('Patient added successfully!');
```

### Before (Error)
```jsx
alert('Failed to save patient');
```

### After (Error)
```jsx
toast.error('Failed to save patient');
```

### Before (Validation)
```jsx
alert('Please enter a valid phone number.');
```

### After (Validation)
```jsx
toast.warning('Please enter a valid phone number.');
```

## Quick Type Reference

| Type | Color | Use Case | Icon |
|------|-------|----------|------|
| `success` | Green | Successful operations | ✅ |
| `error` | Red | Failed operations | ❌ |
| `warning` | Orange | Validation issues | ⚠️ |
| `info` | Blue | General information | ℹ️ |

---

**Remember**: The toast system is already set up globally. Just import `useToast()` and start using it! 🎉

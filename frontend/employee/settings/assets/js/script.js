// Settings Page JavaScript
const API_BASE = window.API_BASE || `${location.origin}/api`;
// Header date/time helpers (independent from GlobalLanguage)
function formatHeaderDate(d) {
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
}

function formatHeaderTime(d) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${String(h).padStart(2,'0')}:${m} ${ampm}`;
}

// Settings Page JavaScript

// Use global language system

document.addEventListener('DOMContentLoaded', function() {
    console.log('Settings page loaded at:', new Date().toISOString());
    
    // Initialize settings functionality
    initializeSettings();
    initializeFormValidation();
    initializeToggleSwitches();
    initializeButtons();
    // Initialize global language system
    if (window.GlobalLanguage) {
        window.GlobalLanguage.initialize();
    }

    // Initialize header date/time immediately and every minute
    try {
        const elDate = document.querySelector('.header .date');
        const elTime = document.querySelector('.header .time');
        const tickHeader = () => {
            // If language manager is available, delegate for correct localization
            if (window.GlobalLanguage && typeof window.GlobalLanguage.updateDateTime === 'function') {
                window.GlobalLanguage.updateDateTime();
                return;
            }
            const now = new Date();
            if (elDate) elDate.textContent = formatHeaderDate(now);
            if (elTime) elTime.textContent = formatHeaderTime(now);
        };
        tickHeader();
        setInterval(tickHeader, 60000);
    } catch (e) {
        console.warn('Header date/time init failed:', e);
    }

    // Sidebar navigation handler for .menu-item[data-href] (Settings page only)
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', function(e) {
            const btn = e.target.closest('.menu-item[data-href]');
            if (!btn) return;
            if (btn.hasAttribute('aria-current')) return; // Không chuyển nếu đang ở trang hiện tại
            e.preventDefault();
            const href = btn.getAttribute('data-href');
            if (href) window.location.href = href;
        });
    }
});

// Initialize settings page
function initializeSettings() {
    // Clear sessionStorage to force reload from API (for testing)
    // sessionStorage.removeItem('user_info');
    
    // Load user info from sessionStorage
    loadUserInfo();
    
    // Load saved settings from localStorage
    loadSettings();
    
    // Update date and time display
    updateDateTime();
    
    // Set up auto-save for toggle switches
    setupAutoSave();
}

// Load user info from API (always fetch fresh data)
async function loadUserInfo() {
    try {
        const token = sessionStorage.getItem('auth_token');
        if (!token) {
            console.error('No auth token found');
            return;
        }

        // Always fetch fresh user info from API
        console.log('Fetching fresh user info from API...');
        const response = await fetch(`${API_BASE}/user/current`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                const userInfo = result.data;
                // Save to sessionStorage for future use
                sessionStorage.setItem('user_info', JSON.stringify(userInfo));
                console.log('Fresh user info loaded:', userInfo);
                
                // Update user name in header - use full_name ưu tiên (khắc phục bug header không đổi)
                updateHeaderName(userInfo);
                
                // Update form fields with user info
                const fullNameField = document.getElementById('fullName');
                if (fullNameField) {
                    // Bind "Full Name" input to username field in DB
                    fullNameField.value = userInfo.username || '';
                }
                
                const emailField = document.getElementById('email');
                if (emailField) {
                    emailField.value = userInfo.email || '';
                }
                
                const phoneField = document.getElementById('phone');
                if (phoneField) {
                    phoneField.value = userInfo.phone || '';
                    console.log('Phone field updated with:', userInfo.phone);
                }
            }
        } else {
            console.error('Failed to fetch user profile from API');
            // Fallback to sessionStorage
            const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
            const userNameElement = document.querySelector('.user-name');
            if (userNameElement) {
                userNameElement.textContent = userInfo.full_name || userInfo.username || 'Employee';
            }
        }
    } catch (error) {
        console.error('Error loading user info:', error);
        // Fallback to sessionStorage
        const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
        const userNameElement = document.querySelector('.user-name');
        if (userNameElement) {
            userNameElement.textContent = userInfo.full_name || userInfo.username || 'Employee';
        }
    }
}

// Load settings from localStorage
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    
    // Load form values (only if not already set by user info)
    if (settings.fullName) document.getElementById('fullName').value = settings.fullName;
    if (settings.email) document.getElementById('email').value = settings.email;
    if (settings.phone) document.getElementById('phone').value = settings.phone;
    if (settings.language) document.getElementById('language').value = settings.language;
    if (settings.measurementUnits) document.getElementById('measurementUnits').value = settings.measurementUnits;
    
    // Load toggle states
    if (settings.autoSync !== undefined) document.getElementById('autoSync').checked = settings.autoSync;
    if (settings.aiSuggestion !== undefined) document.getElementById('aiSuggestion').checked = settings.aiSuggestion;
    if (settings.emailNotifications !== undefined) document.getElementById('emailNotifications').checked = settings.emailNotifications;
}

// Save settings to localStorage
function saveSettings() {
    const settings = {
        fullName: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        language: document.getElementById('language').value,
        measurementUnits: document.getElementById('measurementUnits').value,
        autoSync: document.getElementById('autoSync').checked,
        aiSuggestion: document.getElementById('aiSuggestion').checked,
        emailNotifications: document.getElementById('emailNotifications').checked,
        lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem('userSettings', JSON.stringify(settings));
    console.log('Settings saved:', settings);
}

// Update user profile via API
async function updateUserProfile() {
    try {
        const token = sessionStorage.getItem('auth_token');
        console.log('Token found:', !!token); // Debug log
        
        if (!token) {
            throw new Error('No authentication token found. Please login again.');
        }

        const profileData = {
            // Update username in DB using the "Full Name" input
            username: document.getElementById('fullName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value
        };
        
        console.log('Sending profile data:', profileData); // Debug log

        const response = await fetch(`${API_BASE}/user/update-profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profileData)
        });

        console.log('Response status:', response.status); // Debug log
        console.log('Response ok:', response.ok); // Debug log

        const result = await response.json();
        console.log('Response data:', result); // Debug log

        if (!response.ok) {
            throw new Error(result.message || `HTTP ${response.status}: Failed to update profile`);
        }
        
        if (result.success) {
            // Update sessionStorage with new user info
            const currentUserInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
            const updatedUserInfo = { ...currentUserInfo, ...result.data.user };
            sessionStorage.setItem('user_info', JSON.stringify(updatedUserInfo));
            
            console.log('Profile updated successfully'); // Debug log
            return true;
        } else {
            throw new Error(result.message || 'Failed to update profile');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        throw error;
    }
}

// Update date and time display
function updateDateTime() {
    // Locally update header date/time once (recurring interval set on DOMContentLoaded)
    try {
        const elDate = document.querySelector('.header .date');
        const elTime = document.querySelector('.header .time');
        const now = new Date();
        if (elDate) elDate.textContent = formatHeaderDate(now);
        if (elTime) elTime.textContent = formatHeaderTime(now);
    } catch (_) {}
}

// Setup auto-save for toggle switches
function setupAutoSave() {
    const toggles = document.querySelectorAll('.toggle-switch input[type="checkbox"]');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', function() {
            saveSettings();
            showNotification('Setting updated', 'success');
        });
    });
}

// Initialize form validation
function initializeFormValidation() {
    const form = document.querySelector('.settings-container');
    const inputs = form.querySelectorAll('input, select');
    
    inputs.forEach(input => {
        // Real-time validation
        input.addEventListener('blur', function() {
            validateField(this);
        });
        
        input.addEventListener('input', function() {
            clearFieldError(this);
        });
    });
}

// Validate individual field
function validateField(field) {
    const value = field.value.trim();
    const fieldType = field.type;
    const fieldId = field.id;
    
    clearFieldError(field);
    
    let isValid = true;
    let errorMessage = '';
    
    // Required field validation
    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = 'This field is required';
    }
    
    // Email validation
    if (fieldType === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address';
        }
    }
    
    // Phone validation
    if (fieldId === 'phone' && value) {
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid phone number';
        }
    }
    
    // Password validation
    if (fieldId === 'newPassword' && value) {
        if (value.length < 8) {
            isValid = false;
            errorMessage = 'Password must be at least 8 characters long';
        }
    }
    
    // Confirm password validation
    if (fieldId === 'confirmPassword' && value) {
        const newPassword = document.getElementById('newPassword').value;
        if (value !== newPassword) {
            isValid = false;
            errorMessage = 'Passwords do not match';
        }
    }
    
    if (!isValid) {
        showFieldError(field, errorMessage);
    }
    
    return isValid;
}

// Show field error
function showFieldError(field, message) {
    const fieldContainer = field.closest('.field');
    fieldContainer.classList.add('field-error');
    
    // Remove existing error message
    const existingError = fieldContainer.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Add new error message
    const errorElement = document.createElement('span');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    fieldContainer.appendChild(errorElement);
}

// Clear field error
function clearFieldError(field) {
    const fieldContainer = field.closest('.field');
    fieldContainer.classList.remove('field-error');
    
    const errorMessage = fieldContainer.querySelector('.error-message');
    if (errorMessage) {
        errorMessage.remove();
    }
}

// Validate entire form
function validateForm() {
    const form = document.querySelector('.settings-container');
    const inputs = form.querySelectorAll('input[required], input[type="email"], input[id="phone"], input[id="newPassword"], input[id="confirmPassword"]');
    
    let isValid = true;
    
    inputs.forEach(input => {
        if (!validateField(input)) {
            isValid = false;
        }
    });
    
    return isValid;
}

// Initialize toggle switches
function initializeToggleSwitches() {
    const toggles = document.querySelectorAll('.toggle-switch');
    
    toggles.forEach(toggle => {
        const input = toggle.querySelector('input[type="checkbox"]');
        const slider = toggle.querySelector('.slider');
        
        // Add click handler for better accessibility
        toggle.addEventListener('click', function(e) {
            if (e.target !== input) {
                input.checked = !input.checked;
                input.dispatchEvent(new Event('change'));
            }
        });
        
        // Keyboard support
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                input.checked = !input.checked;
                input.dispatchEvent(new Event('change'));
            }
        });
    });
}

// Initialize buttons
function initializeButtons() {
    const cancelBtn = document.getElementById('btnCancel');
    const saveBtn = document.getElementById('btnSave');
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancel);
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSave);
    }
}

// Handle cancel button
function handleCancel() {
    if (confirm('Are you sure you want to cancel? All unsaved changes will be lost.')) {
        // Reset form to original values
        loadSettings();
        showNotification('Changes cancelled', 'info');
    }
}

// Handle save button
async function handleSave() {
    const saveBtn = document.getElementById('btnSave');
    
    // Validate form
    if (!validateForm()) {
        showNotification('Please fix the errors before saving', 'error');
        return;
    }
    
    // Show loading state
    saveBtn.classList.add('loading');
    saveBtn.disabled = true;
    
    try {
        // Try to update user profile via API
        try {
            await updateUserProfile();
            console.log('Profile updated via API');
        } catch (apiError) {
            console.warn('API update failed, falling back to localStorage only:', apiError);
            // Continue with localStorage save even if API fails
        }
        
        // Save other settings to localStorage
        saveSettings();
        
        // Show success message
        showNotification('Settings saved successfully!', 'success');
        
        // Reset form state
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
        
        // Reload page after a short delay to show updated information
        (window.globalCleanup && window.globalCleanup.addTimeout
            ? window.globalCleanup.addTimeout(setTimeout(() => { window.location.reload(); }, 1000))
            : setTimeout(() => { window.location.reload(); }, 1000));
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification(`Error saving settings: ${error.message}`, 'error');
        
        // Reset button state
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fa-solid fa-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${getNotificationColor(type)};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;
    
    // Add animation keyframes
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    (window.globalCleanup && window.globalCleanup.addTimeout
        ? window.globalCleanup.addTimeout(setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000))
        : setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000));
}

// Get notification icon based on type
function getNotificationIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Get notification color based on type
function getNotificationColor(type) {
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6'
    };
    return colors[type] || '#3B82F6';
}

// Debug function to force reload user info
function debugReloadUserInfo() {
    console.log('Force reloading user info...');
    sessionStorage.removeItem('user_info');
    loadUserInfo();
}

// Debug function to check token and test API
async function debugCheckToken() {
    const token = sessionStorage.getItem('auth_token');
    console.log('Current token:', token);
    
    if (!token) {
        console.log('No token found in sessionStorage');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/user/current`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        console.log('Current user API result:', result);
        
        if (result.success) {
            console.log('User data:', result.data);
        } else {
            console.log('API error:', result.message);
        }
        
    } catch (error) {
        console.error('API call error:', error);
    }
}

// Debug function to test update profile API directly
async function debugTestUpdateAPI() {
    const token = sessionStorage.getItem('auth_token');
    if (!token) {
        console.log('No token found');
        return;
    }
    
    try {
        const testData = {
            full_name: 'Test Name',
            email: 'test@example.com',
            phone: '1234567890'
        };
        
        console.log('Testing update API with data:', testData);
        
        const response = await fetch(`${API_BASE}/user/update-profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });
        
        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response data:', result);
        
    } catch (error) {
        console.error('Test API error:', error);
    }
}

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
  btnLogout.addEventListener('click', function () {
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_info');
    localStorage.removeItem('bakery_credentials');
    window.location.href = '../../login/index.html';
  });
}

// Export functions for external use
window.SettingsPage = {
    loadSettings,
    saveSettings,
    validateForm,
    showNotification,
    debugReloadUserInfo,
    debugCheckToken,
    debugTestUpdateAPI,
};

// Cập nhật header đúng cách (dùng full_name nếu có)
function updateHeaderName(userInfo) {
    const userNameElement = document.querySelector('.user-name');
    if (userNameElement) {
        // Always display username across the app (Settings included)
        userNameElement.textContent = userInfo.username || 'Employee';
    }
}

// ==================== GLOBAL VARIABLES ====================
const API_BASE_URL =
  (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
    ? 'http://127.0.0.1:5000/api'
    : '/api';

let isSubmitting = false;

// ==================== DOM ELEMENTS ====================
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('togglePassword');
const loginBtn = document.getElementById('loginBtn');
const btnText = document.querySelector('.btn-text');
const btnLoader = document.querySelector('.btn-loader');
const toast = document.getElementById('toast');
const rememberMeCheckbox = document.getElementById('rememberMe');
const IS_DEV_WITH_FRONTEND_PREFIX = window.location.pathname.startsWith('/frontend/');

const PREFIX = IS_DEV_WITH_FRONTEND_PREFIX ? '/frontend' : '';

const ADMIN_DASHBOARD_URL = `${PREFIX}/admin/report/index.html`;
const OWNER_DASHBOARD_URL = `${PREFIX}/owner/dashboard/index.html`;
const EMPLOYEE_HOME_URL = `${PREFIX}/employee/homepage/index.html`;


// ==================== UTILITY FUNCTIONS ====================
/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (success, error, warning)
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
function showToast(message, type = 'success', duration = 4000) {
    const toastMessage = toast.querySelector('.toast-message');
    const toastIcon = toast.querySelector('.toast-icon');
    
    // Set message and type
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    
    // Show toast
    toast.classList.add('show');
    
    // Auto hide
    setTimeout(() => {
        hideToast();
    }, duration);
}

/**
 * Hide toast notification
 */
function hideToast() {
    toast.classList.remove('show');
}

/**
 * Show field error
 * @param {HTMLElement} field - Input field
 * @param {HTMLElement} errorElement - Error message element
 * @param {string} message - Error message
 */
function showFieldError(field, errorElement, message) {
    field.style.borderColor = 'var(--error-color)';
    errorElement.textContent = message;
    errorElement.classList.add('show');
}

/**
 * Clear field error
 * @param {HTMLElement} field - Input field
 * @param {HTMLElement} errorElement - Error message element
 */
function clearFieldError(field, errorElement) {
    field.style.borderColor = 'var(--border-color)';
    errorElement.textContent = '';
    errorElement.classList.remove('show');
}

/**
 * Set loading state for login button
 * @param {boolean} isLoading - Loading state
 */
function setLoadingState(isLoading) {
    isSubmitting = isLoading;
    loginBtn.disabled = isLoading;
    
    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'block';
    } else {
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
    }
}

/**
 * Validate email
 * @param {string} email - Email to validate
 * @returns {object} - Validation result
 */
function validateEmail(email) {
    const errors = [];
    
    if (!email.trim()) {
        errors.push('Email cannot be empty');
    } else if (email.length > 100) {
        errors.push('Email cannot exceed 100 characters');
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.push('Email is invalid');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate password
 * @param {string} password - Password to validate
 * @returns {object} - Validation result
 */
function validatePassword(password) {
    const errors = [];
    
    if (!password.trim()) {
        errors.push('Password cannot be empty');
    } else if (password.length < 6) {
        errors.push('Password must be at least 6 characters');
    } else if (password.length > 100) {
        errors.push('Password cannot exceed 100 characters');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Format form data for API
 * @param {FormData} formData - Form data
 * @returns {object} - Formatted data
 */
function formatFormData(formData) {
    return {
        email: formData.get('email').trim(),
        password: formData.get('password'),
        remember_me: formData.has('rememberMe')
    };
}

/**
 * Save login credentials to localStorage if remember me is checked
 * @param {string} email - Email
 * @param {string} password - Password (encrypted)
 */
function saveCredentials(email, password) {
    if (rememberMeCheckbox.checked) {
        try {
            const credentials = {
                email: email,
                password: btoa(password) // Simple base64 encoding (not secure for production)
            };
            localStorage.setItem('bakery_credentials', JSON.stringify(credentials));
        } catch (error) {
            console.warn('Could not save credentials:', error);
        }
    }
}

/**
 * Load saved credentials from localStorage
 */
function loadCredentials() {
    try {
        const savedCredentials = localStorage.getItem('bakery_credentials');
        if (savedCredentials) {
            const credentials = JSON.parse(savedCredentials);
            emailInput.value = credentials.email;
            passwordInput.value = atob(credentials.password); // Decode base64
            rememberMeCheckbox.checked = true;
        }
    } catch (error) {
        console.warn('Could not load credentials:', error);
        localStorage.removeItem('bakery_credentials');
    }
}

/**
 * Clear saved credentials
 */
function clearCredentials() {
    localStorage.removeItem('bakery_credentials');
}

/**
 * Map role info to redirect URL
 * Fallback mapping based on current DB: 1=Admin, 2=Owner, 3=Employee
 */
function getRedirectUrl(roleName, roleId) {
    const normalizedRole = (roleName || '').toString().toLowerCase();
    const numericRoleId = Number(roleId);

    // Prefer explicit role name from API
    if (normalizedRole === 'admin') {
        return ADMIN_DASHBOARD_URL;
    }
    if (normalizedRole === 'owner') {
        return OWNER_DASHBOARD_URL;
    }

    // Fallback by role_id
    if (numericRoleId === 1) return ADMIN_DASHBOARD_URL;
    if (numericRoleId === 2) return OWNER_DASHBOARD_URL;
    return EMPLOYEE_HOME_URL;
}

// ==================== API FUNCTIONS ====================
/**
 * Login user via API
 * @param {object} loginData - Login credentials
 * @returns {Promise} - API response
 */
async function loginUser(loginData) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }
        
        return data;
    } catch (error) {
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Unable to connect to the server. Please check your network connection.');
        }
        throw error;
    }
}

// ==================== EVENT HANDLERS ====================
/**
 * Handle password visibility toggle
 */
function handleTogglePassword() {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    
    const icon = togglePasswordBtn.querySelector('i');
    icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
}

/**
 * Handle form submission
 * @param {Event} event - Form submit event
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    
    // Get form data
    const formData = new FormData(loginForm);
    const loginData = formatFormData(formData);
    
    // Get error elements
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    
    // Clear previous errors
    clearFieldError(emailInput, emailError);
    clearFieldError(passwordInput, passwordError);
    
    // Validate inputs
    const emailValidation = validateEmail(loginData.email);
    const passwordValidation = validatePassword(loginData.password);
    
    let hasErrors = false;
    
    if (!emailValidation.isValid) {
        showFieldError(emailInput, emailError, emailValidation.errors[0]);
        hasErrors = true;
    }
    
    if (!passwordValidation.isValid) {
        showFieldError(passwordInput, passwordError, passwordValidation.errors[0]);
        hasErrors = true;
    }
    
    if (hasErrors) {
        showToast('Please check your login credentials again', 'error');
        return;
    }
    
    // Set loading state
    setLoadingState(true);
    
    try {
        // Attempt login
        const response = await loginUser(loginData);
        
        // Save credentials if remember me is checked
        if (loginData.remember_me) {
            saveCredentials(loginData.email, loginData.password);
        } else {
            clearCredentials();
        }
        
        // Store auth token
        if (response && response.data && response.data.token) {
            sessionStorage.setItem('auth_token', response.data.token);
            sessionStorage.setItem('user_info', JSON.stringify(response.data.user));
            // Store role for redirect
            if (response.data.role) {
                sessionStorage.setItem('user_role', response.data.role);
            }
            // Store role_id if available
            if (response.data.user && response.data.user.role_id) {
                sessionStorage.setItem('user_role_id', response.data.user.role_id);
            }
        }
        
        // Show success message
        showToast('Login successful! Redirecting...', 'success', 2000);
        
        // Redirect based on role after short delay
        setTimeout(() => {
            const role = (response && response.data && response.data.role) ? response.data.role : 'employee';
            const roleId = (response && response.data && response.data.user && response.data.user.role_id) 
                ? response.data.user.role_id 
                : null;
            
            window.location.href = getRedirectUrl(role, roleId);
        }, 1500);
        
    } catch (error) {
        console.error('Login error:', error);
        
        // Show error message
        showToast(error.message || 'Login failed. Please try again.', 'error');
        
        // Clear password on error
        passwordInput.value = '';
        passwordInput.focus();
        
    } finally {
        // Reset loading state
        setLoadingState(false);
    }
}

/**
 * Handle input focus
 * @param {Event} event - Input focus event
 */
function handleInputFocus(event) {
    const errorElement = event.target.parentElement.parentElement.querySelector('.error-message');
    clearFieldError(event.target, errorElement);
}

/**
 * Handle input blur with validation
 * @param {Event} event - Input blur event
 */
function handleInputBlur(event) {
    const input = event.target;
    const errorElement = input.parentElement.parentElement.querySelector('.error-message');
    
    if (input === emailInput) {
        const validation = validateEmail(input.value);
        if (!validation.isValid) {
            showFieldError(input, errorElement, validation.errors[0]);
        }
    } else if (input === passwordInput) {
        const validation = validatePassword(input.value);
        if (!validation.isValid) {
            showFieldError(input, errorElement, validation.errors[0]);
        }
    }
}

/**
 * Handle key press events
 * @param {Event} event - Key press event
 */
function handleKeyPress(event) {
    // Allow form submission with Enter key
    if (event.key === 'Enter' && !isSubmitting) {
        handleFormSubmit(event);
    }
    
    // Clear errors on typing
    if (event.target === emailInput || event.target === passwordInput) {
        const errorElement = event.target.parentElement.parentElement.querySelector('.error-message');
        if (errorElement.textContent) {
            clearFieldError(event.target, errorElement);
        }
    }
}

// ==================== INITIALIZATION ====================
/**
 * Initialize the application
 */
function init() {
    // Load saved credentials
    loadCredentials();
    
    // Add event listeners
    loginForm.addEventListener('submit', handleFormSubmit);
    togglePasswordBtn.addEventListener('click', handleTogglePassword);
    
    // Add input event listeners
    emailInput.addEventListener('focus', handleInputFocus);
    emailInput.addEventListener('blur', handleInputBlur);
    emailInput.addEventListener('keypress', handleKeyPress);
    
    passwordInput.addEventListener('focus', handleInputFocus);
    passwordInput.addEventListener('blur', handleInputBlur);
    passwordInput.addEventListener('keypress', handleKeyPress);
    
    // Add click listener to toast for manual close
    toast.addEventListener('click', hideToast);
    
    // Auto-focus email input if empty
    if (!emailInput.value) {
        emailInput.focus();
    } else {
        passwordInput.focus();
    }
    
    // Check if user is already logged in
    const authToken = sessionStorage.getItem('auth_token');
    if (authToken) {
        showToast('You are logged in. Redirecting...', 'success', 2000);
        setTimeout(() => {
            const role = sessionStorage.getItem('user_role') || 'employee';
            let roleId = sessionStorage.getItem('user_role_id') ? parseInt(sessionStorage.getItem('user_role_id')) : null;
            
            // Try to get role_id from user_info if not stored separately
            if (!roleId) {
                try {
                    const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
                    roleId = userInfo.role_id || null;
                } catch (e) {
                    console.warn('Could not parse user_info:', e);
                }
            }
            
            window.location.href = getRedirectUrl(role, roleId);
        }, 1500);
    }
    
    console.log('Login page initialized successfully');
}

// ==================== ERROR HANDLING ====================
/**
 * Global error handler
 * @param {Error} error - Error object
 */
window.addEventListener('error', (error) => {
    console.error('Global error:', error);
    showToast('An unexpected error occurred. Please reload the page.', 'error');
});

/**
 * Handle unhandled promise rejections
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('An unexpected error occurred. Please reload the page.', 'error');
});

// ==================== START APPLICATION ====================
// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

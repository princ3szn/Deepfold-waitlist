// Waitlist Form Handler
const form = document.getElementById('waitlistForm');
const emailInput = document.getElementById('emailInput');
const statusMessage = document.getElementById('statusMessage');
const submitButton = form.querySelector('button[type="submit"]');

// Determine API URL based on environment
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : window.location.origin;

// Security: Client-side email validation
function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
}

// Form submission handler
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    
    // Validate email on client side first
    if (!email || !validateEmail(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }

    // Disable button and show loading state
    submitButton.disabled = true;
    submitButton.textContent = 'Joining...';

    try {
        // Send to backend
        const response = await fetch(`${API_URL}/api/waitlist`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });

        // Handle response
        if (!response.ok) {
            // Try to get error message from server
            let errorMessage = 'Something went wrong. Please try again.';
            
            try {
                const errorData = await response.json();
                if (errorData.message) {
                    errorMessage = errorData.message;
                }
            } catch (e) {
                // If parsing fails, use generic message
            }

            // Handle specific error codes
            if (response.status === 429) {
                errorMessage = 'Too many attempts. Please wait a moment and try again.';
            } else if (response.status === 400) {
                // Keep the server's message for validation errors
            } else if (response.status >= 500) {
                errorMessage = 'Our servers are experiencing issues. Please try again in a few moments.';
            }

            showMessage(errorMessage, 'error');
            return;
        }

        const data = await response.json();

        if (data.success) {
            showMessage('Success! Check your email to confirm your spot on the waitlist.', 'success');
            emailInput.value = '';
            
            // Optional: Track conversion with analytics
            if (window.gtag) {
                gtag('event', 'waitlist_signup', {
                    'event_category': 'engagement',
                    'event_label': 'email_submitted'
                });
            }
        } else {
            showMessage(data.message || 'Unable to process your request. Please try again.', 'error');
        }

    } catch (error) {
        // Network errors or other unexpected issues
        console.error('Error:', error);
        
        // User-friendly error message
        let userMessage = 'Unable to connect. Please check your internet connection and try again.';
        
        // Different messages for different scenarios
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            userMessage = 'Connection failed. Please check your internet and try again.';
        } else if (error.name === 'AbortError') {
            userMessage = 'Request timed out. Please try again.';
        }
        
        showMessage(userMessage, 'error');
    } finally {
        // Always re-enable button
        submitButton.disabled = false;
        submitButton.textContent = 'Join Waitlist';
    }
});

// Display status message
function showMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}
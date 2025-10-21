// Waitlist Form Handler
const form = document.getElementById('waitlistForm');
const emailInput = document.getElementById('emailInput');
const statusMessage = document.getElementById('statusMessage');
const submitButton = form.querySelector('button[type="submit"]');

// Security: Client-side email validation
function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
}

// Form submission handler
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    
    console.log('🔵 Form submitted with email:', email);
    
    // Validate email on client side first
    if (!email || !validateEmail(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }

    // Disable button and show loading state
    submitButton.disabled = true;
    submitButton.textContent = 'Joining...';

    try {
        console.log('🔵 Sending request to server...');
        
        // Send to backend
        const response = await fetch('http://localhost:3000/api/waitlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });

        console.log('🔵 Response status:', response.status);
        
        const data = await response.json();
        console.log('🔵 Response data:', data);

        if (data.success) {
            showMessage('Success! Check your email to confirm your spot on the waitlist.', 'success');
            emailInput.value = '';
        } else {
            showMessage(data.message || 'Something went wrong. Please try again.', 'error');
        }

    } catch (error) {
        console.error('🔴 Network error:', error);
        showMessage('Could not connect to server. Make sure the server is running on port 3000.', 'error');
    } finally {
        // Re-enable button
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
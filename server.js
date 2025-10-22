const express = require('express');
const cors = require('cors');
const SibApiV3Sdk = require('@getbrevo/brevo');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Rate limiting to prevent abuse
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 3; // 3 attempts per minute per IP

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.vercel.app', 'https://deepfold.com'] // Add your actual domain
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('.')); // Serve your HTML/CSS/JS files

// Security: Input sanitization
function sanitizeEmail(email) {
    if (!email) return null;
    // Remove any HTML tags, scripts, and dangerous characters
    return email
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[<>(){}[\]\\\/]/g, '') // Remove dangerous characters
        .substring(0, 254); // RFC 5321 max email length
}

// Security: Advanced email validation
function validateEmail(email) {
    if (!email) return false;
    
    // RFC 5322 compliant regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(email)) return false;
    
    // Additional checks
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    
    const [localPart, domain] = parts;
    
    // Local part checks
    if (localPart.length === 0 || localPart.length > 64) return false;
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
    if (localPart.includes('..')) return false;
    
    // Domain checks
    if (domain.length === 0 || domain.length > 253) return false;
    if (domain.startsWith('-') || domain.endsWith('-')) return false;
    if (!domain.includes('.')) return false;
    
    // Block obviously fake/temporary emails
    const disposableDomains = ['tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com'];
    if (disposableDomains.some(d => domain.includes(d))) return false;
    
    return true;
}

// Security: Rate limiting middleware
function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }
    
    const requests = rateLimitMap.get(ip).filter(time => now - time < RATE_LIMIT_WINDOW);
    
    if (requests.length >= MAX_REQUESTS_PER_WINDOW) {
        console.log(`🚫 Rate limit exceeded for IP: ${ip}`);
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again in a minute.'
        });
    }
    
    requests.push(now);
    rateLimitMap.set(ip, requests);
    
    // Cleanup old entries every hour
    if (Math.random() < 0.01) {
        for (const [key, times] of rateLimitMap.entries()) {
            const validTimes = times.filter(time => now - time < RATE_LIMIT_WINDOW);
            if (validTimes.length === 0) {
                rateLimitMap.delete(key);
            } else {
                rateLimitMap.set(key, validTimes);
            }
        }
    }
    
    next();
}

// Initialize Brevo API
const apiInstance = new SibApiV3Sdk.ContactsApi();
const apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;

// Endpoint to add contact to waitlist
app.post('/api/waitlist', rateLimitMiddleware, async (req, res) => {
    console.log('\n🔔 NEW REQUEST RECEIVED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const rawEmail = req.body?.email;
    console.log(`📩 Raw email received: ${rawEmail}`);
    console.log(`🌐 Request IP: ${req.ip || req.connection.remoteAddress}`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);

    // Security: Sanitize input
    const sanitizedEmail = sanitizeEmail(rawEmail);
    
    if (!sanitizedEmail) {
        console.log('❌ Email is missing or invalid after sanitization');
        return res.status(400).json({ 
            success: false, 
            message: 'Email address is required' 
        });
    }

    // Security: Validate email format
    if (!validateEmail(sanitizedEmail)) {
        console.log(`❌ Email validation failed: ${sanitizedEmail}`);
        return res.status(400).json({ 
            success: false, 
            message: 'Please enter a valid email address' 
        });
    }

    const email = sanitizedEmail;
    console.log(`✅ Email sanitized and validated: ${email}`);

    try {
        console.log(`\n📧 Processing waitlist signup for: ${email}`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);
        console.log(`🔑 Using API Key: ${process.env.BREVO_API_KEY ? '✅ Set' : '❌ NOT SET'}`);
        console.log(`📧 Sender Email: ${process.env.SENDER_EMAIL || 'NOT SET'}`);

        // Create contact in Brevo
        const createContact = new SibApiV3Sdk.CreateContact();
        createContact.email = email;
        createContact.listIds = [4]; // Deepfold list ID
        createContact.updateEnabled = false; // Update if contact already exists

        console.log(`📝 Attempting to add contact to list ID: [4]`);
        const contactResult = await apiInstance.createContact(createContact);
        console.log(`✅ Contact added to Brevo successfully!`);
        console.log(`   Contact ID: ${contactResult.id || 'N/A'}`);

        // Send confirmation email
        const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();
        emailApi.authentications['apiKey'].apiKey = process.env.BREVO_API_KEY;

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.sender = { 
            name: 'Deepfold', 
            email: process.env.SENDER_EMAIL || 'deepfold.025@gmail.com' // Add to .env file
        };
        sendSmtpEmail.to = [{ email: email }];
        sendSmtpEmail.subject = 'Welcome to Deepfold Waitlist!';
        sendSmtpEmail.htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #4d9fff, #6b5fff); color: white; padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 40px 20px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; background: #4d9fff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>DEEPFOLD</h1>
                        <p>You're on the waitlist!</p>
                    </div>
                    <div class="content">
                        <h2>Welcome to Deepfold! 🎨</h2>
                        <p>Thank you for joining our waitlist! We're excited to have you as one of the first to experience our premium design marketplace.</p>
                        <p>Here's what happens next:</p>
                        <ul>
                            <li>You'll receive early access when we launch</li>
                            <li>Exclusive discounts for waitlist members</li>
                            <li>First look at our curated design collections</li>
                        </ul>
                        <p>We're working hard to bring you the best design marketplace for print-on-demand creators. Stay tuned!</p>
                        <div class="footer">
                            <p>© 2025 Deepfold. All rights reserved.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        console.log(`📨 Attempting to send email...`);
        const emailResult = await emailApi.sendTransacEmail(sendSmtpEmail);
        console.log(`✅ Email sent successfully!`);
        console.log(`   Message ID: ${emailResult.messageId}`);
        console.log(`   Response:`, JSON.stringify(emailResult, null, 2));
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        res.json({ 
            success: true, 
            message: 'Successfully added to waitlist!' 
        });

    } catch (error) {
        console.error('❌ ERROR OCCURRED:');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Full error:', error);
        console.error('Error message:', error.message);
        console.error('Error response:', error.response?.body || 'No response body');
        console.error('Error status:', error.response?.status || 'No status');
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        // Handle duplicate contact error
        if (error.response && (error.response.body?.code === 'duplicate_parameter' || error.response.data?.code === 'duplicate_parameter')) {
    return res.status(400).json({ 
        success: false, 
        message: 'This email is already on the waitlist!' 
    });
}

        res.status(500).json({ 
            success: false, 
            message: 'Something went wrong. Please try again.' 
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log('\n🚀 DEEPFOLD WAITLIST SERVER');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📡 Waitlist endpoint: POST http://localhost:${PORT}/api/waitlist`);
    console.log(`\n🔐 SECURITY STATUS:`);
    console.log(`   ✅ Rate limiting enabled (${MAX_REQUESTS_PER_WINDOW} req/min)`);
    console.log(`   ✅ Input sanitization enabled`);
    console.log(`   ✅ Email validation enabled`);
    console.log(`   ✅ CORS configured`);
    console.log(`\n⚙️  CONFIGURATION:`);
    console.log(`   API Key: ${process.env.BREVO_API_KEY ? '✅ Set' : '❌ NOT SET'}`);
    console.log(`   Sender Email: ${process.env.SENDER_EMAIL || '❌ NOT SET'}`);
    console.log(`   List ID: 4 (Deepfold waitlist)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  IMPORTANT: If you get 401 errors, regenerate your API key in Brevo!\n');
    console.log('💡 TIP: Submit a test email and watch this console for logs\n');
});
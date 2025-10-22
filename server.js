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
        ? ['https://deepfold-waitlist.vercel.app', 'https://deepfold.com']
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('.'));

// Security: Input sanitization
function sanitizeEmail(email) {
    if (!email) return null;
    return email
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[<>(){}[\]\\\/]/g, '')
        .substring(0, 254);
}

// Security: Advanced email validation
function validateEmail(email) {
    if (!email) return false;
    
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(email)) return false;
    
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    
    const [localPart, domain] = parts;
    
    if (localPart.length === 0 || localPart.length > 64) return false;
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
    if (localPart.includes('..')) return false;
    
    if (domain.length === 0 || domain.length > 253) return false;
    if (domain.startsWith('-') || domain.endsWith('-')) return false;
    if (!domain.includes('.')) return false;
    
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
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again in a minute.'
        });
    }
    
    requests.push(now);
    rateLimitMap.set(ip, requests);
    
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
    const rawEmail = req.body?.email;

    // Security: Sanitize input
    const sanitizedEmail = sanitizeEmail(rawEmail);
    
    if (!sanitizedEmail) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email address is required' 
        });
    }

    // Security: Validate email format
    if (!validateEmail(sanitizedEmail)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Please enter a valid email address' 
        });
    }

    const email = sanitizedEmail;

    try {
        // Create contact in Brevo
        const createContact = new SibApiV3Sdk.CreateContact();
        createContact.email = email;
        createContact.listIds = [4];
        createContact.updateEnabled = false; // Reject duplicates

        await apiInstance.createContact(createContact);

        // Send confirmation email
        const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();
        emailApi.authentications['apiKey'].apiKey = process.env.BREVO_API_KEY;

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.sender = { 
            name: 'Deepfold', 
            email: process.env.SENDER_EMAIL || 'deepfold.025@gmail.com'
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
                        <h2>Welcome to Deepfold!</h2>
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

        await emailApi.sendTransacEmail(sendSmtpEmail);

        res.json({ 
            success: true, 
            message: 'Successfully added to waitlist!' 
        });

    } catch (error) {
        // Handle duplicate contact
        if (error.response?.body?.code === 'duplicate_parameter' ||
            error.response?.body?.message?.toLowerCase().includes('contact already exist') ||
            error.response?.body?.message?.toLowerCase().includes('already exists')) {
            return res.status(400).json({ 
                success: false, 
                message: 'This email is already on the waitlist!' 
            });
        }

        // Handle unauthorized
        if (error.response?.status === 401 || error.response?.statusCode === 401) {
            return res.status(500).json({ 
                success: false, 
                message: 'Configuration error. Please try again later.' 
            });
        }

        res.status(500).json({ 
            success: false, 
            message: 'Something went wrong. Please try again.' 
        });
    }
});

// Start server (works for both local and Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
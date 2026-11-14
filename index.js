import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

// Normalize URL paths to clean duplicate slashes (e.g. //api/contact -> /api/contact)
app.use((req, res, next) => {
  if (req.url && req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'https://portfolio-frontend-ecru-zeta.vercel.app';

// Security Headers with Helmet
app.use(helmet());

// CORS Configuration
const allowedOrigins = [
  CLIENT_URL,
  'https://portfolio-frontend-ecru-zeta.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);

      // Normalize origin by removing trailing slashes
      const cleanOrigin = origin.replace(/\/+$/, '');
      const isAllowed = allowedOrigins.some(allowed => {
        if (!allowed) return false;
        return allowed.replace(/\/+$/, '') === cleanOrigin;
      }) || cleanOrigin.endsWith('.vercel.app');

      if (isAllowed) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy: Access denied for origin ${origin}.`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  })
);

// Body parser
app.use(express.json({ limit: '50kb' }));

// Rate Limiter: Max 5 contact submissions per 15 minutes per IP
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many contact submissions from this IP. Please wait 15 minutes or email directly.'
  }
});

// Helper: Sanitize string to prevent injection
const sanitize = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim();
};

// Root welcome endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Gagan Kumar Portfolio Backend API is running successfully!',
    health: '/api/health',
    contactEndpoint: 'POST /api/contact'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Contact API Endpoint
app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message, hp_field } = req.body;

    // 1. Honeypot check (Spam protection)
    if (hp_field) {
      console.warn('[SPAM DETECTED] Honeypot triggered.');
      return res.status(200).json({
        success: true,
        message: 'Message received.'
      });
    }

    // 2. Input validation & sanitization
    const cleanName = sanitize(name);
    const cleanEmail = sanitize(email);
    const cleanSubject = sanitize(subject);
    const cleanMessage = sanitize(message);

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name is required and must be at least 2 characters.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required.'
      });
    }

    if (!cleanSubject || cleanSubject.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Subject must be at least 3 characters.'
      });
    }

    if (!cleanMessage || cleanMessage.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters long.'
      });
    }

    // 3. Nodemailer Configuration
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_APP_PASSWORD ? process.env.EMAIL_APP_PASSWORD.replace(/\s+/g, '') : '';
    const recipientEmail = 'gagankumar1102.3@gmail.com';

    if (!emailUser || !emailPass) {
      console.error('[CONFIG ERROR] EMAIL_USER or EMAIL_APP_PASSWORD is not set in environment.');
      return res.status(503).json({
        success: false,
        message: 'Mail server credentials not configured. Please use direct email to gagankumar1102.3@gmail.com.'
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    // 4. Construct Email
    const mailOptions = {
      from: `"Portfolio Contact Form" <${emailUser}>`,
      to: recipientEmail,
      replyTo: cleanEmail,
      subject: `[Portfolio Inquiry] ${cleanSubject}`,
      text: `You have received a new message from your portfolio contact form:\n\nName: ${cleanName}\nEmail: ${cleanEmail}\nSubject: ${cleanSubject}\n\nMessage:\n${cleanMessage}\n\n---\nSent on: ${new Date().toLocaleString()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
          <h2 style="color: #4f46e5; margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px;">New Portfolio Contact Message</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569; width: 100px;">From:</td>
              <td style="padding: 8px 0; color: #0f172a;">${cleanName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Email:</td>
              <td style="padding: 8px 0; color: #0f172a;"><a href="mailto:${cleanEmail}" style="color: #4f46e5;">${cleanEmail}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Subject:</td>
              <td style="padding: 8px 0; color: #0f172a;">${cleanSubject}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Received:</td>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">${new Date().toLocaleString()}</td>
            </tr>
          </table>

          <div style="background-color: #ffffff; padding: 18px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
            <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Message Content:</h3>
            <p style="color: #1e293b; white-space: pre-wrap; line-height: 1.6; margin-bottom: 0;">${cleanMessage}</p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 0;">
            This email was sent from your portfolio contact form at <a href="${CLIENT_URL}" style="color: #6366f1;">${CLIENT_URL}</a>. You can reply directly to this email to contact ${cleanName}.
          </p>
        </div>
      `
    };

    // 5. Send Email
    await transporter.sendMail(mailOptions);
    console.log(`[SUCCESS] Contact email sent successfully from ${cleanEmail} to ${recipientEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully!'
    });
  } catch (error) {
    console.error('[ERROR sending contact email]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message via Gmail. Please use the direct email link or try again later.',
      error: error.message,
      code: error.code || error.responseCode
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Portfolio API Server running on port ${PORT}`);
  console.log(`Allowed client origin: ${CLIENT_URL}`);
});

// require('dotenv').config();

// const config = {
//   server: {
//     port: process.env.PORT || 4005,
//     environment: process.env.NODE_ENV || 'development'
//   },
//   database: {
//     uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_notifications'
//   },
//   services: {
//     authApiUrl: process.env.AUTH_API_URL || 'http://localhost:4001/api',
//     syncApiUrl: process.env.SYNC_API_URL || 'http://localhost:4002/api',
//     portfolioApiUrl: process.env.PORTFOLIO_API_URL || 'http://localhost:4003/api',
//     marketApiUrl: process.env.MARKET_API_URL || 'http://localhost:4004/api'
//   },
//   alerts: {
//     checkIntervalMinutes: parseInt(process.env.ALERT_CHECK_INTERVAL_MINUTES) || 5,
//     enableEngine: process.env.ENABLE_ALERT_ENGINE === 'true',
//     maxPerPerson: parseInt(process.env.MAX_ALERTS_PER_PERSON) || 100
//   },
//   email: {
//     enabled: process.env.ENABLE_EMAIL === 'true',
//     sendgridApiKey: process.env.SENDGRID_API_KEY,
//     from: process.env.EMAIL_FROM || 'noreply@example.com',
//     fromName: process.env.EMAIL_FROM_NAME || 'Portfolio Tracker'
//   },
//   sms: {
//     enabled: process.env.ENABLE_SMS === 'true',
//     twilioSid: process.env.TWILIO_ACCOUNT_SID,
//     twilioToken: process.env.TWILIO_AUTH_TOKEN,
//     twilioPhone: process.env.TWILIO_PHONE_NUMBER
//   },
//   push: {
//     enabled: process.env.ENABLE_PUSH === 'true',
//     fcmServerKey: process.env.FCM_SERVER_KEY
//   },
//   webhooks: {
//     enabled: process.env.ENABLE_WEBHOOKS === 'true',
//     secret: process.env.WEBHOOK_SECRET || 'default-webhook-secret',
//     timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5000,
//     maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3
//   },
//   rateLimit: {
//     notificationsPerHour: parseInt(process.env.MAX_NOTIFICATIONS_PER_HOUR) || 50,
//     alertsPerDay: parseInt(process.env.MAX_ALERTS_PER_DAY) || 200
//   },
//   logging: {
//     level: process.env.LOG_LEVEL || 'info'
//   },
//   cors: {
//     origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
//     credentials: true
//   }
// };

// module.exports = config;

email: {
    enabled: process.env.EMAIL_ENABLED !== 'false',
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    fromName: process.env.EMAIL_FROM_NAME || 'Questrade Tracker',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@questrade.com'
  },
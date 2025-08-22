const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const notificationSender = require('../services/notificationSender');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson, validateNotificationSend } = require('../middleware/validateRequest');

// Get all notifications
router.get('/', asyncHandler(async (req, res) => {
  const { status, channel, limit = 100 } = req.query;
  
  const filter = {};
  if (status) filter.status = status;
  if (channel) filter.channel = channel;
  
  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));
  
  res.json({
    success: true,
    data: notifications
  });
}));

// Get notifications for a person
router.get('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { unreadOnly, channel, limit = 50 } = req.query;
  
  const options = {
    unreadOnly: unreadOnly === 'true',
    channel,
    limit: parseInt(limit)
  };
  
  const notifications = await Notification.getForPerson(personName, options);
  
  res.json({
    success: true,
    data: notifications
  });
}));

// Get specific notification
router.get('/detail/:notificationId', asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  
  const notification = await Notification.findOne({ notificationId });
  
  if (!notification) {
    return res.status(404).json({
      success: false,
      error: 'Notification not found'
    });
  }
  
  res.json({
    success: true,
    data: notification
  });
}));

// Send notification manually
router.post('/send', validateNotificationSend, asyncHandler(async (req, res) => {
  const notificationData = req.body;
  
  const notification = await notificationSender.sendNotification(notificationData);
  
  res.status(201).json({
    success: true,
    data: notification,
    message: 'Notification sent successfully'
  });
}));

// Mark notification as read
router.put('/:notificationId/read', asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  
  const notification = await Notification.findOne({ notificationId });
  
  if (!notification) {
    return res.status(404).json({
      success: false,
      error: 'Notification not found'
    });
  }
  
  await notification.markAsRead();
  
  res.json({
    success: true,
    data: notification,
    message: 'Notification marked as read'
  });
}));

// Mark all as read for a person
router.put('/person/:personName/read-all', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const result = await Notification.updateMany(
    { personName, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  
  res.json({
    success: true,
    message: `Marked ${result.modifiedCount} notifications as read`
  });
}));

// Delete notification
router.delete('/:notificationId', asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  
  const result = await Notification.deleteOne({ notificationId });
  
  if (result.deletedCount === 0) {
    return res.status(404).json({
      success: false,
      error: 'Notification not found'
    });
  }
  
  res.json({
    success: true,
    message: 'Notification deleted successfully'
  });
}));

// Resend failed notification
router.post('/:notificationId/resend', asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  
  const notification = await Notification.findOne({ notificationId });
  
  if (!notification) {
    return res.status(404).json({
      success: false,
      error: 'Notification not found'
    });
  }
  
  // Reset status to pending for retry
  notification.status = 'pending';
  notification.retryCount = 0;
  await notification.save();
  
  // Process immediately
  await notificationSender.processNotification(notification);
  
  res.json({
    success: true,
    data: notification,
    message: 'Notification queued for resending'
  });
}));

// Test email notification
router.post('/test/email', asyncHandler(async (req, res) => {
  const { to, subject = 'Test Email', message = 'This is a test email' } = req.body;
  
  if (!to) {
    return res.status(400).json({
      success: false,
      error: 'Email address is required'
    });
  }
  
  const result = await notificationSender.sendEmail({
    to,
    subject,
    message,
    template: 'alert',
    templateData: {
      alertType: 'Test Alert',
      message,
      currentValue: 'N/A',
      threshold: 'N/A'
    }
  });
  
  res.json({
    success: true,
    data: result,
    message: 'Test email sent'
  });
}));

// Get notification statistics
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const { personName, days = 7 } = req.query;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));
  
  const filter = { createdAt: { $gte: startDate } };
  if (personName) filter.personName = personName;
  
  const stats = await Notification.aggregate([
    { $match: filter },
    {
      $group: {
        _id: {
          status: '$status',
          channel: '$channel'
        },
        count: { $sum: 1 }
      }
    }
  ]);
  
  const byChannel = {};
  const byStatus = {};
  
  stats.forEach(stat => {
    const channel = stat._id.channel;
    const status = stat._id.status;
    
    if (!byChannel[channel]) byChannel[channel] = 0;
    if (!byStatus[status]) byStatus[status] = 0;
    
    byChannel[channel] += stat.count;
    byStatus[status] += stat.count;
  });
  
  res.json({
    success: true,
    data: {
      period: `${days} days`,
      total: await Notification.countDocuments(filter),
      byChannel,
      byStatus,
      detailed: stats
    }
  });
}));

module.exports = router;
const express = require('express');
const router = express.Router();
const NotificationPreference = require('../models/NotificationPreference');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson } = require('../middleware/validateRequest');

// Get preferences for a person
router.get('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  let preferences = await NotificationPreference.findOne({ personName });
  
  if (!preferences) {
    // Create default preferences
    preferences = new NotificationPreference({ personName });
    await preferences.save();
  }
  
  res.json({
    success: true,
    data: preferences
  });
}));

// Update preferences
router.put('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const updates = req.body;
  
  let preferences = await NotificationPreference.findOne({ personName });
  
  if (!preferences) {
    preferences = new NotificationPreference({ personName });
  }
  
  // Update nested objects carefully
  if (updates.channels) {
    Object.assign(preferences.channels, updates.channels);
  }
  if (updates.alertTypes) {
    Object.assign(preferences.alertTypes, updates.alertTypes);
  }
  if (updates.schedule) {
    Object.assign(preferences.schedule, updates.schedule);
  }
  if (updates.limits) {
    Object.assign(preferences.limits, updates.limits);
  }
  
  // Update top-level fields
  if (updates.enabled !== undefined) {
    preferences.enabled = updates.enabled;
  }
  
  await preferences.save();
  
  res.json({
    success: true,
    data: preferences,
    message: 'Preferences updated successfully'
  });
}));

// Subscribe to channel
router.post('/:personName/subscribe', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { channel, address } = req.body;
  
  if (!channel) {
    return res.status(400).json({
      success: false,
      error: 'Channel is required'
    });
  }
  
  let preferences = await NotificationPreference.findOne({ personName });
  
  if (!preferences) {
    preferences = new NotificationPreference({ personName });
  }
  
  // Enable channel and set address
  preferences.channels[channel].enabled = true;
  
  if (channel === 'email' && address) {
    preferences.channels.email.address = address;
  } else if (channel === 'sms' && address) {
    preferences.channels.sms.phoneNumber = address;
  } else if (channel === 'webhook' && address) {
    preferences.channels.webhook.url = address;
  }
  
  await preferences.save();
  
  res.json({
    success: true,
    data: preferences,
    message: `Subscribed to ${channel} notifications`
  });
}));

// Unsubscribe from channel
router.post('/:personName/unsubscribe', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { channel } = req.body;
  
  let preferences = await NotificationPreference.findOne({ personName });
  
  if (!preferences) {
    return res.status(404).json({
      success: false,
      error: 'Preferences not found'
    });
  }
  
  if (channel) {
    // Unsubscribe from specific channel
    preferences.channels[channel].enabled = false;
  } else {
    // Unsubscribe from all
    preferences.enabled = false;
    preferences.unsubscribedAt = new Date();
  }
  
  await preferences.save();
  
  res.json({
    success: true,
    data: preferences,
    message: channel ? `Unsubscribed from ${channel}` : 'Unsubscribed from all notifications'
  });
}));

// Verify email
router.post('/:personName/verify-email', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { token } = req.body;
  
  const preferences = await NotificationPreference.findOne({ personName });
  
  if (!preferences) {
    return res.status(404).json({
      success: false,
      error: 'Preferences not found'
    });
  }
  
  if (preferences.channels.email.verificationToken !== token) {
    return res.status(400).json({
      success: false,
      error: 'Invalid verification token'
    });
  }
  
  preferences.channels.email.verified = true;
  preferences.channels.email.verifiedAt = new Date();
  preferences.channels.email.verificationToken = undefined;
  
  await preferences.save();
  
  res.json({
    success: true,
    message: 'Email verified successfully'
  });
}));

// Add push token
router.post('/:personName/push-token', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { token, platform } = req.body;
  
  if (!token || !platform) {
    return res.status(400).json({
      success: false,
      error: 'Token and platform are required'
    });
  }
  
  let preferences = await NotificationPreference.findOne({ personName });
  
  if (!preferences) {
    preferences = new NotificationPreference({ personName });
  }
  
  // Check if token already exists
  const existingToken = preferences.channels.push.tokens.find(t => t.token === token);
  
  if (!existingToken) {
    preferences.channels.push.tokens.push({
      token,
      platform,
      addedAt: new Date()
    });
    preferences.channels.push.enabled = true;
  }
  
  await preferences.save();
  
  res.json({
    success: true,
    data: preferences,
    message: 'Push token added successfully'
  });
}));

// Remove push token
router.delete('/:personName/push-token/:token', validatePerson, asyncHandler(async (req, res) => {
  const { personName, token } = req.params;
  
  const preferences = await NotificationPreference.findOne({ personName });
  
  if (!preferences) {
    return res.status(404).json({
      success: false,
      error: 'Preferences not found'
    });
  }
  
  preferences.channels.push.tokens = preferences.channels.push.tokens.filter(
    t => t.token !== token
  );
  
  // Disable push if no tokens left
  if (preferences.channels.push.tokens.length === 0) {
    preferences.channels.push.enabled = false;
  }
  
  await preferences.save();
  
  res.json({
    success: true,
    message: 'Push token removed'
  });
}));

module.exports = router;
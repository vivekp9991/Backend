const express = require('express');
const router = express.Router();
const webhookService = require('../services/webhookService');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all webhooks
router.get('/', asyncHandler(async (req, res) => {
  const webhooks = await webhookService.getAllWebhooks();
  
  res.json({
    success: true,
    data: webhooks
  });
}));

// Register webhook
router.post('/', asyncHandler(async (req, res) => {
  const { personName, url, events, secret, headers } = req.body;
  
  if (!personName || !url || !events) {
    return res.status(400).json({
      success: false,
      error: 'Person name, URL, and events are required'
    });
  }
  
  const webhook = await webhookService.registerWebhook({
    personName,
    url,
    events,
    secret,
    headers
  });
  
  res.status(201).json({
    success: true,
    data: webhook,
    message: 'Webhook registered successfully'
  });
}));

// Update webhook
router.put('/:webhookId', asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  const updates = req.body;
  
  const webhook = await webhookService.updateWebhook(webhookId, updates);
  
  res.json({
    success: true,
    data: webhook,
    message: 'Webhook updated successfully'
  });
}));

// Delete webhook
router.delete('/:webhookId', asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  
  await webhookService.deleteWebhook(webhookId);
  
  res.json({
    success: true,
    message: 'Webhook deleted successfully'
  });
}));

// Test webhook
router.post('/:webhookId/test', asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  
  const result = await webhookService.testWebhook(webhookId);
  
  res.json({
    success: true,
    data: result,
    message: 'Webhook test completed'
  });
}));

// Webhook endpoint for receiving callbacks
router.post('/callback/:webhookId', asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  const signature = req.headers['x-webhook-signature'];
  
  // Verify webhook signature
  const isValid = webhookService.verifySignature(
    webhookId,
    req.body,
    signature
  );
  
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid signature'
    });
  }
  
  // Process webhook callback
  await webhookService.processCallback(webhookId, req.body);
  
  res.json({
    success: true,
    message: 'Webhook processed'
  });
}));

module.exports = router;
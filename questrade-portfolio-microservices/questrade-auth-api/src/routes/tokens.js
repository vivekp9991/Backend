const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all active tokens (without decrypted values)
router.get('/', asyncHandler(async (req, res) => {
  const tokens = await Token.find({ isActive: true })
    .select('personName type apiServer expiresAt lastUsed errorCount lastError createdAt')
    .sort({ personName: 1, type: 1 });
  
  res.json({
    success: true,
    data: tokens
  });
}));

// Get tokens for a specific person
router.get('/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const tokens = await Token.find({ personName, isActive: true })
    .select('type apiServer expiresAt lastUsed errorCount lastError createdAt')
    .sort({ type: 1 });
  
  res.json({
    success: true,
    data: tokens
  });
}));

// Delete expired tokens
router.delete('/expired', asyncHandler(async (req, res) => {
  const result = await Token.deleteMany({
    expiresAt: { $lt: new Date() }
  });
  
  res.json({
    success: true,
    message: `Deleted ${result.deletedCount} expired tokens`
  });
}));

// Get token statistics
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const [total, active, expired, withErrors] = await Promise.all([
    Token.countDocuments(),
    Token.countDocuments({ isActive: true, expiresAt: { $gt: new Date() } }),
    Token.countDocuments({ expiresAt: { $lt: new Date() } }),
    Token.countDocuments({ errorCount: { $gt: 0 } })
  ]);
  
  res.json({
    success: true,
    data: {
      total,
      active,
      expired,
      withErrors
    }
  });
}));

module.exports = router;
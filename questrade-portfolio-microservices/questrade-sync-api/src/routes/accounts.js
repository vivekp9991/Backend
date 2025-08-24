const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const accountSync = require('../services/accountSync');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get all accounts
router.get('/', asyncHandler(async (req, res) => {
  const { personName, type, status } = req.query;
  
  const filter = {};
  if (personName) filter.personName = personName;
  if (type) filter.type = type;
  if (status) filter.status = status;
  
  const accounts = await Account.find(filter)
    .select('-syncErrors')
    .sort({ personName: 1, isPrimary: -1, 'summary.totalEquityCAD': -1 });
  
  res.json({
    success: true,
    data: accounts
  });
}));

// Get accounts for a specific person
router.get('/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const accounts = await accountSync.getPersonAccounts(personName);
  
  res.json({
    success: true,
    data: accounts
  });
}));

// Get specific account details
router.get('/detail/:accountId', asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  
  const account = await accountSync.getAccountDetails(accountId);
  
  if (!account) {
    return res.status(404).json({
      success: false,
      error: 'Account not found'
    });
  }
  
  res.json({
    success: true,
    data: account
  });
}));

// Get account summary
router.get('/summary/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const accounts = await Account.find({ personName })
    .select('accountId type summary');
  
  const summary = accounts.reduce((acc, account) => {
    acc.totalEquityCAD += account.summary.totalEquityCAD || 0;
    acc.totalCashCAD += account.summary.cashCAD || 0;
    acc.totalMarketValueCAD += account.summary.marketValueCAD || 0;
    acc.accountCount++;
    return acc;
  }, {
    totalEquityCAD: 0,
    totalCashCAD: 0,
    totalMarketValueCAD: 0,
    accountCount: 0
  });
  
  res.json({
    success: true,
    data: summary
  });
}));

module.exports = router;
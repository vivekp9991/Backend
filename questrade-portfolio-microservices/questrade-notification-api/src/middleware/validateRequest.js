const Joi = require('joi');
const { NotificationError } = require('./errorHandler');

// Validate person name
const validatePerson = (req, res, next) => {
  const personName = req.params.personName || req.query.personName || req.body.personName;
  
  if (!personName) {
    throw new NotificationError('Person name is required', 400, 'MISSING_PERSON');
  }
  
  req.personName = personName.trim();
  next();
};

// Validate alert creation
const validateAlertCreation = (req, res, next) => {
  const schema = Joi.object({
    personName: Joi.string().required(),
    type: Joi.string().valid('price', 'percentage', 'portfolio', 'volume', 'news', 'custom').required(),
    symbol: Joi.string().when('type', {
      is: Joi.string().valid('price', 'percentage', 'volume'),
      then: Joi.required()
    }),
    condition: Joi.string().required(),
    threshold: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
    message: Joi.string(),
    severity: Joi.string().valid('low', 'medium', 'high', 'critical'),
    expiresAt: Joi.date()
  });
  
  const { error } = schema.validate(req.body);
  
  if (error) {
    throw new NotificationError(error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  
  next();
};

// Validate notification sending
const validateNotificationSend = (req, res, next) => {
  const schema = Joi.object({
    personName: Joi.string().required(),
    channel: Joi.string().valid('email', 'sms', 'push', 'webhook', 'inapp').required(),
    to: Joi.string().required(),
    subject: Joi.string().when('channel', {
      is: 'email',
      then: Joi.required()
    }),
    message: Joi.string().required(),
    template: Joi.string(),
    templateData: Joi.object(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical')
  });
  
  const { error } = schema.validate(req.body);
  
  if (error) {
    throw new NotificationError(error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  
  next();
};

// Validate rule creation
const validateRuleCreation = (req, res, next) => {
  const schema = Joi.object({
    personName: Joi.string().required(),
    name: Joi.string().required(),
    description: Joi.string(),
    type: Joi.string().valid('price', 'percentage', 'portfolio', 'volume', 'news', 'pattern', 'custom').required(),
    conditions: Joi.object({
      symbol: Joi.string(),
      metric: Joi.string(),
      operator: Joi.string().valid('above', 'below', 'equals', 'change', 'increase', 'decrease', 'between').required(),
      threshold: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
      secondaryThreshold: Joi.alternatives().try(Joi.number(), Joi.string()),
      timeframe: Joi.string(),
      frequency: Joi.string().valid('once', 'daily', 'always')
    }).required(),
    enabled: Joi.boolean(),
    notifications: Joi.object({
      channels: Joi.array().items(Joi.string().valid('email', 'sms', 'push', 'webhook', 'inapp')),
      cooldownMinutes: Joi.number().min(0),
      priority: Joi.string().valid('low', 'medium', 'high', 'critical')
    }),
    expiresAt: Joi.date()
  });
  
  const { error } = schema.validate(req.body);
  
  if (error) {
    throw new NotificationError(error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  
  next();
};

module.exports = {
  validatePerson,
  validateAlertCreation,
  validateNotificationSend,
  validateRuleCreation
};
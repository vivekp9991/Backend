const { MarketError } = require('./errorHandler');

// Validate symbol parameter
const validateSymbol = (req, res, next) => {
  const symbol = req.params.symbol || req.query.symbol || req.body.symbol;
  
  if (!symbol) {
    throw new MarketError('Symbol is required', 400, 'MISSING_SYMBOL');
  }
  
  // Basic symbol validation
  if (!/^[A-Z0-9\.\-]+$/i.test(symbol)) {
    throw new MarketError('Invalid symbol format', 400, 'INVALID_SYMBOL');
  }
  
  req.symbol = symbol.toUpperCase();
  next();
};

// Validate multiple symbols
const validateSymbols = (req, res, next) => {
  const symbols = req.query.symbols || req.body.symbols;
  
  if (!symbols) {
    throw new MarketError('Symbols are required', 400, 'MISSING_SYMBOLS');
  }
  
  const symbolList = Array.isArray(symbols) 
    ? symbols 
    : symbols.split(',').map(s => s.trim());
  
  if (symbolList.length === 0) {
    throw new MarketError('At least one symbol is required', 400, 'EMPTY_SYMBOLS');
  }
  
  if (symbolList.length > 100) {
    throw new MarketError('Maximum 100 symbols allowed', 400, 'TOO_MANY_SYMBOLS');
  }
  
  req.symbols = symbolList.map(s => s.toUpperCase());
  next();
};

// Validate person name
const validatePerson = (req, res, next) => {
  const personName = req.params.personName || req.query.personName || req.body.personName;
  
  if (!personName) {
    throw new MarketError('Person name is required', 400, 'MISSING_PERSON');
  }
  
  req.personName = personName.trim();
  next();
};

module.exports = {
  validateSymbol,
  validateSymbols,
  validatePerson
};
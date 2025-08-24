const axios = require('axios');
const CurrencyRate = require('../models/CurrencyRate');
const logger = require('../utils/logger');

class CurrencyService {
  constructor() {
    this.apiKey = '00957c0f4d4444cc9c994f568a323fa7';
    this.apiUrl = 'https://api.twelvedata.com/exchange_rate';
    this.defaultRate = 1.35; // Fallback USD/CAD rate
    this.lastFetchTime = null;
    this.cachedRate = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Fetch USD/CAD exchange rate from API
   */
  async fetchExchangeRate() {
    try {
      logger.info('[CURRENCY] Fetching USD/CAD exchange rate from TwelveData API');
      
      const response = await axios.get(this.apiUrl, {
        params: {
          symbol: 'USD/CAD',
          apikey: this.apiKey
        },
        timeout: 10000
      });

      if (response.data && response.data.rate) {
        const rate = parseFloat(response.data.rate);
        const timestamp = new Date(response.data.timestamp * 1000);
        
        // Store in database
        await CurrencyRate.upsertRate('USD', 'CAD', rate, timestamp);
        
        // Update cache
        this.cachedRate = rate;
        this.lastFetchTime = Date.now();
        
        logger.info(`[CURRENCY] Successfully fetched USD/CAD rate: ${rate}`);
        
        return rate;
      } else {
        throw new Error('Invalid response from exchange rate API');
      }
    } catch (error) {
      logger.error('[CURRENCY] Failed to fetch exchange rate:', error.message);
      
      // Try to get from database
      const dbRate = await CurrencyRate.getLatestRate('USD', 'CAD');
      if (dbRate) {
        logger.info('[CURRENCY] Using rate from database:', dbRate.rate);
        this.cachedRate = dbRate.rate;
        this.lastFetchTime = Date.now();
        return dbRate.rate;
      }
      
      // Use default rate as last resort
      logger.warn(`[CURRENCY] Using default USD/CAD rate: ${this.defaultRate}`);
      return this.defaultRate;
    }
  }

  /**
   * Get current USD/CAD exchange rate (with caching)
   */
  async getUSDtoCAD() {
    // Check if cache is valid
    if (this.cachedRate && this.lastFetchTime) {
      const cacheAge = Date.now() - this.lastFetchTime;
      if (cacheAge < this.cacheTimeout) {
        logger.debug(`[CURRENCY] Using cached USD/CAD rate: ${this.cachedRate}`);
        return this.cachedRate;
      }
    }

    // Fetch new rate
    return await this.fetchExchangeRate();
  }

  /**
   * Convert USD to CAD
   */
  async convertUSDtoCAD(amountUSD) {
    const rate = await this.getUSDtoCAD();
    return amountUSD * rate;
  }

  /**
   * Convert CAD to USD
   */
  async convertCADtoUSD(amountCAD) {
    const rate = await this.getUSDtoCAD();
    return amountCAD / rate;
  }

  /**
   * Convert any amount based on currency
   */
  async convertToCAD(amount, currency) {
    if (currency === 'CAD') {
      return amount;
    } else if (currency === 'USD') {
      return await this.convertUSDtoCAD(amount);
    } else {
      logger.warn(`[CURRENCY] Unknown currency: ${currency}, returning original amount`);
      return amount;
    }
  }

  /**
   * Start scheduled rate updates (every 5 minutes)
   */
  startScheduledUpdates() {
    // Initial fetch
    this.fetchExchangeRate().catch(err => {
      logger.error('[CURRENCY] Initial rate fetch failed:', err);
    });

    // Schedule updates every 5 minutes
    setInterval(() => {
      this.fetchExchangeRate().catch(err => {
        logger.error('[CURRENCY] Scheduled rate fetch failed:', err);
      });
    }, this.cacheTimeout);

    logger.info('[CURRENCY] Started scheduled exchange rate updates (every 5 minutes)');
  }

  /**
   * Get exchange rate history
   */
  async getRateHistory(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const rates = await CurrencyRate.find({
      fromCurrency: 'USD',
      toCurrency: 'CAD',
      timestamp: { $gte: startDate }
    }).sort({ timestamp: -1 });

    return rates;
  }
}

module.exports = new CurrencyService();
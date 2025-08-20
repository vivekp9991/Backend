const axios = require('axios');
const pLimit = require('p-limit');
const config = require('../config/environment');
const logger = require('../utils/logger');

class QuestradeClient {
  constructor() {
    this.authApiUrl = config.authApi.url;
    this.rateLimiter = pLimit(config.rateLimit.maxConcurrent);
    this.requestsThisSecond = 0;
    this.lastResetTime = Date.now();
  }

  // Rate limiting logic
  async waitForRateLimit() {
    const now = Date.now();
    
    // Reset counter every second
    if (now - this.lastResetTime >= 1000) {
      this.requestsThisSecond = 0;
      this.lastResetTime = now;
    }
    
    // If we've hit the limit, wait until next second
    if (this.requestsThisSecond >= config.rateLimit.questradePerSecond) {
      const waitTime = 1000 - (now - this.lastResetTime);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestsThisSecond = 0;
        this.lastResetTime = Date.now();
      }
    }
    
    this.requestsThisSecond++;
  }

  // Get valid access token from Auth API
  async getAccessToken(personName) {
    try {
      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${personName}`,
        {
          headers: {
            'x-api-key': config.authApi.apiKey
          }
        }
      );
      
      return response.data.data;
    } catch (error) {
      logger.error(`Failed to get access token for ${personName}:`, error.message);
      throw new Error(`Authentication failed for ${personName}: ${error.message}`);
    }
  }

  // Make authenticated request to Questrade API
  async makeRequest(personName, endpoint, method = 'GET', data = null) {
    return this.rateLimiter(async () => {
      await this.waitForRateLimit();
      
      const tokenData = await this.getAccessToken(personName);
      const url = `${tokenData.apiServer}/v1/${endpoint}`;
      
      try {
        const response = await axios({
          method,
          url,
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          },
          data,
          timeout: 15000
        });
        
        return response.data;
      } catch (error) {
        if (error.response) {
          logger.error(`Questrade API error for ${personName}:`, {
            endpoint,
            status: error.response.status,
            data: error.response.data
          });
          
          // Token expired - try to refresh
          if (error.response.status === 401) {
            logger.info(`Token expired for ${personName}, refreshing...`);
            
            // Trigger token refresh via Auth API
            await axios.post(
              `${this.authApiUrl}/auth/refresh-token/${personName}`,
              {},
              {
                headers: {
                  'x-api-key': config.authApi.apiKey
                }
              }
            );
            
            // Retry the request once
            return this.makeRequest(personName, endpoint, method, data);
          }
        }
        
        throw error;
      }
    });
  }

  // Account endpoints
  async getAccounts(personName) {
    const response = await this.makeRequest(personName, 'accounts');
    return response.accounts || [];
  }

  async getAccountBalances(personName, accountId) {
    const response = await this.makeRequest(personName, `accounts/${accountId}/balances`);
    return response;
  }

  async getAccountPositions(personName, accountId) {
    const response = await this.makeRequest(personName, `accounts/${accountId}/positions`);
    return response.positions || [];
  }

  async getAccountActivities(personName, accountId, startDate, endDate) {
    const params = new URLSearchParams();
    if (startDate) params.append('startTime', startDate.toISOString());
    if (endDate) params.append('endTime', endDate.toISOString());
    
    const endpoint = `accounts/${accountId}/activities?${params.toString()}`;
    const response = await this.makeRequest(personName, endpoint);
    return response.activities || [];
  }

  async getAccountOrders(personName, accountId, options = {}) {
    const params = new URLSearchParams();
    if (options.stateFilter) params.append('stateFilter', options.stateFilter);
    if (options.startTime) params.append('startTime', options.startTime.toISOString());
    if (options.endTime) params.append('endTime', options.endTime.toISOString());
    
    const endpoint = `accounts/${accountId}/orders?${params.toString()}`;
    const response = await this.makeRequest(personName, endpoint);
    return response.orders || [];
  }

  // Market data endpoints
  async getSymbol(personName, symbolId) {
    const response = await this.makeRequest(personName, `symbols/${symbolId}`);
    return response.symbols?.[0] || null;
  }

  async searchSymbols(personName, prefix) {
    const response = await this.makeRequest(personName, `symbols/search?prefix=${prefix}`);
    return response.symbols || [];
  }

  async getQuote(personName, symbolId) {
    const response = await this.makeRequest(personName, `markets/quotes?ids=${symbolId}`);
    return response.quotes?.[0] || null;
  }

  async getQuotes(personName, symbolIds) {
    const ids = symbolIds.join(',');
    const response = await this.makeRequest(personName, `markets/quotes?ids=${ids}`);
    return response.quotes || [];
  }

  // Time endpoint (useful for testing)
  async getTime(personName) {
    const response = await this.makeRequest(personName, 'time');
    return response.time;
  }
}

module.exports = new QuestradeClient();
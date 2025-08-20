const PortfolioSnapshot = require('../models/PortfolioSnapshot');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const Decimal = require('decimal.js');

class PortfolioCalculator {
  constructor() {
    this.syncApiUrl = config.services.syncApiUrl;
  }

  /**
   * Fetch data from Sync API
   */
  async fetchFromSyncApi(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.syncApiUrl}${endpoint}`, { params });
      return response.data;
    } catch (error) {
      logger.error(`Error fetching from Sync API ${endpoint}:`, error.message);
      throw new Error(`Failed to fetch data from Sync API: ${error.message}`);
    }
  }

  /**
   * Get complete portfolio summary
   */
  async getPortfolioSummary(personName) {
    try {
      // Fetch all required data
      const [accountsResponse, positionsResponse, activitiesResponse] = await Promise.all([
        this.fetchFromSyncApi(`/accounts/${personName}`),
        this.fetchFromSyncApi(`/positions/person/${personName}`),
        this.fetchFromSyncApi(`/activities/person/${personName}`, { limit: 50 })
      ]);

      const accounts = accountsResponse.data || [];
      const positions = positionsResponse.data || [];
      const activities = activitiesResponse.data || [];

      // Calculate portfolio value
      const portfolioValue = await this.calculatePortfolioValue(personName);
      
      // Calculate holdings
      const holdings = await this.calculateHoldings(personName);
      
      // Get latest snapshot for day change
      const latestSnapshot = await PortfolioSnapshot.getLatest(personName);
      
      let dayChange = {
        amount: 0,
        percentage: 0
      };
      
      if (latestSnapshot && latestSnapshot.dayChange) {
        dayChange = latestSnapshot.dayChange;
      }

      return {
        overview: {
          totalValue: portfolioValue.totalValueCAD,
          totalCash: portfolioValue.totalCash,
          totalMarketValue: portfolioValue.totalMarketValue,
          dayChange,
          lastUpdated: new Date()
        },
        accounts: accounts.map(acc => ({
          accountId: acc.accountId,
          type: acc.type,
          value: acc.summary?.totalEquityCAD || 0,
          cash: acc.summary?.cashCAD || 0
        })),
        holdings: {
          count: holdings.count,
          totalValue: holdings.totalValue,
          holdings: holdings.holdings,
          topHoldings: holdings.topHoldings.map(h => ({
            symbol: h.symbol,
            value: h.marketValue,
            percentage: h.percentage,
            quantity: h.quantity,
            marketValue: h.marketValue
          }))
        },
        recentActivity: activities.slice(0, 10).map(activity => ({
          date: activity.transactionDate,
          type: activity.type,
          symbol: activity.symbol,
          amount: activity.netAmount
        }))
      };
    } catch (error) {
      logger.error(`Error getting portfolio summary for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate total portfolio value
   */
  async calculatePortfolioValue(personName) {
    try {
      const accountsResponse = await this.fetchFromSyncApi(`/accounts/${personName}`);
      const accounts = accountsResponse.data || [];

      let totalValueCAD = new Decimal(0);
      let totalCash = new Decimal(0);
      let totalMarketValue = new Decimal(0);

      accounts.forEach(account => {
        if (account.summary) {
          totalValueCAD = totalValueCAD.plus(account.summary.totalEquityCAD || 0);
          totalCash = totalCash.plus(account.summary.cashCAD || 0);
          totalMarketValue = totalMarketValue.plus(account.summary.marketValueCAD || 0);
        }
      });

      return {
        totalValueCAD: totalValueCAD.toNumber(),
        totalCash: totalCash.toNumber(),
        totalMarketValue: totalMarketValue.toNumber(),
        accountCount: accounts.length
      };
    } catch (error) {
      logger.error(`Error calculating portfolio value for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate holdings with aggregation across accounts
   */
  async calculateHoldings(personName) {
    try {
      const positionsResponse = await this.fetchFromSyncApi(`/positions/person/${personName}`);
      const positions = positionsResponse.data || [];

      // Aggregate positions by symbol
      const holdingsMap = new Map();

      positions.forEach(position => {
        if (!holdingsMap.has(position.symbol)) {
          holdingsMap.set(position.symbol, {
            symbol: position.symbol,
            totalQuantity: 0,
            totalCost: new Decimal(0),
            marketValue: new Decimal(0),
            unrealizedPnL: new Decimal(0),
            dayPnL: new Decimal(0),
            accounts: []
          });
        }

        const holding = holdingsMap.get(position.symbol);
        holding.totalQuantity += position.openQuantity;
        holding.totalCost = holding.totalCost.plus(position.totalCost || 0);
        holding.marketValue = holding.marketValue.plus(position.currentMarketValue || 0);
        holding.unrealizedPnL = holding.unrealizedPnL.plus(position.openPnl || 0);
        holding.dayPnL = holding.dayPnL.plus(position.dayPnl || 0);
        holding.accounts.push(position.accountId);
      });

      // Convert to array and calculate percentages
      const totalMarketValue = Array.from(holdingsMap.values())
        .reduce((sum, h) => sum.plus(h.marketValue), new Decimal(0));

      const holdings = Array.from(holdingsMap.values()).map(holding => {
        const marketValueNum = holding.marketValue.toNumber();
        const percentage = totalMarketValue.gt(0) 
          ? holding.marketValue.div(totalMarketValue).mul(100).toNumber() 
          : 0;

        return {
          symbol: holding.symbol,
          quantity: holding.totalQuantity,
          averagePrice: holding.totalQuantity > 0 
            ? holding.totalCost.div(holding.totalQuantity).toNumber() 
            : 0,
          marketValue: marketValueNum,
          totalCost: holding.totalCost.toNumber(),
          unrealizedPnL: holding.unrealizedPnL.toNumber(),
          unrealizedPnLPercent: holding.totalCost.gt(0) 
            ? holding.unrealizedPnL.div(holding.totalCost).mul(100).toNumber() 
            : 0,
          dayPnL: holding.dayPnL.toNumber(),
          percentage,
          accountCount: holding.accounts.length
        };
      });

      // Sort by market value
      holdings.sort((a, b) => b.marketValue - a.marketValue);

      return {
        count: holdings.length,
        totalValue: totalMarketValue.toNumber(),
        holdings,
        topHoldings: holdings.slice(0, 10)
      };
    } catch (error) {
      logger.error(`Error calculating holdings for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Create a new portfolio snapshot
   */
  async createSnapshot(personName) {
    try {
      logger.info(`Creating portfolio snapshot for ${personName}`);

      // Get current portfolio data
      const [portfolioValue, holdings, accountsResponse] = await Promise.all([
        this.calculatePortfolioValue(personName),
        this.calculateHoldings(personName),
        this.fetchFromSyncApi(`/accounts/${personName}`)
      ]);

      const accounts = accountsResponse.data || [];

      // Get previous snapshot for comparison
      const previousSnapshot = await PortfolioSnapshot.getLatest(personName);

      // Calculate day change
      let dayChange = {
        amount: 0,
        percentage: 0
      };

      if (previousSnapshot) {
        dayChange.amount = portfolioValue.totalValueCAD - previousSnapshot.totalValueCAD;
        dayChange.percentage = previousSnapshot.totalValueCAD > 0 
          ? (dayChange.amount / previousSnapshot.totalValueCAD) * 100 
          : 0;
      }

      // Calculate asset allocation (simplified)
      const cashPercentage = portfolioValue.totalValueCAD > 0 
        ? (portfolioValue.totalCash / portfolioValue.totalValueCAD) * 100 
        : 0;
      const stocksPercentage = portfolioValue.totalValueCAD > 0 
        ? (portfolioValue.totalMarketValue / portfolioValue.totalValueCAD) * 100 
        : 0;

      // Create snapshot with properly formatted accountBreakdown
      const snapshot = new PortfolioSnapshot({
        personName,
        snapshotDate: new Date(),
        totalValue: portfolioValue.totalValueCAD,
        totalValueCAD: portfolioValue.totalValueCAD,
        totalCash: portfolioValue.totalCash,
        totalMarketValue: portfolioValue.totalMarketValue,
        dayChange,
        holdingsCount: holdings.count,
        topHoldings: holdings.topHoldings.map(h => ({
          symbol: h.symbol,
          value: h.marketValue,
          percentage: h.percentage
        })),
        // Ensure accountBreakdown is properly formatted as array of objects
        accountBreakdown: accounts.map(acc => ({
          accountId: String(acc.accountId),
          type: String(acc.type || 'Unknown'),
          value: Number(acc.summary?.totalEquityCAD || 0),
          percentage: portfolioValue.totalValueCAD > 0 
            ? Number(((acc.summary?.totalEquityCAD || 0) / portfolioValue.totalValueCAD) * 100)
            : 0
        })),
        assetAllocation: {
          stocks: { 
            value: portfolioValue.totalMarketValue, 
            percentage: stocksPercentage 
          },
          cash: { 
            value: portfolioValue.totalCash, 
            percentage: cashPercentage 
          },
          bonds: { value: 0, percentage: 0 },
          other: { value: 0, percentage: 0 }
        },
        currencyExposure: [
          {
            currency: 'CAD',
            value: portfolioValue.totalValueCAD,
            percentage: 100
          }
        ],
        calculatedAt: new Date(),
        isEndOfDay: false
      });

      await snapshot.save();

      logger.info(`Portfolio snapshot created for ${personName}`);

      return snapshot;
    } catch (error) {
      logger.error(`Error creating snapshot for ${personName}:`, error);
      throw error;
    }
  }
}

module.exports = new PortfolioCalculator();
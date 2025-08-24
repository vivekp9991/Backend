const PortfolioSnapshot = require('../models/PortfolioSnapshot');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const Decimal = require('decimal.js');
const currencyService = require('./currencyService');
const dividendService = require('./dividendService');
const marketDataService = require('./marketDataService');

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

      // Check if response has expected structure
      if (!response.data) {
        logger.warn(`[PORTFOLIO] No data in response from ${endpoint}`);
        return { success: false, data: [] };
      }

      return response.data;
    } catch (error) {
      // Log more detailed error information
      if (error.response) {
        logger.error(`[PORTFOLIO] Sync API error ${endpoint}:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else if (error.request) {
        logger.error(`[PORTFOLIO] No response from Sync API ${endpoint}:`, {
          message: error.message,
          syncApiUrl: this.syncApiUrl
        });
      } else {
        logger.error(`[PORTFOLIO] Error setting up request to Sync API ${endpoint}:`, error.message);
      }

      // Return empty but valid response structure
      return { success: false, data: [] };
    }
  }

  /**
   * Get all persons from Auth API
   */
  async getAllPersons() {
    try {
      const authApiUrl = config.services.authApiUrl || 'http://localhost:4001/api';
      const response = await axios.get(`${authApiUrl}/persons`);

      if (response.data && response.data.success) {
        return response.data.data.filter(p => p.isActive);
      }

      return [];
    } catch (error) {
      logger.error('[PORTFOLIO] Failed to fetch persons:', error.message);
      return [];
    }
  }

  /**
   * Get all positions for all persons (main method for UI)
   */
  async getAllPersonsPositions(viewMode = 'all', aggregate = true) {
    try {
      logger.info(`[PORTFOLIO] Getting positions for viewMode: ${viewMode}, aggregate: ${aggregate}`);

      // Get all active persons
      const persons = await this.getAllPersons();
      logger.info(`[PORTFOLIO] Found ${persons.length} active persons`);

      if (persons.length === 0) {
        return [];
      }

      // Fetch all positions and accounts
      const allPositions = [];
      const accountsMap = new Map();

      for (const person of persons) {
        try {
          // Fetch positions for this person
          const positionsResponse = await this.fetchFromSyncApi('/positions/person/' + person.personName, {
            aggregated: 'false' // Get raw positions, not aggregated
          });

          if (positionsResponse.success && positionsResponse.data) {
            // Add personName to each position
            const personPositions = positionsResponse.data.map(pos => ({
              ...pos,
              personName: person.personName
            }));
            allPositions.push(...personPositions);
          }

          // Fetch accounts for this person
          const accountsResponse = await this.fetchFromSyncApi('/accounts/' + person.personName);

          if (accountsResponse.success && accountsResponse.data) {
            accountsResponse.data.forEach(account => {
              accountsMap.set(account.accountId, {
                ...account,
                personName: person.personName
              });
            });
          }
        } catch (error) {
          logger.error(`[PORTFOLIO] Failed to fetch data for ${person.personName}:`, error.message);
        }
      }

      logger.info(`[PORTFOLIO] Total positions fetched: ${allPositions.length}`);

      if (aggregate) {
        return await this.aggregatePositions(allPositions, accountsMap);
      } else {
        return await this.formatIndividualPositions(allPositions, accountsMap);
      }
    } catch (error) {
      logger.error('[PORTFOLIO] Failed to get all persons positions:', error);
      throw error;
    }
  }

  async aggregatePositions(positions, accountsMap) {
    try {
      // If no positions, return empty array
      if (!positions || positions.length === 0) {
        logger.info('[PORTFOLIO] No positions to aggregate');
        return [];
      }

      logger.info(`[PORTFOLIO] Starting aggregation of ${positions.length} positions`);

      // Group positions by symbol
      const symbolGroups = new Map();

      for (const position of positions) {
        const symbol = position.symbol;

        if (!symbolGroups.has(symbol)) {
          symbolGroups.set(symbol, {
            positions: [],
            totalQuantity: new Decimal(0),
            totalCost: new Decimal(0),
            accounts: new Set(),
            accountTypes: new Set(),
            persons: new Set()
          });
        }

        const group = symbolGroups.get(symbol);
        group.positions.push(position);
        group.totalQuantity = group.totalQuantity.plus(position.openQuantity || 0);
        group.totalCost = group.totalCost.plus(position.totalCost || 0);

        const account = accountsMap.get(position.accountId);
        if (account) {
          group.accounts.add(position.accountId);
          group.accountTypes.add(account.type);
          group.persons.add(position.personName);
        }
      }

      logger.info(`[PORTFOLIO] Grouped into ${symbolGroups.size} unique symbols`);

      // Get all unique symbols for batch price fetch
      const symbols = Array.from(symbolGroups.keys());

      // Only fetch prices if we have symbols
      let priceData = {};
      if (symbols.length > 0) {
        try {
          logger.info(`[PORTFOLIO] Fetching prices for ${symbols.length} symbols`);
          priceData = await marketDataService.getMultiplePrices(symbols);
          logger.info(`[PORTFOLIO] Fetched prices for ${Object.keys(priceData).length} symbols`);
        } catch (error) {
          logger.error('[PORTFOLIO] Failed to fetch market prices, continuing with cached/default prices:', error.message);
          // Continue with empty price data rather than failing
        }
      }

      // Build aggregated positions
      const aggregatedPositions = [];

      for (const [symbol, group] of symbolGroups.entries()) {
        logger.debug(`[PORTFOLIO] Processing symbol ${symbol} with ${group.positions.length} positions`);

        const totalQuantity = group.totalQuantity.toNumber();
        const totalCost = group.totalCost.toNumber();
        const averageEntryPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;

        // Get current price data
        const currentPriceData = priceData[symbol] || {};
        const currentPrice = currentPriceData.currentPrice || group.positions[0]?.currentPrice || 0;
        const openPrice = currentPriceData.openPrice || currentPrice;

        // Determine currency (assume USD for now, could be enhanced)
        const currency = symbol.includes('.TO') ? 'CAD' : 'USD';

        logger.debug(`[PORTFOLIO] Calculating dividend data for ${symbol}`);

        // Calculate dividend data - wrap in try-catch to prevent failures
        let dividendData = {
          totalReceived: 0,
          monthlyDividendPerShare: 0,
          annualDividend: 0,
          annualDividendPerShare: 0,
          yieldOnCost: 0,
          currentYield: 0,
          dividendHistory: []
        };

        try {
          logger.info(`[PORTFOLIO] Starting dividend calculation for ${symbol} with ${group.positions.length} positions`);
          dividendData = await dividendService.calculateDividendData(
            symbol,
            group.positions,
            currentPrice
          );
          logger.info(`[PORTFOLIO] Dividend calculation complete for ${symbol}:`, {
            totalReceived: dividendData.totalReceived,
            annualDividend: dividendData.annualDividend
          });
        } catch (error) {
          logger.error(`[PORTFOLIO] Failed to calculate dividend data for ${symbol}:`, {
            message: error.message,
            stack: error.stack
          });
        }

        // Build individual positions array
        const individualPositions = [];
        for (const pos of group.positions) {
          const account = accountsMap.get(pos.accountId);
          if (account) {
            individualPositions.push({
              accountName: `${account.type}-${account.number}`,
              accountType: account.type,
              personName: pos.personName,
              shares: pos.openQuantity,
              avgCost: pos.averageEntryPrice || 0,
              marketValue: pos.currentMarketValue || (pos.openQuantity * currentPrice),
              currency: currency
            });
          }
        }

        // Build the aggregated position
        const aggregatedPosition = {
          symbol: symbol,
          currency: currency,
          openQuantity: totalQuantity,
          averageEntryPrice: Math.round(averageEntryPrice * 100) / 100,
          currentPrice: Math.round(currentPrice * 100) / 100,
          openPrice: Math.round(openPrice * 100) / 100,
          dividendData: dividendData, // This now includes paymentFrequency
          isAggregated: group.accounts.size > 1,
          sourceAccounts: Array.from(group.accountTypes),
          accountCount: group.accounts.size,
          individualPositions: individualPositions
        };

        aggregatedPositions.push(aggregatedPosition);
      }

      // Sort by market value (descending)
      aggregatedPositions.sort((a, b) => {
        const aValue = a.openQuantity * a.currentPrice;
        const bValue = b.openQuantity * b.currentPrice;
        return bValue - aValue;
      });

      logger.info(`[PORTFOLIO] Aggregated ${positions.length} positions into ${aggregatedPositions.length} symbols`);

      return aggregatedPositions;
    } catch (error) {
      logger.error('[PORTFOLIO] Failed to aggregate positions:', {
        message: error.message,
        stack: error.stack
      });
      // Return empty array instead of throwing
      return [];
    }
  }

  /**
   * Format individual positions without aggregation
   */
  async formatIndividualPositions(positions, accountsMap) {
    try {
      // Get all unique symbols for batch price fetch
      const symbols = [...new Set(positions.map(p => p.symbol))];
      const priceData = await marketDataService.getMultiplePrices(symbols);

      const formattedPositions = [];

      for (const position of positions) {
        const account = accountsMap.get(position.accountId);
        const symbol = position.symbol;

        // Get current price data
        const currentPriceData = priceData[symbol] || {};
        const currentPrice = currentPriceData.currentPrice || position.currentPrice || 0;
        const openPrice = currentPriceData.openPrice || currentPrice;

        // Determine currency
        const currency = symbol.includes('.TO') ? 'CAD' : 'USD';

        // Calculate simple dividend data for individual position
        const dividendData = await dividendService.calculateDividendData(
          symbol,
          [position],
          currentPrice
        );

        const formattedPosition = {
          symbol: symbol,
          currency: currency,
          openQuantity: position.openQuantity,
          averageEntryPrice: Math.round((position.averageEntryPrice || 0) * 100) / 100,
          currentPrice: Math.round(currentPrice * 100) / 100,
          openPrice: Math.round(openPrice * 100) / 100,
          dividendData: dividendData,
          isAggregated: false,
          sourceAccounts: account ? [account.type] : [],
          accountCount: 1,
          individualPositions: account ? [{
            accountName: `${account.type}-${account.number}`,
            accountType: account.type,
            personName: position.personName,
            shares: position.openQuantity,
            avgCost: position.averageEntryPrice || 0,
            marketValue: position.currentMarketValue || (position.openQuantity * currentPrice),
            currency: currency
          }] : []
        };

        formattedPositions.push(formattedPosition);
      }

      // Sort by market value (descending)
      formattedPositions.sort((a, b) => {
        const aValue = a.openQuantity * a.currentPrice;
        const bValue = b.openQuantity * b.currentPrice;
        return bValue - aValue;
      });

      return formattedPositions;
    } catch (error) {
      logger.error('[PORTFOLIO] Failed to format individual positions:', error);
      throw error;
    }
  }

  // ... (keep all existing methods from the original file)

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
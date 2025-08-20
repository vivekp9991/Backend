const AssetAllocation = require('../models/AssetAllocation');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');

class AllocationAnalyzer {
  constructor() {
    this.syncApiUrl = config.services.syncApiUrl;
  }

  async fetchFromSyncApi(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.syncApiUrl}${endpoint}`, { params });
      return response.data;
    } catch (error) {
      logger.error(`Error fetching from Sync API ${endpoint}:`, error.message);
      throw error;
    }
  }

  async getAssetAllocation(personName) {
    try {
      // Try to get cached allocation first
      let allocation = await AssetAllocation.getLatest(personName);
      
      if (!allocation || this.isStale(allocation)) {
        allocation = await this.calculateAssetAllocation(personName);
      }
      
      return allocation;
    } catch (error) {
      logger.error(`Error getting asset allocation for ${personName}:`, error);
      throw error;
    }
  }

  async calculateAssetAllocation(personName) {
    try {
      const positionsResponse = await this.fetchFromSyncApi(`/positions/person/${personName}`);
      const positions = positionsResponse.data || [];
      
      const accountsResponse = await this.fetchFromSyncApi(`/accounts/${personName}`);
      const accounts = accountsResponse.data || [];
      
      // Calculate total value
      let totalValue = 0;
      accounts.forEach(account => {
        totalValue += account.summary?.totalEquityCAD || 0;
      });
      
      // Asset class allocation (simplified)
      const byAssetClass = this.calculateAssetClassAllocation(positions, accounts, totalValue);
      
      // Account type allocation
      const byAccountType = this.calculateAccountTypeAllocation(accounts, totalValue);
      
      // Currency allocation
      const byCurrency = this.calculateCurrencyAllocation(positions, accounts, totalValue);
      
      // Concentration metrics
      const concentration = this.calculateConcentration(positions, totalValue);
      
      // Diversification metrics
      const diversification = this.calculateDiversification(positions);
      
      // Create new allocation record
      const allocation = new AssetAllocation({
        personName,
        calculationDate: new Date(),
        totalValue,
        byAssetClass,
        byAccountType,
        byCurrency,
        concentration,
        diversification
      });
      
      // Mark old allocations as stale
      await AssetAllocation.markStale(personName);
      
      await allocation.save();
      
      return allocation;
    } catch (error) {
      logger.error(`Error calculating asset allocation for ${personName}:`, error);
      throw error;
    }
  }

  calculateAssetClassAllocation(positions, accounts, totalValue) {
    // Simplified calculation - in reality, you'd need to classify each position
    let stocks = 0;
    let cash = 0;
    
    positions.forEach(position => {
      stocks += position.currentMarketValue || 0;
    });
    
    accounts.forEach(account => {
      cash += account.summary?.cashCAD || 0;
    });
    
    return [
      {
        assetClass: 'Stocks',
        value: stocks,
        percentage: totalValue > 0 ? (stocks / totalValue) * 100 : 0,
        holdings: positions.length
      },
      {
        assetClass: 'Cash',
        value: cash,
        percentage: totalValue > 0 ? (cash / totalValue) * 100 : 0,
        holdings: 0
      }
    ];
  }

  calculateAccountTypeAllocation(accounts, totalValue) {
    const accountTypes = {};
    
    accounts.forEach(account => {
      const type = account.type;
      if (!accountTypes[type]) {
        accountTypes[type] = {
          accountType: type,
          value: 0,
          accounts: 0
        };
      }
      accountTypes[type].value += account.summary?.totalEquityCAD || 0;
      accountTypes[type].accounts++;
    });
    
    return Object.values(accountTypes).map(type => ({
      ...type,
      percentage: totalValue > 0 ? (type.value / totalValue) * 100 : 0
    }));
  }

  calculateCurrencyAllocation(positions, accounts, totalValue) {
    // Simplified - assumes all CAD
    return [{
      currency: 'CAD',
      value: totalValue,
      valueCAD: totalValue,
      percentage: 100,
      holdings: positions.length
    }];
  }

  calculateConcentration(positions, totalValue) {
    if (positions.length === 0) {
      return {
        top1Holding: { symbol: 'N/A', percentage: 0 },
        top5Holdings: { value: 0, percentage: 0 },
        top10Holdings: { value: 0, percentage: 0 },
        herfindahlIndex: 0
      };
    }
    
    // Sort positions by value
    const sorted = [...positions].sort((a, b) => 
      (b.currentMarketValue || 0) - (a.currentMarketValue || 0)
    );
    
    const top1 = sorted[0];
    const top5Value = sorted.slice(0, 5).reduce((sum, p) => sum + (p.currentMarketValue || 0), 0);
    const top10Value = sorted.slice(0, 10).reduce((sum, p) => sum + (p.currentMarketValue || 0), 0);
    
    return {
      top1Holding: {
        symbol: top1?.symbol || 'N/A',
        percentage: totalValue > 0 ? ((top1?.currentMarketValue || 0) / totalValue) * 100 : 0
      },
      top5Holdings: {
        value: top5Value,
        percentage: totalValue > 0 ? (top5Value / totalValue) * 100 : 0
      },
      top10Holdings: {
        value: top10Value,
        percentage: totalValue > 0 ? (top10Value / totalValue) * 100 : 0
      },
      herfindahlIndex: this.calculateHerfindahlIndex(positions, totalValue)
    };
  }

  calculateHerfindahlIndex(positions, totalValue) {
    if (totalValue === 0) return 0;
    
    let sumOfSquares = 0;
    positions.forEach(position => {
      const weight = (position.currentMarketValue || 0) / totalValue;
      sumOfSquares += weight * weight;
    });
    
    return sumOfSquares * 10000; // Scale to 0-10000 range
  }

  calculateDiversification(positions) {
    const uniqueSymbols = new Set(positions.map(p => p.symbol));
    
    return {
      numberOfHoldings: positions.length,
      numberOfSectors: 0, // Would need sector data
      numberOfCurrencies: 1, // Simplified
      effectiveNumberOfHoldings: uniqueSymbols.size,
      diversificationRatio: positions.length > 0 ? uniqueSymbols.size / positions.length : 0
    };
  }

  isStale(allocation) {
    // Consider allocation stale if older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return allocation.calculationDate < oneHourAgo;
  }

  async getSectorAllocation(personName) {
    // Simplified implementation
    const allocation = await this.getAssetAllocation(personName);
    return allocation.bySector || [];
  }

  async getGeographicAllocation(personName) {
    // Simplified implementation
    const allocation = await this.getAssetAllocation(personName);
    return allocation.byGeography || [];
  }

  async getCurrencyAllocation(personName) {
    const allocation = await this.getAssetAllocation(personName);
    return allocation.byCurrency || [];
  }

  async getAccountTypeAllocation(personName) {
    const allocation = await this.getAssetAllocation(personName);
    return allocation.byAccountType || [];
  }

  async getMarketCapAllocation(personName) {
    // Simplified implementation
    const allocation = await this.getAssetAllocation(personName);
    return allocation.byMarketCap || [];
  }
}

module.exports = new AllocationAnalyzer();
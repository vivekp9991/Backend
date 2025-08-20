const PerformanceHistory = require('../models/PerformanceHistory');
const PortfolioSnapshot = require('../models/PortfolioSnapshot');
const mathHelpers = require('../utils/mathHelpers');
const logger = require('../utils/logger');

class RiskAnalyzer {
  async calculateRiskMetrics(personName, period = '1Y') {
    try {
      const dateHelpers = require('../utils/dateHelpers');
      const startDate = dateHelpers.getPeriodStartDate(period);
      
      // Get historical snapshots
      const snapshots = await PortfolioSnapshot.getDateRange(personName, startDate, new Date());
      
      if (snapshots.length < 2) {
        return {
          period,
          volatility: 0,
          sharpeRatio: 0,
          sortinoRatio: 0,
          beta: 0,
          maxDrawdown: 0,
          valueAtRisk: 0,
          message: 'Insufficient data for risk calculation'
        };
      }
      
      // Calculate daily returns
      const returns = [];
      for (let i = 1; i < snapshots.length; i++) {
        const prevValue = snapshots[i - 1].totalValueCAD;
        const currValue = snapshots[i].totalValueCAD;
        if (prevValue > 0) {
          returns.push((currValue - prevValue) / prevValue);
        }
      }
      
      // Calculate metrics
      const volatility = mathHelpers.standardDeviation(returns) * Math.sqrt(252); // Annualized
      const avgReturn = mathHelpers.average(returns) * 252; // Annualized
      const riskFreeRate = 0.02; // 2% annual risk-free rate
      
      const sharpeRatio = mathHelpers.sharpeRatio(returns, riskFreeRate / 252);
      const maxDrawdown = this.calculateMaxDrawdown(snapshots);
      const valueAtRisk = this.calculateVaR(returns, 0.95);
      
      return {
        period,
        dataPoints: snapshots.length,
        volatility: volatility * 100,
        annualizedReturn: avgReturn * 100,
        sharpeRatio,
        sortinoRatio: sharpeRatio * 0.8, // Simplified
        beta: 1.0, // Would need market data
        maxDrawdown: maxDrawdown * 100,
        valueAtRisk: valueAtRisk * 100,
        riskAdjustedReturn: avgReturn - (volatility * volatility / 2)
      };
    } catch (error) {
      logger.error(`Error calculating risk metrics for ${personName}:`, error);
      throw error;
    }
  }

  calculateMaxDrawdown(snapshots) {
    if (snapshots.length === 0) return 0;
    
    let maxDrawdown = 0;
    let peak = snapshots[0].totalValueCAD;
    
    for (const snapshot of snapshots) {
      const value = snapshot.totalValueCAD;
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }

  calculateVaR(returns, confidence = 0.95) {
    if (returns.length === 0) return 0;
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    
    return Math.abs(sortedReturns[index] || 0);
  }

  async analyzeDiversification(personName) {
    try {
      const allocationAnalyzer = require('./allocationAnalyzer');
      const allocation = await allocationAnalyzer.getAssetAllocation(personName);
      
      return {
        diversificationMetrics: allocation.diversification,
        concentrationMetrics: allocation.concentration,
        recommendation: this.getDiversificationRecommendation(allocation)
      };
    } catch (error) {
      logger.error(`Error analyzing diversification for ${personName}:`, error);
      throw error;
    }
  }

  getDiversificationRecommendation(allocation) {
    const recommendations = [];
    
    if (allocation.concentration.top1Holding.percentage > 20) {
      recommendations.push('Consider reducing concentration in top holding');
    }
    
    if (allocation.diversification.numberOfHoldings < 10) {
      recommendations.push('Consider adding more positions for better diversification');
    }
    
    if (allocation.concentration.herfindahlIndex > 2000) {
      recommendations.push('Portfolio is highly concentrated');
    }
    
    return recommendations;
  }

  async getCorrelationMatrix(personName, symbols = null) {
    // Simplified - would need historical price data for each symbol
    return {
      message: 'Correlation matrix calculation not yet implemented',
      symbols: symbols || [],
      matrix: []
    };
  }

  async analyzeConcentration(personName) {
    try {
      const allocationAnalyzer = require('./allocationAnalyzer');
      const allocation = await allocationAnalyzer.getAssetAllocation(personName);
      
      return {
        concentration: allocation.concentration,
        risk: this.assessConcentrationRisk(allocation.concentration)
      };
    } catch (error) {
      logger.error(`Error analyzing concentration for ${personName}:`, error);
      throw error;
    }
  }

  assessConcentrationRisk(concentration) {
    if (concentration.top1Holding.percentage > 30) {
      return 'High - Single position dominates portfolio';
    } else if (concentration.top5Holdings.percentage > 70) {
      return 'Medium - Top 5 holdings represent majority of portfolio';
    } else {
      return 'Low - Well diversified portfolio';
    }
  }

  async calculateDrawdown(personName, period = '1Y') {
    try {
      const dateHelpers = require('../utils/dateHelpers');
      const startDate = dateHelpers.getPeriodStartDate(period);
      
      const snapshots = await PortfolioSnapshot.getDateRange(personName, startDate, new Date());
      
      if (snapshots.length === 0) {
        return {
          maxDrawdown: 0,
          currentDrawdown: 0,
          drawdownPeriods: []
        };
      }
      
      const drawdowns = [];
      let peak = snapshots[0].totalValueCAD;
      let currentDrawdown = 0;
      
      snapshots.forEach(snapshot => {
        const value = snapshot.totalValueCAD;
        if (value > peak) {
          peak = value;
        }
        currentDrawdown = peak > 0 ? (peak - value) / peak : 0;
        
        drawdowns.push({
          date: snapshot.snapshotDate,
          value,
          peak,
          drawdown: currentDrawdown * 100
        });
      });
      
      const maxDrawdown = Math.max(...drawdowns.map(d => d.drawdown));
      
      return {
        period,
        maxDrawdown,
        currentDrawdown: currentDrawdown * 100,
        drawdownPeriods: drawdowns
      };
    } catch (error) {
      logger.error(`Error calculating drawdown for ${personName}:`, error);
      throw error;
    }
  }
}

module.exports = new RiskAnalyzer();
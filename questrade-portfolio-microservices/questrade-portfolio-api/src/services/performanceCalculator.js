// src/services/performanceCalculator.js
const mongoose = require('mongoose');
const Decimal = require('decimal.js');
const moment = require('moment');
const logger = require('../utils/logger');

const Activity = mongoose.model('Activity');
const PortfolioSnapshot = require('../models/PortfolioSnapshot');
const PerformanceHistory = require('../models/PerformanceHistory');

class PerformanceCalculator {
  // Get date range based on period
  getDateRange(period) {
    const endDate = new Date();
    let startDate = new Date();
    
    switch(period) {
      case '1D':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '1W':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '1M':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case '3M':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case '6M':
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case '1Y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'YTD':
        startDate = new Date(startDate.getFullYear(), 0, 1);
        break;
      case 'ALL':
        startDate = new Date(2000, 0, 1); // Far back date
        break;
    }
    
    return { startDate, endDate };
  }
  
  async calculateReturns(personName, period = '1Y') {
    try {
      const { startDate, endDate } = this.getDateRange(period);
      
      // Get snapshots for the period
      const snapshots = await PortfolioSnapshot.getDateRange(
        personName,
        startDate,
        endDate
      );
      
      if (!snapshots || snapshots.length < 2) {
        return {
          period,
          startDate,
          endDate,
          absoluteReturn: 0,
          percentageReturn: 0,
          message: 'Insufficient data for period'
        };
      }
      
      const firstSnapshot = snapshots[0];
      const lastSnapshot = snapshots[snapshots.length - 1];
      
      const startValue = new Decimal(firstSnapshot.totalValueCAD);
      const endValue = new Decimal(lastSnapshot.totalValueCAD);
      
      // Get cash flows for the period
      const cashFlows = await this.getCashFlows(personName, startDate, endDate);
      
      // Simple return calculation
      const simpleReturn = endValue.minus(startValue).minus(cashFlows.net);
      const simpleReturnPercent = startValue.gt(0)
        ? simpleReturn.div(startValue).mul(100)
        : new Decimal(0);
      
      // Time-weighted return
      const twr = await this.calculateTWR(snapshots, cashFlows.flows);
      
      // Money-weighted return
      const mwr = await this.calculateMWR(
        startValue.toNumber(),
        endValue.toNumber(),
        cashFlows.flows
      );
      
      return {
        period,
        startDate,
        endDate,
        startValue: startValue.toNumber(),
        endValue: endValue.toNumber(),
        absoluteReturn: simpleReturn.toNumber(),
        percentageReturn: simpleReturnPercent.toNumber(),
        timeWeightedReturn: twr,
        moneyWeightedReturn: mwr,
        cashFlows: cashFlows.total,
        deposits: cashFlows.deposits,
        withdrawals: cashFlows.withdrawals
      };
    } catch (error) {
      logger.error(`Error calculating returns for ${personName}:`, error);
      throw error;
    }
  }
  
  async getCashFlows(personName, startDate, endDate) {
    const activities = await Activity.find({
      personName,
      transactionDate: {
        $gte: startDate,
        $lte: endDate
      },
      type: { $in: ['Deposit', 'Withdrawal', 'Transfer'] }
    });
    
    let deposits = new Decimal(0);
    let withdrawals = new Decimal(0);
    const flows = [];
    
    activities.forEach(activity => {
      const amount = Math.abs(activity.netAmount || 0);
      const date = activity.transactionDate;
      
      if (activity.type === 'Deposit') {
        deposits = deposits.plus(amount);
        flows.push({ date, amount });
      } else if (activity.type === 'Withdrawal') {
        withdrawals = withdrawals.plus(amount);
        flows.push({ date, amount: -amount });
      }
    });
    
    return {
      deposits: deposits.toNumber(),
      withdrawals: withdrawals.toNumber(),
      net: deposits.minus(withdrawals).toNumber(),
      total: deposits.plus(withdrawals).toNumber(),
      flows
    };
  }
  
  async calculateTWR(snapshots, cashFlows) {
    // Time-weighted return calculation
    // TWR = [(1 + R1) × (1 + R2) × ... × (1 + Rn)] - 1
    
    let twr = new Decimal(1);
    
    for (let i = 1; i < snapshots.length; i++) {
      const prevSnapshot = snapshots[i - 1];
      const currSnapshot = snapshots[i];
      
      // Find cash flows between snapshots
      const periodFlows = cashFlows.filter(flow =>
        flow.date > prevSnapshot.snapshotDate &&
        flow.date <= currSnapshot.snapshotDate
      );
      
      const periodFlowAmount = periodFlows.reduce(
        (sum, flow) => sum + flow.amount,
        0
      );
      
      const startValue = prevSnapshot.totalValueCAD;
      const endValue = currSnapshot.totalValueCAD;
      const adjustedStartValue = startValue + periodFlowAmount / 2; // Mid-point assumption
      
      if (adjustedStartValue > 0) {
        const periodReturn = (endValue - periodFlowAmount) / adjustedStartValue;
        twr = twr.mul(1 + periodReturn);
      }
    }
    
    return twr.minus(1).mul(100).toNumber();
  }
  
  async calculateMWR(startValue, endValue, cashFlows) {
    // Money-weighted return (IRR) calculation
    // This is a simplified implementation
    // For production, use a proper IRR calculation library
    
    if (cashFlows.length === 0) {
      return ((endValue - startValue) / startValue) * 100;
    }
    
    // Simple approximation for MWR
    const totalInflows = cashFlows
      .filter(f => f.amount > 0)
      .reduce((sum, f) => sum + f.amount, 0);
    
    const totalOutflows = Math.abs(
      cashFlows
        .filter(f => f.amount < 0)
        .reduce((sum, f) => sum + f.amount, 0)
    );
    
    const netCashFlow = totalInflows - totalOutflows;
    const averageCapital = (startValue + endValue + netCashFlow) / 2;
    
    if (averageCapital > 0) {
      const gain = endValue - startValue - netCashFlow;
      return (gain / averageCapital) * 100;
    }
    
    return 0;
  }
  
  async getHistoricalPerformance(personName, startDate, endDate, interval = 'daily') {
    try {
      const snapshots = await PortfolioSnapshot.getDateRange(
        personName,
        startDate,
        endDate
      );
      
      if (!snapshots || snapshots.length === 0) {
        return [];
      }
      
      const performance = [];
      let previousValue = snapshots[0].totalValueCAD;
      
      for (let i = 1; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        const currentValue = snapshot.totalValueCAD;
        
        const dailyReturn = previousValue > 0
          ? ((currentValue - previousValue) / previousValue) * 100
          : 0;
        
        performance.push({
          date: snapshot.snapshotDate,
          value: currentValue,
          dailyReturn,
          cumulativeReturn: 0 // Will calculate
        });
        
        previousValue = currentValue;
      }
      
      // Calculate cumulative returns
      let cumulativeMultiplier = 1;
      performance.forEach(p => {
        cumulativeMultiplier *= (1 + p.dailyReturn / 100);
        p.cumulativeReturn = (cumulativeMultiplier - 1) * 100;
      });
      
      // Aggregate by interval if needed
      if (interval !== 'daily') {
        return this.aggregatePerformance(performance, interval);
      }
      
      return performance;
    } catch (error) {
      logger.error(`Error getting historical performance for ${personName}:`, error);
      throw error;
    }
  }
  
  aggregatePerformance(dailyPerformance, interval) {
    const aggregated = [];
    let currentPeriod = [];
    
    dailyPerformance.forEach(day => {
      const date = moment(day.date);
      
      // Check if we need to start a new period
      let startNewPeriod = false;
      
      if (currentPeriod.length === 0) {
        startNewPeriod = true;
      } else {
        const lastDate = moment(currentPeriod[currentPeriod.length - 1].date);
        
        switch(interval) {
          case 'weekly':
            startNewPeriod = !date.isSame(lastDate, 'week');
            break;
          case 'monthly':
            startNewPeriod = !date.isSame(lastDate, 'month');
            break;
          case 'quarterly':
            startNewPeriod = !date.isSame(lastDate, 'quarter');
            break;
          case 'yearly':
            startNewPeriod = !date.isSame(lastDate, 'year');
            break;
        }
      }
      
      if (startNewPeriod && currentPeriod.length > 0) {
        // Aggregate current period
        const periodStart = currentPeriod[0];
        const periodEnd = currentPeriod[currentPeriod.length - 1];
        
        aggregated.push({
          date: periodEnd.date,
          startDate: periodStart.date,
          value: periodEnd.value,
          periodReturn: periodEnd.cumulativeReturn - (periodStart.cumulativeReturn || 0),
          cumulativeReturn: periodEnd.cumulativeReturn
        });
        
        currentPeriod = [];
      }
      
      currentPeriod.push(day);
    });
    
    // Don't forget the last period
    if (currentPeriod.length > 0) {
      const periodStart = currentPeriod[0];
      const periodEnd = currentPeriod[currentPeriod.length - 1];
      
      aggregated.push({
        date: periodEnd.date,
        startDate: periodStart.date,
        value: periodEnd.value,
        periodReturn: periodEnd.cumulativeReturn - (periodStart.cumulativeReturn || 0),
        cumulativeReturn: periodEnd.cumulativeReturn
      });
    }
    
    return aggregated;
  }
}

module.exports = new PerformanceCalculator();
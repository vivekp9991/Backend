const PortfolioSnapshot = require('../models/PortfolioSnapshot');
const PerformanceHistory = require('../models/PerformanceHistory');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const Decimal = require('decimal.js');
const moment = require('moment');

class ReturnCalculator {
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
      throw error;
    }
  }

  /**
   * Calculate simple returns (absolute and percentage)
   */
  async calculateSimpleReturns(personName, startDate, endDate) {
    try {
      // Get portfolio values at start and end dates
      const [startSnapshot, endSnapshot] = await Promise.all([
        this.getSnapshotNearDate(personName, startDate),
        this.getSnapshotNearDate(personName, endDate)
      ]);

      if (!startSnapshot || !endSnapshot) {
        throw new Error('Insufficient data for return calculation');
      }

      const startValue = startSnapshot.totalValueCAD;
      const endValue = endSnapshot.totalValueCAD;
      const absoluteReturn = endValue - startValue;
      const percentageReturn = startValue > 0 ? (absoluteReturn / startValue) * 100 : 0;

      return {
        startDate: startSnapshot.snapshotDate,
        endDate: endSnapshot.snapshotDate,
        startValue,
        endValue,
        absoluteReturn,
        percentageReturn,
        annualizedReturn: this.annualizeReturn(percentageReturn / 100, startDate, endDate) * 100
      };
    } catch (error) {
      logger.error(`Error calculating simple returns for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate Time-Weighted Return (TWR)
   * TWR removes the impact of cash flows
   */
  async calculateTimeWeightedReturn(personName, startDate, endDate) {
    try {
      // Get all snapshots in the period
      const snapshots = await PortfolioSnapshot.find({
        personName,
        snapshotDate: {
          $gte: startDate,
          $lte: endDate
        }
      }).sort({ snapshotDate: 1 });

      if (snapshots.length < 2) {
        return { twr: 0, periods: 0 };
      }

      // Get cash flows (deposits/withdrawals)
      const cashFlows = await this.getCashFlows(personName, startDate, endDate);

      // Calculate sub-period returns
      const subPeriodReturns = [];
      let lastValue = snapshots[0].totalValueCAD;
      let lastDate = snapshots[0].snapshotDate;

      for (let i = 1; i < snapshots.length; i++) {
        const currentSnapshot = snapshots[i];
        const currentValue = currentSnapshot.totalValueCAD;
        const currentDate = currentSnapshot.snapshotDate;

        // Check for cash flows between periods
        const periodCashFlow = this.getCashFlowsInPeriod(
          cashFlows,
          lastDate,
          currentDate
        );

        // Calculate sub-period return
        const adjustedStartValue = lastValue + periodCashFlow;
        const subPeriodReturn = adjustedStartValue > 0
          ? (currentValue - adjustedStartValue) / adjustedStartValue
          : 0;

        subPeriodReturns.push(subPeriodReturn);

        lastValue = currentValue;
        lastDate = currentDate;
      }

      // Calculate TWR by geometrically linking sub-period returns
      const twr = this.geometricLinking(subPeriodReturns);

      return {
        twr: twr * 100,
        periods: subPeriodReturns.length,
        annualizedTWR: this.annualizeReturn(twr, startDate, endDate) * 100
      };
    } catch (error) {
      logger.error(`Error calculating TWR for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate Money-Weighted Return (MWR) using XIRR
   * MWR considers the timing and size of cash flows
   */
  async calculateMoneyWeightedReturn(personName, startDate, endDate) {
    try {
      // Get initial and final values
      const [startSnapshot, endSnapshot] = await Promise.all([
        this.getSnapshotNearDate(personName, startDate),
        this.getSnapshotNearDate(personName, endDate)
      ]);

      if (!startSnapshot || !endSnapshot) {
        return { mwr: 0, cashFlowCount: 0 };
      }

      // Get all cash flows
      const cashFlows = await this.getCashFlows(personName, startDate, endDate);

      // Create cash flow array for XIRR calculation
      const xirr_cashflows = [
        {
          date: startSnapshot.snapshotDate,
          amount: -startSnapshot.totalValueCAD // Initial investment (negative)
        }
      ];

      // Add intermediate cash flows
      cashFlows.forEach(cf => {
        xirr_cashflows.push({
          date: cf.date,
          amount: -cf.amount // Deposits are negative, withdrawals are positive
        });
      });

      // Add final value
      xirr_cashflows.push({
        date: endSnapshot.snapshotDate,
        amount: endSnapshot.totalValueCAD // Final value (positive)
      });

      // Calculate XIRR
      const mwr = this.calculateXIRR(xirr_cashflows);

      return {
        mwr: mwr * 100,
        cashFlowCount: cashFlows.length,
        annualizedMWR: mwr * 100 // XIRR is already annualized
      };
    } catch (error) {
      logger.error(`Error calculating MWR for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate XIRR (Internal Rate of Return with irregular cash flows)
   */
  calculateXIRR(cashFlows, guess = 0.1) {
    const maxIterations = 100;
    const tolerance = 0.000001;

    // Newton-Raphson method
    let rate = guess;

    for (let i = 0; i < maxIterations; i++) {
      const { npv, derivative } = this.calculateNPVAndDerivative(cashFlows, rate);

      if (Math.abs(npv) < tolerance) {
        return rate;
      }

      const newRate = rate - npv / derivative;

      if (Math.abs(newRate - rate) < tolerance) {
        return newRate;
      }

      rate = newRate;
    }

    // If doesn't converge, return simple approximation
    return this.approximateReturn(cashFlows);
  }

  /**
   * Calculate NPV and its derivative for XIRR
   */
  calculateNPVAndDerivative(cashFlows, rate) {
    if (cashFlows.length === 0) return { npv: 0, derivative: 0 };

    const firstDate = cashFlows[0].date;
    let npv = 0;
    let derivative = 0;

    cashFlows.forEach(cf => {
      const days = moment(cf.date).diff(moment(firstDate), 'days');
      const years = days / 365.0;
      const discountFactor = Math.pow(1 + rate, years);

      npv += cf.amount / discountFactor;
      derivative -= (cf.amount * years) / (discountFactor * (1 + rate));
    });

    return { npv, derivative };
  }

  /**
   * Simple return approximation when XIRR doesn't converge
   */
  approximateReturn(cashFlows) {
    if (cashFlows.length < 2) return 0;

    const firstCF = cashFlows[0];
    const lastCF = cashFlows[cashFlows.length - 1];
    const totalInvested = Math.abs(firstCF.amount);
    const finalValue = lastCF.amount;

    if (totalInvested === 0) return 0;

    const totalReturn = (finalValue - totalInvested) / totalInvested;
    const days = moment(lastCF.date).diff(moment(firstCF.date), 'days');
    const years = days / 365.0;

    return years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : totalReturn;
  }

  /**
   * Calculate returns for multiple periods
   */
  async calculateMultiPeriodReturns(personName, periods = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD']) {
    const results = {};
    const dateHelpers = require('../utils/dateHelpers');
    const endDate = new Date();

    for (const period of periods) {
      try {
        const startDate = dateHelpers.getPeriodStartDate(period);
        
        const [simple, twr, mwr] = await Promise.all([
          this.calculateSimpleReturns(personName, startDate, endDate),
          this.calculateTimeWeightedReturn(personName, startDate, endDate),
          this.calculateMoneyWeightedReturn(personName, startDate, endDate)
        ]);

        results[period] = {
          period,
          startDate,
          endDate,
          absoluteReturn: simple.absoluteReturn,
          percentageReturn: simple.percentageReturn,
          timeWeightedReturn: twr.twr,
          moneyWeightedReturn: mwr.mwr,
          annualizedReturn: simple.annualizedReturn
        };
      } catch (error) {
        logger.warn(`Failed to calculate returns for period ${period}:`, error.message);
        results[period] = {
          period,
          error: 'Insufficient data',
          absoluteReturn: 0,
          percentageReturn: 0,
          timeWeightedReturn: 0,
          moneyWeightedReturn: 0
        };
      }
    }

    return results;
  }

  /**
   * Calculate daily returns
   */
  async calculateDailyReturns(personName, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const snapshots = await PortfolioSnapshot.find({
        personName,
        snapshotDate: {
          $gte: startDate,
          $lte: endDate
        }
      }).sort({ snapshotDate: 1 });

      const dailyReturns = [];

      for (let i = 1; i < snapshots.length; i++) {
        const prevValue = snapshots[i - 1].totalValueCAD;
        const currValue = snapshots[i].totalValueCAD;
        
        const dailyReturn = prevValue > 0
          ? ((currValue - prevValue) / prevValue) * 100
          : 0;

        dailyReturns.push({
          date: snapshots[i].snapshotDate,
          value: currValue,
          previousValue: prevValue,
          dailyReturn,
          cumulativeReturn: this.calculateCumulativeReturn(snapshots, i)
        });
      }

      return dailyReturns;
    } catch (error) {
      logger.error(`Error calculating daily returns for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate cumulative return up to a point
   */
  calculateCumulativeReturn(snapshots, index) {
    if (index === 0 || snapshots.length === 0) return 0;

    const initialValue = snapshots[0].totalValueCAD;
    const currentValue = snapshots[index].totalValueCAD;

    return initialValue > 0
      ? ((currentValue - initialValue) / initialValue) * 100
      : 0;
  }

  /**
   * Get cash flows (deposits and withdrawals)
   */
  async getCashFlows(personName, startDate, endDate) {
    try {
      const response = await this.fetchFromSyncApi('/activities/person/' + personName, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const activities = response.data || [];

      return activities
        .filter(activity => 
          activity.type === 'Deposit' || 
          activity.type === 'Withdrawal' ||
          activity.type === 'Transfer'
        )
        .map(activity => ({
          date: new Date(activity.transactionDate),
          amount: activity.type === 'Withdrawal' 
            ? Math.abs(activity.netAmount) 
            : -Math.abs(activity.netAmount),
          type: activity.type
        }));
    } catch (error) {
      logger.error(`Error getting cash flows for ${personName}:`, error);
      return [];
    }
  }

  /**
   * Get cash flows within a specific period
   */
  getCashFlowsInPeriod(cashFlows, startDate, endDate) {
    return cashFlows
      .filter(cf => cf.date > startDate && cf.date <= endDate)
      .reduce((sum, cf) => sum + cf.amount, 0);
  }

  /**
   * Get snapshot nearest to a specific date
   */
  async getSnapshotNearDate(personName, targetDate) {
    try {
      // Try exact date first
      let snapshot = await PortfolioSnapshot.findOne({
        personName,
        snapshotDate: {
          $gte: moment(targetDate).startOf('day').toDate(),
          $lte: moment(targetDate).endOf('day').toDate()
        }
      });

      // If not found, get nearest snapshot
      if (!snapshot) {
        snapshot = await PortfolioSnapshot.findOne({
          personName,
          snapshotDate: { $lte: targetDate }
        }).sort({ snapshotDate: -1 });
      }

      return snapshot;
    } catch (error) {
      logger.error(`Error getting snapshot near date for ${personName}:`, error);
      return null;
    }
  }

  /**
   * Geometric linking of returns
   */
  geometricLinking(returns) {
    if (returns.length === 0) return 0;

    const product = returns.reduce((acc, r) => acc * (1 + r), 1);
    return product - 1;
  }

  /**
   * Annualize a return
   */
  annualizeReturn(returnValue, startDate, endDate) {
    const days = moment(endDate).diff(moment(startDate), 'days');
    const years = days / 365.0;

    if (years <= 0) return returnValue;

    return Math.pow(1 + returnValue, 1 / years) - 1;
  }

  /**
   * Calculate rolling returns
   */
  async calculateRollingReturns(personName, windowDays = 30, periods = 365) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periods);

      const snapshots = await PortfolioSnapshot.find({
        personName,
        snapshotDate: {
          $gte: startDate,
          $lte: endDate
        }
      }).sort({ snapshotDate: 1 });

      const rollingReturns = [];

      for (let i = windowDays; i < snapshots.length; i++) {
        const windowStart = snapshots[i - windowDays];
        const windowEnd = snapshots[i];

        const returnValue = windowStart.totalValueCAD > 0
          ? ((windowEnd.totalValueCAD - windowStart.totalValueCAD) / windowStart.totalValueCAD) * 100
          : 0;

        rollingReturns.push({
          date: windowEnd.snapshotDate,
          return: returnValue,
          windowDays
        });
      }

      return rollingReturns;
    } catch (error) {
      logger.error(`Error calculating rolling returns for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate benchmark-relative returns
   */
  async calculateBenchmarkRelativeReturns(personName, benchmarkSymbol = 'SPY', period = '1Y') {
    try {
      const dateHelpers = require('../utils/dateHelpers');
      const startDate = dateHelpers.getPeriodStartDate(period);
      const endDate = new Date();

      // Get portfolio returns
      const portfolioReturns = await this.calculateSimpleReturns(personName, startDate, endDate);

      // For now, return placeholder benchmark data
      // In production, you'd fetch actual benchmark data
      const benchmarkReturn = 10.5; // Placeholder

      return {
        period,
        portfolioReturn: portfolioReturns.percentageReturn,
        benchmarkReturn,
        benchmarkSymbol,
        alpha: portfolioReturns.percentageReturn - benchmarkReturn,
        trackingError: 0, // Would need to calculate
        informationRatio: 0 // Would need to calculate
      };
    } catch (error) {
      logger.error(`Error calculating benchmark-relative returns for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Store calculated returns in PerformanceHistory
   */
  async storePerformanceHistory(personName, date, period, returns) {
    try {
      const performanceHistory = new PerformanceHistory({
        personName,
        date,
        period,
        startValue: returns.startValue,
        endValue: returns.endValue,
        absoluteReturn: returns.absoluteReturn,
        percentageReturn: returns.percentageReturn,
        timeWeightedReturn: returns.timeWeightedReturn,
        moneyWeightedReturn: returns.moneyWeightedReturn,
        calculatedAt: new Date()
      });

      await performanceHistory.save();
      
      return performanceHistory;
    } catch (error) {
      logger.error(`Error storing performance history for ${personName}:`, error);
      throw error;
    }
  }
}

module.exports = new ReturnCalculator();
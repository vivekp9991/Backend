const portfolioCalculator = require('./portfolioCalculator');
const performanceCalculator = require('./performanceCalculator');
const allocationAnalyzer = require('./allocationAnalyzer');
const riskAnalyzer = require('./riskAnalyzer');
const logger = require('../utils/logger');

class ReportGenerator {
  async generateSummaryReport(personName, period = '1Y', format = 'json') {
    try {
      const [portfolio, performance, allocation, risk] = await Promise.all([
        portfolioCalculator.getPortfolioSummary(personName),
        performanceCalculator.calculateReturns(personName, period),
        allocationAnalyzer.getAssetAllocation(personName),
        riskAnalyzer.calculateRiskMetrics(personName, period)
      ]);
      
      const report = {
        generatedAt: new Date(),
        personName,
        period,
        portfolio: {
          totalValue: portfolio.overview.totalValue,
          dayChange: portfolio.overview.dayChange,
          accountCount: portfolio.accounts.length,
          holdingsCount: portfolio.holdings.count
        },
        performance,
        allocation: {
          byAssetClass: allocation.byAssetClass,
          byAccountType: allocation.byAccountType
        },
        risk: {
          volatility: risk.volatility,
          sharpeRatio: risk.sharpeRatio,
          maxDrawdown: risk.maxDrawdown
        }
      };
      
      if (format === 'json') {
        return report;
      } else if (format === 'csv') {
        return this.convertToCSV(report);
      } else if (format === 'pdf') {
        return this.generatePDF(report);
      }
      
      return report;
    } catch (error) {
      logger.error(`Error generating summary report for ${personName}:`, error);
      throw error;
    }
  }

  async generateDetailedReport(personName, format = 'json') {
    try {
      const [portfolio, holdings, activities] = await Promise.all([
        portfolioCalculator.getPortfolioSummary(personName),
        portfolioCalculator.calculateHoldings(personName),
        this.getRecentActivities(personName)
      ]);
      
      const report = {
        generatedAt: new Date(),
        personName,
        portfolio,
        holdings: holdings.holdings,
        recentActivities: activities
      };
      
      if (format === 'json') {
        return report;
      }
      
      return report;
    } catch (error) {
      logger.error(`Error generating detailed report for ${personName}:`, error);
      throw error;
    }
  }

  async generateTaxReport(personName, year, format = 'json') {
    // Simplified tax report
    const report = {
      generatedAt: new Date(),
      personName,
      taxYear: year,
      message: 'Tax report generation not yet fully implemented',
      capitalGains: {
        realized: 0,
        unrealized: 0
      },
      dividends: {
        eligible: 0,
        nonEligible: 0,
        foreign: 0
      },
      interest: 0
    };
    
    if (format === 'json') {
      return report;
    }
    
    return report;
  }

  async generateCustomReport(personName, sections, period, format = 'json') {
    try {
      const report = {
        generatedAt: new Date(),
        personName,
        period,
        sections: {}
      };
      
      for (const section of sections) {
        switch (section) {
          case 'performance':
            report.sections.performance = await performanceCalculator.calculateReturns(personName, period);
            break;
          case 'allocation':
            report.sections.allocation = await allocationAnalyzer.getAssetAllocation(personName);
            break;
          case 'holdings':
            report.sections.holdings = await portfolioCalculator.calculateHoldings(personName);
            break;
          case 'risk':
            report.sections.risk = await riskAnalyzer.calculateRiskMetrics(personName, period);
            break;
          default:
            logger.warn(`Unknown report section: ${section}`);
        }
      }
      
      if (format === 'json') {
        return report;
      }
      
      return report;
    } catch (error) {
      logger.error(`Error generating custom report for ${personName}:`, error);
      throw error;
    }
  }

  async getRecentActivities(personName, limit = 50) {
    try {
      const axios = require('axios');
      const config = require('../config/environment');
      
      const response = await axios.get(
        `${config.services.syncApiUrl}/activities/person/${personName}`,
        { params: { limit } }
      );
      
      return response.data.data || [];
    } catch (error) {
      logger.error(`Error fetching recent activities for ${personName}:`, error);
      return [];
    }
  }

  convertToCSV(data) {
    // Simplified CSV conversion
    const csv = require('csv-writer');
    // Implementation would go here
    return 'CSV generation not yet implemented';
  }

  generatePDF(data) {
    // Simplified PDF generation
    return 'PDF generation not yet implemented';
  }
}

module.exports = new ReportGenerator();
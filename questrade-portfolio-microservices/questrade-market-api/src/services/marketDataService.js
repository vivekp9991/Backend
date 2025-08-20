const MarketData = require('../models/MarketData');
const Quote = require('../models/Quote');
const logger = require('../utils/logger');
const axios = require('axios');
const moment = require('moment');
const config = require('../config/environment');

class MarketDataService {
  constructor() {
    this.authApiUrl = config.services.authApiUrl;
  }

  async getMarketStatus() {
    const now = moment();
    const dayOfWeek = now.day();
    const hour = now.hour();
    const minute = now.minute();
    
    // Check if weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        isOpen: false,
        session: 'CLOSED',
        reason: 'Weekend',
        currentTime: now.toISOString(),
        nextOpen: this.getNextMarketOpen(now)
      };
    }
    
    // Market sessions (ET)
    const sessions = {
      preMarket: { start: 4 * 60, end: 9 * 60 + 30 },  // 4:00 AM - 9:30 AM
      regular: { start: 9 * 60 + 30, end: 16 * 60 },   // 9:30 AM - 4:00 PM
      afterHours: { start: 16 * 60, end: 20 * 60 }     // 4:00 PM - 8:00 PM
    };
    
    const currentMinutes = hour * 60 + minute;
    
    let status = {
      currentTime: now.toISOString(),
      isOpen: false,
      session: 'CLOSED'
    };
    
    if (currentMinutes >= sessions.preMarket.start && currentMinutes < sessions.preMarket.end) {
      status.isOpen = true;
      status.session = 'PRE_MARKET';
      status.nextChange = moment().hour(9).minute(30).second(0).toISOString();
    } else if (currentMinutes >= sessions.regular.start && currentMinutes < sessions.regular.end) {
      status.isOpen = true;
      status.session = 'REGULAR';
      status.nextClose = moment().hour(16).minute(0).second(0).toISOString();
    } else if (currentMinutes >= sessions.afterHours.start && currentMinutes < sessions.afterHours.end) {
      status.isOpen = true;
      status.session = 'AFTER_HOURS';
      status.nextClose = moment().hour(20).minute(0).second(0).toISOString();
    } else {
      status.nextOpen = this.getNextMarketOpen(now);
    }
    
    return status;
  }

  getNextMarketOpen(currentTime) {
    const next = moment(currentTime);
    
    // If it's before 9:30 AM on a weekday
    if (next.day() >= 1 && next.day() <= 5) {
      const marketOpen = moment(next).hour(9).minute(30).second(0);
      if (next.isBefore(marketOpen)) {
        return marketOpen.toISOString();
      }
    }
    
    // Find next weekday
    do {
      next.add(1, 'day');
    } while (next.day() === 0 || next.day() === 6);
    
    return next.hour(9).minute(30).second(0).toISOString();
  }

  async getMarketSummary() {
    try {
      // Get cached or fetch new market summary
      let marketData = await MarketData.getLatest('summary');
      
      if (!marketData || this.isStale(marketData.lastUpdated, 60)) {
        marketData = await this.fetchMarketSummary();
      }
      
      return marketData;
    } catch (error) {
      logger.error('Failed to get market summary:', error);
      throw error;
    }
  }

  async fetchMarketSummary() {
    // This would typically fetch from a market data provider
    // For now, we'll calculate from our quotes
    const recentQuotes = await Quote.find({
      lastUpdated: { $gte: new Date(Date.now() - 60000) } // Last minute
    });
    
    let advancers = 0;
    let decliners = 0;
    let unchanged = 0;
    let totalVolume = 0;
    
    recentQuotes.forEach(quote => {
      if (quote.change > 0) advancers++;
      else if (quote.change < 0) decliners++;
      else unchanged++;
      
      totalVolume += quote.volume || 0;
    });
    
    const marketData = new MarketData({
      date: new Date(),
      type: 'summary',
      summary: {
        totalVolume,
        advancers,
        decliners,
        unchanged,
        newHighs: 0, // Would need historical data
        newLows: 0
      },
      isRealTime: true
    });
    
    await marketData.save();
    return marketData;
  }

  async getMarketMovers(type = 'all', limit = 10) {
    try {
      const quotes = await Quote.find({
        lastUpdated: { $gte: new Date(Date.now() - 300000) } // Last 5 minutes
      }).sort({ lastUpdated: -1 });
      
      const movers = {
        gainers: [],
        losers: [],
        mostActive: []
      };
      
      // Sort for gainers
      const gainers = [...quotes]
        .filter(q => q.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, limit);
      
      // Sort for losers
      const losers = [...quotes]
        .filter(q => q.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, limit);
      
      // Sort for most active
      const mostActive = [...quotes]
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, limit);
      
      movers.gainers = gainers.map(q => ({
        symbol: q.symbol,
        price: q.lastTradePrice,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume
      }));
      
      movers.losers = losers.map(q => ({
        symbol: q.symbol,
        price: q.lastTradePrice,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume
      }));
      
      movers.mostActive = mostActive.map(q => ({
        symbol: q.symbol,
        price: q.lastTradePrice,
        volume: q.volume
      }));
      
      if (type === 'gainers') return movers.gainers;
      if (type === 'losers') return movers.losers;
      if (type === 'volume') return movers.mostActive;
      
      return movers;
    } catch (error) {
      logger.error('Failed to get market movers:', error);
      throw error;
    }
  }

  async getSectorPerformance() {
    // Simplified sector performance
    // In production, this would aggregate from actual sector data
    const sectors = [
      { name: 'Technology', change: 1.2, changePercent: 0.8 },
      { name: 'Healthcare', change: 0.5, changePercent: 0.3 },
      { name: 'Financial', change: -0.3, changePercent: -0.2 },
      { name: 'Energy', change: 2.1, changePercent: 1.5 },
      { name: 'Consumer', change: 0.7, changePercent: 0.4 },
      { name: 'Industrial', change: -0.1, changePercent: -0.1 },
      { name: 'Materials', change: 0.9, changePercent: 0.6 },
      { name: 'Utilities', change: -0.5, changePercent: -0.4 },
      { name: 'Real Estate', change: 0.3, changePercent: 0.2 },
      { name: 'Communications', change: 1.0, changePercent: 0.7 }
    ];
    
    return sectors.sort((a, b) => b.changePercent - a.changePercent);
  }

  async getMarketBreadth() {
    const quotes = await Quote.find({
      lastUpdated: { $gte: new Date(Date.now() - 300000) }
    });
    
    let advancers = 0;
    let decliners = 0;
    let advancingVolume = 0;
    let decliningVolume = 0;
    
    quotes.forEach(quote => {
      if (quote.change > 0) {
        advancers++;
        advancingVolume += quote.volume || 0;
      } else if (quote.change < 0) {
        decliners++;
        decliningVolume += quote.volume || 0;
      }
    });
    
    return {
      advanceDeclineRatio: decliners > 0 ? advancers / decliners : advancers,
      upDownVolumeRatio: decliningVolume > 0 ? advancingVolume / decliningVolume : 1,
      advancers,
      decliners,
      advancingVolume,
      decliningVolume,
      totalIssues: quotes.length
    };
  }

  isStale(date, seconds) {
    return Date.now() - new Date(date).getTime() > seconds * 1000;
  }
}

module.exports = new MarketDataService();
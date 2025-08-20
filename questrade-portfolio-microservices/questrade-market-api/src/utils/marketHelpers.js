const moment = require('moment-timezone');

class MarketHelpers {
  // Check if market is open
  isMarketOpen() {
    const now = moment().tz('America/New_York');
    const dayOfWeek = now.day();
    
    // Market closed on weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    const currentTime = now.format('HHmm');
    const marketOpen = '0930';
    const marketClose = '1600';
    
    return currentTime >= marketOpen && currentTime < marketClose;
  }
  
  // Check if in pre-market hours
  isPreMarket() {
    const now = moment().tz('America/New_York');
    const dayOfWeek = now.day();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    const currentTime = now.format('HHmm');
    const preMarketOpen = '0400';
    const marketOpen = '0930';
    
    return currentTime >= preMarketOpen && currentTime < marketOpen;
  }
  
  // Check if in after-hours trading
  isAfterHours() {
    const now = moment().tz('America/New_York');
    const dayOfWeek = now.day();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    const currentTime = now.format('HHmm');
    const marketClose = '1600';
    const afterHoursClose = '2000';
    
    return currentTime >= marketClose && currentTime < afterHoursClose;
  }
  
  // Get next market open time
  getNextMarketOpen() {
    const now = moment().tz('America/New_York');
    let nextOpen = moment().tz('America/New_York').hour(9).minute(30).second(0);
    
    // If it's after market open today, move to next day
    if (now.isAfter(nextOpen)) {
      nextOpen.add(1, 'day');
    }
    
    // Skip weekends
    while (nextOpen.day() === 0 || nextOpen.day() === 6) {
      nextOpen.add(1, 'day');
    }
    
    return nextOpen.toDate();
  }
  
  // Format price with appropriate decimal places
  formatPrice(price) {
    if (!price && price !== 0) return 'N/A';
    
    if (price < 1) {
      return price.toFixed(4);
    } else if (price < 10) {
      return price.toFixed(3);
    } else {
      return price.toFixed(2);
    }
  }
  
  // Format large numbers
  formatVolume(volume) {
    if (!volume) return '0';
    
    if (volume >= 1000000000) {
      return (volume / 1000000000).toFixed(2) + 'B';
    } else if (volume >= 1000000) {
      return (volume / 1000000).toFixed(2) + 'M';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(2) + 'K';
    }
    
    return volume.toLocaleString();
  }
  
  // Calculate percentage change
  calculateChangePercent(current, previous) {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }
  
  // Format market cap
  formatMarketCap(marketCap) {
    if (!marketCap) return 'N/A';
    
    if (marketCap >= 1000000000000) {
      return '$' + (marketCap / 1000000000000).toFixed(2) + 'T';
    } else if (marketCap >= 1000000000) {
      return '$' + (marketCap / 1000000000).toFixed(2) + 'B';
    } else if (marketCap >= 1000000) {
      return '$' + (marketCap / 1000000).toFixed(2) + 'M';
    }
    
    return '$' + marketCap.toLocaleString();
  }
}

module.exports = new MarketHelpers();
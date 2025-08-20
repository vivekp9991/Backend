// src/utils/dateHelpers.js
const moment = require('moment');

class DateHelpers {
  // Get business days between dates
  getBusinessDays(startDate, endDate) {
    let count = 0;
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end)) {
      if (current.day() !== 0 && current.day() !== 6) {
        count++;
      }
      current.add(1, 'day');
    }
    
    return count;
  }
  
  // Get period start date
  getPeriodStartDate(period) {
    const now = moment();
    
    switch(period) {
      case '1D':
        return now.subtract(1, 'day').toDate();
      case '1W':
        return now.subtract(1, 'week').toDate();
      case '1M':
        return now.subtract(1, 'month').toDate();
      case '3M':
        return now.subtract(3, 'months').toDate();
      case '6M':
        return now.subtract(6, 'months').toDate();
      case '1Y':
        return now.subtract(1, 'year').toDate();
      case 'YTD':
        return moment().startOf('year').toDate();
      case 'ALL':
        return new Date(2000, 0, 1);
      default:
        return now.subtract(1, 'year').toDate();
    }
  }
  
  // Format date for display
  formatDate(date, format = 'YYYY-MM-DD') {
    return moment(date).format(format);
  }
  
  // Get quarter from date
  getQuarter(date) {
    return moment(date).quarter();
  }
  
  // Get days in period
  getDaysInPeriod(period) {
    switch(period) {
      case '1D': return 1;
      case '1W': return 7;
      case '1M': return 30;
      case '3M': return 90;
      case '6M': return 180;
      case '1Y': return 365;
      case 'YTD': return moment().dayOfYear();
      default: return 365;
    }
  }
  
  // Check if market is open
  isMarketOpen(date = new Date()) {
    const m = moment(date);
    const day = m.day();
    const hour = m.hour();
    const minute = m.minute();
    
    // Market closed on weekends
    if (day === 0 || day === 6) return false;
    
    // Market hours: 9:30 AM - 4:00 PM ET
    const marketOpen = hour === 9 && minute >= 30 || hour > 9;
    const marketClose = hour < 16;
    
    return marketOpen && marketClose;
  }
  
  // Get next market open
  getNextMarketOpen(date = new Date()) {
    const m = moment(date);
    
    // If it's a weekday and before market open
    if (m.day() >= 1 && m.day() <= 5) {
      const marketOpenToday = m.clone().hour(9).minute(30).second(0);
      if (m.isBefore(marketOpenToday)) {
        return marketOpenToday.toDate();
      }
    }
    
    // Find next weekday
    do {
      m.add(1, 'day');
    } while (m.day() === 0 || m.day() === 6);
    
    return m.hour(9).minute(30).second(0).toDate();
  }
}

module.exports = new DateHelpers();
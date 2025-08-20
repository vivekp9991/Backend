// src/utils/formatters.js
class Formatters {
  // Format large numbers
  formatLargeNumber(value) {
    if (Math.abs(value) >= 1e9) {
      return `${(value / 1e9).toFixed(2)}B`;
    } else if (Math.abs(value) >= 1e6) {
      return `${(value / 1e6).toFixed(2)}M`;
    } else if (Math.abs(value) >= 1e3) {
      return `${(value / 1e3).toFixed(2)}K`;
    }
    return value.toFixed(2);
  }
  
  // Format percentage with color indicator
  formatPercentageWithColor(value) {
    const formatted = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    const color = value >= 0 ? 'green' : 'red';
    return { value: formatted, color };
  }
  
  // Format duration
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
  
  // Format account type
  formatAccountType(type) {
    const typeMap = {
      'TFSA': 'Tax-Free Savings Account',
      'RRSP': 'Registered Retirement Savings Plan',
      'RESP': 'Registered Education Savings Plan',
      'LIRA': 'Locked-In Retirement Account',
      'Cash': 'Cash Account',
      'Margin': 'Margin Account'
    };
    
    return typeMap[type] || type;
  }
  
  // Format position for display
  formatPosition(position) {
    return {
      symbol: position.symbol,
      quantity: position.quantity.toLocaleString(),
      avgPrice: `$${position.averagePrice.toFixed(2)}`,
      currentPrice: `$${position.currentPrice.toFixed(2)}`,
      marketValue: `$${position.marketValue.toFixed(2)}`,
      pnl: this.formatPercentageWithColor(position.unrealizedPnLPercent),
      dayChange: this.formatPercentageWithColor(position.dayPnLPercent || 0)
    };
  }
  
  // Format table data for console output
  formatTable(data, columns) {
    const header = columns.map(col => col.label).join(' | ');
    const separator = '-'.repeat(header.length);
    
    const rows = data.map(item => {
      return columns.map(col => {
        const value = item[col.key];
        const width = col.width || col.label.length;
        return String(value).padEnd(width);
      }).join(' | ');
    });
    
    return [header, separator, ...rows].join('\n');
  }
}

module.exports = new Formatters();
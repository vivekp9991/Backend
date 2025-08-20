# Questrade Portfolio API

Portfolio Calculations and Analytics Service for Questrade Portfolio Tracker

## Overview

This service provides read-only access to portfolio calculations, performance metrics, asset allocation analysis, and custom reporting. It uses data synced by the Sync API to perform complex calculations and analytics.

## Features

### Core Calculations
- Portfolio valuation and summaries
- Performance metrics (TWR, MWR, Simple returns)
- Profit & Loss calculations
- Asset allocation analysis
- Risk metrics (Sharpe ratio, volatility, beta)
- Correlation and diversification analysis

### Advanced Analytics
- Historical performance tracking
- Benchmark comparisons
- Sector and geographic analysis
- Currency exposure analysis
- Concentration risk assessment
- Tax reporting capabilities

### Reporting
- Summary reports
- Detailed portfolio reports
- Performance reports
- Tax reports
- Custom report generation
- Export to PDF/CSV

## Prerequisites

1. **MongoDB** must be running
2. **Sync API** must be running (port 4002)
3. **Auth API** must be running (port 4001)
4. Data must be synced via Sync API

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Set database connection string
- Configure service URLs
- Adjust calculation parameters

### 3. Run setup wizard

```bash
npm run setup
```

This will:
- Verify service dependencies
- Test database connection
- Initialize calculation caches
- Generate initial snapshots

### 4. Start the service

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Documentation

### Portfolio Endpoints

#### Get Portfolio Overview
```
GET /api/portfolio/:personName
```

Returns complete portfolio overview including:
- Total value
- Holdings
- Performance metrics
- Asset allocation

#### Get Portfolio Summary
```
GET /api/portfolio/:personName/summary
```

Returns:
- Total value
- Number of holdings
- Daily/Total P&L
- Top holdings

### Performance Endpoints

#### Get Performance Metrics
```
GET /api/performance/:personName
```

Query parameters:
- `period`: 1D, 1W, 1M, 3M, 6M, 1Y, YTD, ALL
- `benchmark`: Compare to benchmark (e.g., SPY)

Returns:
- Absolute returns
- Percentage returns
- Time-weighted returns
- Money-weighted returns
- Benchmark comparison

#### Get Historical Performance
```
GET /api/performance/:personName/history
```

Query parameters:
- `startDate`: Start date (YYYY-MM-DD)
- `endDate`: End date (YYYY-MM-DD)
- `interval`: daily, weekly, monthly

### Allocation Endpoints

#### Get Asset Allocation
```
GET /api/allocation/:personName
```

Returns allocation by:
- Asset class
- Security type
- Account type

#### Get Sector Allocation
```
GET /api/allocation/:personName/sector
```

Returns portfolio breakdown by sector

### Analytics Endpoints

#### Get Risk Metrics
```
GET /api/analytics/:personName/risk
```

Returns:
- Volatility
- Sharpe ratio
- Sortino ratio
- Maximum drawdown
- Value at Risk (VaR)
- Beta

#### Get Diversification Analysis
```
GET /api/analytics/:personName/diversification
```

Returns:
- Diversification ratio
- Correlation matrix
- Concentration metrics

### Reports Endpoints

#### Generate Summary Report
```
GET /api/reports/:personName/summary
```

Query parameters:
- `format`: json, pdf, csv
- `period`: Custom date range

#### Generate Custom Report
```
POST /api/reports/:personName/custom
```

Body:
```json
{
  "sections": ["performance", "allocation", "holdings"],
  "period": "1Y",
  "format": "pdf"
}
```

## Calculation Methodology

### Performance Calculations

#### Time-Weighted Return (TWR)
Used for measuring portfolio manager performance, excluding impact of deposits/withdrawals.

#### Money-Weighted Return (MWR)
Internal rate of return considering cash flows timing.

### Risk Metrics

#### Sharpe Ratio
```
(Portfolio Return - Risk-Free Rate) / Portfolio Volatility
```

#### Maximum Drawdown
Largest peak-to-trough decline in portfolio value.

## Caching

The service implements intelligent caching:
- Calculations are cached for 5 minutes by default
- Cache invalidation on new data sync
- Configurable TTL per calculation type

## Performance Optimization

- Batch processing for large portfolios
- Concurrent calculation limits
- Database query optimization
- Result caching

## Error Handling

All endpoints return consistent error responses:
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Monitoring

Health check endpoint:
```
GET /health
```

Metrics endpoint:
```
GET /api/metrics
```

## Development

### Running tests
```bash
npm test
```

### Manual calculation trigger
```bash
npm run calculate:snapshots
```

## Integration

This service integrates with:
- **Sync API**: Reads synced data
- **Auth API**: Validates persons
- **Market API**: Gets real-time prices (optional)

## Troubleshooting

### No data returned
- Ensure Sync API has synced data
- Check person name is correct
- Verify database connection

### Calculations seem outdated
- Check cache settings
- Manually clear cache if needed
- Verify sync is running

### Performance issues
- Adjust batch size in .env
- Check database indexes
- Monitor calculation concurrency

## License

MIT
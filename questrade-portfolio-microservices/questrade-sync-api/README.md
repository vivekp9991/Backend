# Questrade Sync API

Data Synchronization Service for Questrade Portfolio Tracker

## Features

- Automated data synchronization from Questrade API
- Account information sync
- Position tracking
- Balance updates
- Activity history
- Order management
- Scheduled sync jobs
- Rate limiting and retry logic
- Sync status tracking
- Data validation and transformation

## Prerequisites

1. **Auth API must be running** (port 3001)
2. MongoDB must be running
3. Valid Questrade tokens configured in Auth API

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
- Set `AUTH_API_URL` to your Auth API endpoint
- Configure sync intervals and rate limits
- Set MongoDB connection string

### 3. Run setup wizard

```bash
npm run setup
```

This will:
- Verify Auth API connection
- Test database connection
- Create initial sync configuration
- Optionally perform initial sync

### 4. Start the service

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Sync Operations

- `POST /api/sync/all` - Sync all data for all persons
- `POST /api/sync/person/:personName` - Sync specific person
- `POST /api/sync/accounts/:personName` - Sync accounts only
- `POST /api/sync/positions/:personName` - Sync positions only
- `POST /api/sync/activities/:personName` - Sync activities only
- `GET /api/sync/status` - Get sync status
- `GET /api/sync/history` - Get sync history

### Data Access

- `GET /api/accounts` - Get all accounts
- `GET /api/accounts/:personName` - Get person's accounts
- `GET /api/positions` - Get all positions
- `GET /api/positions/:accountId` - Get account positions
- `GET /api/activities` - Get all activities
- `GET /api/activities/:accountId` - Get account activities

### Statistics

- `GET /api/stats/sync` - Sync statistics
- `GET /api/stats/data` - Data statistics
- `GET /api/stats/errors` - Error statistics

## Scheduled Sync

The service runs automatic sync based on `SYNC_INTERVAL_MINUTES` in `.env`.

### Manual sync

```bash
# Run one-time sync
npm run sync:once
```

## Data Models

### Account
- Account number, type, status
- Primary account flag
- Client account type
- Associated person

### Position
- Symbol, quantity, average cost
- Current market value
- P&L calculations
- Account association

### Balance
- Currency balances
- Cash, market value
- Buying power
- Maintenance excess

### Activity
- Transaction type, date
- Symbol, quantity, price
- Commission, fees
- Settlement date

### SyncLog
- Sync status, timing
- Records processed
- Errors encountered
- Person/account tracking

## Rate Limiting

The service implements intelligent rate limiting:
- Respects Questrade API limits
- Concurrent request management
- Automatic retry with backoff
- Error recovery

## Error Handling

- Comprehensive error logging
- Automatic retry for transient failures
- Token refresh integration
- Graceful degradation

## Monitoring

Check service health:
```
GET http://localhost:4002/health
```

View sync status:
```
GET http://localhost:4002/api/sync/status
```

## Troubleshooting

### Common Issues

1. **Auth API Connection Failed**
   - Ensure Auth API is running on port 3001
   - Check AUTH_API_URL in .env

2. **Token Errors**
   - Verify tokens are valid in Auth API
   - Check person has valid refresh token

3. **Rate Limit Errors**
   - Reduce QUESTRADE_RATE_LIMIT_PER_SECOND
   - Increase sync interval

4. **Data Not Syncing**
   - Check sync logs: GET /api/sync/history
   - Verify ENABLE_AUTO_SYNC=true
   - Check MongoDB connection

## Development

### Running tests
```bash
npm test
```

### Manual testing
Use the setup script to test individual sync operations:
```bash
npm run setup
```

## Integration

This service integrates with:
- **Auth API**: Token management
- **Portfolio API**: Provides data for calculations
- **Market API**: Enriches with market data

## License

MIT
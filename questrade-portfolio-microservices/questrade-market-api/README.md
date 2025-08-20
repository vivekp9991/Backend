# Questrade Market API

Real-time Market Data and Quotes Service for Questrade Portfolio Tracker

## Overview

This service provides real-time market data, quotes, symbol information, and watchlist management. It acts as a caching layer between the Questrade API and your portfolio application to optimize API usage and provide faster response times.

## Features

### Core Functionality
- Real-time quotes and market data
- Symbol search and information
- Market hours and status
- Watchlist management
- Historical quotes
- Options chain data
- Market movers tracking
- Exchange status

### Advanced Features
- Quote streaming (polling-based)
- Price alerts
- Market analytics
- Sector performance
- Market breadth indicators
- Volume analysis

## Prerequisites

1. **MongoDB** must be running
2. **Auth API** must be running (port 4001)
3. Valid Questrade tokens configured in Auth API
4. (Optional) Redis for enhanced caching

## Setup

### 1. Install dependencies

```bash
npm install
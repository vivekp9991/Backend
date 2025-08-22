# Questrade Notification API

Alerts and Notifications Service for Questrade Portfolio Tracker

## Overview

This service handles all alerts, notifications, and monitoring for the portfolio tracker. It monitors price changes, portfolio performance, and custom alert rules, then sends notifications via email, SMS, push notifications, or webhooks.

## Features

### Alert Types
- Price alerts (above/below thresholds)
- Percentage change alerts
- Portfolio value alerts
- P&L alerts
- Volume alerts
- 52-week high/low alerts
- Stop loss/Take profit alerts
- News alerts

### Notification Channels
- Email notifications
- SMS notifications (Twilio)
- Push notifications (Firebase)
- Webhook notifications
- In-app notifications

### Additional Features
- Alert rule management
- Notification preferences
- Daily/Weekly summaries
- Alert history
- Delivery tracking
- Template management

## Prerequisites

1. **MongoDB** must be running
2. **All other services** must be running:
   - Auth API (port 4001)
   - Sync API (port 4002)
   - Portfolio API (port 4003)
   - Market API (port 4004)
3. Email service credentials (SendGrid)
4. Optional: SMS (Twilio) and Push (Firebase) credentials

## Setup

### 1. Install dependencies

```bash
npm install
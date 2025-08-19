const Token = require('../models/Token');
const Person = require('../models/Person');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');

class TokenManager {
  constructor() {
    this.authUrl = config.questrade.authUrl;
  }

  async getValidAccessToken(personName) {
    try {
      // Check for valid access token in database
      const accessToken = await Token.findOne({
        personName,
        type: 'access',
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 });

      if (accessToken) {
        await accessToken.markAsUsed();
        return {
          success: true,
          accessToken: accessToken.getDecryptedToken(),
          apiServer: accessToken.apiServer,
          personName,
          expiresAt: accessToken.expiresAt
        };
      }

      // Need to refresh token
      logger.info(`Access token expired for ${personName}, refreshing...`);
      return await this.refreshAccessToken(personName);
    } catch (error) {
      logger.error(`Error getting valid access token for ${personName}:`, error);
      throw error;
    }
  }

  async refreshAccessToken(personName) {
    try {
      const refreshTokenDoc = await Token.findOne({
        personName,
        type: 'refresh',
        isActive: true
      }).sort({ createdAt: -1 });

      if (!refreshTokenDoc) {
        throw new Error(`No active refresh token found for ${personName}`);
      }

      const refreshToken = refreshTokenDoc.getDecryptedToken();
      
      if (!refreshToken || refreshToken.length < 20) {
        throw new Error(`Invalid refresh token format for ${personName}`);
      }
      
      logger.info(`Attempting to refresh access token for ${personName}...`);
      
      // Call Questrade OAuth endpoint
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const response = await axios.post(
        `${this.authUrl}/oauth2/token`,
        params.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000
        }
      );

      const { 
        access_token, 
        refresh_token: newRefreshToken, 
        api_server, 
        expires_in 
      } = response.data;

      if (!access_token || !newRefreshToken) {
        throw new Error('Invalid response from Questrade API - missing tokens');
      }

      // Delete old tokens for this person
      await Token.deleteMany({ personName, isActive: true });

      // Save new access token
      const accessTokenDoc = Token.createWithToken({
        type: 'access',
        personName,
        token: access_token,
        apiServer: api_server,
        expiresAt: new Date(Date.now() + (expires_in * 1000)),
        isActive: true
      });
      await accessTokenDoc.save();

      // Save new refresh token
      const refreshTokenNewDoc = Token.createWithToken({
        type: 'refresh',
        personName,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)), // 7 days
        isActive: true
      });
      await refreshTokenNewDoc.save();

      // Update person record
      await Person.findOneAndUpdate(
        { personName },
        { 
          hasValidToken: true,
          lastTokenRefresh: new Date(),
          lastTokenError: null
        }
      );

      logger.info(`Token refreshed successfully for ${personName}`);
      
      return {
        success: true,
        accessToken: access_token,
        apiServer: api_server,
        personName,
        expiresAt: new Date(Date.now() + (expires_in * 1000))
      };
    } catch (error) {
      await this.recordTokenError(personName, error.message);
      
      if (error.response) {
        logger.error(`Questrade API error for ${personName}:`, {
          status: error.response.status,
          data: error.response.data
        });
        
        if (error.response.status === 400) {
          throw new Error(`Invalid or expired refresh token for ${personName}. Please update the refresh token.`);
        } else if (error.response.status === 401) {
          throw new Error(`Unauthorized access for ${personName}. Token may be invalid.`);
        }
      }
      
      throw error;
    }
  }

  async setupPersonToken(personName, refreshToken) {
    try {
      // Validate refresh token format
      if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length < 20) {
        throw new Error('Invalid refresh token format');
      }

      const cleanToken = refreshToken.trim();
      
      logger.info(`Setting up token for ${personName}...`);
      
      // Validate token with Questrade
      const testParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: cleanToken
      });

      const testResponse = await axios.post(
        `${this.authUrl}/oauth2/token`,
        testParams.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000
        }
      );

      const { 
        access_token, 
        refresh_token: newRefreshToken, 
        api_server, 
        expires_in 
      } = testResponse.data;

      if (!access_token || !newRefreshToken) {
        throw new Error('Invalid refresh token - could not obtain new tokens');
      }

      // Delete old tokens for this person
      await Token.deleteMany({ personName });

      // Save new refresh token
      const refreshTokenDoc = Token.createWithToken({
        type: 'refresh',
        personName,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)),
        isActive: true
      });
      await refreshTokenDoc.save();

      // Save access token
      const accessTokenDoc = Token.createWithToken({
        type: 'access',
        personName,
        token: access_token,
        apiServer: api_server,
        expiresAt: new Date(Date.now() + (expires_in * 1000)),
        isActive: true
      });
      await accessTokenDoc.save();

      // Create or update person record
      await Person.findOneAndUpdate(
        { personName },
        { 
          personName,
          hasValidToken: true,
          lastTokenRefresh: new Date(),
          lastTokenError: null,
          isActive: true
        },
        { upsert: true, new: true }
      );

      logger.info(`Refresh token setup successfully for ${personName}`);
      
      return { 
        success: true, 
        personName,
        apiServer: api_server
      };
    } catch (error) {
      logger.error(`Error setting up token for ${personName}:`, error);
      throw error;
    }
  }

  async getTokenStatus(personName) {
    try {
      const refreshToken = await Token.findOne({
        personName,
        type: 'refresh',
        isActive: true
      }).sort({ createdAt: -1 });

      const accessToken = await Token.findOne({
        personName,
        type: 'access',
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 });

      return {
        personName,
        refreshToken: {
          exists: !!refreshToken,
          expiresAt: refreshToken?.expiresAt,
          lastUsed: refreshToken?.lastUsed,
          errorCount: refreshToken?.errorCount || 0,
          lastError: refreshToken?.lastError
        },
        accessToken: {
          exists: !!accessToken,
          expiresAt: accessToken?.expiresAt,
          lastUsed: accessToken?.lastUsed,
          apiServer: accessToken?.apiServer
        },
        isHealthy: !!refreshToken && (!!accessToken || !refreshToken.lastError)
      };
    } catch (error) {
      logger.error(`Error getting token status for ${personName}:`, error);
      throw error;
    }
  }

  async recordTokenError(personName, errorMessage) {
    try {
      await Token.findOneAndUpdate(
        { personName, type: 'refresh', isActive: true },
        { 
          $inc: { errorCount: 1 },
          lastError: errorMessage,
          lastUsed: new Date(),
          updatedAt: new Date()
        }
      );

      await Person.findOneAndUpdate(
        { personName },
        { 
          hasValidToken: false,
          lastTokenError: errorMessage
        }
      );
    } catch (error) {
      logger.error(`Error recording token error for ${personName}:`, error);
    }
  }

  async testConnection(personName) {
    try {
      const tokenData = await this.getValidAccessToken(personName);
      
      if (!tokenData.success) {
        throw new Error('Failed to get valid access token');
      }

      const response = await axios.get(`${tokenData.apiServer}/v1/time`, {
        headers: {
          'Authorization': `Bearer ${tokenData.accessToken}`
        },
        timeout: 10000
      });

      await Token.findOneAndUpdate(
        { personName, type: 'refresh', isActive: true },
        { 
          lastSuccessfulUse: new Date(),
          errorCount: 0,
          lastError: null
        }
      );

      return {
        success: true,
        serverTime: response.data.time,
        personName,
        apiServer: tokenData.apiServer
      };
    } catch (error) {
      await this.recordTokenError(personName, error.message);
      throw error;
    }
  }

  async deletePersonTokens(personName) {
    try {
      await Token.updateMany(
        { personName },
        { isActive: false }
      );

      await Person.findOneAndUpdate(
        { personName },
        { 
          hasValidToken: false,
          isActive: false
        }
      );

      logger.info(`Tokens deleted for ${personName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting tokens for ${personName}:`, error);
      throw error;
    }
  }
}

module.exports = new TokenManager();
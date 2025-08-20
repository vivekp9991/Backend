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

    // Format the API server URL properly
    let formattedApiServer = api_server;
    
    // Remove trailing slash if present
    if (formattedApiServer && formattedApiServer.endsWith('/')) {
      formattedApiServer = formattedApiServer.slice(0, -1);
    }
    
    // Add https:// if not present
    if (formattedApiServer && !formattedApiServer.startsWith('http://') && !formattedApiServer.startsWith('https://')) {
      formattedApiServer = `https://${formattedApiServer}`;
    }

    logger.info(`API Server for ${personName}: ${formattedApiServer}`);

    // Delete old tokens for this person
    await Token.deleteMany({ personName, isActive: true });

    // Save new access token
    const accessTokenDoc = Token.createWithToken({
      type: 'access',
      personName,
      token: access_token,
      apiServer: formattedApiServer,
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
      apiServer: formattedApiServer,
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

    // Format the API server URL properly
    let formattedApiServer = api_server;
    
    // Remove trailing slash if present
    if (formattedApiServer && formattedApiServer.endsWith('/')) {
      formattedApiServer = formattedApiServer.slice(0, -1);
    }
    
    // Add https:// if not present
    if (formattedApiServer && !formattedApiServer.startsWith('http://') && !formattedApiServer.startsWith('https://')) {
      formattedApiServer = `https://${formattedApiServer}`;
    }

    logger.info(`API Server for ${personName}: ${formattedApiServer}`);

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
      apiServer: formattedApiServer,
      expiresAt: new Date(Date.now() + (expires_in * 1000)),
      isActive: true
    });
    await accessTokenDoc.save();

    // Update person record if it exists
    const existingPerson = await Person.findOne({ personName });
    if (existingPerson) {
      await Person.findOneAndUpdate(
        { personName },
        { 
          hasValidToken: true,
          lastTokenRefresh: new Date(),
          lastTokenError: null,
          isActive: true
        }
      );
    }

    logger.info(`Refresh token setup successfully for ${personName}`);
    
    return { 
      success: true, 
      personName,
      apiServer: formattedApiServer
    };
  } catch (error) {
    logger.error(`Error setting up token for ${personName}:`, error);
    
    // Log more details about the error
    if (error.response) {
      logger.error(`Questrade OAuth error:`, {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
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

    // Ensure the API server URL is properly formatted
    let apiServer = tokenData.apiServer;
    
    // Remove trailing slash if present
    if (apiServer.endsWith('/')) {
      apiServer = apiServer.slice(0, -1);
    }
    
    // Add https:// if not present
    if (!apiServer.startsWith('http://') && !apiServer.startsWith('https://')) {
      apiServer = `https://${apiServer}`;
    }

    logger.info(`Testing connection to: ${apiServer}/v1/time`);

    const response = await axios.get(`${apiServer}/v1/time`, {
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
      apiServer: apiServer
    };
  } catch (error) {
    await this.recordTokenError(personName, error.message);
    
    // Log more details about the error
    if (error.response) {
      logger.error(`Questrade API error for ${personName}:`, {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      logger.error(`No response from Questrade API for ${personName}:`, {
        url: error.config?.url
      });
    } else {
      logger.error(`Error setting up request for ${personName}:`, error.message);
    }
    
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
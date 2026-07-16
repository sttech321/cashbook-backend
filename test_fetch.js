// test_fetch.js
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/businesses',
  method: 'GET',
  headers: {
    // Need a token to authenticate
  }
};

// I cannot easily fetch without a token.

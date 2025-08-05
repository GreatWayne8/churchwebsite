const axios = require('axios');
const moment = require('moment');
const base64 = require('base-64');

// Your credentials
const consumerKey = '4XvZ5bRRVLenfJn5ETSVpMENqHGvEKaOZIOkftlZINALg6xl';
const consumerSecret = 'dnhx0r3wUpOdKUCpVgAyRFqBHyeZl7Vp6TdAfzSlIxpdG7E5MIBZIOkrvjEovMNF';
const shortcode = '174379'; // Test shortcode
const passkey = 'your_passkey_here'; // Replace this with your actual test passkey from Daraja

const generateAccessToken = async () => {
  const auth = base64.encode(`${consumerKey}:${consumerSecret}`);
  try {
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error generating access token', error.response.data);
    throw error;
  }
};

const initiateStkPush = async (phone, amount) => {
  const token = await generateAccessToken();
  const timestamp = moment().format('YYYYMMDDHHmmss');
  const password = base64.encode(`${shortcode}${passkey}${timestamp}`);

  const requestData = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: 'http://localhost:5000/callback',
    AccountReference: 'Test',
    TransactionDesc: 'Payment for something',
  };

  try {
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error initiating STK Push', error.response.data);
    throw error;
  }
};

module.exports = { generateAccessToken, initiateStkPush };

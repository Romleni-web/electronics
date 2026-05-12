const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Order } = require('../models');

const CFG = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  passkey: process.env.MPESA_PASSKEY,
  shortcode: process.env.MPESA_SHORTCODE || '174379',
  callbackUrl: process.env.MPESA_CALLBACK_URL,
  env: process.env.MPESA_ENVIRONMENT || 'sandbox'
};

const BASE = CFG.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

async function getToken() {
  const auth = Buffer.from(CFG.consumerKey + ':' + CFG.consumerSecret).toString('base64');
  const r = await axios.get(BASE + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + auth }
  });
  return r.data.access_token;
}

function timestamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') +
    String(d.getHours()).padStart(2,'0') + String(d.getMinutes()).padStart(2,'0') + String(d.getSeconds()).padStart(2,'0');
}

function password(ts) {
  return Buffer.from(CFG.shortcode + CFG.passkey + ts).toString('base64');
}

router.post('/stk-push', async (req, res) => {
  const { phoneNumber, amount, accountReference, transactionDesc, orderNumber } = req.body;
  if (!phoneNumber || !amount) return res.status(400).json({ success: false, error: 'Phone and amount required' });

  let phone = phoneNumber.replace(/\D/g,'');
  if (phone.startsWith('0')) phone = '254' + phone.substring(1);
  if (!phone.startsWith('254')) phone = '254' + phone;

  const ts = timestamp();
  const payload = {
    BusinessShortCode: CFG.shortcode,
    Password: password(ts),
    Timestamp: ts,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: phone,
    PartyB: CFG.shortcode,
    PhoneNumber: phone,
    CallBackURL: CFG.callbackUrl,
    AccountReference: accountReference || 'GURUTECH',
    TransactionDesc: transactionDesc || 'Payment'
  };

  try {
    const token = await getToken();
    const r = await axios.post(BASE + '/mpesa/stkpush/v1/processrequest', payload, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    });

    // Save checkoutRequestId to order for matching
    if (orderNumber) {
      await Order.findOneAndUpdate(
        { number: orderNumber },
        { checkoutRequestId: r.data.CheckoutRequestID, updatedAt: new Date() }
      );
    }

    res.json({
      success: true,
      data: {
        checkoutRequestId: r.data.CheckoutRequestID,
        merchantRequestId: r.data.MerchantRequestID,
        responseCode: r.data.ResponseCode,
        responseDescription: r.data.ResponseDescription,
        customerMessage: r.data.CustomerMessage
      }
    });
  } catch (err) {
    console.error('STK Push error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: 'STK Push failed', details: err.response?.data || err.message });
  }
});

router.post('/callback', async (req, res) => {
  const cb = req.body?.Body?.stkCallback;
  if (!cb) return res.json({ success: false, error: 'Invalid callback' });

  const resultCode = cb.ResultCode;
  const resultDesc = cb.ResultDesc;
  const checkoutRequestId = cb.CheckoutRequestID;

  if (resultCode === 0) {
    const meta = cb.CallbackMetadata?.Item || [];
    const amount = meta.find(i => i.Name === 'Amount')?.Value;
    const receipt = meta.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const phone = meta.find(i => i.Name === 'PhoneNumber')?.Value;

    // Update order by checkoutRequestId
    const order = await Order.findOneAndUpdate(
      { checkoutRequestId },
      { paymentStatus: 'completed', status: 'paid', mpesaReceipt: receipt, updatedAt: new Date() },
      { new: true }
    );

    console.log('Payment OK:', receipt, amount, phone, 'order:', order?.number);
    res.json({ success: true, receipt, amount, orderNumber: order?.number });
  } else {
    await Order.findOneAndUpdate(
      { checkoutRequestId },
      { paymentStatus: 'failed', updatedAt: new Date() }
    );
    console.log('Payment failed:', resultDesc);
    res.json({ success: false, error: resultDesc });
  }
});

router.get('/query/:checkoutRequestId', async (req, res) => {
  const ts = timestamp();
  const payload = {
    BusinessShortCode: CFG.shortcode,
    Password: password(ts),
    Timestamp: ts,
    CheckoutRequestID: req.params.checkoutRequestId
  };
  try {
    const token = await getToken();
    const r = await axios.post(BASE + '/mpesa/stkpushquery/v1/query', payload, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    res.json({ success: true, data: r.data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Query failed' });
  }
});

module.exports = router;

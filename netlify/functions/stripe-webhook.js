const crypto = require('crypto');

const SUPABASE_URL = 'https://vvhrqajhbopxcltvpwif.supabase.co';

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map((kv) => kv.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'method_not_allowed' };
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: 'server_not_configured' };
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  if (!verifyStripeSignature(rawBody, sigHeader, process.env.STRIPE_WEBHOOK_SECRET)) {
    return { statusCode: 400, body: 'invalid_signature' };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch (err) {
    return { statusCode: 400, body: 'invalid_json' };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const update = { status: 'paid' };

    // Recupera el enlace al recibo real del cobro (lo emite Stripe, no Cimbra).
    if (session.payment_intent && process.env.STRIPE_SECRET_KEY) {
      try {
        const piRes = await fetch(
          `https://api.stripe.com/v1/payment_intents/${session.payment_intent}?expand[]=latest_charge`,
          { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
        );
        const pi = await piRes.json();
        if (piRes.ok && pi.latest_charge && pi.latest_charge.receipt_url) {
          update.receipt_url = pi.latest_charge.receipt_url;
        }
      } catch (err) {
        console.error('fetching receipt_url failed', err);
      }
    }

    await fetch(`${SUPABASE_URL}/rest/v1/deals?stripe_session_id=eq.${session.id}`, {
      method: 'PATCH',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(update),
    });
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

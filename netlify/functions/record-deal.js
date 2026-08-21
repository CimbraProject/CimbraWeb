const SUPABASE_URL = 'https://vvhrqajhbopxcltvpwif.supabase.co';
const ADMIN_NOTIFY_EMAIL = 'info@cimbrasolutions.es';

const EARLY_BIRD_RATE = 0.01;
const STANDARD_RATE = 0.02;
const FREE_EVERY = 6; // deal nº 6, 12, 18... es gratis (tarjeta de fidelidad)

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// No debe tumbar el registro del acuerdo si falla el envío del correo.
async function notifyAdmin({ dealId, dealNumber, constructoraName, fabricaName, orderValue, isFree, commissionAmount, siteUrl }) {
  if (!process.env.RESEND_API_KEY) return;
  const summary = isFree
    ? 'Este acuerdo es gratuito (tarjeta de fidelidad).'
    : `Comisión: ${commissionAmount.toFixed(2)} €.`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Cimbra <notificaciones@cimbrasolutions.es>',
        to: ADMIN_NOTIFY_EMAIL,
        subject: `Nuevo acuerdo cerrado #${dealNumber} — ${constructoraName} × ${fabricaName}`,
        html: `
          <p>Se ha registrado un nuevo acuerdo cerrado en Cimbra.</p>
          <p><b>Constructora:</b> ${constructoraName}<br>
          <b>Fábrica:</b> ${fabricaName}<br>
          <b>Importe del pedido:</b> ${orderValue.toLocaleString('es-ES')} €<br>
          ${summary}</p>
          <p><a href="${siteUrl}/acuerdo.html?id=${dealId}">Ver resumen completo</a></p>
        `,
      }),
    });
  } catch (err) {
    console.error('notifyAdmin failed', err);
  }
}

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.STRIPE_SECRET_KEY) {
    return json(500, { error: 'server_not_configured' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return json(401, { error: 'missing_token' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'invalid_json' });
  }

  const { constructoraId, fabricaId, material, orderValue } = payload;
  const orderValueNum = Number(orderValue);
  if (!constructoraId || !fabricaId || !orderValueNum || orderValueNum <= 0) {
    return json(400, { error: 'missing_fields' });
  }

  try {
    // 1. Verifica que quien llama es un admin autenticado.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return json(401, { error: 'invalid_session', detail: await userRes.text() });
    const caller = await userRes.json();

    const [callerProfile] = await supabaseRequest(`profiles?id=eq.${caller.id}&select=is_admin`);
    if (!callerProfile || !callerProfile.is_admin) {
      return json(403, { error: 'not_admin' });
    }
    // 2. Datos de la constructora (para saber si es early bird) y de la fábrica.
    const [constructora] = await supabaseRequest(`profiles?id=eq.${constructoraId}&select=is_early_bird,company_name`);
    if (!constructora) return json(404, { error: 'constructora_not_found' });
    const [fabrica] = await supabaseRequest(`profiles?id=eq.${fabricaId}&select=company_name`);
    if (!fabrica) return json(404, { error: 'fabrica_not_found' });

    // 3. Nº de orden del acuerdo para esa constructora.
    const previousDeals = await supabaseRequest(`deals?constructora_id=eq.${constructoraId}&select=id`);
    const dealNumber = previousDeals.length + 1;
    const isFree = dealNumber % FREE_EVERY === 0;
    const rate = constructora.is_early_bird ? EARLY_BIRD_RATE : STANDARD_RATE;
    const commissionAmount = isFree ? 0 : Math.round(orderValueNum * rate * 100) / 100;

    // 4. Registra el acuerdo.
    const [deal] = await supabaseRequest('deals', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        constructora_id: constructoraId,
        fabrica_id: fabricaId,
        material: material || null,
        order_value: orderValueNum,
        deal_number: dealNumber,
        commission_rate: rate,
        commission_amount: commissionAmount,
        is_free: isFree,
        status: commissionAmount > 0 ? 'invoiced' : 'paid',
      }),
    });

    const siteUrl = `https://${event.headers.host}`;

    if (commissionAmount <= 0) {
      await notifyAdmin({
        dealId: deal.id, dealNumber, constructoraName: constructora.company_name, fabricaName: fabrica.company_name,
        orderValue: orderValueNum, isFree: true, commissionAmount: 0, siteUrl,
      });
      return json(200, { dealNumber, isFree: true, commissionRate: rate, commissionAmount: 0, checkoutUrl: null });
    }

    // 5. Crea el enlace de cobro en Stripe (Checkout, sin custodiar el pago de materiales).
    const params = new URLSearchParams({
      mode: 'payment',
      'payment_method_types[0]': 'card',
      success_url: `${siteUrl}/admin.html?pago=ok`,
      cancel_url: `${siteUrl}/admin.html?pago=cancelado`,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(Math.round(commissionAmount * 100)),
      'line_items[0][price_data][product_data][name]': `Comisión Cimbra — acuerdo #${dealNumber} (${constructora.company_name})`,
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const stripeSession = await stripeRes.json();
    if (!stripeRes.ok) {
      return json(502, { error: 'stripe_error', detail: stripeSession });
    }

    await supabaseRequest(`deals?id=eq.${deal.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ checkout_url: stripeSession.url, stripe_session_id: stripeSession.id }),
    });

    await notifyAdmin({
      dealId: deal.id, dealNumber, constructoraName: constructora.company_name, fabricaName: fabrica.company_name,
      orderValue: orderValueNum, isFree: false, commissionAmount, siteUrl,
    });

    return json(200, {
      dealNumber,
      isFree: false,
      commissionRate: rate,
      commissionAmount,
      checkoutUrl: stripeSession.url,
    });
  } catch (err) {
    return json(500, { error: 'internal_error', detail: String(err) });
  }
};

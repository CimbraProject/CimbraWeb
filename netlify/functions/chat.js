const SYSTEM_PROMPT = `Eres el asistente de soporte de Cimbra, una plataforma B2B que conecta fábricas/distribuidores de materiales de construcción con constructoras y reformistas. Modelo: licitación inversa (publicar solicitud, fábricas ofertan) y búsqueda directa (comparador de fábricas verificadas). Comisión de éxito 2-3% a la constructora solo si se cierra acuerdo; registro y catálogo siempre gratuitos para fábricas. Responde en español, de forma breve, clara y amable, como soporte al cliente. Si no sabes algo específico de la cuenta del usuario, sugiere escribir a hola@cimbrasolutions.es.`;

const MAX_HISTORY = 20;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'server_not_configured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-MAX_HISTORY) : [];
  if (messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing_messages' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: messages
      })
    });

    const data = await response.json();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'upstream_error' }) };
  }
};

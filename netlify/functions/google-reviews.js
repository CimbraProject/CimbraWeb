// Consulta la valoración y reseñas de Google de una fábrica a través de la
// Google Places API (Place Details), manteniendo la API key en el servidor.
//
// Uso: GET /api/google-reviews?place_id=PLACE_ID_DE_LA_FICHA_DE_GOOGLE_BUSINESS
//
// Requiere la variable de entorno GOOGLE_PLACES_API_KEY en Netlify
// (Site configuration → Environment variables), con la Places API habilitada
// en Google Cloud y facturación activa.
//
// La API de Google Places solo permite devolver como máximo 5 reseñas por
// ficha (no el histórico completo) y exige mostrar la atribución "Google"
// junto al dato — respetar esto al pintar el resultado en el frontend.

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'server_not_configured' }) };
  }

  const placeId = event.queryStringParameters && event.queryStringParameters.place_id;
  if (!placeId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing_place_id' }) };
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'name,rating,user_ratings_total,reviews,url');
    url.searchParams.set('language', 'es');
    url.searchParams.set('key', process.env.GOOGLE_PLACES_API_KEY);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK') {
      return { statusCode: 502, body: JSON.stringify({ error: 'google_api_error', status: data.status }) };
    }

    const result = data.result || {};
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({
        name: result.name,
        rating: result.rating,
        userRatingsTotal: result.user_ratings_total,
        reviews: (result.reviews || []).slice(0, 5).map(r => ({
          author: r.author_name,
          rating: r.rating,
          text: r.text,
          relativeTime: r.relative_time_description
        })),
        googleUrl: result.url,
        source: 'Google'
      })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'upstream_error' }) };
  }
};

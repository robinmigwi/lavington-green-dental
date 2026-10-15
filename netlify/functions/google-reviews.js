const HEADERS = {
  "Content-Type": "application/json",
  // Reviews change slowly. Cache at the edge for an hour so the page loads fast
  // and the Google Places quota is not spent on every visitor.
  "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400"
};
const NO_CACHE = { "Content-Type": "application/json", "Cache-Control": "no-store" };

const FIELDS = "id,displayName,rating,userRatingCount,googleMapsUri,reviews";
const SEARCH_QUERY =
  process.env.GOOGLE_PLACE_QUERY ||
  "Lavington Green Dental Suite, Lavington Green Shopping Centre, James Gichuru Road, Nairobi";

// Resolved place id is kept between warm invocations so Text Search runs rarely.
let resolvedPlaceId = null;

async function findPlaceId(apiKey) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName"
    },
    body: JSON.stringify({ textQuery: SEARCH_QUERY, pageSize: 1, regionCode: "KE" })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Google Places search failed");
  const place = data.places && data.places[0];
  if (!place || !place.id) throw new Error("Lavington Green Dental Suite was not found on Google");
  return place.id;
}

exports.handler = async () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ configured: false }) };
  }

  try {
    const placeId = process.env.GOOGLE_PLACE_ID || resolvedPlaceId || (resolvedPlaceId = await findPlaceId(apiKey));

    const response = await fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId), {
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS }
    });
    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: NO_CACHE,
        body: JSON.stringify({ configured: true, error: data.error?.message || "Google Places request failed" })
      };
    }

    const reviews = (data.reviews || []).map(review => ({
      rating: review.rating,
      text: review.text?.text || review.originalText?.text || "",
      authorName: review.authorAttribution?.displayName || "Google reviewer",
      authorUri: review.authorAttribution?.uri || "",
      authorPhotoUri: review.authorAttribution?.photoUri || "",
      relativePublishTimeDescription: review.relativePublishTimeDescription || "",
      googleMapsUri: review.googleMapsUri || data.googleMapsUri || "",
      flagContentUri: review.flagContentUri || ""
    }));

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        configured: true,
        id: data.id,
        name: data.displayName?.text || "Lavington Green Dental Suite",
        rating: data.rating || 0,
        userRatingCount: data.userRatingCount || 0,
        googleMapsUri: data.googleMapsUri || "",
        reviews
      })
    };
  } catch (error) {
    resolvedPlaceId = null;
    return {
      statusCode: 500,
      headers: NO_CACHE,
      body: JSON.stringify({ configured: true, error: error.message || "Unable to load Google reviews" })
    };
  }
};

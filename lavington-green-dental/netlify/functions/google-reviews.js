exports.handler = async () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ configured: false })
    };
  }

  try {
    const url = "https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId);
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,googleMapsUri,reviews"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ configured: true, error: data.error?.message || "Google Places request failed" })
      };
    }

    const reviews = (data.reviews || []).map(review => ({
      rating: review.rating,
      text: review.text?.text || review.originalText?.text || "",
      authorName: review.authorAttribution?.displayName || "Google reviewer",
      authorUri: review.authorAttribution?.uri || "",
      relativePublishTimeDescription: review.relativePublishTimeDescription || "",
      googleMapsUri: review.googleMapsUri || data.googleMapsUri || "",
      flagContentUri: review.flagContentUri || ""
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
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
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ configured: true, error: "Unable to load Google reviews" })
    };
  }
};
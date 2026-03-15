const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const store = getStore("tasklist");

    if (event.httpMethod === "GET") {
      const raw = await store.get("data");
      const data = raw ? JSON.parse(raw) : null;
      return {
        statusCode: 200,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(data || {}),
      };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body);
      await store.set("data", JSON.stringify(body));
      return {
        statusCode: 200,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true }),
      };
    }

    return { statusCode: 405, headers, body: "Method not allowed" };

  } catch (err) {
    console.error("Blobs error:", err.message, err.stack);
    return {
      statusCode: 500,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

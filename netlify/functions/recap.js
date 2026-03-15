const https = require('https');

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method not allowed" };
  }

  try {
    const { prompt } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;

    console.log("API key present:", !!apiKey);
    console.log("API key length:", apiKey ? apiKey.length : 0);

    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const payload = JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    console.log("Sending request to Anthropic...");

    const text = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      }, (res) => {
        let data = "";
        console.log("Response status:", res.statusCode);
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          console.log("Response body:", data.substring(0, 200));
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
              return;
            }
            const txt = parsed.content && parsed.content[0] && parsed.content[0].text;
            resolve(txt || "");
          } catch(e) { reject(e); }
        });
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    };

  } catch (err) {
    console.error("Recap error:", err.message);
    return {
      statusCode: 500,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

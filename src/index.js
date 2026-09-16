function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return jsonResponse({
        success: true,
        message: "QuickKart Razorpay Worker is running",
      });
    }

    if (url.pathname !== "/createRazorpayQr") {
      return jsonResponse(
        {
          success: false,
          message: "Endpoint not found",
        },
        404
      );
    }

    if (request.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          message: "Only POST requests are allowed",
        },
        405
      );
    }

    try {
      const body = await request.json();

      const amount = Number(body?.amount);
      const orderReference =
        body?.orderReference || `QK-${Date.now()}`;

      if (!Number.isFinite(amount) || amount <= 0) {
        return jsonResponse(
          {
            success: false,
            message: "Invalid amount",
          },
          400
        );
      }

      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        return jsonResponse(
          {
            success: false,
            message: "Razorpay secrets are not configured",
          },
          500
        );
      }

      const amountInPaise = Math.round(amount * 100);

      const auth = btoa(
        env.RAZORPAY_KEY_ID +
          ":" +
          env.RAZORPAY_KEY_SECRET
      );

      const response = await fetch(
        "https://api.razorpay.com/v1/payments/qr_codes",
        {
          method: "POST",
          headers: {
            Authorization: "Basic " + auth,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "upi_qr",
            name: "QuickKart",
            usage: "single_use",
            fixed_amount: true,
            payment_amount: amountInPaise,
            description:
              "QuickKart Order " +
              String(orderReference).slice(0, 200),
            notes: {
              orderReference:
                String(orderReference).slice(0, 250),
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Razorpay QR API error", data);

        return jsonResponse(
          {
            success: false,
            message:
              data?.error?.description ||
              "Unable to create Razorpay QR",
          },
          response.status
        );
      }

      return jsonResponse({
        success: true,
        qr: {
          id: data.id,
          image_url: data.image_url,
          payment_amount: data.payment_amount,
          status: data.status,
        },
      });
    } catch (error) {
      console.error("Worker error", error);

      return jsonResponse(
        {
          success: false,
          message:
            error?.message ||
            "Unable to create Razorpay QR",
        },
        500
      );
    }
  },
};

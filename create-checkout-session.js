const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body || {};
    const origin = req.headers.origin || process.env.PUBLIC_APP_URL;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY in Vercel environment variables.' });
    }
    if (!process.env.STEWARD_PRICE_ID) {
      return res.status(500).json({ error: 'Missing STEWARD_PRICE_ID in Vercel environment variables.' });
    }
    if (!origin) {
      return res.status(500).json({ error: 'Missing app origin. Set PUBLIC_APP_URL in Vercel.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STEWARD_PRICE_ID,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      allow_promotion_codes: true,
      success_url: `${origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=true`,
      metadata: {
        app: 'moses',
        plan: 'steward_monthly',
      },
      subscription_data: {
        metadata: {
          app: 'moses',
          plan: 'steward_monthly',
        },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('create-checkout-session error:', error);
    return res.status(500).json({ error: error.message || 'Unable to create checkout session.' });
  }
};

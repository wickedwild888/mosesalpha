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

    if (!email) {
      return res.status(400).json({ error: 'Add your email in Profile before opening the billing portal.' });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];

    if (!customer) {
      return res.status(404).json({ error: 'No Stripe customer found for this email yet.' });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: origin || process.env.PUBLIC_APP_URL,
    });

    return res.status(200).json({ url: portal.url });
  } catch (error) {
    console.error('create-portal-session error:', error);
    return res.status(500).json({ error: error.message || 'Unable to create billing portal session.' });
  }
};

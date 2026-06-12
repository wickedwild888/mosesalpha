const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function upsertProfile({ email, subscriber, subscriptionPlan, renewalDate, stripeCustomerId, stripeSubscriptionId }) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !email) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const payload = {
    email,
    subscriber,
    subscription_plan: subscriptionPlan,
    renewal_date: renewalDate,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    updated_at: new Date().toISOString(),
  };

  await supabase.from('profiles').upsert(payload, { onConflict: 'email' });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  let event;

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('Stripe webhook signature error:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const subscription = session.subscription
        ? await stripe.subscriptions.retrieve(session.subscription)
        : null;

      await upsertProfile({
        email: session.customer_details && session.customer_details.email,
        subscriber: true,
        subscriptionPlan: 'steward_monthly',
        renewalDate: subscription && subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
      });
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);
      const active = ['active', 'trialing'].includes(subscription.status);

      await upsertProfile({
        email: customer.email,
        subscriber: active,
        subscriptionPlan: active ? 'steward_monthly' : 'free',
        renewalDate: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('stripe-webhook handling error:', error);
    return res.status(500).send('Webhook handler failed');
  }
};

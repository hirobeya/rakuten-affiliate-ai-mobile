const {config,verifySignature,activate,syncSubscription,ensureAuthUser} = require('../lib/billing');
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).end();
  let event;
  try {
    const chunks=[]; let size=0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size>1048576) return res.status(413).end();
      chunks.push(Buffer.from(chunk));
    }
    event=verifySignature(Buffer.concat(chunks),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);
  } catch { return res.status(400).json({message:'Invalid webhook'}); }
  try {
    if (event.livemode !== config().live) return res.status(400).json({message:'Environment mismatch'});
    const obj=event.data?.object;
    if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
      // Ignore unrelated products and pending asynchronous payments.
      if (obj.payment_link===config().link && obj.payment_status==='paid') await activate(obj.id,{requireActive:false});
    } else if (['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) {
      const row=await syncSubscription(obj.id);
      if (row?.active) await ensureAuthUser(row.email);
    } else if (['invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(event.type)) {
      const sub=obj.parent?.subscription_details?.subscription || obj.subscription;
      if (sub) await syncSubscription(typeof sub==='string'?sub:sub.id);
    }
    return res.status(200).json({received:true});
  } catch { return res.status(503).json({message:'Synchronization pending; retry required'}); }
};
module.exports.config = {api:{bodyParser:false}};

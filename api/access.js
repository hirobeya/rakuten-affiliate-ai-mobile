const {config, stripeGet, activate, authorize} = require('../lib/billing');
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).json({code:'method_not_allowed',message:'Method not allowed'}); }
  try {
    if (req.query.action === 'logout') {
      res.setHeader('Set-Cookie','urenavi_device_v1=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
      return res.status(204).end();
    }
    if (req.query.action === 'status') {
      const result = await authorize(req);
      return res.status(result.ok ? 200 : result.status).json({allowed:result.ok,email:result.ok ? String(result.user?.email||'') : ''});
    }
    if (req.query.action === 'buy') {
      const c = config();
      const link = await stripeGet('/payment_links/'+encodeURIComponent(c.link));
      const items = await stripeGet('/payment_links/'+encodeURIComponent(c.link)+'/line_items?limit=10');
      if (link.livemode !== c.live || !link.active || link.url !== c.url || (items.has_more || items.data?.length!==1) || !items.data?.some(x=>x.quantity===1 && !x.adjustable_quantity?.enabled && x.price?.id===c.price && x.price.unit_amount===980 && x.price.currency==='jpy' && x.price.recurring?.interval==='month' && x.price.recurring.interval_count===1)) throw new Error('Purchase configuration invalid');
      const restriction=link.restrictions?.completed_sessions;
      if (restriction?.limit !== 30 || restriction.count >= 30) throw new Error('Offer unavailable');
      const appUrl = process.env.URENAVI_APP_URL || (c.live ? 'https://rakuten-affiliate-ai-mobile.vercel.app' : 'https://'+process.env.VERCEL_BRANCH_URL);
      const destination=new URL(link.after_completion?.redirect?.url || '');
      if(link.after_completion?.type!=='redirect' || destination.origin!==new URL(appUrl).origin || destination.pathname!=='/api/access' || destination.searchParams.get('action')!=='activate' || destination.searchParams.get('session_id')!=='{CHECKOUT_SESSION_ID}') throw new Error('Activation redirect invalid');
      return res.redirect(302,c.url);
    }
    if (req.query.action !== 'activate') return res.status(400).json({code:'invalid_action',message:'Invalid action'});
    await activate(String(req.query.session_id||''));
    return res.redirect(303,'/app.html?activated=1');
  } catch {
    return res.status(503).json({code:'service_unavailable',message:'利用情報を確認できませんでした。時間をおいて再度お試しください。'});
  }
};

const crypto = require('node:crypto');
const {config, stripeGet, activate, authorize, setDeviceCookie, clearDeviceCookie, db} = require('../lib/billing');

const HANDOFF_TTL_MS = 10 * 60 * 1000;
const handoffHash = code => crypto.createHash('sha256').update(String(code)).digest('hex');
const validHandoffCode = code => /^[a-f0-9]{64}$/i.test(String(code || ''));

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  if (req.method !== 'GET') return res.status(405).json({message:'Method not allowed'});
  try {
    if (req.query.action === 'logout') {
      clearDeviceCookie(res);
      return res.status(204).end();
    }

    if (req.query.action === 'status') {
      const result = await authorize(req);
      if(result.ok && result.user?.email) setDeviceCookie(res,result.user.email);
      return res.status(result.ok ? 200 : result.status).json({allowed:result.ok,email:result.ok ? String(result.user?.email||'') : ''});
    }

    if (req.query.action === 'handoff-approve') {
      const code = String(req.query.code || '');
      if (!validHandoffCode(code)) return res.status(400).json({message:'Invalid handoff'});
      const result = await authorize(req);
      if (!result.ok || !result.user?.email) return res.status(result.status || 401).json({message:'Authentication required'});
      const codeHash = handoffHash(code);
      const row = {
        code_hash: codeHash,
        email: String(result.user.email).trim().toLowerCase(),
        expires_at: new Date(Date.now() + HANDOFF_TTL_MS).toISOString()
      };
      await db('urenavi_device_handoffs?on_conflict=code_hash', {
        method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(row)
      });
      setDeviceCookie(res,row.email);
      return res.status(200).json({approved:true});
    }

    if (req.query.action === 'handoff-status') {
      const code = String(req.query.code || '');
      if (!validHandoffCode(code)) return res.status(400).json({message:'Invalid handoff'});
      const codeHash = handoffHash(code);
      const rows = await db('urenavi_device_handoffs?'+new URLSearchParams({code_hash:'eq.'+codeHash,select:'email,expires_at'}));
      const row = rows[0];
      if (!row) return res.status(202).json({approved:false});
      if (!row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
        await db('urenavi_device_handoffs?code_hash=eq.'+encodeURIComponent(codeHash),{method:'DELETE',headers:{Prefer:'return=minimal'}});
        return res.status(410).json({approved:false});
      }
      const allowed = await authorize({headers:{cookie:''}}).catch(()=>({ok:false}));
      void allowed;
      setDeviceCookie(res,row.email);
      await db('urenavi_device_handoffs?code_hash=eq.'+encodeURIComponent(codeHash),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return res.status(200).json({approved:true,email:row.email});
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

    if (req.query.action !== 'activate') return res.status(400).json({message:'Invalid action'});
    const row=await activate(String(req.query.session_id||''));
    setDeviceCookie(res,row.email);
    return res.redirect(303,'/app.html?activated=1');
  } catch (e) {
    console.error('access failed', e?.message || 'unknown');
    return res.status(503).json({message:'利用情報を確認できませんでした。時間をおいて再度お試しください。'});
  }
};

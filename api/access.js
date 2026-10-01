const crypto = require('node:crypto');
const {config, proConfig, stripeGet, activate, authorize, authorizePro, upgradeBaseToPro, setDeviceCookie, clearDeviceCookie, db} = require('../lib/billing');

const HANDOFF_TTL_MS = 10 * 60 * 1000;
const handoffHash = code => crypto.createHash('sha256').update(String(code)).digest('hex');
const validHandoffCode = code => /^[a-f0-9]{64}$/i.test(String(code || ''));

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  try {
    if (req.method === 'POST' && req.query.action === 'upgrade-pro') {
      return res.status(404).json({message:'販売・新規受付は現在停止しています'});
    }
    if (req.method !== 'GET') return res.status(405).json({message:'Method not allowed'});
    if (req.query.action === 'logout') {
      clearDeviceCookie(res);
      return res.status(204).end();
    }

    if (req.query.action === 'pro-billing-status') {
      return res.status(200).json({configured:false});
    }

    if (req.query.action === 'status' || req.query.action === 'pro-status') {
      const pro=req.query.action==='pro-status';
      const result = pro ? await authorizePro(req) : await authorize(req);
      if(result.ok && result.user?.email) setDeviceCookie(res,result.user.email);
      return res.status(result.ok ? 200 : result.status).json({
        allowed:result.ok,
        pro:result.ok && (result.plan==='pro' || result.plan==='owner'),
        plan:result.ok ? String(result.plan||'base') : '',
        email:result.ok ? String(result.user?.email||'') : ''
      });
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
      const redirectToApp = String(req.query.redirect || '') === '1';
      if (!validHandoffCode(code)) return res.status(400).json({message:'Invalid handoff'});
      const codeHash = handoffHash(code);
      const rows = await db('urenavi_device_handoffs?'+new URLSearchParams({code_hash:'eq.'+codeHash,select:'email,expires_at'}));
      const row = rows[0];
      if (!row) return res.status(202).json({approved:false});
      if (!row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
        await db('urenavi_device_handoffs?code_hash=eq.'+encodeURIComponent(codeHash),{method:'DELETE',headers:{Prefer:'return=minimal'}});
        return res.status(410).json({approved:false});
      }
      setDeviceCookie(res,row.email);
      await db('urenavi_device_handoffs?code_hash=eq.'+encodeURIComponent(codeHash),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      if (redirectToApp) return res.redirect(303,'/open-app.html');
      return res.status(200).json({approved:true,email:row.email});
    }

    if (req.query.action === 'buy-pro' || req.query.action === 'buy') {
      return res.status(404).json({message:'販売・新規受付は現在停止しています'});
    }

    if (!['activate','activate-pro'].includes(String(req.query.action||''))) return res.status(400).json({message:'Invalid action'});
    const isPro=req.query.action==='activate-pro';
    const row=await activate(String(req.query.session_id||''),{plan:isPro?'pro':'base'});
    setDeviceCookie(res,row.email);
    return res.redirect(303,isPro?'/app.html?activated=pro#pro':'/open-app.html?activated=1');
  } catch (e) {
    console.error('access failed', e?.message || 'unknown');
    return res.status(503).json({message:'利用情報を確認できませんでした。時間をおいて再度お試しください。'});
  }
};

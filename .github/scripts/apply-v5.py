from pathlib import Path


def replace_once(path, old, new):
    p=Path(path)
    s=p.read_text()
    if old not in s:
        raise SystemExit(f'target not found in {path}: {old[:100]}')
    p.write_text(s.replace(old,new,1))

# lib/room-ai.js: preserve fully validated grounded evidence for copy use,
# while keeping strict spec-only eligibleForPost unchanged.
p=Path('lib/room-ai.js'); s=p.read_text()
old="""    text,source,evidence,valid,evidenceValid,textEvidenceValid,numbersValid,promoRisk,claimRisk,evidencePromoRisk,evidenceClaimRisk,genericRisk,truncationRisk,specLike,\n    eligibleForPost:valid&&specLike&&(source==='itemName'||source==='itemCaption')\n  };"""
new="""    text,source,evidence,valid,evidenceValid,textEvidenceValid,numbersValid,promoRisk,claimRisk,evidencePromoRisk,evidenceClaimRisk,genericRisk,truncationRisk,specLike,\n    eligibleForCopyEvidence:valid&&(source==='itemName'||source==='itemCaption'),\n    eligibleForPost:valid&&specLike&&(source==='itemName'||source==='itemCaption')\n  };"""
if old not in s: raise SystemExit('feature target not found')
s=s.replace(old,new,1)
old2="""    meaningCoverage:Number(meaningCoverage.toFixed(3)),promoRisk,claimRisk,evidencePromoRisk,evidenceClaimRisk,truncationRisk,specLike,\n    eligibleForPost:valid&&specLike&&(source==='itemName'||source==='itemCaption')\n  };"""
new2="""    meaningCoverage:Number(meaningCoverage.toFixed(3)),promoRisk,claimRisk,evidencePromoRisk,evidenceClaimRisk,truncationRisk,specLike,\n    eligibleForCopyEvidence:valid&&(source==='itemName'||source==='itemCaption'),\n    eligibleForPost:valid&&specLike&&(source==='itemName'||source==='itemCaption')\n  };"""
if old2 not in s: raise SystemExit('selling point target not found')
p.write_text(s.replace(old2,new2,1))

# public/app.html: let validated source evidence reach copy builder.
p=Path('public/app.html'); s=p.read_text()
old="""  const featureRows=(v.features||[])\n    .filter(x=>x?.eligibleForPost&&x?.text&&x?.evidence)\n    .filter(x=>x.source==='itemName'||x.source==='itemCaption');"""
new="""  const featureRows=(v.features||[])\n    .filter(x=>x?.eligibleForCopyEvidence&&x?.text&&x?.evidence)\n    .filter(x=>x.source==='itemName'||x.source==='itemCaption');"""
if old not in s: raise SystemExit('featureRows target not found')
s=s.replace(old,new,1)
old="""  const sellingPoints=(v.sellingPoints||[])\n    .filter(x=>x?.eligibleForPost&&x?.text&&x?.evidence)"""
new="""  const sellingPoints=(v.sellingPoints||[])\n    .filter(x=>x?.eligibleForCopyEvidence&&x?.text&&x?.evidence)"""
if old not in s: raise SystemExit('sellingPoints target not found')
s=s.replace(old,new,1)
old="""  const titleTokens=window.UrenaviPainCopy?.titleFactTokens?.(item)||[];\n  const facts=window.UrenaviFactSafety?.filterAllowedTitleFacts?.(titleTokens,combinedFacts)||[];\n  return window.UrenaviPainCopy?.buildGroundedBenefitPost?.(item,facts)\n    ||window.UrenaviPainCopy?.buildNeutralFactPost?.(item,facts)\n    ||'';"""
new="""  const universalPost=window.UrenaviPainCopy?.buildValidatedProductPost?.(item,insight.productType,combinedFacts)||'';\n  if(universalPost) return universalPost;\n  const titleTokens=window.UrenaviPainCopy?.titleFactTokens?.(item)||[];\n  const facts=window.UrenaviFactSafety?.filterAllowedTitleFacts?.(titleTokens,combinedFacts)||[];\n  return window.UrenaviPainCopy?.buildGroundedBenefitPost?.(item,facts)\n    ||window.UrenaviPainCopy?.buildNeutralFactPost?.(item,facts)\n    ||'';"""
if old not in s: raise SystemExit('aiPhase1Post target not found')
p.write_text(s.replace(old,new,1))

# public/room-copy-quality.js: universal builder from dynamically validated product type + exact source quotes.
p=Path('public/room-copy-quality.js'); s=p.read_text()
marker="  function buildGroundedBenefitPost(item,facts=[]){"
if marker not in s: raise SystemExit('quality marker not found')
insert=r'''  const AI_COPY_EVIDENCE_RISK_RE=/(?:絶対|必ず|確実|No\.?\s*1|ナンバーワン|一番|最高|最強|治る|治療|改善|若返|痩せ|美白|小顔|リフトアップ|予防|効果|効能|除菌|殺菌|抗菌|消臭|防臭|ランキング|受賞|送料無料|クーポン|SALE|セール|半額|最安|ポイント\d*倍|P\d+倍)/i;

  function aiCopySource(item){
    return [item?.itemName,item?.itemCaption]
      .filter(Boolean)
      .map(x=>String(x).normalize('NFKC').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim())
      .join(' ');
  }

  function validatedAiCopyEvidence(item,facts=[]){
    const source=aiCopySource(item);
    return (Array.isArray(facts)?facts:[])
      .map(x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim())
      .filter(x=>x&&x.length<=96&&source.includes(x)&&!AI_COPY_EVIDENCE_RISK_RE.test(x))
      .filter((x,i,a)=>a.indexOf(x)===i)
      .slice(0,3);
  }

  function buildValidatedProductPost(item,identity,evidenceFacts=[]){
    const id=String(identity||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    const source=aiCopySource(item);
    if(!id||id.length>32||!source.includes(id)||AI_COPY_EVIDENCE_RISK_RE.test(id)) return '';
    const facts=validatedAiCopyEvidence(item,evidenceFacts);
    const price=Number(item?.itemPrice);
    const lines=[id+'を探しているならチェック。','', '商品名・説明から「'+id+'」として確認できた商品です。'];
    for(const fact of facts.slice(0,2)){
      const transformed=groundedBenefitForFact(fact);
      if(transformed?.benefit) lines.push('',transformed.benefit);
      else lines.push('','商品説明では「'+fact+'」と確認できます。');
    }
    if(!facts.length){
      lines.push('',id+'として商品情報を確認できています。価格や商品ページの詳細を見比べながら、自分の条件に合うか確認できます。');
    }else{
      lines.push('',id+'を選ぶときに、商品ページの情報とあわせて比較したいポイントです。');
    }
    if(Number.isFinite(price)&&price>0) lines.push('','価格：'+fmt(price)+'円');
    lines.push('','※アフィリエイト広告を利用しています');
    return lines.join('\n').slice(0,500);
  }

'''
s=s.replace(marker,insert+marker,1)
old="""  api.buildGroundedBenefitPost=buildGroundedBenefitPost;\n  api.groundedBenefitForFact=groundedBenefitForFact;"""
new="""  api.buildGroundedBenefitPost=buildGroundedBenefitPost;\n  api.buildValidatedProductPost=buildValidatedProductPost;\n  api.validatedAiCopyEvidence=validatedAiCopyEvidence;\n  api.groundedBenefitForFact=groundedBenefitForFact;"""
if old not in s: raise SystemExit('quality export target not found')
p.write_text(s.replace(old,new,1))

# regression tests
p=Path('test/local-grounded-facts.test.js'); s=p.read_text()
addition=r'''

test('validated AI copy supports previously unknown product types from grounded source evidence',()=>{
  const api=load();
  const item={itemName:'髭剃り シェーバー 電気 カミソリ メンズ ポータブル 回転式 6枚刃 防水',itemCaption:'電気シェーバーとして掲載。回転式6枚刃を採用。',itemPrice:3319};
  const out=api.buildValidatedProductPost(item,'電気シェーバー',['回転式6枚刃']);
  assert.match(out,/電気シェーバーを探しているならチェック。/);
  assert.match(out,/回転式6枚刃/);
  assert.match(out,/価格：3,319円/);
});

test('validated AI copy rejects identity or evidence absent from source',()=>{
  const api=load();
  const item={itemName:'シェーバー メンズ',itemCaption:'電気シェーバーとして掲載。',itemPrice:1000};
  assert.equal(api.buildValidatedProductPost(item,'掃除機',['急速充電']), '');
  const out=api.buildValidatedProductPost(item,'電気シェーバー',['急速充電']);
  assert.doesNotMatch(out,/急速充電/);
});

test('client AI path uses validated copy evidence instead of spec-only evidence',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
  assert.match(html,/eligibleForCopyEvidence/);
  assert.match(html,/buildValidatedProductPost/);
});
'''
if 'validated AI copy supports previously unknown product types' not in s:
    p.write_text(s+addition)

p=Path('tests/room-ai-phase1.test.js'); s=p.read_text()
marker="  await run('Groq eligibleForPost uses strict spec allowlist'"
if marker not in s: raise SystemExit('AI test marker not found')
addition=r'''
  await run('valid non-spec AI evidence is preserved for copy but not promoted to strict spec fact',()=>{
    const v=validateAiExtraction({
      productType:{value:'電気シェーバー',source:'itemCaption',evidence:'電気シェーバー'},
      features:[{text:'回転式6枚刃',source:'itemCaption',evidence:'回転式6枚刃'}],
      sellingPoints:[],confidence:'high'
    },{itemName:'髭剃り シェーバー',itemCaption:'電気シェーバー 回転式6枚刃'},{imageAvailable:false});
    assert.equal(v.productType.valid,true);
    assert.equal(v.features[0].valid,true);
    assert.equal(v.features[0].eligibleForCopyEvidence,true);
    assert.equal(v.features[0].eligibleForPost,false);
  });

'''
p.write_text(s.replace(marker,addition+marker,1))

# restore normal CI and remove patch helper/trigger files in the result commit.
Path('.github/workflows/ci.yml').write_text("name: Verify Urenavi\non: [push, pull_request]\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '24'\n      - run: node --test\n")
for path in ['.github/scripts/apply-v5.py','.v5-trigger','.v5-trigger2']:
    Path(path).unlink(missing_ok=True)

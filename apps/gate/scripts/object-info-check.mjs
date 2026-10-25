// Main journey -> actual rendered object marker -> Convex -> saved Apify run -> cited HUD/native XR card.
// Explicit --live enables at most one lookup per supported topic. Saved run IDs prevent ambiguous retries.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';
import { launchBrowser } from './browser.mjs';
if(!process.argv.includes('--live'))throw Error('Pass --live to verify real bounded Apify retrieval.');
const base=process.env.GATE_URL??'https://localhost:5180',out='.logs/object-info-live';mkdirSync(out,{recursive:true});
const fromHome=process.argv.includes('--from-home');
const backend=new ConvexHttpClient('http://127.0.0.1:3210');
if(existsSync(out+'/room.json')){
  const previous=JSON.parse(readFileSync(out+'/room.json','utf8'));
  const jobs=(await backend.query(api.objectKnowledge.list,previous)).jobs;
  if(jobs.some(j=>['starting','running','uncertain','failed'].includes(j.status)))throw Error('A saved verification topic needs inspection. No new cloud run was started.');
}
const browser=await launchBrowser(),ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
await ctx.addInitScript(()=>Object.defineProperty(Navigator.prototype,'xr',{get:()=>undefined,configurable:true}));
const page=await ctx.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
let auth;
try{
  await page.goto(`${base}/?voice=off&memory=red-kite&emulate=1`);
  if(fromHome){
    await check('welcome keeps Begin and the existing examples alongside the Apify option at three screen sizes',async()=>{
      await expect(page.getByTestId('home-discovery')).toContainText('via Apify',{timeout:90000});
      await expect(page.getByTestId('begin')).toBeEnabled();
      await expect(page.getByTestId('enter-vr')).toBeVisible({timeout:15000});
      await expect(page.getByTestId('open-red-kite')).toHaveAttribute('href','/?story=red-kite');
      await expect(page.getByTestId('open-object-workshop')).toHaveAttribute('href','/?story=red-kite&objects=1');
      for(const [label,width,height] of [['desktop',1440,900],['phone',390,844],['landscape',844,390]]){
        await page.setViewportSize({width,height});
        const portal=await page.getByTestId('portal').boundingBox(),bar=await page.locator('.topbar').boundingBox();
        assert.ok(portal.x>=0&&portal.x+portal.width<=width&&portal.y>=bar.y+bar.height&&portal.y+portal.height<=height,`${label}: welcome fits below the top bar`);
        const controls=await Promise.all(['begin','explore-meadow','open-red-kite','open-object-workshop','enter-vr'].map(id=>page.getByTestId(id).boundingBox()));
        for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
          const a=controls[i],b=controls[j];
          assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${label}: welcome and headset controls do not overlap`);
        }
        await page.screenshot({path:out+`/home-${label}.png`,timeout:60000});
      }
      assert.equal(await page.evaluate(()=>window.__gate.store.getState().session),null,'viewing the welcome does not create a room or trigger a lookup');
      await page.setViewportSize({width:1440,height:900});
    });
    await check('a family invitation keeps its focused Join flow',async()=>{
      await page.evaluate(()=>window.__gate.store.getState().set({invite:{code:'ABCDEF',key:'ABCDEF',host:'your family'}}));
      await expect(page.getByTestId('home-discovery')).toHaveCount(0);
      await expect(page.getByTestId('begin')).toHaveText('Join');
      await page.evaluate(()=>window.__gate.store.getState().set({invite:null}));
    });
    await check('nearby visits retain Join and Start a new visit with the optional sample',async()=>{
      await page.evaluate(()=>window.__presence.setState({nearby:{code:'ABCDEF',key:'ABCDEF'}}));
      await expect(page.getByTestId('join-nearby')).toBeVisible();
      await expect(page.getByTestId('begin')).toHaveText('Start a new visit');
      await expect(page.getByTestId('explore-meadow')).toBeVisible();
      await page.evaluate(()=>window.__presence.setState({nearby:null}));
    });
    await page.getByTestId('explore-meadow').click();
    await page.waitForFunction(()=>window.__gate.store.getState().stage==='memory',null,{timeout:90000});
    await page.getByTestId('choose-grandparent').click({timeout:45000});
    await check('the home option opens the existing prepared meadow and labels it as a fictional sample',async()=>{
      assert.match(await page.evaluate(()=>window.__gate.store.getState().memoryTitle),/fictional sample/);
      assert.equal(await page.evaluate(()=>window.__gate.memory.introLine()),'Here we are. The little path, and the old oak at the bend.');
    });
  }else{
    await page.getByTestId('begin').click({timeout:90000});
    await page.getByTestId('choose-grandparent').click({timeout:45000});
  }
  await page.waitForFunction(()=>window.__gate.store.getState().session,null,{timeout:30000});
  auth=await page.evaluate(()=>{const s=window.__gate.store.getState().session;return{code:s.code,token:s.token};});
  writeFileSync(out+'/room.json',JSON.stringify(auth)); // ignored, private credentials; never copy into evidence
  if(!fromHome){
    await page.evaluate(()=>window.__gate.flow.testHear('We flew a white kite in this meadow, with flowers beside the little path.'));
    await page.evaluate(()=>window.__gate.flow.testHear('Yes, let us go there together.'));
  }
  await page.waitForFunction(()=>window.__gate.store.getState().stage==='memory',null,{timeout:90000});
  await page.waitForFunction(()=>window.__gate.store.getState().photoWorld,null,{timeout:45000});
  await page.getByRole('button',{name:'My view',exact:true}).click();
  await page.waitForTimeout(4500);
  await check('the same main meadow and existing controls remain visible',async()=>{
    await expect(page.getByTestId('leave')).toBeVisible();await expect(page.getByTestId('add-memory')).toBeVisible();await expect(page.getByTestId('places-objects')).toBeVisible();
    await expect(page.locator('.object-info-marker[data-topic="kite"]')).toBeVisible({timeout:30000});
    await page.screenshot({path:out+'/meadow-markers.png',timeout:60000});
  });
  const before=await page.getByTestId('leave').boundingBox();
  await check('selecting the kite retrieves an actual Apify citation inside the unchanged view',async()=>{
    await page.locator('.object-info-marker[data-topic="kite"]').click();
    await expect(page.getByTestId('object-info-card')).toBeVisible();
    await expect(page.getByTestId('object-info-card').getByRole('link',{name:'Read source'})).toBeVisible({timeout:120000});
    await expect(page.getByTestId('object-info-card')).toContainText('via Apify');
    assert.deepEqual(await page.getByTestId('leave').boundingBox(),before);
    const jobs=(await backend.query(api.objectKnowledge.list,auth)).jobs;
    assert.equal(jobs.find(j=>j.topicKey==='kite')?.status,'ready');
    await page.screenshot({path:out+'/meadow-apify-card.png',timeout:60000});
    const id=jobs.find(j=>j.topicKey==='kite').runId;
    await page.getByRole('button',{name:'Close object information'}).click();await page.locator('.object-info-marker[data-topic="kite"]').click();
    assert.equal((await backend.query(api.objectKnowledge.list,auth)).jobs.find(j=>j.topicKey==='kite').runId,id);
    await page.getByRole('button',{name:'Close object information'}).click();
  });
  await check('POV switching and resting close the addon without changing their controls',async()=>{
    await page.locator('.object-info-marker[data-topic="kite"]').click();
    await page.evaluate(()=>window.__social.setViewing('child'));await expect(page.getByTestId('object-info-card')).toHaveCount(0);
    await page.evaluate(()=>window.__social.setViewing('grandparent'));await page.getByTestId('rest').click();await expect(page.getByTestId('object-info-hud')).toHaveCount(0);await page.getByTestId('rest').click();
  });
  await check('native markers and a source card render in a stereo Quest session',async()=>{
    await page.waitForFunction(()=>window.__memoryObjectScene?.emulator());
    await page.evaluate(()=>{const d=window.__memoryObjectScene.emulator();if(d.devui){d.devui.devUIContainer.style.display='none';d.devui.render=()=>undefined;}d.ipd=.064;d.stereoEnabled=true;});
    await page.getByTestId('enter-vr').click();await page.waitForFunction(()=>window.__objectInfo?.snapshot().xr,null,{timeout:20000});
    await page.waitForFunction(()=>window.__objectInfo.snapshot().markers.some(m=>m.visible),null,{timeout:30000});
    await expect(page.getByTestId('object-info-hud')).toHaveCount(0);
    await page.screenshot({path:out+'/quest-object-markers.png',timeout:60000});
    // Aim the actual emulated controller at the native marker; do not call the addon's selection handler.
    const aim=async name=>{
      await page.evaluate(name=>{
        const at=window.__objectInfo.rayTarget(name);if(!at)throw Error('No native ray target');
        const c=window.__memoryObjectScene.emulator().controllers.left;
        c.position.set(-.3,1.15,-.3);
        const vx=at[0]+.3,vy=at[1]-1.15,vz=at[2]+.3,len=Math.hypot(vx,vy,vz),qx=vy/len,qy=-vx/len,qw=1-vz/len,n=Math.hypot(qx,qy,qw);
        c.quaternion.set(qx/n,qy/n,0,qw/n);
      },name);
      await page.waitForTimeout(80);
      await page.evaluate(()=>window.__memoryObjectScene.emulator().controllers.left.updateButtonValue('trigger',1));await page.waitForTimeout(150);
      await page.evaluate(()=>window.__memoryObjectScene.emulator().controllers.left.updateButtonValue('trigger',0));await page.waitForTimeout(200);
    };
    await page.waitForTimeout(2500);
    const marker=await page.evaluate(()=>window.__objectInfo.snapshot().markers.find(m=>m.topic==='kite').id);
    for(let attempt=0;attempt<3;attempt++){await aim('ObjectInfoMarker:'+marker);if(await page.evaluate(()=>window.__objectInfo.snapshot().card))break;}
    await page.waitForFunction(()=>window.__objectInfo.snapshot().card,null,{timeout:15000});
    await page.screenshot({path:out+'/quest-apify-card.png',timeout:60000});
    await aim('ObjectInfoAction:Details');
    await page.waitForFunction(()=>window.__objectInfo.rayTarget('ObjectInfoAction:Less'));
    await aim('ObjectInfoAction:Back');
    await page.waitForFunction(()=>!window.__objectInfo.snapshot().card);
    for(const [topic,id] of [['flowers','meadow:flowers'],['trees','meadow:oak']]){
      await aim('ObjectInfoMarker:'+id);
      await page.waitForFunction(()=>window.__objectInfo.snapshot().card,null,{timeout:15000});
      await expect.poll(async()=>{const j=(await backend.query(api.objectKnowledge.list,auth)).jobs.find(j=>j.topicKey===topic);if(j?.status==='failed'||j?.status==='uncertain')throw Error(`Saved ${topic} run ${j.runId} needs inspection; no automatic retry.`);return j?.status;},{timeout:120000,intervals:[1500,2500,4000]}).toBe('ready');
      await page.screenshot({path:out+`/quest-${topic}-card.png`,timeout:60000});
      await aim('ObjectInfoAction:Back');await page.waitForFunction(()=>!window.__objectInfo.snapshot().card);
      checks.push(`real native ${topic} hotspot retrieves attributed Apify context`);console.log('PASS native '+topic+' context');
    }
    await page.evaluate(()=>window.__memoryObjectScene.emulator().controllers.right.updateButtonValue('b-button',1));await page.waitForTimeout(150);await page.evaluate(()=>window.__memoryObjectScene.emulator().controllers.right.updateButtonValue('b-button',0));
    await page.waitForFunction(()=>window.__gate.store.getState().resting);
    await page.evaluate(()=>window.__memoryObjectScene.emulator().controllers.right.updateButtonValue('b-button',1));await page.waitForTimeout(150);await page.evaluate(()=>window.__memoryObjectScene.emulator().controllers.right.updateButtonValue('b-button',0));
    await page.waitForFunction(()=>!window.__gate.store.getState().resting);
  });
  const jobs=(await backend.query(api.objectKnowledge.list,auth)).jobs;
  assert.deepEqual(errors,[]);
  writeFileSync(out+'/verification.json',JSON.stringify({checks,errors,fromHome,actorVersion:'1.3',mainBase:'e78e720',jobs:jobs.map(j=>({topic:j.topicKey,status:j.status,runId:j.runId,sources:j.references.map(r=>({url:r.sourceUrl,publisher:r.attribution,fetchedAt:r.fetchedAt}))})),xr:await page.evaluate(()=>window.__objectInfo.snapshot()),physicalHeadset:false},null,2));
  console.log(JSON.stringify({checks:checks.length,errors:errors.length,runs:jobs.map(j=>j.runId)}));
}catch(e){
  writeFileSync(out+'/failure.json',JSON.stringify({error:String(e),errors,scene:await page.evaluate(()=>({stage:window.__gate?.store.getState().stage,objects:window.__objectInfo?.snapshot()})).catch(()=>null),jobs:auth?(await backend.query(api.objectKnowledge.list,auth)).jobs.map(j=>({topic:j.topicKey,status:j.status,runId:j.runId,error:j.error})):[]},null,2));
  await page.screenshot({path:out+'/failure.png',timeout:30000}).catch(()=>{});console.error(String(e).slice(0,350));process.exitCode=1;
}finally{await browser.close();}

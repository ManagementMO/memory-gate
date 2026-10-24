import { test, expect } from '@playwright/test';
import { backend, createRoomWithConsent, deleteOwnedRoom, IPHONE_13, overflowsX, wav } from './helpers.mjs';

test('the simpler storyteller view preserves pause, words, and permission boundaries', async ({ browser }) => {
  const context=await browser.newContext({ ...IPHONE_13 });
  const page=await context.newPage();
  try {
    await createRoomWithConsent(page,{title:'A place we enjoy',name:'Alex (fictional test)',sample:true,
      scopes:{voice_recording:false,vendor_upload_modal:false,vendor_upload_worldlabs:false,share_with_family:false}});
    await page.getByTestId('tab-story').click();
    await page.getByTestId('practice-load').click();
    await page.getByTestId('story-focus').click();
    await expect(page.getByTestId('family-story-tools')).toBeHidden();
    await expect(page.getByTestId('story-moment')).toBeVisible();
    await expect(page.getByTestId('pause-toggle')).toBeVisible();
    await expect(page.getByTestId('stage-open')).toHaveText(/Choose sharing permissions/);
    await expect(page.getByTestId('memory-stage-frame')).toHaveCount(0);
    await page.getByTestId('tell-input').fill("I'm not sure if there was a radio.");
    await page.getByTestId('tell-submit').click();
    await expect(page.getByTestId('story-moment')).toContainText("I'm not sure if there was a radio.");
    await expect(page.getByTestId('story-moment')).toContainText('There is no right answer');
    await page.getByTestId('pause-toggle').click();
    await expect(page.getByTestId('paused-banner')).toBeVisible();
    await expect(page.getByTestId('stage-open')).toBeDisabled();
    await page.getByTestId('pause-toggle').click();
    await page.getByTestId('story-focus').click();
    await expect(page.getByTestId('object-item')).toHaveCount(4);
    await expect(page.getByTestId('utterance-item').first()).toHaveAttribute('data-intent','none');
    expect(await overflowsX(page)).toBe(false);
  } finally { await deleteOwnedRoom(page);await context.close(); }
});

test('a new latest recording stops the previous voice before changing its attribution', async ({ page }) => {
  try {
    const code=await createRoomWithConsent(page,{title:'Original voice attribution',name:'Alex (fictional test)',scopes:{voice_recording:true,vendor_upload_modal:false,vendor_upload_worldlabs:false}});
    await page.getByTestId('tab-story').click();
    const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('memorygate.session.v1')));
    const {client,api}=backend();
    const upload=await client.mutation(api.utterances.generateAudioUploadUrl,{code,token:session.token});
    const response=await fetch(upload,{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav(8)});
    const {storageId}=await response.json();
    const say=transcript=>client.mutation(api.utterances.add,{code,token:session.token,transcript,source:'fixture',commandId:crypto.randomUUID(),audioFileId:storageId});
    await say('Our first story.');
    await expect(page.getByTestId('story-moment')).toContainText('Our first story.');
    await page.evaluate(()=>{
      const original=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(){window.__replayedClip=this;return original.call(this);};
    });
    await page.getByTestId('story-moment').getByTestId('replay').click();
    await expect(page.getByTestId('story-moment').getByTestId('replay')).toHaveAttribute('data-state','playing');
    await say('A new story at our own pace.');
    await expect(page.getByTestId('story-moment')).toContainText('A new story at our own pace.');
    await expect(page.getByTestId('story-moment').getByTestId('replay')).toHaveAttribute('data-state','idle');
    expect(await page.evaluate(()=>window.__replayedClip.paused)).toBe(true);
  } finally { await deleteOwnedRoom(page); }
});

test('the shared 3D view opens without a family key and closes when sharing is revoked', async ({ browser }) => {
  test.setTimeout(65000);
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1100,height:900}});
  const page=await context.newPage();
  const policyErrors=[];
  page.on('console',message=>{if(message.type()==='error' && /xr-spatial-tracking/.test(message.text()))policyErrors.push(message.text());});
  try {
    const code=await createRoomWithConsent(page,{title:'Shared illustrative garden',name:'Alex (fictional test)',sample:true,
      scopes:{voice_recording:false,vendor_upload_modal:false,vendor_upload_worldlabs:false,share_with_family:true}});
    await page.getByTestId('tab-story').click();
    await page.getByTestId('practice-load').click();
    await expect(page.getByTestId('memory-stage-frame')).toHaveCount(0);
    await page.getByTestId('stage-open').click();
    await expect(page.getByTestId('memory-stage-frame')).toBeVisible();
    const src=await page.getByTestId('memory-stage-frame').getAttribute('src');
    expect(new URL(src).searchParams.has('key')).toBe(false);
    const frame=page.frames().find(f=>f.url().includes('view=spectator')) ?? await page.waitForEvent('framenavigated',f=>f.url().includes('view=spectator'));
    await frame.waitForFunction(()=>window.__mg?.placements?.().filter(o=>o.phase==='solid').length===4,null,{timeout:35000});
    expect(await frame.evaluate(()=>window.__mg.stats.spectator)).toBe(true);
    expect(await frame.evaluate(()=>window.__mg.stats.drift)).toBe(false);
    const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('memorygate.session.v1')));
    const {client,api}=backend(),view=await client.query(api.rooms.get,{code,token:session.token});
    await client.mutation(api.consents.revoke,{code,token:session.token,consentId:view.consents[0].id});
    await expect(page.getByTestId('memory-stage-frame')).toHaveCount(0);
    await expect(page.getByTestId('stage-open')).toHaveText(/Choose sharing permissions/);
    expect(policyErrors).toEqual([]);
  } finally {await deleteOwnedRoom(page);await context.close();}
});

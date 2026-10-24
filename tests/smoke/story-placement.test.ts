import { expect, test, vi } from 'vitest';
import { storyPlacement } from '../../packages/shared/src/story-placement';
import { api, internal } from '../../convex/_generated/api';
import { cid, drain, newT, setupRoom } from './helpers';

test('unpointed narrative props stay on the floor, clear of conservative object bounds', () => {
  const objects = [{size:1.6, anchor:{position:[-2,0,-3.3]}}];
  const position=storyPlacement(.55,objects)!;
  expect(position[1]).toBe(0);
  expect(Math.hypot(position[0]+2,position[2]+3.3)).toBeGreaterThan((1.6+.55)*.5+.18);
});
test('new floor suggestions stay inside the courtyard even for a large prop', () => {
  const position=storyPlacement(3,[])!,r=1.62;
  expect(position[0]-r).toBeGreaterThanOrEqual(-5.5);
  expect(position[0]+r).toBeLessThanOrEqual(5.5);
  expect(position[2]-r).toBeGreaterThanOrEqual(-8.05);
  expect(position[2]+r).toBeLessThanOrEqual(-1);
});
test('exhausted space never falls back to an overlapping position', () => {
  expect(storyPlacement(.55,[{size:30,anchor:{position:[0,0,-4]}}])).toBeNull();
});
test('successive additions choose different available slots', () => {
  const first=storyPlacement(.55,[])!;
  expect(storyPlacement(.72,[{size:.55,anchor:{position:first}}])).not.toEqual(first);
});

test('the backend ignores ungrounded model support fields and never overlaps an exhausted room', async () => {
  vi.useFakeTimers();
  try {
    const t=newT(),{code,owner}=await setupRoom(t);
    await t.run(async ctx=>{const room=await ctx.db.query('rooms').withIndex('by_code',q=>q.eq('code',code)).unique();await ctx.db.patch(room!._id,{layout:'courtyard'});});
    const {utteranceId}=await t.mutation(api.utterances.add,{code,token:owner,transcript:'There was a radio.',source:'typed',commandId:cid()});
    const args={actions:[{type:'propose_object',label:'radio',details:[],where:'',quote:'radio',anchor:'table',relation:'on',generatorPrompt:'radio'}],reply:'Thank you.',replyTranslation:'',aiMode:'mock',aiMs:0,dropped:[],language:'en',translation:null};
    await t.mutation(internal.objects.applyActions,{utteranceId,...args});
    const first=(await t.query(api.objects.list,{code,token:owner}))[0]!;
    expect(first.anchor.position[1]).toBe(0);
    expect(first.anchor.source).toBe('suggested-layout');
    await t.run(ctx=>ctx.db.patch(first.id,{size:30}));
    await expect(t.mutation(api.objects.proposeFromPhone,{code,token:owner,label:'chair',commandId:cid()})).rejects.toThrow(/no clear floor space/i);
    const next=await t.mutation(api.utterances.add,{code,token:owner,transcript:'There was a chair.',source:'typed',commandId:cid()});
    await t.mutation(internal.objects.applyActions,{...args,utteranceId:next.utteranceId,actions:[{...args.actions[0]!,label:'chair',quote:'chair'}]});
    expect(await t.query(api.objects.list,{code,token:owner})).toHaveLength(1);
    const words=(await t.query(api.utterances.recent,{code,token:owner})).find(u=>u.id===next.utteranceId)!;
    expect(words).toMatchObject({status:'done',transcript:'There was a chair.',intent:'none'});
    expect(words.dropped.join(' ')).toContain('No clear floor space');
    await drain(t);
  } finally {vi.useRealTimers();}
});

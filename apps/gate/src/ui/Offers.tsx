// Gentle alternatives to talking, offered by the companion: a photo, a video, or someone to help.
// Each is one tap; files can also be dropped anywhere on the page.
import { useRef } from 'react';
import { flow } from '../flow/controller';
import { useGate } from '../state/store';
import { PeopleIcon, PhotoIcon, VideoIcon } from './Icons';

export function Offers() {
  const stage = useGate((s) => s.stage);
  const offers = useGate((s) => s.offers);
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  if (stage !== 'gathering') return null;
  const any = offers.photo || offers.video || offers.invite;
  return (
    <div className="offers" data-testid="offers" style={{ opacity: any ? 1 : 0, transition: 'opacity 900ms var(--ease-soft)' }} aria-hidden={!any}>
      {offers.photo && (
        <button type="button" className="pill glass offer" onClick={() => photo.current?.click()} data-testid="offer-photo">
          <PhotoIcon /><span className="label">Show a photo<small>From this device</small></span>
        </button>
      )}
      {offers.video && (
        <button type="button" className="pill glass offer" onClick={() => video.current?.click()} data-testid="offer-video">
          <VideoIcon /><span className="label">Share a video<small>A short clip is plenty</small></span>
        </button>
      )}
      {offers.invite && (
        <button type="button" className="pill glass offer" onClick={() => useGate.getState().set({ inviteOpen: true })} data-testid="offer-invite">
          <PeopleIcon /><span className="label">Invite someone<small>They can send photos</small></span>
        </button>
      )}
      <input ref={photo} type="file" accept="image/*" hidden data-testid="photo-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void flow.receiveFile(f); e.target.value = ''; }} />
      <input ref={video} type="file" accept="video/*" hidden data-testid="video-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void flow.receiveFile(f); e.target.value = ''; }} />
    </div>
  );
}

// A small consistent icon set (24px grid, 1.6 stroke, round caps). Decorative: every use has a text label beside it.
type P = { size?: number };
const base = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const PhotoIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M5 17.5l4.6-4.4 3.2 3 2.6-2.4 3.6 3.8" /></svg>
);
export const VideoIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="3.5" y="6" width="12.5" height="12" rx="3" /><path d="M16 10.5l4.5-2.6v8.2L16 13.5" /></svg>
);
export const PeopleIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="9" r="3.2" /><path d="M3.8 19c.6-3 2.7-4.6 5.2-4.6s4.6 1.6 5.2 4.6" /><circle cx="16.6" cy="8.2" r="2.5" /><path d="M15.4 13.4c2.4-.2 4.2 1.2 4.8 3.9" /></svg>
);
export const RestIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M9 6.5v11M15 6.5v11" /></svg>
);
export const PlayIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M8.5 6.2v11.6l9.3-5.8z" /></svg>
);
export const SoundIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M4.5 9.5h3l4.2-3.6v12.2L7.5 14.5h-3z" /><path d="M15.4 9.2c1 .8 1.5 1.7 1.5 2.8s-.5 2-1.5 2.8M17.8 6.8c1.8 1.4 2.7 3.1 2.7 5.2s-.9 3.8-2.7 5.2" /></svg>
);
export const MuteIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M4.5 9.5h3l4.2-3.6v12.2L7.5 14.5h-3z" /><path d="M16 10l4 4M20 10l-4 4" /></svg>
);
export const LeaveIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M14 5.5h3.5a2 2 0 012 2v9a2 2 0 01-2 2H14" /><path d="M10.5 8.5L7 12l3.5 3.5M7 12h9" /></svg>
);
export const HeadsetIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M3.5 10.5a3 3 0 013-3h11a3 3 0 013 3v3.6a3 3 0 01-3 3h-2.6l-1.6-2.2a1.6 1.6 0 00-2.6 0l-1.6 2.2H6.5a3 3 0 01-3-3z" /></svg>
);
export const PhotosIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="3.5" y="6.5" width="13" height="11" rx="2.2" /><path d="M7.5 4.5h10.8a2.2 2.2 0 012.2 2.2v8.3" /><path d="M5 15.5l3.2-3.4 2.6 2.4 2-1.8 2.7 2.8" /><circle cx="12.8" cy="9.6" r="1.2" /></svg>
);
export const CloseIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
);
export const MicIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="9" y="3.8" width="6" height="10.4" rx="3" /><path d="M6 11.5a6 6 0 0012 0M12 17.5v3" /></svg>
);
export const MapIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M3.5 6.6l5.2-2.1 6.6 2.6 5.2-2.1v12.9l-5.2 2.1-6.6-2.6-5.2 2.1z" /><path d="M8.7 4.5v12.9M15.3 7.1V20" /></svg>
);
export const LockIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="5" y="10.5" width="14" height="9.5" rx="2.6" /><path d="M8.2 10.5V8a3.8 3.8 0 017.6 0v2.5" /></svg>
);
export const GlobeIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z" /></svg>
);
export const BackIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M14.5 6l-6 6 6 6" /></svg>
);
export const ZoomIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="10.5" cy="10.5" r="6.2" /><path d="M15.2 15.2l4.8 4.8M10.5 8v5M8 10.5h5" /></svg>
);
export const PlusIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 5.5v13M5.5 12h13" /></svg>
);
export const MinusIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M5.5 12h13" /></svg>
);

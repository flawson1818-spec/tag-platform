/**
 * A church's or group's live room: a session (training, information, preaching, worship) led by
 * one of its leaders, with an optional video (a YouTube or Facebook live shown in the page, or a
 * video-call link to join), shared worship music, and members interacting — chat, reactions,
 * raised hands. Pure helpers here; the socket side is GroupLiveGateway.
 */

export const LIVE_KINDS = ['TRAINING', 'INFORMATION', 'PREACHING', 'WORSHIP', 'PRAYER'] as const;
export type LiveKind = (typeof LIVE_KINDS)[number];

export interface LiveVideo {
  /** Shown inside the page (YouTube, Facebook). */
  embedUrl?: string;
  /** Opened in a new tab (Zoom, Google Meet, Jitsi, Teams…). */
  joinUrl?: string;
  link: string;
}

const YT_VIDEO = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const FACEBOOK = /^https:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\//i;

/** Turns the link a leader pastes into something the room can show or open. */
export function parseLiveVideo(link: string): LiveVideo | null {
  const value = link.trim();
  if (!/^https:\/\/[^\s]+$/i.test(value) || value.length > 500) return null;
  const yt = value.match(YT_VIDEO);
  if (yt) return { embedUrl: `https://www.youtube.com/embed/${yt[1]}?autoplay=1`, link: value };
  if (FACEBOOK.test(value)) {
    return { embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(value)}&show_text=false`, link: value };
  }
  return { joinUrl: value, link: value };
}

/** A fresh video-call room nobody can guess, opened in a new tab (no account needed). */
export function newVisioLink(communityId: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `https://meet.jit.si/TourAvantGarde-${communityId.slice(0, 8)}-${random}`;
}

import type { Track } from './lib/music';

/** The repository that hosts the site (used by the editor to publish changes). */
export const REPO = { owner: 'elrecreodeadanzonat-glitch', name: 'elrecreodeadanzonat-glitch.github.io' } as const;

/**
 * Firestore project that stores the photos and comments the family adds from the book.
 * The web API key only identifies the project (it is public by design); what anyone may read or write is
 * decided by firestore.rules on Google's side.
 */
export const FIREBASE = { projectId: 'libro-de-mama', apiKey: 'AIzaSyAkmo_2oLGePcnp8ZZevZDWUrL-yrXRXoo' } as const;

/** Background music (instrumental, verifiable reuse licence — see MUSIC_LICENSE.txt). Played in order, looping. */
export const PLAYLIST: Track[] = [
  { src: 'audio/01-uplifting-piano-pop-flow.mp3', title: 'Uplifting Piano Pop Flow Music', artist: 'JuliusH' },
  { src: 'audio/02-neon-piano-lane.mp3', title: 'Neon Piano Lane', artist: 'Turning Pages' },
  { src: 'audio/03-upbeat-happy-indie-pop.mp3', title: 'Upbeat Happy Indie Pop', artist: 'Vivaleum' },
  { src: 'audio/04-my-happy-dance.mp3', title: 'My Happy Dance', artist: 'melodyayresgriffiths' },
];

export const MUSIC_CREDIT = 'Música: JuliusH, Turning Pages, Vivaleum y melodyayresgriffiths (Pixabay)';

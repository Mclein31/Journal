/* Photo frame registry (Phase 5). Visuals live in styles/frames.css under [data-frame="id"].
   Adding a frame = one entry here + one CSS block. */

export interface FrameDef {
  id: string;
  label: string;
  /** has a handwritten caption strip */
  caption?: boolean;
  /** opens the tear tool instead of just styling (Phase 6) */
  tear?: boolean;
}

export const FRAMES: FrameDef[] = [
  { id: 'none', label: 'Plain' },
  { id: 'polaroid', label: 'Polaroid', caption: true },
  { id: 'instant', label: 'Instant mini', caption: true },
  { id: 'instant-wide', label: 'Instant wide', caption: true },
  { id: 'photocard', label: 'Photocard' },
  { id: 'tape', label: 'Washi tape' },
  { id: 'film', label: 'Film strip' },
  { id: 'stamp', label: 'Stamp' },
  { id: 'scallop', label: 'Scalloped' },
  { id: 'heart', label: 'Heart' },
  { id: 'circle', label: 'Circle' },
  { id: 'torn', label: 'Torn ✂', tear: true },
];

export const FRAME_COLORS = ['#ffffff', '#fbf4e6', '#2b2629', '#f7c6d0', '#cfe6d8', '#d6d0f2'];

export const frameDef = (id: string): FrameDef => FRAMES.find((f) => f.id === id) ?? FRAMES[0];

// utils/electrodes.js — 32-channel international 10-20 standard layout
// projected to a 2D unit disc (azimuthal equidistant). Channel order matches
// the BioSemi 32 / Easycap M10 ordering, which the mock backend uses verbatim.
//
//   x:  -1 = left ear (T7)              +1 = right ear (T8)
//   y:  -1 = nasion (Fpz front)         +1 = inion (Oz back)
//
// Values are slightly inset (max ~0.94) so dots never sit on the head outline.

(function () {
  const ELECTRODES_32 = [
    { label: 'Fp1', x: -0.29, y: -0.89 },
    { label: 'AF3', x: -0.32, y: -0.76 },
    { label: 'F7',  x: -0.75, y: -0.55 },
    { label: 'F3',  x: -0.41, y: -0.52 },
    { label: 'FC1', x: -0.22, y: -0.28 },
    { label: 'FC5', x: -0.62, y: -0.28 },
    { label: 'T7',  x: -0.94, y:  0.00 },
    { label: 'C3',  x: -0.47, y:  0.00 },
    { label: 'CP1', x: -0.22, y:  0.28 },
    { label: 'CP5', x: -0.62, y:  0.28 },
    { label: 'P7',  x: -0.75, y:  0.55 },
    { label: 'P3',  x: -0.41, y:  0.52 },
    { label: 'Pz',  x:  0.00, y:  0.52 },
    { label: 'PO3', x: -0.32, y:  0.76 },
    { label: 'O1',  x: -0.29, y:  0.89 },
    { label: 'Oz',  x:  0.00, y:  0.94 },
    { label: 'O2',  x:  0.29, y:  0.89 },
    { label: 'PO4', x:  0.32, y:  0.76 },
    { label: 'P4',  x:  0.41, y:  0.52 },
    { label: 'P8',  x:  0.75, y:  0.55 },
    { label: 'CP6', x:  0.62, y:  0.28 },
    { label: 'CP2', x:  0.22, y:  0.28 },
    { label: 'C4',  x:  0.47, y:  0.00 },
    { label: 'T8',  x:  0.94, y:  0.00 },
    { label: 'FC6', x:  0.62, y: -0.28 },
    { label: 'FC2', x:  0.22, y: -0.28 },
    { label: 'F4',  x:  0.41, y: -0.52 },
    { label: 'F8',  x:  0.75, y: -0.55 },
    { label: 'AF4', x:  0.32, y: -0.76 },
    { label: 'Fp2', x:  0.29, y: -0.89 },
    { label: 'Fz',  x:  0.00, y: -0.52 },
    { label: 'Cz',  x:  0.00, y:  0.00 },
  ];

  // BioSemi 128 channel positions (azimuthal equidistant projection)
  const ELECTRODES_128 = [
    { label: "A1", x: 0.0000, y: -0.0000 },
    { label: "A2", x: 0.0000, y: 0.1015 },
    { label: "A3", x: 0.0000, y: 0.2067 },
    { label: "A4", x: 0.0000, y: 0.3157 },
    { label: "A5", x: -0.1591, y: 0.3844 },
    { label: "A6", x: -0.2967, y: 0.2967 },
    { label: "A7", x: -0.3686, y: 0.3686 },
    { label: "A8", x: -0.3695, y: 0.5081 },
    { label: "A9", x: -0.4321, y: 0.5930 },
    { label: "A10", x: -0.4871, y: 0.6781 },
    { label: "A11", x: -0.5498, y: 0.7588 },
    { label: "A12", x: -0.6179, y: 0.8414 },
    { label: "A13", x: -0.3304, y: 0.9912 },
    { label: "A14", x: -0.2864, y: 0.8924 },
    { label: "A15", x: -0.2583, y: 0.7940 },
    { label: "A16", x: -0.2294, y: 0.6967 },
    { label: "A17", x: -0.1920, y: 0.5989 },
    { label: "A18", x: -0.1985, y: 0.4820 },
    { label: "A19", x: 0.0000, y: 0.4169 },
    { label: "A20", x: 0.0000, y: 0.5228 },
    { label: "A21", x: 0.0000, y: 0.6291 },
    { label: "A22", x: 0.0000, y: 0.7332 },
    { label: "A23", x: 0.0000, y: 0.8350 },
    { label: "A24", x: 0.0000, y: 0.9373 },
    { label: "A25", x: 0.0000, y: 1.0450 },
    { label: "A26", x: 0.3304, y: 0.9912 },
    { label: "A27", x: 0.2864, y: 0.8924 },
    { label: "A28", x: 0.2583, y: 0.7940 },
    { label: "A29", x: 0.2294, y: 0.6967 },
    { label: "A30", x: 0.1920, y: 0.5989 },
    { label: "A31", x: 0.1985, y: 0.4820 },
    { label: "A32", x: 0.1591, y: 0.3844 },
    { label: "B1", x: 0.1014, y: 0.0298 },
    { label: "B2", x: 0.1460, y: 0.1460 },
    { label: "B3", x: 0.2967, y: 0.2967 },
    { label: "B4", x: 0.3686, y: 0.3686 },
    { label: "B5", x: 0.3695, y: 0.5081 },
    { label: "B6", x: 0.4321, y: 0.5930 },
    { label: "B7", x: 0.4871, y: 0.6781 },
    { label: "B8", x: 0.5498, y: 0.7588 },
    { label: "B9", x: 0.6179, y: 0.8414 },
    { label: "B10", x: 0.7588, y: 0.5498 },
    { label: "B11", x: 0.6781, y: 0.4871 },
    { label: "B12", x: 0.5930, y: 0.4321 },
    { label: "B13", x: 0.5081, y: 0.3695 },
    { label: "B14", x: 0.7940, y: 0.2583 },
    { label: "B15", x: 0.6967, y: 0.2294 },
    { label: "B16", x: 0.5989, y: 0.1920 },
    { label: "B17", x: 0.4820, y: 0.1985 },
    { label: "B18", x: 0.3844, y: 0.1591 },
    { label: "B19", x: 0.2719, y: 0.1581 },
    { label: "B20", x: 0.2067, y: -0.0000 },
    { label: "B21", x: 0.3157, y: -0.0000 },
    { label: "B22", x: 0.4169, y: -0.0000 },
    { label: "B23", x: 0.5228, y: -0.0000 },
    { label: "B24", x: 0.6291, y: -0.0000 },
    { label: "B25", x: 0.7332, y: -0.0000 },
    { label: "B26", x: 0.8350, y: -0.0000 },
    { label: "B27", x: 0.7940, y: -0.2583 },
    { label: "B28", x: 0.6967, y: -0.2294 },
    { label: "B29", x: 0.5989, y: -0.1920 },
    { label: "B30", x: 0.4820, y: -0.1985 },
    { label: "B31", x: 0.3844, y: -0.1591 },
    { label: "B32", x: 0.2719, y: -0.1581 },
    { label: "C1", x: 0.0597, y: -0.0836 },
    { label: "C2", x: 0.1460, y: -0.1460 },
    { label: "C3", x: 0.2967, y: -0.2967 },
    { label: "C4", x: 0.3686, y: -0.3686 },
    { label: "C5", x: 0.5081, y: -0.3695 },
    { label: "C6", x: 0.5930, y: -0.4321 },
    { label: "C7", x: 0.6781, y: -0.4871 },
    { label: "C8", x: 0.4871, y: -0.6781 },
    { label: "C9", x: 0.4321, y: -0.5930 },
    { label: "C10", x: 0.3695, y: -0.5081 },
    { label: "C11", x: 0.1581, y: -0.2719 },
    { label: "C12", x: 0.1591, y: -0.3844 },
    { label: "C13", x: 0.1985, y: -0.4820 },
    { label: "C14", x: 0.1920, y: -0.5989 },
    { label: "C15", x: 0.2294, y: -0.6967 },
    { label: "C16", x: 0.2583, y: -0.7940 },
    { label: "C17", x: 0.0000, y: -0.8350 },
    { label: "C18", x: 0.0000, y: -0.7332 },
    { label: "C19", x: 0.0000, y: -0.6291 },
    { label: "C20", x: 0.0000, y: -0.5228 },
    { label: "C21", x: 0.0000, y: -0.4169 },
    { label: "C22", x: 0.0000, y: -0.3157 },
    { label: "C23", x: 0.0000, y: -0.2067 },
    { label: "C24", x: -0.1581, y: -0.2719 },
    { label: "C25", x: -0.1591, y: -0.3844 },
    { label: "C26", x: -0.1985, y: -0.4820 },
    { label: "C27", x: -0.1920, y: -0.5989 },
    { label: "C28", x: -0.2294, y: -0.6967 },
    { label: "C29", x: -0.2583, y: -0.7940 },
    { label: "C30", x: -0.4871, y: -0.6781 },
    { label: "C31", x: -0.4321, y: -0.5930 },
    { label: "C32", x: -0.3695, y: -0.5081 },
    { label: "D1", x: -0.0597, y: -0.0836 },
    { label: "D2", x: -0.1460, y: -0.1460 },
    { label: "D3", x: -0.2967, y: -0.2967 },
    { label: "D4", x: -0.3686, y: -0.3686 },
    { label: "D5", x: -0.5081, y: -0.3695 },
    { label: "D6", x: -0.5930, y: -0.4321 },
    { label: "D7", x: -0.6781, y: -0.4871 },
    { label: "D8", x: -0.7940, y: -0.2583 },
    { label: "D9", x: -0.6967, y: -0.2294 },
    { label: "D10", x: -0.5989, y: -0.1920 },
    { label: "D11", x: -0.4820, y: -0.1985 },
    { label: "D12", x: -0.3844, y: -0.1591 },
    { label: "D13", x: -0.2719, y: -0.1581 },
    { label: "D14", x: -0.2067, y: -0.0000 },
    { label: "D15", x: -0.1014, y: 0.0298 },
    { label: "D16", x: -0.1460, y: 0.1460 },
    { label: "D17", x: -0.2719, y: 0.1581 },
    { label: "D18", x: -0.3157, y: -0.0000 },
    { label: "D19", x: -0.4169, y: -0.0000 },
    { label: "D20", x: -0.5228, y: -0.0000 },
    { label: "D21", x: -0.6291, y: -0.0000 },
    { label: "D22", x: -0.7332, y: -0.0000 },
    { label: "D23", x: -0.8350, y: -0.0000 },
    { label: "D24", x: -0.7940, y: 0.2583 },
    { label: "D25", x: -0.6967, y: 0.2294 },
    { label: "D26", x: -0.5989, y: 0.1920 },
    { label: "D27", x: -0.4820, y: 0.1985 },
    { label: "D28", x: -0.3844, y: 0.1591 },
    { label: "D29", x: -0.5081, y: 0.3695 },
    { label: "D30", x: -0.5930, y: 0.4321 },
    { label: "D31", x: -0.6781, y: 0.4871 },
    { label: "D32", x: -0.7588, y: 0.5498 },
  ];

  // Convenience: index by label.
  const LABEL_TO_INDEX = {};
  ELECTRODES_32.forEach((e, i) => { LABEL_TO_INDEX[e.label] = i; });

  const LABEL_TO_INDEX_128 = {};
  ELECTRODES_128.forEach((e, i) => { LABEL_TO_INDEX_128[e.label] = i; });

  // Default channel name list (when the backend's hello_ack omits channel_names
  // we fall back to this).
  const DEFAULT_CHANNEL_NAMES = ELECTRODES_32.map(e => e.label);

  // Presets for the channel selector. Capped at 6 per spec § 5.1.
  const CHANNEL_PRESETS = [
    { id: 'key',   label: '关键通道 C3 · Cz · C4',     channels: ['C3', 'Cz', 'C4'] },
    { id: 'motor', label: '运动皮层 6 通道',          channels: ['FC1', 'FC2', 'C3', 'Cz', 'C4', 'CP1'] },
    { id: 'midline', label: '中线 Fz · Cz · Pz',     channels: ['Fz', 'Cz', 'Pz'] },
  ];

  const MAX_DISPLAY_CHANNELS = 6;

  window.ELECTRODES_32 = ELECTRODES_32;
  window.ELECTRODES_128 = ELECTRODES_128;
  window.ELECTRODE_LABEL_TO_INDEX = LABEL_TO_INDEX;
  window.ELECTRODE_128_LABEL_TO_INDEX = LABEL_TO_INDEX_128;
  window.DEFAULT_CHANNEL_NAMES = DEFAULT_CHANNEL_NAMES;
  window.CHANNEL_PRESETS = CHANNEL_PRESETS;
  window.MAX_DISPLAY_CHANNELS = MAX_DISPLAY_CHANNELS;
})();

// Ambiances sonores du mode focus — 100 % synthétisées via la Web Audio API.
// AUCUN fichier audio : le son est généré sur l'appareil à partir de bruit
// aléatoire filtré. Conséquences voulues :
//   • 0 stockage / 0 egress Supabase (rien n'est jamais téléchargé ni servi) ;
//   • marche hors-ligne (généré localement, aucune requête réseau) ;
//   • 0 licence (pas de fichiers = pas de droits d'auteur).
//
// API impérative (un seul AudioContext, créé paresseusement au 1er démarrage,
// qui DOIT venir d'un geste utilisateur pour l'autoplay policy — le bouton
// d'activation en est un).

export const AMBIENT_PRESETS = ["white", "brown", "pink", "rain", "waves"];

let ctx = null;
let master = null;
let active = null; // { nodes: [], stop() } du preset en cours

export function isAmbientSupported() {
  return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
}

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  return ctx;
}

// Buffer de bruit (blanc / brun / rose) de `seconds` secondes, mis en boucle.
// Buffer long (10 s) : le point de bouclage est rare et inaudible sur du bruit
// à faible volume.
function noiseBuffer(type, seconds = 10) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);

  if (type === "brown") {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = Math.max(-1, Math.min(1, last * 3.5));
    }
  } else if (type === "pink") {
    // Filtre de Paul Kellet (bruit rose : énergie équilibrée par octave).
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      d[i] = Math.max(-1, Math.min(1, v * 0.11));
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

// Construit le graphe audio d'un preset et le démarre. Renvoie un handle stop().
function build(preset) {
  const base = preset === "brown" || preset === "waves" ? "brown"
    : preset === "pink" ? "pink" : "white";
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(base);
  src.loop = true;

  const nodes = [src];
  let tail = src;

  if (preset === "rain") {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1000;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.5;
    tail.connect(hp); hp.connect(bp);
    nodes.push(hp, bp); tail = bp;
  } else if (preset === "waves") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 550;
    tail.connect(lp); nodes.push(lp); tail = lp;
    // Houle : LFO lent qui fait respirer le volume (vagues qui montent/descendent).
    const swell = ctx.createGain();
    swell.gain.value = 0.6;
    tail.connect(swell); nodes.push(swell); tail = swell;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.38;
    lfo.connect(lfoGain); lfoGain.connect(swell.gain);
    lfo.start();
    nodes.push(lfo, lfoGain);
  } else if (preset === "brown") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1800;
    tail.connect(lp); nodes.push(lp); tail = lp;
  }

  tail.connect(master);
  src.start();

  return {
    stop() {
      nodes.forEach((n) => {
        try { if (n.stop) n.stop(); } catch {}
        try { n.disconnect(); } catch {}
      });
    },
  };
}

// Volume 0..1 → courbe douce, plafonnée pour ne jamais saturer.
export function setAmbientVolume(v) {
  const c = getCtx();
  if (!c || !master) return;
  const vol = Math.max(0, Math.min(1, Number(v) || 0));
  master.gain.setTargetAtTime(vol * vol * 0.6, c.currentTime, 0.05);
}

export function startAmbient(preset = "brown", volume = 0.5) {
  const c = getCtx();
  if (!c) return false;
  if (c.state === "suspended") { try { c.resume(); } catch {} }
  if (active) { active.stop(); active = null; } // changement de preset : coupe l'ancien
  active = build(AMBIENT_PRESETS.includes(preset) ? preset : "brown");
  setAmbientVolume(volume);
  return true;
}

export function stopAmbient() {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.08); // fondu de sortie (anti-clic)
  const a = active; active = null;
  if (a) setTimeout(() => a.stop(), 260);
}

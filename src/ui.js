import * as THREE from 'three';
import { projeterRepere } from './reperes.js';
import { directionMenace } from './perception.js';
import { DUREE_TRAVAIL, ALERTE_TRAVAIL, travailProtege } from './travail.js';
import { nomTouche } from './input.js';
const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      detFill: $('det-fill'), detWrap: $('det-wrap'), detTxt: $('det-txt'),
      stressFill: $('stress-fill'), stamFill: $('stam-fill'),
      clock: $('clock'), timer: $('timer'), timerWrap: $('timer-wrap'),
      prompt: $('prompt'), subtitle: $('subtitle'), state: $('state-chip'),
      vignette: $('vignette'), flash: $('flash'),
      start: $('screen-start'), fail: $('screen-fail'), win: $('screen-win'),
      pause: $('screen-pause'), suite: $('screen-suite'),
      failLine: $('fail-line'), winStats: $('win-stats'), failCount: $('fail-count'),
      toast: $('toast'),
    };
    this.cache = new Map();
    this.subT = 0;
    this.toastT = 0;
  }

  changed(key, value, apply) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(value);
  }

  setControls(touches) {
    for (const el of document.querySelectorAll('[data-touche]'))
      el.textContent = nomTouche(touches[el.dataset.touche]?.find(Boolean));
  }

  loading(titre, detail = 'Encore quelques instants avant de prendre la fuite.') {
    const voile = $('chargement');
    if (!voile) return;
    voile.classList.toggle('parti', !titre);
    voile.setAttribute('aria-hidden', String(!titre));
    if (titre) $('chargement-etape').textContent = titre;
    $('chargement-note').textContent = detail;
    $('chargement-reessayer').hidden = true;
  }

  erreurChargement(reessayer) {
    this.loading('Impossible de charger cet étage', 'Ta progression est conservée. Tu peux réessayer.');
    const bouton = $('chargement-reessayer');
    bouton.hidden = false;
    bouton.onclick = reessayer;
    bouton.focus();
  }

  setExit(seq) {
    $('sortie-attente').hidden = !seq;
    if (!seq) return;
    const pct = Math.round((1 - seq.t / seq.total) * 100);
    this.changed('sortie', pct, v => $('sortie-fill').style.transform = `scaleX(${v / 100})`);
    this.changed('sortie-texte', `${seq.id}:${Math.ceil(seq.t)}`, () => {
      $('sortie-texte').textContent = `${seq.id === 'elevator' ? 'Ascenseur en approche' : 'Départ par les escaliers'} · ${Math.ceil(seq.t)} s`;
    });
  }

  setDetection(v, caughtBy, etat = 'travail', visible = false, entendu = false, protection = null) {
    const protege = protection != null;
    const fin = protege && protection <= ALERTE_TRAVAIL;
    const pct = Math.round((protege ? protection / DUREE_TRAVAIL : v) * 100);
    this.changed('detection', pct, n => this.el.detFill.style.transform = `scaleX(${n / 100})`);
    const hue = protege ? (fin ? 40 : 150) : Math.round(55 - 55 * Math.min(1, v / 0.9));
    this.changed('hue', hue, h => this.el.detFill.style.background =
      `linear-gradient(90deg, hsl(${h} 95% 55%), hsl(${Math.max(0, h - 12)} 100% 62%))`);
    this.el.detWrap.classList.toggle('pulse', !protege && v > 0.6);
    this.el.detWrap.classList.toggle('protege', protege);
    this.el.detWrap.classList.toggle('protection-fin', fin);
    // Une phrase, pas un pourcentage : le joueur doit savoir QUI et
    // à quel point, sans avoir à interpréter une jauge.
    const qui = caughtBy || 'Quelqu’un';
    const txt = {
      travail: visible ? `${qui} peut te voir` : entendu ? `${qui} entend tes pas` : v < 0.05 ? 'Aucune suspicion' : 'La méfiance retombe',
      doute: visible ? `${qui} te remarque` : entendu ? `${qui} entend tes pas` : `${qui} a un doute`,
      observation: visible ? `${qui} te regarde. Cache-toi !` : `${qui} surveille ta dernière position`,
      repere: 'REPÉRÉ !',
    };
    const message = protege ? (fin ? `Protection : encore ${Math.ceil(protection)} s · prépare ta sortie`
      : `Tu fais illusion · protégé pendant ${Math.ceil(protection)} s`) : txt[etat] || txt.travail;
    this.changed('detection-texte', message, t => this.el.detTxt.textContent = t);
    this.el.detWrap.classList.toggle('observe', !protege && (etat === 'observation' || etat === 'repere'));
    this.changed('vignette', protege ? 0 : Math.round(Math.max(0, (v - 0.35) / 0.65) * 85), n => this.el.vignette.style.opacity = n / 100);
  }

  setGuide(title, detail, hint) {
    this.changed('guide', [title, detail, hint].join('|'), () => {
      $('guide').hidden = !title;
      $('guide-titre').textContent = title;
      $('guide-detail').textContent = detail;
      $('guide-hint').textContent = hint;
    });
  }

  setObjectives(objets, player, camera) {
    this.objectiveNodes ??= new Map();
    const actifs = new Set(), places = [];
    camera.updateMatrixWorld();
    for (const [i,o] of objets.entries()) {
      if (o.pris) continue;
      actifs.add(o);
      let el=this.objectiveNodes.get(o);
      if(!el) {
        el=document.createElement('div');el.className='repere-objet';
        el.innerHTML='<i class="repere-direction">▲</i><b class="repere-numero"></b><span><strong></strong><small></small></span>';
        el.querySelector('strong').textContent={badge:'Badge d’accès',passe:'Passe de sécurité'}[o.id]||'Ordinateur portable';
        el.querySelector('b').textContent=i+1;
        $('reperes-objets').appendChild(el);this.objectiveNodes.set(o,el);
      }
      const p=projeterRepere({x:o.x,y:o.y+.62,z:o.z},camera,innerWidth,innerHeight);
      // Les deux objets du dernier étage restent lisibles s'ils se superposent.
      for(const q of places)if(Math.abs(q.x-p.x)<205&&Math.abs(q.y-p.y)<52) {
        const bas=innerHeight-Math.min(245,innerHeight*.30);
        p.y+=p.y+56<=bas?56:-56;
      }
      places.push(p);
      el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;
      el.classList.toggle('hors-champ',p.horsChamp);
      el.querySelector('.repere-direction').style.transform=`rotate(${p.angle}rad)`;
      const distance=Math.ceil(Math.hypot(o.x-player.pos.x,o.z-player.pos.z));
      el.querySelector('small').textContent=`${distance} m · ${o.ouvre?'facultatif, ouvre l’escalier':'à récupérer'}`;
    }
    for(const [o,el] of this.objectiveNodes)if(!actifs.has(o)){el.remove();this.objectiveNodes.delete(o);}
    $('legende-objets').hidden=!actifs.size;
  }

  setThreats(npcs, player, camera, yaw) {
    if (travailProtege(player)) npcs = [];
    if (!this.threatNodes) this.threatNodes = new Map();
    const active = new Set(), secteurs = new Map();
    for (const n of npcs) {
      if (n.suspicion < 0.14) continue;
      const point = new THREE.Vector3(n.pos.x, n.eyeY, n.pos.z).project(camera);
      const horsChamp = point.z < -1 || point.z > 1 || Math.abs(point.x) > 0.86 || Math.abs(point.y) > 0.8;
      if (!horsChamp) continue;
      active.add(n);
      let el = this.threatNodes.get(n);
      if (!el) {
        el = document.createElement('div'); el.className = 'menace';
        el.innerHTML = '<i>▲</i><span></span>';
        $('menaces').appendChild(el); this.threatNodes.set(n, el);
      }
      const a = directionMenace(n.pos, player.pos, yaw);
      // Ovale autour du champ de jeu : derrière soi donne une flèche en bas.
      const x = Math.sin(a), y = -Math.cos(a);
      const secteur = Math.round(a / (Math.PI / 4));
      const rang = secteurs.get(secteur) || 0; secteurs.set(secteur, rang + 1);
      el.style.left = `${50+x*36}%`; el.style.top = `calc(${50+y*31}% + ${rang*34}px)`;
      el.querySelector('i').style.transform = `rotate(${a}rad)`;
      el.querySelector('span').textContent = `${n.name} · ${n.sawThisFrame ? 'vous voit' : n.heardThisFrame ? 'vous entend' : 'cherche'}`;
      el.classList.toggle('fort', n.suspicion > 0.52);
    }
    for (const [n, el] of this.threatNodes) if (!active.has(n)) {
      el.remove(); this.threatNodes.delete(n);
    }
  }

  setBars(stress, stamina, epuise = false) {
    this.changed('stress', Math.round(stress * 100), n => this.el.stressFill.style.transform = `scaleX(${n / 100})`);
    this.changed('endurance', Math.round(stamina * 100), n => this.el.stamFill.style.transform = `scaleX(${n / 100})`);
    this.el.stressFill.classList.toggle('hot', stress > 0.8);
    this.el.stamFill.classList.toggle('low', epuise);
    this.changed('souffle', epuise, v => $('stam-label').textContent = v ? 'reprends ton souffle' : 'course');
  }

  setClock(text) { this.changed('clock', text, t => this.el.clock.textContent = t); }

  setTimer(sec, hunting) {
    const cle = hunting ? 'chasse' : Math.ceil(sec);
    if (this.cache.get('timer') === cle) return;
    this.cache.set('timer', cle);
    if (hunting) {
      this.el.timer.textContent = 'Réunion terminée !';
      this.el.timerWrap.classList.add('danger');
    } else {
      const total = Math.ceil(sec), m = Math.floor(total / 60), s = total % 60;
      this.el.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
      this.el.timerWrap.classList.toggle('danger', sec < 30);
    }
  }

  setState(txt, cls) {
    this.changed('state', `${txt}|${cls}`, () => {
      this.el.state.textContent = txt;
      this.el.state.className = 'chip ' + (cls || '');
    });
  }

  setPrompt(txt) {
    this.changed('prompt', txt, t => {
      this.el.prompt.style.opacity = t ? 1 : 0;
      this.el.prompt.innerHTML = t;
    });
  }

  say(titre, detail, dur = 3.2) {
    this.el.subtitle.innerHTML = `<b>${titre}</b>` + (detail ? `<span>${detail}</span>` : '');
    this.el.subtitle.style.opacity = 1;
    this.subT = dur;
  }

  toast(titre, detail, dur = 2.4) {
    this.el.toast.innerHTML = `<b>${titre}</b>` + (detail ? ` <span>${detail}</span>` : '');
    this.el.toast.style.opacity = 1;
    this.toastT = dur;
  }

  flash() {
    this.el.flash.style.transition = 'none';
    this.el.flash.style.opacity = 0.75;
    requestAnimationFrame(() => {
      this.el.flash.style.transition = 'opacity 0.9s ease-out';
      this.el.flash.style.opacity = 0;
    });
  }

  update(dt) {
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) this.el.subtitle.style.opacity = 0;
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.style.opacity = 0;
    }
  }

  show(which) {
    if (which) document.getElementById('objectifs').classList.remove('on');
    for (const k of ['start', 'fail', 'win', 'pause', 'suite']) {
      this.el[k].classList.toggle('on', k === which);
      this.el[k].inert = k !== which;
      this.el[k].setAttribute('aria-hidden', String(k !== which));
    }
    if (which) {
      this.setPrompt(''); this.setExit(null);
      this.setGuide('', '', '');
      requestAnimationFrame(() => this.el[which].querySelector('button:not(:disabled)')?.focus({ preventScroll: true }));
    } else document.activeElement?.blur();
    document.body.classList.toggle('modal', !!which);
  }
}

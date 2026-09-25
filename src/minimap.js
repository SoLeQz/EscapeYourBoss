// Mini-carte 2D : murs, bureaux, cônes de vision, sorties.
export class Minimap {
  constructor(canvas, level) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.level = level;
    this.X0 = -21; this.X1 = 21;
    this.Z0 = -17; this.Z1 = 17;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = canvas.clientWidth || 210;
    this.h = canvas.clientHeight || 172;
    canvas.width = this.w * dpr;
    canvas.height = this.h * dpr;
    this.g.scale(dpr, dpr);
    this.sx = this.w / (this.X1 - this.X0);
    this.sz = this.h / (this.Z1 - this.Z0);
  }

  px(x) { return (x - this.X0) * this.sx; }
  pz(z) { return (z - this.Z0) * this.sz; }

  buildBackground() {
    this.fond = document.createElement('canvas');
    this.fond.width = this.cv.width; this.fond.height = this.cv.height;
    const g = this.fond.getContext('2d');
    g.scale(this.fond.width / this.w, this.fond.height / this.h);
    g.fillStyle = 'rgba(18,16,22,0.82)';
    g.fillRect(0, 0, this.w, this.h);

    // zones
    g.fillStyle = 'rgba(255,225,180,0.07)';
    g.fillRect(this.px(4), this.pz(-16), (12 - 4) * this.sx, 32 * this.sz);
    g.fillRect(this.px(12), this.pz(-4), 8 * this.sx, 10 * this.sz);

    // obstacles
    for (const o of this.level.obstacles) {
      if (o.h >= 2.5) g.fillStyle = o.seeThrough ? 'rgba(150,215,235,0.55)' : 'rgba(210,198,180,0.78)';
      else if (o.kind === 'desk') g.fillStyle = 'rgba(200,150,95,0.55)';
      else g.fillStyle = 'rgba(130,150,170,0.42)';
      g.fillRect(this.px(o.x1), this.pz(o.z1),
        Math.max(1, (o.x2 - o.x1) * this.sx), Math.max(1, (o.z2 - o.z1) * this.sz));
    }

    this.fondNiveau = this.level;
  }

  draw(game) {
    const g = this.g;
    if (this.fondNiveau !== this.level) this.buildBackground();
    g.clearRect(0, 0, this.w, this.h);
    g.drawImage(this.fond, 0, 0, this.w, this.h);

    // sorties
    for (const it of this.level.interactables) {
      g.fillStyle = it.id === 'elevator' ? '#4ade80' : '#60c8f0';
      g.beginPath(); g.arc(this.px(it.x), this.pz(it.z), 4, 0, 7); g.fill();
      g.fillStyle = '#0c0c10';
      g.font = 'bold 7px system-ui';
      g.textAlign = 'center';
      g.fillText(it.id === 'elevator' ? 'A' : 'E', this.px(it.x), this.pz(it.z) + 2.5);
    }

    // PNJ + cônes
    for (const n of game.npcs) {
      const x = this.px(n.pos.x), z = this.pz(n.pos.z);
      // Même état que le cône 3D : les soupçons en mémoire pendant
      // le travail protégé ne sont pas une alerte active.
      const s = ['doute', 'observation', 'repere'].includes(n.state) ? n.suspicion : 0;
      if (game.showCones) {
        const r = n.viewDist * this.sx;
        const a0 = n.headYaw - n.fov / 2, a1 = n.headYaw + n.fov / 2;
        g.beginPath();
        g.moveTo(x, z);
        // écran : +X = droite, +Z monde = bas ; angle monde a → (sin a, cos a)
        g.arc(x, z, r, Math.atan2(Math.cos(a0), Math.sin(a0)), Math.atan2(Math.cos(a1), Math.sin(a1)), true);
        g.closePath();
        g.fillStyle = s > 0.02
          ? `rgba(${255},${Math.round(200 - 200 * s)},${Math.round(90 - 90 * s)},${0.16 + s * 0.3})`
          : 'rgba(255,225,150,0.14)';
        g.fill();
      }

      g.beginPath(); g.arc(x, z, 3.4, 0, 7);
      g.fillStyle = n.isBoss ? '#ff5a4a' : (s > 0.45 ? '#ffd24a' : '#e9e6df');
      g.fill();
      if (n.isBoss) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
    }

    // coéquipier (multijoueur) : même flèche, en orange
    const co = game.coequipier;
    if (co?.mesh.visible && game.mode === 'multi') {
      g.save(); g.translate(this.px(co.pos.x), this.pz(co.pos.z)); g.rotate(Math.PI - co.yaw);
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4.2, 4); g.lineTo(0, 1.6); g.lineTo(-4.2, 4); g.closePath();
      g.fillStyle = '#ffab5c'; g.fill(); g.restore();
    }

    // joueur
    const px = this.px(game.player.pos.x), pz = this.pz(game.player.pos.z);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.PI - game.player.yaw);  // yaw monde -> angle canvas
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4.2, 4); g.lineTo(0, 1.6); g.lineTo(-4.2, 4);
    g.closePath();
    g.fillStyle = game.player.crouch > 0.5 ? '#8be9fd' : '#5cf07a';
    g.fill();
    g.restore();

    // Au-dessus des cônes et des personnages : les objectifs ne peuvent
    // plus disparaître sous la vision d'un collègue. Numéros communs au HUD.
    for(const [i,o] of this.level.ramassables.entries()) {
      if(o.pris)continue;
      const x=this.px(o.x),y=this.pz(o.z);
      g.fillStyle='rgba(255,212,135,.18)';g.beginPath();g.arc(x,y,11,0,Math.PI*2);g.fill();
      g.fillStyle='#ffd487';g.strokeStyle='#171b21';g.lineWidth=2;
      g.beginPath();g.moveTo(x,y-8);g.lineTo(x+8,y);g.lineTo(x,y+8);g.lineTo(x-8,y);g.closePath();g.fill();g.stroke();
      g.fillStyle='#171b21';g.font='bold 9px system-ui';g.textAlign='center';g.textBaseline='middle';
      g.fillText(String(i+1),x,y+.5);g.textBaseline='alphabetic';
    }

    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, this.w - 1, this.h - 1);
  }
}

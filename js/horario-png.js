/* Descarga un horario como imagen PNG.
   Se dibuja directo en un <canvas> con los datos del horario (sin librerías externas),
   con el logo y los colores del colegio. Lo usa la página /horarios/. */
window.HORARIO_PNG = (function () {
  "use strict";

  const H = window.HORARIOS;
  const W = 1600;          // ancho de la imagen
  const M = 56;            // margen
  const COL_HORA = 150;
  const FILA = 84;         // alto de un bloque de clase
  const FILA_PAUSA = 40;
  const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const SERIF = '"Fraunces", Georgia, "Times New Roman", serif';

  const css = (v, def) => (getComputedStyle(document.documentElement).getPropertyValue(v) || "").trim() || def;

  // Corta el texto en líneas que caben en el ancho; si no caben, achica la letra
  function lineas(ctx, texto, ancho, max) {
    const palabras = String(texto || "").split(/\s+/).filter(Boolean);
    const out = [];
    let linea = "";
    palabras.forEach((p) => {
      const prueba = linea ? linea + " " + p : p;
      if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba;
      else { out.push(linea); linea = p; }
    });
    if (linea) out.push(linea);
    if (out.length > max) {
      const resto = out.slice(max - 1).join(" ");
      out.length = max - 1;
      let t = resto;
      while (t.length > 1 && ctx.measureText(t + "…").width > ancho) t = t.slice(0, -1);
      out.push(t + "…");
    }
    return out;
  }

  // Escribe un bloque (grupo, asignatura, detalle) centrado verticalmente en su caja
  function textoBloque(ctx, x, y, w, h, { grupo, asignatura, detalle }, tinta) {
    const pad = 14, ancho = w - pad * 2;
    let tam = w < 180 ? 17 : 19;
    let principal;
    for (; tam >= 12; tam--) {
      ctx.font = `700 ${tam}px ${SANS}`;
      principal = lineas(ctx, asignatura, ancho, 4);
      const alto = principal.length * tam * 1.2 + (grupo ? 18 : 0) + (detalle ? 20 : 0);
      const cabe = principal.every((l) => !l.endsWith("…") && ctx.measureText(l).width <= ancho);
      if (alto <= h - 12 && cabe) break;
    }
    tam = Math.max(tam, 12);
    ctx.font = `700 ${tam}px ${SANS}`;
    principal = lineas(ctx, asignatura, ancho, Math.max(1, Math.floor((h - 12 - (grupo ? 18 : 0) - (detalle ? 20 : 0)) / (tam * 1.2))));
    ctx.font = `500 15px ${SANS}`;
    const det = detalle ? lineas(ctx, detalle, ancho, 1) : [];
    const alto = principal.length * tam * 1.2 + (grupo ? 18 : 0) + det.length * 20;
    let cy = y + (h - alto) / 2;
    ctx.fillStyle = tinta;
    ctx.textBaseline = "top";
    if (grupo) {
      ctx.globalAlpha = 0.72;
      ctx.font = `700 11px ${SANS}`;
      ctx.fillText(grupo.toUpperCase().split("").join(String.fromCharCode(8202)), x + pad, cy);
      ctx.globalAlpha = 1;
      cy += 18;
    }
    ctx.font = `700 ${tam}px ${SANS}`;
    principal.forEach((l) => { ctx.fillText(l, x + pad, cy); cy += tam * 1.2; });
    if (det.length) {
      ctx.globalAlpha = 0.78;
      ctx.font = `500 15px ${SANS}`;
      ctx.fillText(det[0], x + pad, cy + 2);
      ctx.globalAlpha = 1;
    }
  }

  // Une celdas iguales seguidas del mismo día (bloques dobles), igual que la tabla del sitio
  function uniones(filas, pausas) {
    const span = filas.map(() => H.DIAS.map(() => 1));
    H.DIAS.forEach((_, d) => {
      let origen = -1;
      filas.forEach((f, r) => {
        const txt = H.norm((f.celdas || [])[d]);
        if (!pausas[r] && origen >= 0 && txt && txt === H.norm((filas[origen].celdas || [])[d])) { span[origen][d]++; span[r][d] = 0; }
        else origen = pausas[r] || !txt ? -1 : r;
      });
    });
    return span;
  }

  // Imagen del logo ya cargada en el encabezado (mismo sitio, así el canvas se puede exportar)
  function logoActual() {
    const img = document.querySelector(".site-header .brand__crest img, .brand__crest img");
    if (!img || !img.complete || !img.naturalWidth) return null;
    try { if (new URL(img.src, location.href).origin !== location.origin) return null; } catch (e) { return null; }
    return img;
  }

  function escudo(ctx, x, y, alto, fondo, oro) {
    const k = alto / 56;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = "#ffffff";
    ctx.fill(new Path2D("M24 2 4 9v17c0 14 9 23 20 28 11-5 20-14 20-28V9L24 2z"));
    ctx.strokeStyle = oro; ctx.lineWidth = 1.6;
    ctx.stroke(new Path2D("M24 7 9 12.4V26c0 10.6 6.6 17.8 15 22 8.4-4.2 15-11.4 15-22V12.4L24 7z"));
    ctx.fillStyle = fondo; ctx.font = `700 15px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("SM", 24, 33);
    ctx.restore(); ctx.textAlign = "left";
  }

  async function dibujar(hor, { tipo, subtitulo, colores }) {
    if (document.fonts && document.fonts.load) {
      try { await Promise.all([`700 34px ${SERIF}`, `700 16px ${SANS}`, `600 16px ${SANS}`, `500 16px ${SANS}`].map((f) => document.fonts.load(f))); }
      catch (e) { /* sin fuentes web: se usan las del sistema */ }
    }
    const navy = css("--navy-900", "#0b1f3a"), oro = css("--gold", "#c9a24b"), crema = css("--cream", "#f7f3ea");
    const linea = "#e4e1d8";
    const filas = hor.filas || [];
    const pausas = filas.map(H.pausa);
    const span = uniones(filas, pausas);
    const altos = filas.map((_, r) => (pausas[r] ? FILA_PAUSA : FILA));
    const tops = altos.reduce((a, h, i) => (a.push(i ? a[i - 1] + altos[i - 1] : 0), a), []);
    const asigs = H.asignaturas([hor]);

    const ENC = 170, CAB = 50;
    const anchoDia = (W - M * 2 - COL_HORA) / H.DIAS.length;
    const altoTabla = CAB + altos.reduce((a, b) => a + b, 0);

    // Leyenda: mide cuántas filas ocupa
    const cv = document.createElement("canvas");
    const ctx0 = cv.getContext("2d");
    ctx0.font = `500 17px ${SANS}`;
    const items = asigs.map((a) => ({ a, w: 22 + 8 + ctx0.measureText(a).width + 28 }));
    let filasLey = asigs.length ? 1 : 0, xx = 0;
    items.forEach((it) => { if (xx + it.w > W - M * 2) { filasLey++; xx = 0; } xx += it.w; });
    const altoLey = filasLey ? 30 + filasLey * 32 : 0;
    const H_TOTAL = ENC + 44 + altoTabla + altoLey + 70;

    const escala = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    cv.width = W * escala; cv.height = H_TOTAL * escala;
    const ctx = cv.getContext("2d");
    ctx.scale(escala, escala);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H_TOTAL);

    // Encabezado con logo, colegio y nombre del curso o docente
    ctx.fillStyle = navy; ctx.fillRect(0, 0, W, ENC);
    ctx.fillStyle = oro; ctx.fillRect(0, ENC - 6, W, 6);
    const logo = logoActual();
    const LOGO_H = 92;
    let lx = M;
    if (logo) {
      const w = Math.min(220, (logo.naturalWidth / logo.naturalHeight) * LOGO_H);
      const ly = (ENC - 6 - LOGO_H) / 2;
      ctx.fillStyle = "#ffffff";
      const r = 14, bx = lx - 10, by = ly - 10, bw = w + 20, bh = LOGO_H + 20;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, r) : ctx.rect(bx, by, bw, bh); ctx.fill();
      ctx.drawImage(logo, lx, ly, w, LOGO_H);
      lx += w + 34;
    } else {
      escudo(ctx, lx, (ENC - 6 - LOGO_H) / 2, LOGO_H, navy, oro);
      lx += 80 + 30;
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff"; ctx.font = `700 34px ${SERIF}`;
    ctx.fillText("Colegio San Martín", lx, 76);
    ctx.fillStyle = oro; ctx.font = `600 15px ${SANS}`;
    ctx.fillText("I Q U I Q U E", lx + 2, 102);
    ctx.textAlign = "right";
    ctx.fillStyle = oro; ctx.font = `700 14px ${SANS}`;
    ctx.fillText((tipo === "docentes" ? "HORARIO DEL DOCENTE" : "HORARIO DE CLASES").split("").join(String.fromCharCode(8202)), W - M, 62);
    ctx.fillStyle = "#ffffff";
    let tam = 44;
    do { ctx.font = `700 ${tam}px ${SERIF}`; tam -= 2; } while (ctx.measureText(hor.nombre || "").width > W - M - lx - 340 && tam > 22);
    ctx.fillText(hor.nombre || "", W - M, 112);
    if (subtitulo) { ctx.font = `500 16px ${SANS}`; ctx.globalAlpha = 0.8; ctx.fillText(subtitulo, W - M, 140); ctx.globalAlpha = 1; }
    ctx.textAlign = "left";

    // Tabla
    const tx = M, ty = ENC + 44;
    ctx.save();
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx, ty, W - M * 2, altoTabla, 14) : ctx.rect(tx, ty, W - M * 2, altoTabla); ctx.clip();
    ctx.fillStyle = navy; ctx.fillRect(tx, ty, W - M * 2, CAB);
    ctx.fillStyle = "#ffffff"; ctx.font = `700 15px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("HORA", tx + COL_HORA / 2, ty + CAB / 2);
    H.DIAS.forEach((d, i) => ctx.fillText(d.toUpperCase().split("").join(String.fromCharCode(8202)), tx + COL_HORA + anchoDia * (i + 0.5), ty + CAB / 2));
    const y0 = ty + CAB;
    filas.forEach((f, r) => {
      const y = y0 + tops[r], h = altos[r];
      // Hora
      ctx.fillStyle = crema; ctx.fillRect(tx, y, COL_HORA, h);
      const hp = String(f.hora || "").split(/\s*[-–—]\s*|\s+a\s+/).filter(Boolean);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = navy;
      if (pausas[r] || hp.length !== 2) {
        ctx.font = `600 ${pausas[r] ? 14 : 16}px ${SANS}`;
        ctx.fillText(H.norm(f.hora) === H.norm(pausas[r]) ? "" : (hp.length === 2 ? `${hp[0]} – ${hp[1]}` : f.hora || ""), tx + COL_HORA / 2, y + h / 2);
      } else {
        ctx.font = `700 17px ${SANS}`; ctx.fillText(hp[0], tx + COL_HORA / 2, y + h / 2 - 10);
        ctx.font = `500 14px ${SANS}`; ctx.fillStyle = "#6b7280"; ctx.fillText(hp[1], tx + COL_HORA / 2, y + h / 2 + 12);
      }
      if (pausas[r]) {
        ctx.fillStyle = crema; ctx.fillRect(tx + COL_HORA, y, anchoDia * H.DIAS.length, h);
        ctx.fillStyle = css("--gold-dark", "#9c7a2e"); ctx.font = `700 14px ${SANS}`;
        ctx.fillText(String(pausas[r]).toUpperCase().split("").join(" "), tx + COL_HORA + (anchoDia * H.DIAS.length) / 2, y + h / 2);
        return;
      }
      ctx.textAlign = "left";
      H.DIAS.forEach((_, d) => {
        if (!span[r][d]) return;
        const x = tx + COL_HORA + anchoDia * d;
        const alto = altos.slice(r, r + span[r][d]).reduce((a, b) => a + b, 0);
        const txt = String((f.celdas || [])[d] || "").trim();
        if (!txt) return;
        const partes = H.electivos(txt) || [{ ...H.partes(txt), grupo: "" }];
        const w = anchoDia / partes.length;
        partes.forEach((p, i) => {
          const bg = H.color(p.asignatura, colores);
          ctx.fillStyle = bg; ctx.fillRect(x + w * i, y, w, alto);
          textoBloque(ctx, x + w * i, y, w, alto, p, H.tinta(bg));
          if (i) { ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(x + w * i, y, 2, alto); }
        });
      });
    });
    // Líneas de la grilla
    ctx.fillStyle = linea;
    filas.forEach((f, r) => {
      const y = y0 + tops[r] + altos[r];
      if (r === filas.length - 1) return;
      ctx.fillRect(tx, y - 0.5, COL_HORA, 1);
      H.DIAS.forEach((_, d) => {
        // No se dibuja la línea dentro de un bloque doble
        const dentro = !pausas[r] && !pausas[r + 1] && span[r + 1][d] === 0;
        if (!dentro) ctx.fillRect(tx + COL_HORA + anchoDia * d, y - 0.5, anchoDia, 1);
      });
    });
    for (let i = 0; i <= H.DIAS.length; i++) {
      const x = tx + COL_HORA + anchoDia * i;
      filas.forEach((f, r) => { if (!pausas[r] || i === 0) ctx.fillRect(x - 0.5, y0 + tops[r], 1, altos[r]); });
    }
    ctx.restore();
    ctx.strokeStyle = linea; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx + 0.5, ty + 0.5, W - M * 2 - 1, altoTabla - 1, 14) : ctx.rect(tx, ty, W - M * 2, altoTabla); ctx.stroke();

    // Leyenda de asignaturas
    let ly = ty + altoTabla + 34;
    xx = M;
    ctx.font = `500 17px ${SANS}`; ctx.textBaseline = "middle";
    items.forEach((it) => {
      if (xx + it.w > W - M) { xx = M; ly += 32; }
      ctx.fillStyle = H.color(it.a, colores);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(xx, ly - 10, 20, 20, 5) : ctx.rect(xx, ly - 10, 20, 20); ctx.fill();
      ctx.fillStyle = "#4b5563"; ctx.fillText(it.a, xx + 30, ly + 1);
      xx += it.w;
    });

    // Pie
    const hoy = new Date();
    ctx.fillStyle = "#6b7280"; ctx.font = `500 15px ${SANS}`; ctx.textBaseline = "alphabetic";
    ctx.fillText(location.host + location.pathname.replace(/\/horarios\/.*$/, "/horarios/"), M, H_TOTAL - 32);
    ctx.textAlign = "right";
    ctx.fillText(`Descargado el ${hoy.toLocaleDateString("es-CL")}`, W - M, H_TOTAL - 32);
    ctx.textAlign = "left";
    return cv;
  }

  const nombreArchivo = (n) => "horario-" + (String(n || "colegio").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/°/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "colegio") + ".png";

  async function descargar(hor, opciones) {
    const cv = await dibujar(hor, opciones);
    const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
    if (!blob) throw new Error("No se pudo crear la imagen.");
    const nombre = nombreArchivo(hor.nombre);
    // En el celular se abre el menú «Compartir» (permite «Guardar imagen» en la galería)
    const archivo = typeof File === "function" ? new File([blob], nombre, { type: "image/png" }) : null;
    const tactil = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    if (tactil && archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], title: `Horario ${hor.nombre}` }); return; }
      catch (e) { if (e && e.name === "AbortError") return; /* si no se puede compartir, se descarga */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return { dibujar, descargar, nombreArchivo };
})();

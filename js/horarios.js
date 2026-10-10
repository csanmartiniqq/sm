/* Horarios: reglas compartidas por el sitio (/horarios/) y el panel (/admin/).
   Cada horario es { nombre, filas: [{ hora, celdas: [lunes … viernes] }] }.
   El color de cada celda depende de su asignatura (la primera línea del texto).
   Electivos: un mismo bloque dividido entre planes se escribe separado por « / » o « | »:
     «Biología / Economía y sociedad»  →  Científico: Biología · Humanista: Economía y sociedad
     «Científico: Biología · Lab | Humanista: Filosofía · Sala 4»  (con planes y salas explícitos) */
window.HORARIOS = (function () {
  "use strict";

  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

  // Tonos suaves que se asignan solos a cada asignatura nueva; se pueden cambiar desde el panel
  const PALETA = ["#cfe3ff", "#ffd9c2", "#d4f0d9", "#f6d4ec", "#fff0b3", "#d9d4f7", "#c8eef0", "#ffd3d3",
    "#e4ecc4", "#f1dcc4", "#d0e6f5", "#ecd5f2", "#d9f2c4", "#fde2b8", "#cde0dc", "#f3cfd9"];

  const norm = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  // "Matemática · 7° A" o "Matemática\nSala 12" → asignatura "Matemática", detalle "7° A" / "Sala 12"
  const partes = (texto) => {
    const t = String(texto || "").trim();
    const m = t.match(/^(.*?)(?:\s*\n\s*|\s+[·–—-]\s+|\s*\/\s+)([\s\S]*)$/);
    return m ? { asignatura: m[1].trim(), detalle: m[2].replace(/\s*\n\s*/g, " · ").trim() } : { asignatura: t, detalle: "" };
  };

  // Electivos: devuelve [{ grupo, asignatura, detalle }] si el bloque está dividido entre planes, o null
  const GRUPOS = ["Científico", "Humanista"];
  // Lo que va después de « / » y parece sala o curso es un detalle, no otra asignatura
  const ES_DETALLE = /^(sala|lab|laboratorio|gimnasio|biblioteca|patio|cancha|auditorio|aula|prof|profesor|curso|\d)/i;
  const electivos = (texto) => {
    const t = String(texto || "").trim();
    let trozos = t.split(/\s*\|\s*/);
    if (trozos.length < 2) {
      trozos = t.split(/\s+\/\s+|\s*\/\s*(?=(?:cient|human|art|t[eé]cn|plan)\w*\s*:)/i);
      if (trozos.length < 2 || trozos.slice(1).some((x) => ES_DETALLE.test(x.trim()))) return null;
    }
    const lista = trozos.map((x) => x.trim()).filter(Boolean).map((x, i) => {
      const g = /^([^:·\n]{2,25}):\s*(.+)$/s.exec(x);
      const p = partes(g ? g[2] : x);
      return { grupo: g ? g[1].trim() : GRUPOS[i] || `Grupo ${i + 1}`, asignatura: p.asignatura, detalle: p.detalle };
    });
    return lista.length > 1 ? lista : null;
  };
  // Asignatura principal de un bloque (en un electivo, la del primer plan)
  const asignatura = (texto) => { const e = electivos(texto); return e ? e[0].asignatura : partes(texto).asignatura; };

  const PAUSA = /recreo|almuerzo|colaci[oó]n|descanso/i;
  // Bloques que no se publican en el horario de un docente
  const ADMIN = /administrativ|^adm\.?$|^adm\s|no lectiv|planificaci[oó]n/i;
  const esAdministrativo = (texto) => ADMIN.test(String(texto || "").trim());

  // Una fila es pausa si la hora lo dice o si todas las celdas con texto dicen «Recreo», «Almuerzo»…
  const pausa = (fila) => {
    if (PAUSA.test(fila.hora || "")) return (fila.hora.match(PAUSA) || [""])[0];
    const llenas = (fila.celdas || []).filter((c) => String(c || "").trim());
    if (llenas.length && llenas.every((c) => PAUSA.test(c) && norm(c) === norm(llenas[0]))) return String(llenas[0]).trim();
    return "";
  };

  const hash = (s) => [...norm(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const color = (asig, colores) => {
    if (!asig) return "";
    const k = Object.keys(colores || {}).find((x) => norm(x) === norm(asig));
    return k ? colores[k] : PALETA[hash(asig) % PALETA.length];
  };

  // Texto oscuro o claro según el fondo
  const tinta = (hex) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
    if (!m) return "#1d2433";
    const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? "#1d2433" : "#ffffff";
  };

  // Asignaturas que aparecen en una lista de horarios (sin pausas), en orden de aparición
  const asignaturas = (horarios) => {
    const vistas = new Map();
    (horarios || []).forEach((hor) => (hor.filas || []).forEach((f) => {
      if (pausa(f)) return;
      (f.celdas || []).forEach((c) => {
        (electivos(c) || [{ asignatura: partes(c).asignatura }]).forEach(({ asignatura: a }) => { if (a && !vistas.has(norm(a))) vistas.set(norm(a), a); });
      });
    }));
    return [...vistas.values()];
  };

  return { DIAS, PALETA, GRUPOS, norm, partes, electivos, asignatura, pausa, esAdministrativo, color, tinta, asignaturas };
})();

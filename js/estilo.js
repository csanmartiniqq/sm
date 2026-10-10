/* ==========================================================
   Estilo visual editable (botones, fondos, tipografías, tarjetas).
   Lo usan el sitio (se carga en el <head> de cada página) y la
   herramienta «Estilo visual» del panel /admin/.
   Los valores se guardan en data/sitio.json → "estilo":
     { "global": { clave: valor }, "paginas": { "inicio": { clave: valor } } }
   ========================================================== */
(function () {
  "use strict";

  const FUENTES_TITULO = ["Fraunces", "Playfair Display", "Merriweather", "Lora", "Cormorant Garamond", "Montserrat", "Poppins", "Raleway"];
  const FUENTES_TEXTO = ["Inter", "Open Sans", "Lato", "Nunito", "Roboto", "Source Sans 3", "Work Sans", "Montserrat"];

  // Cada opción: grupo, etiqueta, tipo de control y cómo se convierte en variables CSS
  const OPCIONES = [
    { k: "btnForma", grupo: "Botones", label: "Forma", tipo: "opciones", def: "pildora",
      opciones: { pildora: ["Píldora", { "--btn-radius": "999px" }], suave: ["Esquinas suaves", { "--btn-radius": "10px" }], recto: ["Recto", { "--btn-radius": "2px" }] } },
    { k: "btnTamano", grupo: "Botones", label: "Tamaño", tipo: "opciones", def: "normal",
      opciones: { compacto: ["Compacto", { "--btn-pad-y": ".6rem", "--btn-pad-x": "1.1rem" }], normal: ["Normal", { "--btn-pad-y": ".85rem", "--btn-pad-x": "1.5rem" }], grande: ["Grande", { "--btn-pad-y": "1.05rem", "--btn-pad-x": "2rem" }] } },
    { k: "btnMayus", grupo: "Botones", label: "Texto en mayúsculas", tipo: "opciones", def: "no",
      opciones: { no: ["No", { "--btn-transform": "none" }], si: ["Sí", { "--btn-transform": "uppercase" }] } },
    { k: "btnFondo", grupo: "Botones", label: "Color del botón principal", tipo: "color", def: "", vars: ["--btn-bg"], vacio: "Igual al color de acento" },
    { k: "btnTexto", grupo: "Botones", label: "Color del texto del botón", tipo: "color", def: "", vars: ["--btn-text"], vacio: "Igual al color principal" },

    { k: "fondoPagina", grupo: "Fondos", label: "Fondo de la página", tipo: "color", def: "#ffffff", vars: ["--page-bg", "--paper"] },
    { k: "fondoAlterno", grupo: "Fondos", label: "Fondo de secciones alternas", tipo: "color", def: "#f7f3ea", vars: ["--cream"] },
    { k: "fondoCabecera", grupo: "Fondos", label: "Fondo de la cabecera", tipo: "color", def: "#ffffff", vars: ["--header-bg"] },
    { k: "fondoPie", grupo: "Fondos", label: "Fondo del pie de página", tipo: "color", def: "#071629", vars: ["--footer-bg"] },

    { k: "fuenteTitulos", grupo: "Tipografía", label: "Fuente de títulos", tipo: "fuente", def: "Fraunces", lista: FUENTES_TITULO, vars: ["--serif"], generica: "Georgia, serif" },
    { k: "fuenteTexto", grupo: "Tipografía", label: "Fuente del texto", tipo: "fuente", def: "Inter", lista: FUENTES_TEXTO, vars: ["--sans"], generica: "system-ui, sans-serif" },
    { k: "tamanoTexto", grupo: "Tipografía", label: "Tamaño del texto", tipo: "rango", def: 16, min: 14, max: 19, paso: 1, unidad: "px", vars: ["--base-size"] },
    { k: "colorTitulos", grupo: "Tipografía", label: "Color de títulos", tipo: "color", def: "", vars: ["--heading"], vacio: "Igual al color principal" },
    { k: "colorTexto", grupo: "Tipografía", label: "Color del texto", tipo: "color", def: "#1d2433", vars: ["--ink"] },

    { k: "radio", grupo: "Tarjetas y bloques", label: "Redondeo de esquinas", tipo: "rango", def: 14, min: 0, max: 28, paso: 1, unidad: "px", vars: ["--radius"] },
    { k: "sombra", grupo: "Tarjetas y bloques", label: "Sombras", tipo: "opciones", def: "suave",
      opciones: { ninguna: ["Sin sombra", { "--shadow": "none", "--shadow-lg": "0 0 0 1px rgba(0,0,0,.06)" }],
                  suave: ["Suaves", { "--shadow": "0 10px 30px rgba(11,31,58,.08)", "--shadow-lg": "0 24px 60px rgba(11,31,58,.16)" }],
                  marcada: ["Marcadas", { "--shadow": "0 14px 36px rgba(11,31,58,.18)", "--shadow-lg": "0 30px 70px rgba(11,31,58,.30)" }] } },
  ];

  function variables(valores) {
    const out = {};
    OPCIONES.forEach((o) => {
      const v = valores[o.k];
      if (v === undefined || v === "" || v === null) return;
      if (o.tipo === "opciones") Object.assign(out, (o.opciones[v] || [])[1] || {});
      else if (o.tipo === "fuente") o.vars.forEach((n) => { out[n] = `"${v}", ${o.generica}`; });
      else if (o.tipo === "rango") o.vars.forEach((n) => { out[n] = v + o.unidad; });
      else o.vars.forEach((n) => { out[n] = v; });
    });
    return out;
  }

  const CARGADAS = new Set(["Fraunces", "Inter"]);
  function cargarFuente(doc, nombre) {
    if (!nombre || CARGADAS.has(nombre + "@" + (doc === document))) return;
    if (nombre === "Fraunces" || nombre === "Inter") return;
    CARGADAS.add(nombre + "@" + (doc === document));
    const l = doc.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(nombre).replace(/%20/g, "+") + ":wght@400;500;600;700&display=swap";
    doc.head.appendChild(l);
  }

  // Todas las variables que esta herramienta puede tocar (para limpiar antes de aplicar)
  const TODAS = new Set();
  OPCIONES.forEach((o) => {
    if (o.vars) o.vars.forEach((n) => TODAS.add(n));
    if (o.opciones) Object.values(o.opciones).forEach(([, v]) => Object.keys(v).forEach((n) => TODAS.add(n)));
  });

  // Aplica el estilo global y, encima, el de la página indicada
  function aplicar(estilo, pagina, doc) {
    doc = doc || document;
    if (!estilo) return;
    const valores = Object.assign({}, estilo.global || {}, (estilo.paginas || {})[pagina] || {});
    const vars = variables(valores);
    const root = doc.documentElement.style;
    TODAS.forEach((n) => root.removeProperty(n));
    for (const n in vars) root.setProperty(n, vars[n]);
    cargarFuente(doc, valores.fuenteTitulos);
    cargarFuente(doc, valores.fuenteTexto);
  }

  window.ESTILO = { OPCIONES, variables, aplicar, cargarFuente };

  // Aplicar de inmediato el último estilo conocido para evitar un parpadeo
  try {
    const guardado = JSON.parse(localStorage.getItem("csm-estilo") || "null");
    if (guardado && document.documentElement.dataset.page) aplicar(guardado, document.documentElement.dataset.page);
  } catch (e) { /* sin almacenamiento */ }
})();

/* ==========================================================
   Cabecera y pie compartidos por todas las páginas.
   Se carga al inicio del <body> de cada página:
     <body data-page="noticias">
       <script src="../js/layout.js"></script>
   ========================================================== */
(function () {
  "use strict";

  // Raíz del sitio (funciona en GitHub Pages, en un dominio propio y al abrir los archivos localmente)
  const BASE = document.currentScript.src.replace(/js\/layout\.js(\?.*)?$/, "");
  const LOCAL = location.protocol === "file:";
  const url = (p) => BASE + p + (LOCAL && (p === "" || p.endsWith("/")) ? "index.html" : "");
  // Rutas del sitio o enlaces web/correo/teléfono. Cualquier otro esquema (javascript:, data:…) se descarta
  const asset = (p) => {
    p = String(p || "").trim();
    if (!p) return "";
    if (/^(https?:|mailto:|tel:|\/\/|#)/i.test(p) || /^data:image\/(png|jpe?g|webp|gif);/i.test(p)) return p;
    if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return "";
    return BASE + p.replace(/^\.?\//, "");
  };
  window.SITE = { base: BASE, url, asset };

  // Colores guardados de la última visita, para evitar un parpadeo antes de cargar data/sitio.json
  try {
    const c = JSON.parse(localStorage.getItem("csm-colores") || "null");
    if (c) {
      const s = document.documentElement.style;
      if (c.primario) s.setProperty("--navy-900", c.primario);
      if (c.secundario) s.setProperty("--navy-700", c.secundario);
      if (c.acento) s.setProperty("--gold", c.acento);
    }
  } catch (e) { /* sin almacenamiento */ }

  // Logo subido desde el panel (si no hay, se dibuja el escudo provisional)
  let logo = null;
  try { logo = JSON.parse(localStorage.getItem("csm-logo") || "null"); } catch (e) { /* sin almacenamiento */ }

  const page = document.body.dataset.page || "inicio";
  const WEBCLASS = "http://proyecto.webescuela.cl/sistema/webclass/index.php";

  const MENU = [
    { id: "inicio", texto: "Inicio", href: "" },
    { texto: "Colegio", hijos: [
      { id: "colegio", texto: "Nuestro colegio", href: "colegio/" },
      { id: "directivos", texto: "Equipo directivo", href: "directivos/" },
      { id: "docentes", texto: "Docentes", href: "docentes/" },
      { id: "equipos", texto: "Equipos y funcionarios", href: "equipos/" },
      { id: "cgpa-ceal", texto: "CGPA y CEAL", href: "cgpa-ceal/" },
      { id: "documentos", texto: "Documentos institucionales", href: "documentos/" },
    ] },
    { id: "departamentos", texto: "Departamentos", href: "departamentos/" },
    { id: "noticias", texto: "Noticias", href: "noticias/" },
    { id: "horarios", texto: "Horarios", href: "horarios/" },
    { id: "admision", texto: "Admisión", href: "admision/" },
    { id: "contacto", texto: "Contacto", href: "contacto/" },
  ];

  const attr = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const marca = (borde) => logo && logo.imagen
    ? `<img src="${attr(asset(logo.imagen))}" alt="" width="${attr(+logo.ancho || "")}" height="${attr(+logo.alto || "")}">`
    : crest(borde);
  const crest = (borde) => `<svg viewBox="0 0 48 56"><path d="M24 2 4 9v17c0 14 9 23 20 28 11-5 20-14 20-28V9L24 2z" fill="currentColor"/>${borde ? '<path d="M24 7 9 12.4V26c0 10.6 6.6 17.8 15 22 8.4-4.2 15-11.4 15-22V12.4L24 7z" fill="none" style="stroke:var(--gold)" stroke-width="1.6"/>' : ""}<text x="24" y="33" text-anchor="middle" font-family="Fraunces, serif" font-size="15" font-weight="700" style="fill:var(--gold)">SM</text></svg>`;

  const item = (m) => {
    if (m.hijos) {
      const activo = m.hijos.some((h) => h.id === page);
      return `<li class="has-sub">
        <button class="nav__link nav__toggle${activo ? " is-active" : ""}" aria-expanded="false">${m.texto} <span class="caret"></span></button>
        <ul class="sub">${m.hijos.map((h) => `<li><a href="${url(h.href)}"${h.id === page ? ' aria-current="page"' : ""}>${h.texto}</a></li>`).join("")}</ul>
      </li>`;
    }
    return `<li><a href="${url(m.href)}" class="nav__link${m.id === page ? " is-active" : ""}"${m.id === page ? ' aria-current="page"' : ""}>${m.texto}</a></li>`;
  };

  const ICO_PIN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
  const ICO_TEL = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>';

  const header = `
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <div class="topbar">
    <div class="container topbar__inner">
      <div class="topbar__info">
        <span>${ICO_PIN}Amunátegui 86, Iquique</span>
        <a href="tel:+56572427128">${ICO_TEL}57 242 7128</a>
      </div>
      <div class="topbar__links">
        <a href="http://mail.google.com/a/colegiosm.cl" target="_blank" rel="noopener">Correo institucional</a>
        <span class="topbar__social" id="topSocial"></span>
      </div>
    </div>
  </div>
  <header class="header" id="header">
    <div class="container header__inner">
      <a href="${url("")}" class="brand" aria-label="Colegio San Martín, inicio">
        <span class="brand__crest${logo && logo.imagen ? " brand__crest--img" : ""}" aria-hidden="true">${marca(true)}</span>
        <span class="brand__text"><strong>Colegio San Martín</strong><small>Iquique</small></span>
      </a>
      <nav class="nav" id="nav" aria-label="Principal">
        <ul class="nav__list">${MENU.map(item).join("")}</ul>
        <a href="${WEBCLASS}" class="btn btn--gold nav__cta" target="_blank" rel="noopener">Portal WebClass</a>
      </nav>
      <button class="burger" id="burger" aria-label="Abrir menú" aria-controls="nav" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>`;

  const footer = `
  <footer class="footer">
    <div class="container footer__grid">
      <div>
        <div class="brand brand--footer">
          <span class="brand__crest${logo && logo.imagen ? " brand__crest--img" : ""}" aria-hidden="true">${marca(false)}</span>
          <span class="brand__text"><strong>Colegio San Martín</strong><small>Iquique</small></span>
        </div>
        <p class="footer__claim" data-lema>Aprender, crecer y convivir con sentido.</p>
        <p class="footer__claim">Amunátegui 86, Iquique<br><a href="tel:+56572427128">57 242 7128</a> · <a href="tel:+56572471256">57 247 1256</a></p>
      </div>
      <div>
        <h4>Colegio</h4>
        <ul>
          <li><a href="${url("colegio/")}">Nuestro colegio</a></li>
          <li><a href="${url("directivos/")}">Equipo directivo</a></li>
          <li><a href="${url("docentes/")}">Docentes</a></li>
          <li><a href="${url("equipos/")}">Equipos y funcionarios</a></li>
          <li><a href="${url("departamentos/")}">Departamentos</a></li>
          <li><a href="${url("documentos/")}">Documentos</a></li>
        </ul>
      </div>
      <div>
        <h4>Comunidad</h4>
        <ul>
          <li><a href="${url("noticias/")}">Noticias</a></li>
          <li><a href="${url("cgpa-ceal/")}">CGPA y CEAL</a></li>
          <li><a href="${url("horarios/")}">Horarios</a></li>
          <li><a href="${url("admision/")}">Admisión 2027</a></li>
          <li><a href="${url("contacto/")}">Contacto</a></li>
          <li><a href="${WEBCLASS}" target="_blank" rel="noopener">Portal WebClass</a></li>
        </ul>
      </div>
      <div>
        <h4>Síguenos</h4>
        <ul id="footSocial"></ul>
      </div>
    </div>
    <div class="container footer__bottom">
      <p>© ${new Date().getFullYear()} Colegio San Martín Iquique. Todos los derechos reservados.</p>
      <a href="#top">Volver arriba ↑</a>
    </div>
  </footer>
  <button class="to-top" id="toTop" aria-label="Volver arriba">↑</button>`;

  document.currentScript.insertAdjacentHTML("afterend", header);
  // Ícono de la pestaña del navegador
  // Las páginas ya enlazan img/logo/favicon-*.png; aquí se fuerza la versión nueva tras cambiar el logo
  const favicon = () => {
    if (!logo || !logo.icono) return;
    const v = logo.version ? "?v=" + encodeURIComponent(logo.version) : "";
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
      const ruta = l.getAttribute("href").replace(/\?.*$/, "");
      l.href = ruta + v;
    });
  };
  favicon();

  // main.js lo llama con el logo de data/sitio.json
  window.SITE.logo = (nuevo) => {
    logo = nuevo && nuevo.imagen ? nuevo : null;
    try { localStorage.setItem("csm-logo", JSON.stringify(logo)); } catch (e) { /* sin almacenamiento */ }
    document.querySelectorAll(".brand__crest").forEach((el) => {
      const pie = !!el.closest(".brand--footer");
      el.classList.toggle("brand__crest--img", !!logo);
      el.innerHTML = marca(!pie);
    });
    favicon();
  };

  window.SITE.footer = () => {
    if (!document.querySelector(".footer")) document.body.insertAdjacentHTML("beforeend", footer);
  };
})();

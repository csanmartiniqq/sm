/* ==========================================================
   Colegio San Martín Iquique — interacción del sitio
   ========================================================== */
(function () {
  "use strict";

  // El contenido editable (colores, directivos, departamentos, noticias, redes y documentos) vive en
  // data/sitio.json y se modifica desde el panel /admin/. Cada página tiene solo los contenedores que usa.
  const SITE = window.SITE;
  const $id = (id) => document.getElementById(id);
  let noticias = [];

  SITE.footer();

  // Al abrir los archivos sin servidor, los enlaces a carpetas necesitan "index.html"
  if (location.protocol === "file:") {
    document.querySelectorAll('main a[href$="/"], main a[href="./"]').forEach((a) => {
      if (!/^[a-z]+:/i.test(a.getAttribute("href"))) a.setAttribute("href", a.getAttribute("href") + "index.html");
    });
  }

  const ETIQUETAS = { comunicado: "Comunicado", pedagogia: "Pedagogía", comunidad: "Comunidad" };
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const POR_PAGINA = 6;

  document.documentElement.classList.remove("no-js");

  /* ---------- Cabecera al hacer scroll + botón volver arriba ---------- */
  const header = $id("header");
  const toTop = $id("toTop");
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 10);
    toTop.classList.toggle("is-visible", y > 600);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* ---------- Menú móvil ---------- */
  const burger = document.getElementById("burger");
  const nav = document.getElementById("nav");
  const setMenu = (open) => {
    if (open) nav.style.top = header.getBoundingClientRect().bottom + "px";
    nav.classList.toggle("is-open", open);
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));

  /* ---------- Submenús (clic y teclado) ---------- */
  const subs = document.querySelectorAll(".has-sub");
  const closeSubs = (except) => subs.forEach((li) => {
    if (li !== except) {
      li.classList.remove("is-open");
      li.querySelector(".nav__toggle").setAttribute("aria-expanded", "false");
    }
  });
  subs.forEach((li) => {
    const btn = li.querySelector(".nav__toggle");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !li.classList.contains("is-open");
      closeSubs(li);
      li.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
  });
  document.addEventListener("click", () => closeSubs());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeSubs(); setMenu(false); }
  });

  /* ---------- Aparición al hacer scroll ---------- */
  let revealer = null;
  if ("IntersectionObserver" in window) {
    revealer = new IntersectionObserver((entries, obs) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); obs.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
  }
  const observeReveal = (root) => root.querySelectorAll(".reveal:not(.is-in)").forEach((el) => {
    revealer ? revealer.observe(el) : el.classList.add("is-in");
  });
  observeReveal(document);

  /* ---------- Pestañas Misión / Visión / Sellos ---------- */
  document.querySelectorAll("[data-tabs]").forEach((wrap) => {
    const tabs = [...wrap.querySelectorAll('[role="tab"]')];
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t));
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
          select(next); next.focus();
        }
      });
    });
  });

  /* ---------- Noticias: render, filtro y "ver más" ---------- */
  const newsEl = $id("news");
  const moreBtn = $id("moreNews");
  const limite = newsEl && +newsEl.dataset.limit; // en la portada solo se muestran las últimas
  let filtro = "todas";
  let actual = null; // en /noticia/, la que se está leyendo no se repite abajo
  let visibles = limite || POR_PAGINA;

  // Cada noticia tiene su propia página: /noticia/?id=…
  const enlaceNoticia = (n) => SITE.url("noticia/") + "?id=" + encodeURIComponent(TEXTO.idNoticia(n));

  const tarjeta = (n) => {
    const [year, m, d] = (n.fecha || "").split("-");
    return `
      <article class="card">
        ${n.imagen ? `<img class="card__img" src="${esc(SITE.asset(n.imagen))}" alt="" loading="lazy">` : ""}
        <div class="card__date">
          <span class="card__day">${esc(d)}</span>
          <span class="card__month">${MESES[+m - 1] || ""}<br>${esc(year)}</span>
          <span class="card__tag">${esc(ETIQUETAS[n.tipo] || n.tipo)}</span>
        </div>
        <div class="card__body">
          ${(() => { const d = n.departamento && departamentos.find((x) => idDepto(x) === n.departamento);
            return d ? `<a class="card__dep" href="${esc(enlaceDepto(d, "actividades"))}">${esc(nombreCorto(d))}</a>` : ""; })()}
          <h3><a class="card__link" href="${esc(enlaceNoticia(n))}">${esc(n.titulo)}</a></h3>
          <p>${esc(n.resumen)}</p>
          <a class="link-arrow" href="${esc(enlaceNoticia(n))}" tabindex="-1" aria-hidden="true">Seguir leyendo</a>
        </div>
      </article>`;
  };

  const renderNews = () => {
    if (!newsEl) return;
    const lista = noticias.filter((n) => (filtro === "todas" || n.tipo === filtro) && n !== actual);
    newsEl.innerHTML = lista.slice(0, visibles).map(tarjeta).join("") ||
      '<p class="muted">No hay publicaciones en esta categoría.</p>';
    if (moreBtn) moreBtn.hidden = visibles >= lista.length;
  };

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      filtro = chip.dataset.filter;
      visibles = POR_PAGINA;
      renderNews();
    });
  });
  if (moreBtn) moreBtn.addEventListener("click", () => { visibles += POR_PAGINA; renderNews(); });

  /* ---------- Contenido editable desde data/sitio.json ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const aplicarColores = (c) => {
    if (!c) return;
    const root = document.documentElement.style;
    if (c.primario) root.setProperty("--navy-900", c.primario);
    if (c.secundario) root.setProperty("--navy-700", c.secundario);
    if (c.acento) root.setProperty("--gold", c.acento);
    try { localStorage.setItem("csm-colores", JSON.stringify(c)); } catch (e) { /* sin almacenamiento */ }
  };

  const renderDirectivos = (lista) => {
    const el = $id("team");
    if (!el || !Array.isArray(lista)) return;
    el.innerHTML = lista.map((p) => `
      <article class="member reveal">
        <span class="member__avatar">${p.foto ? `<img src="${esc(SITE.asset(p.foto))}" alt="${esc(p.nombre || p.cargo)}" loading="lazy">` : esc(p.iniciales || (p.cargo || "?").slice(0, 2))}</span>
        <div class="member__text">
          <h3>${esc(p.cargo)}</h3>
          ${p.nombre ? `<p class="member__name">${esc(p.nombre)}</p>` : ""}
          ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ""}
          ${contacto(p)}
        </div>
      </article>`).join("");
    observeReveal(el);
  };

  const contacto = (p) => (p.correo || p.telefono) ? `<p class="contact-line">${
    p.correo ? `<a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a>` : ""}${p.correo && p.telefono ? " · " : ""}${
    p.telefono ? `<a href="tel:${esc(p.telefono.replace(/[^\d+]/g, ""))}">${esc(p.telefono)}</a>` : ""}</p>` : "";

  let personal = [];

  /* Pilares del proyecto educativo (portada y Nuestro colegio), con imagen opcional */
  const renderPilares = (lista) => {
    const el = $id("pillars");
    if (!el || !Array.isArray(lista) || !lista.length) return;
    el.innerHTML = lista.map((p) => `
      <article class="pillar reveal">
        ${p.imagen ? `<img class="card-img card-img--${p.formato === "foto" ? "foto" : "icono"}" src="${esc(SITE.asset(p.imagen))}" alt="" loading="lazy">` : ""}
        <h3>${esc(p.titulo)}</h3>
        ${p.texto ? `<p>${esc(p.texto)}</p>` : ""}
      </article>`).join("");
    observeReveal(el);
  };

  /* ---------- Departamentos: académicos (con profesores y actividades) y equipos de apoyo ---------- */
  let departamentos = [];
  const esAcademico = (d) => d.tipo === "academico";
  const idDepto = (d) => d.id || window.TEXTO.slug(d.nombre);
  const enlaceDepto = (d, vista) => SITE.url("departamentos/") + "?d=" + encodeURIComponent(idDepto(d)) + (vista === "actividades" ? "&v=actividades" : "");
  const profesDe = (d) => personal.filter((p) => (p.departamentos || []).includes(idDepto(d)));
  const actividadesDe = (d) => noticias.filter((n) => n.departamento === idDepto(d));
  const nombreCorto = (d) => String(d.nombre || "").replace(/^Departamento (de )?/i, "");
  const ICONO_DEPTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2"/><path d="M8 7h6M8 11h6"/></svg>';

  const tarjetaApoyo = (d) => `
      <article class="dept reveal">
        ${d.imagen ? `<img class="card-img card-img--${d.formato === "foto" ? "foto" : "icono"}" src="${esc(SITE.asset(d.imagen))}" alt="" loading="lazy">` : ""}
        <h3>${esc(d.nombre)}</h3>
        ${d.descripcion ? `<p>${esc(d.descripcion)}</p>` : ""}
        ${d.encargado ? `<p class="dept__meta"><strong>Encargado/a:</strong> ${esc(d.encargado)}</p>` : ""}
        ${d.correo ? `<a class="link-arrow" href="mailto:${esc(d.correo)}">${esc(d.correo)}</a>` : ""}
        ${(() => {
          const equipo = personal.filter((p) => p.area === d.nombre);
          return equipo.length ? `<details class="dept__team"><summary>Equipo (${equipo.length})</summary><ul>${
            equipo.map((p) => `<li><strong>${esc(p.nombre)}</strong><span>${esc(p.cargo)}</span></li>`).join("")}</ul></details>` : "";
        })()}
      </article>`;

  const tarjetaAcademico = (d) => {
    const n = profesDe(d).length, a = actividadesDe(d).length;
    return `<a class="aca reveal" href="${esc(enlaceDepto(d))}">
        <span class="aca__img${d.imagen ? "" : " aca__img--vacia"}">${d.imagen ? `<img src="${esc(SITE.asset(d.imagen))}" alt="" loading="lazy">` : ICONO_DEPTO}</span>
        <span class="aca__body">
          <span class="aca__name">${esc(nombreCorto(d))}</span>
          ${d.descripcion ? `<span class="aca__desc">${esc(d.descripcion)}</span>` : ""}
          <span class="aca__meta">${n} ${n === 1 ? "profesor" : "profesores"}${a ? ` · ${a} ${a === 1 ? "actividad" : "actividades"}` : ""}</span>
        </span>
      </a>`;
  };

  const renderDepartamentos = () => {
    const lista = departamentos;
    const apoyo = $id("depts"), aca = $id("deptsAca");
    if (apoyo) { apoyo.innerHTML = lista.filter((d) => !esAcademico(d)).map(tarjetaApoyo).join(""); observeReveal(apoyo); }
    if (aca) {
      const acas = lista.filter(esAcademico);
      aca.innerHTML = acas.map(tarjetaAcademico).join("");
      aca.closest(".section").hidden = !acas.length;
      observeReveal(aca);
    }
    renderDepto();
  };

  // Vista de un departamento académico: portada arriba y, al costado, «Profesores» y «Actividades»
  const renderDepto = () => {
    const ver = $id("deptVer");
    if (!ver) return;
    const params = new URLSearchParams(location.search);
    const d = departamentos.find((x) => idDepto(x) === params.get("d"));
    if (!d) { ver.hidden = true; return; }
    let vista = params.get("v") === "actividades" ? "actividades" : "profesores";
    $id("deptLista").hidden = true;
    ver.hidden = false;
    document.title = `${d.nombre} | Colegio San Martín Iquique`;
    $id("deptTitulo").textContent = d.nombre;
    $id("deptLead").textContent = d.descripcion || "";
    $id("deptCrumbs").innerHTML = `<li><a href="${esc(SITE.url(""))}">Inicio</a></li><li><a href="${esc(SITE.url("departamentos/"))}">Departamentos</a></li><li aria-current="page">${esc(nombreCorto(d))}</li>`;
    const hero = $id("deptHero");
    if (d.imagen) { hero.classList.add("page-hero--foto"); hero.style.setProperty("--portada", `url("${SITE.asset(d.imagen).replace(/["\\]/g, "")}")`); }
    const profes = profesDe(d), acts = actividadesDe(d);
    const pintar = () => {
      const tile = (v, titulo, n, texto) => `<button type="button" class="dv__tile${vista === v ? " is-active" : ""}" data-v="${v}" aria-pressed="${vista === v}">
          <span class="dv__tile-n">${n}</span><span class="dv__tile-t">${titulo}</span><span class="dv__tile-s">${texto}</span></button>`;
      const contenido = vista === "profesores"
        ? (profes.length ? `<div class="staff-grid staff-grid--dv">${profes.map(tarjetaPersona).join("")}</div>`
          : '<p class="empty-note">Pronto conocerás a los profesores de este departamento.</p>')
        : (acts.length ? `<div class="news news--dv">${acts.map(tarjeta).join("")}</div>`
          : '<p class="empty-note">Aún no hay actividades publicadas. Cuando se publique una noticia con la etiqueta de este departamento, aparecerá aquí.</p>');
      ver.innerHTML = `<div class="container dv">
          <aside class="dv__side">
            <nav class="dv__tiles" aria-label="Secciones del departamento">
              ${tile("profesores", "Profesores", profes.length, "Conoce al equipo")}
              ${tile("actividades", "Actividades", acts.length, "Lo que hacemos")}
            </nav>
            ${d.encargado || d.correo ? `<div class="dv__contacto">
              ${d.encargado ? `<p><span>Jefatura de departamento</span><strong>${esc(d.encargado)}</strong></p>` : ""}
              ${d.correo ? `<a href="mailto:${esc(d.correo)}">${esc(d.correo)}</a>` : ""}</div>` : ""}
            <a class="dv__volver" href="${esc(SITE.url("departamentos/"))}">← Todos los departamentos</a>
          </aside>
          <div class="dv__main">
            <h2 class="title dv__titulo">${vista === "profesores" ? "Profesores" : "Actividades"}</h2>
            ${contenido}
          </div>
        </div>`;
    };
    ver.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b || b.dataset.v === vista) return;
      vista = b.dataset.v;
      const url = new URL(location.href);
      if (vista === "actividades") url.searchParams.set("v", "actividades"); else url.searchParams.delete("v");
      history.replaceState(null, "", url);
      pintar();
    });
    pintar();
  };

  /* ---------- Ficha completa de una persona (al tocar su tarjeta) ---------- */
  let perfil = null;
  const abrirPerfil = (p) => {
    if (!perfil) {
      perfil = document.createElement("dialog");
      perfil.className = "perfil";
      perfil.setAttribute("aria-label", "Ficha del profesor");
      perfil.addEventListener("click", (e) => { if (e.target === perfil || e.target.closest("[data-cerrar]")) perfil.close(); });
      document.body.append(perfil);
    }
    const ini = (p.nombre || "?").split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
    const deps = departamentos.filter((d) => (p.departamentos || []).includes(idDepto(d)));
    const dato = (titulo, valor) => valor ? `<div class="perfil__dato"><dt>${titulo}</dt><dd>${esc(valor)}</dd></div>` : "";
    perfil.innerHTML = `<div class="perfil__caja">
        <button type="button" class="perfil__cerrar" data-cerrar aria-label="Cerrar">✕</button>
        <div class="perfil__foto${p.foto ? "" : " perfil__foto--vacia"}">${p.foto ? `<img src="${esc(SITE.asset(p.foto))}" alt="">` : `<span>${esc(ini)}</span>`}</div>
        <div class="perfil__info">
          <h2>${esc(p.nombre)}</h2>
          <p class="perfil__cargo">${esc(p.cargo)}</p>
          ${deps.length ? `<p class="perfil__deps">${deps.map((d) => `<a href="${esc(enlaceDepto(d))}">${esc(nombreCorto(d))}</a>`).join("")}</p>` : ""}
          ${p.frase ? `<blockquote class="perfil__frase">${esc(p.frase)}</blockquote>` : ""}
          <dl>
            ${dato("Título profesional", p.titulo)}
            ${dato("Postgrado", p.postgrado)}
            ${dato("Tema favorito o área de interés", p.interes)}
          </dl>
          ${p.correo || p.telefono ? `<p class="perfil__contacto">${p.correo ? `<a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a>` : ""}${p.telefono ? `<a href="tel:${esc(p.telefono.replace(/[^\d+]/g, ""))}">${esc(p.telefono)}</a>` : ""}</p>` : ""}
        </div>
      </div>`;
    if (perfil.showModal) perfil.showModal(); else perfil.setAttribute("open", "");
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-persona]");
    if (!b) return;
    const p = personal[+b.dataset.persona];
    if (p) abrirPerfil(p);
  });

  // Docente o equipo: lo define el panel; si falta, se deduce del área
  const tipoPersona = (p) => p.tipo || (/^docentes/i.test(p.area || "") ? "docente" : /centro de (padres|estudiantes)/i.test(p.area || "") ? "comunidad" : "equipo");

  // Tarjeta con foto (o monograma si aún no hay foto), nombre, cargo y contacto
  const tarjetaPersona = (p) => {
    const ini = (p.nombre || "?").split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
    const i = personal.indexOf(p);
    return `<article class="pcard">
      <button type="button" class="pcard__btn" data-persona="${i}" aria-label="Ver ficha de ${esc(p.nombre)}">
      <div class="pcard__photo${p.foto ? "" : " pcard__photo--empty"}">${p.foto
        ? `<img src="${esc(SITE.asset(p.foto))}" alt="${esc(p.nombre)}" loading="lazy">`
        : `<span class="pcard__initials" aria-hidden="true">${esc(ini)}</span>`}</div>
      <h3 class="pcard__name">${esc(p.nombre)}</h3>
      </button>
      <p class="pcard__role">${esc(p.cargo)}</p>
      ${p.correo ? `<a class="pcard__mail" href="mailto:${esc(p.correo)}">${esc(p.correo)}</a>` : ""}
      ${p.telefono ? `<a class="pcard__tel" href="tel:${esc(p.telefono.replace(/[^\d+]/g, ""))}">${esc(p.telefono)}</a>` : ""}
    </article>`;
  };

  /* Páginas de docentes y de equipos: agrupado por área, con buscador y filtros.
     data-tipo="docente" muestra a los profesores; data-tipo="equipo", al resto de funcionarios. */
  const renderPersonal = () => {
    const el = $id("staff");
    if (!el) return;
    const tipo = el.dataset.tipo || "docente";
    const lista = personal.filter((p) => tipoPersona(p) === tipo);
    const areas = [...new Set(lista.map((p) => p.area).filter(Boolean))];
    const filtros = $id("staffFilters");
    const buscador = $id("staffSearch");
    let area = "todas";
    const norm = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    filtros.innerHTML = ["todas"].concat(areas).map((a) =>
      `<button class="chip${a === area ? " is-active" : ""}" data-area="${esc(a)}">${a === "todas" ? "Todos" : esc(a)}</button>`).join("");
    const pintar = () => {
      const q = norm(buscador.value);
      const grupos = areas.filter((a) => area === "todas" || a === area).map((a) => {
        const gente = lista.filter((p) => p.area === a && (!q || norm(p.nombre + " " + p.cargo).includes(q)));
        return gente.length ? `<section class="staff-group"><h2 class="staff-group__title">${esc(a)} <small>${gente.length}</small></h2><div class="staff-grid">${
          gente.map(tarjetaPersona).join("")}</div></section>` : "";
      }).join("");
      el.innerHTML = grupos || '<p class="empty-note">No encontramos personas con ese nombre o cargo.</p>';
    };
    filtros.addEventListener("click", (e) => {
      const b = e.target.closest("[data-area]");
      if (!b) return;
      area = b.dataset.area;
      filtros.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === b));
      pintar();
    });
    buscador.addEventListener("input", pintar);
    pintar();
  };

  /* ---------- Horarios (página /horarios/) ---------- */
  const renderHorarios = (datos) => {
    const el = $id("timetable");
    if (!el || !window.HORARIOS) return;
    const H = window.HORARIOS;
    const hs = datos || {};
    const colores = hs.colores || {};
    const sel = $id("ttSelect"), selLabel = $id("ttSelectLabel");
    // Solo se publican los horarios de los cursos (los de docentes se quitaron del sitio)
    const listas = { cursos: hs.cursos || [] };
    const params = new URLSearchParams(location.search);
    const tipo = "cursos";
    let dia = Math.min(Math.max(new Date().getDay() - 1, 0), 4);
    let actualHor = null;

    const horaPartes = (t) => String(t || "").split(/\s*[-–—]\s*|\s+a\s+/).filter(Boolean);
    const caja = (asignatura, detalle, grupo) => {
      const bg = H.color(asignatura, colores);
      return `<div class="tt-block" style="--c:${esc(bg)};--t:${H.tinta(bg)}">${grupo ? `<em>${esc(grupo)}</em>` : ""}<strong>${esc(asignatura)}</strong>${detalle ? `<span>${esc(detalle)}</span>` : ""}</div>`;
    };
    // Un electivo se muestra dividido: una parte por plan (Científico, Humanista…)
    const bloque = (txt) => {
      const e = H.electivos(txt);
      if (e) return `<div class="tt-split" role="group" aria-label="Electivo">${e.map((x) => caja(x.asignatura, x.detalle, x.grupo)).join("")}</div>`;
      const { asignatura, detalle } = H.partes(txt);
      return caja(asignatura, detalle);
    };

    const tabla = (hor) => {
      const filas = hor.filas || [];
      const pausas = filas.map(H.pausa);
      // Une celdas iguales seguidas del mismo día (por ejemplo, un bloque doble)
      const span = filas.map(() => H.DIAS.map(() => 1));
      H.DIAS.forEach((_, d) => {
        let origen = -1;
        filas.forEach((f, r) => {
          const txt = H.norm((f.celdas || [])[d]);
          if (!pausas[r] && origen >= 0 && txt && txt === H.norm((filas[origen].celdas || [])[d])) { span[origen][d]++; span[r][d] = 0; }
          else origen = pausas[r] || !txt ? -1 : r;
        });
      });
      const cuerpo = filas.map((f, r) => {
        const hp = horaPartes(f.hora);
        const hora = `<th scope="row" class="tt-hora">${hp.length === 2 ? `${esc(hp[0])}<small>${esc(hp[1])}</small>` : esc(f.hora || "")}</th>`;
        if (pausas[r]) return `<tr class="tt-pausa">${hora}<td colspan="${H.DIAS.length}"><span>${esc(pausas[r])}</span></td></tr>`;
        return `<tr>${hora}${H.DIAS.map((_, d) => {
          if (!span[r][d]) return "";
          const txt = String((f.celdas || [])[d] || "").trim();
          return txt ? `<td${span[r][d] > 1 ? ` rowspan="${span[r][d]}"` : ""}>${bloque(txt)}</td>` : '<td class="tt-vacio"></td>';
        }).join("")}</tr>`;
      }).join("");
      return `<div class="tt-wrap"><table class="tt"><thead><tr><th scope="col" class="tt-hora">Hora</th>${
        H.DIAS.map((d) => `<th scope="col">${d}</th>`).join("")}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
    };

    // En el celular: un día a la vez, con los bloques dobles unidos
    const porDia = (hor) => {
      const items = [];
      (hor.filas || []).forEach((f) => {
        const p = H.pausa(f);
        const txt = p || String((f.celdas || [])[dia] || "").trim();
        const ult = items[items.length - 1];
        if (ult && txt && !p && !ult.pausa && H.norm(ult.txt) === H.norm(txt)) { ult.fin = f.hora; return; }
        items.push({ txt, pausa: !!p, ini: f.hora, fin: f.hora });
      });
      // Sin pausas al comienzo ni al final del día
      while (items.length && (items[0].pausa || !items[0].txt)) items.shift();
      while (items.length && (items[items.length - 1].pausa || !items[items.length - 1].txt)) items.pop();
      const rango = (a, b) => {
        const x = horaPartes(a), y = horaPartes(b);
        return a === b ? (x.length === 2 ? `${x[0]} – ${x[1]}` : a || "") : `${x[0] || a} – ${y[y.length - 1] || b}`;
      };
      return `<div class="tt-dias filters" role="group" aria-label="Día">${H.DIAS.map((d, i) =>
        `<button class="chip${i === dia ? " is-active" : ""}" data-dia="${i}">${d}</button>`).join("")}</div>
        <ol class="tt-lista">${items.filter((it) => it.txt).map((it) => `<li class="${it.pausa ? "tt-lista__pausa" : ""}">
          <span class="tt-lista__hora">${it.pausa && H.norm(it.ini) === H.norm(it.txt) ? "" : esc(rango(it.ini, it.fin))}</span>${it.pausa ? `<span>${esc(it.txt)}</span>` : bloque(it.txt)}</li>`).join("")
          || '<li class="tt-lista__libre">Sin bloques este día.</li>'}</ol>`;
    };

    const leyenda = (hor) => {
      const asigs = H.asignaturas([hor]);
      return asigs.length ? `<ul class="tt-leyenda" aria-label="Asignaturas">${asigs.map((a) => {
        const bg = H.color(a, colores);
        return `<li><i style="background:${esc(bg)}"></i>${esc(a)}</li>`;
      }).join("")}</ul>` : "";
    };

    const pintar = () => {
      const lista = listas[tipo];
      selLabel.textContent = tipo === "cursos" ? "Curso" : "Docente";
      const pedido = params.get(tipo === "cursos" ? "curso" : "docente");
      if (!lista.length) {
        sel.innerHTML = ""; sel.disabled = true;
        el.innerHTML = `<p class="empty-note">Aún no hay horarios de ${tipo === "cursos" ? "cursos" : "docentes"} publicados.</p>`;
        actualHor = null;
        if ($id("ttPng")) $id("ttPng").hidden = true;
        return;
      }
      sel.disabled = false;
      if (!sel.options.length || sel.dataset.tipo !== tipo) {
        sel.dataset.tipo = tipo;
        sel.innerHTML = lista.map((x, i) => `<option value="${i}">${esc(x.nombre)}</option>`).join("");
        const i = lista.findIndex((x) => H.norm(x.nombre) === H.norm(pedido));
        sel.value = i >= 0 ? i : 0;
      }
      const hor = lista[+sel.value] || lista[0];
      const ficha = tipo === "docentes" ? personal.find((p) => H.norm(p.nombre) === H.norm(hor.nombre)) : null;
      el.innerHTML = `<header class="tt-head">
          <div><p class="eyebrow">${tipo === "cursos" ? "Horario de clases" : "Horario del docente"}</p><h2 class="title">${esc(hor.nombre)}</h2>
          ${ficha && ficha.cargo ? `<p class="tt-sub">${esc(ficha.cargo)}</p>` : ""}
          ${tipo === "docentes" ? '<p class="tt-sub">Incluye sus clases y su horario de atención de apoderados.</p>' : ""}</div>
        </header>
        <div class="tt-desk">${tabla(hor)}</div>
        <div class="tt-movil">${porDia(hor)}</div>
        ${leyenda(hor)}`;
      const dias = el.querySelector(".tt-dias"), activo = dias && dias.querySelector(".is-active");
      if (activo) dias.scrollLeft = activo.offsetLeft - dias.offsetLeft - 16;
      actualHor = { hor, subtitulo: ficha && ficha.cargo ? ficha.cargo : "" };
      if ($id("ttPng")) $id("ttPng").hidden = !window.HORARIO_PNG;
      const url = new URL(location.href);
      url.searchParams.delete("curso"); url.searchParams.delete("docente");
      url.searchParams.set(tipo === "cursos" ? "curso" : "docente", hor.nombre);
      history.replaceState(null, "", url);
    };

    sel.addEventListener("change", pintar);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dia]");
      if (b) { dia = +b.dataset.dia; pintar(); }
    });
    const imprimir = $id("ttPrint");
    if (imprimir) imprimir.addEventListener("click", () => window.print());
    // Descargar el horario elegido como imagen PNG (js/horario-png.js)
    const png = $id("ttPng");
    if (png) {
      png.hidden = !window.HORARIO_PNG;
      png.addEventListener("click", async () => {
        if (!actualHor || png.disabled) return;
        const texto = png.textContent;
        png.disabled = true; png.textContent = "Preparando…";
        try {
          await window.HORARIO_PNG.descargar(actualHor.hor, { tipo, subtitulo: actualHor.subtitulo, colores });
        } catch (e) {
          alert("No se pudo crear la imagen. Prueba con el botón Imprimir.");
        } finally {
          png.disabled = false; png.textContent = texto;
        }
      });
    }
    pintar();
  };

  /* ---------- Página CGPA y CEAL: cada centro con su descripción, redes e integrantes ---------- */
  const renderOrganizaciones = (lista) => {
    const el = $id("orgs");
    if (!el || !Array.isArray(lista)) return;
    const ig = window.iconoRed ? window.iconoRed("instagram") : "";
    el.innerHTML = lista.map((o) => {
      const gente = personal.filter((p) => o.area && p.area === o.area);
      return `<section class="org reveal">
        <header class="org__head">
          <div>
            ${o.sigla ? `<p class="eyebrow">${esc(o.sigla)}</p>` : ""}
            <h2 class="title">${esc(o.nombre)}</h2>
            ${o.descripcion ? `<p class="org__desc">${esc(o.descripcion)}</p>` : ""}
          </div>
          <div class="org__links">
            ${o.instagram
              ? `<a class="org__ig" href="${esc(SITE.asset(o.instagram))}" target="_blank" rel="noopener">${ig}<span>Instagram<small>${esc(o.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, ""))}</small></span></a>`
              : `<span class="org__ig org__ig--pronto">${ig}<span>Instagram<small>Muy pronto</small></span></span>`}
            ${o.correo ? `<a class="org__mail" href="mailto:${esc(o.correo)}">${esc(o.correo)}</a>` : ""}
          </div>
        </header>
        ${gente.length ? `<div class="staff-grid">${gente.map(tarjetaPersona).join("")}</div>`
          : '<p class="org__vacio">Pronto publicaremos a sus integrantes.</p>'}
      </section>`;
    }).join("");
    observeReveal(el);
  };

  const renderDocumentos = (lista) => {
    const el = $id("docs");
    if (!el || !Array.isArray(lista)) return;
    el.innerHTML = lista.map((d) => `
      <li><a href="${esc(SITE.asset(d.url))}" target="_blank" rel="noopener"><span class="docs__tag">${esc(d.sigla || "PDF")}</span>${esc(d.nombre)}</a></li>`).join("");
  };

  const renderRedes = (redes) => {
    if (!redes || !Array.isArray(redes.lista)) return;
    const lista = redes.lista.filter((r) => r.url);
    const nombreRed = (r) => (window.REDES[r.red] || window.REDES.web).nombre;
    const grid = $id("socialGrid");
    if (grid) {
      if (redes.titulo) $id("socialTitle").textContent = redes.titulo;
      $id("socialText").textContent = redes.descripcion || "";
      grid.innerHTML = lista.map((r) => `
      <a class="social__item reveal" href="${esc(SITE.asset(r.url))}" target="_blank" rel="noopener">
        <span class="social__ico">${window.iconoRed(r.red)}</span>
        <span><strong>${esc(r.nombre || nombreRed(r))}</strong><small>${esc(nombreRed(r))}</small></span>
      </a>`).join("");
      observeReveal(grid);
    }
    // Barra superior y pie: una entrada por red (la primera cuenta de cada una)
    const unicas = lista.filter((r, i) => lista.findIndex((o) => o.red === r.red) === i);
    $id("topSocial").innerHTML = unicas.map((r) =>
      `<a href="${esc(SITE.asset(r.url))}" target="_blank" rel="noopener" aria-label="${esc(nombreRed(r))}">${window.iconoRed(r.red).replace("<svg", '<svg class="ico"')}</a>`).join("");
    $id("footSocial").innerHTML = unicas.map((r) =>
      `<li><a href="${esc(SITE.asset(r.url))}" target="_blank" rel="noopener">${esc(nombreRed(r))}</a></li>`).join("");
  };

  const renderPortada = (n) => {
    if (!n || !$id("heroNewsTitle")) return;
    const [y, m, d] = (n.fecha || "").split("-");
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    $id("heroNewsTitle").textContent = n.titulo;
    $id("heroNewsDate").textContent = d ? `${+d} de ${meses[+m - 1]} de ${y}` : "";
    $id("heroNewsLink").href = enlaceNoticia(n);
  };

  /* ---------- Página de una noticia (/noticia/?id=…) ---------- */
  const FECHA_LARGA = (f) => {
    const [y, m, d] = (f || "").split("-");
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return d ? `${+d} de ${meses[+m - 1]} de ${y}` : "";
  };
  const renderNoticia = () => {
    const caja = $id("noticiaVer");
    if (!caja) return;
    const id = new URLSearchParams(location.search).get("id") || "";
    actual = noticias.find((n) => TEXTO.idNoticia(n) === id) || null;
    if (!actual) {
      $id("noticiaTitulo").textContent = "No encontramos esta noticia";
      $id("noticiaResumen").textContent = "Puede que se haya eliminado o que el enlace esté incompleto.";
      caja.innerHTML = `<p><a class="btn btn--gold" href="${esc(SITE.url("noticias/"))}">Ver todas las noticias</a></p>`;
      $id("noticiaOtras").hidden = false;
      return;
    }
    const n = actual;
    document.title = `${n.titulo} | Colegio San Martín Iquique`;
    $id("noticiaRuta").textContent = n.titulo;
    const dep = n.departamento && departamentos.find((x) => idDepto(x) === n.departamento);
    $id("noticiaMeta").innerHTML = `<span class="noticia__tag">${esc(ETIQUETAS[n.tipo] || n.tipo || "Noticia")}</span> <time datetime="${esc(n.fecha)}">${esc(FECHA_LARGA(n.fecha))}</time>` +
      (dep ? ` <a class="noticia__dep" href="${esc(enlaceDepto(dep, "actividades"))}">${esc(dep.nombre)}</a>` : "");
    $id("noticiaTitulo").textContent = n.titulo;
    $id("noticiaResumen").textContent = n.resumen || "";
    const adjunto = TEXTO.urlSegura(n.url);
    const esPdf = /\.pdf($|\?)/i.test(adjunto);
    caja.innerHTML = `
      <article class="noticia__art">
        ${n.imagen ? `<figure class="noticia__portada"><img src="${esc(SITE.asset(n.imagen))}" alt=""></figure>` : ""}
        <div class="noticia__cuerpo">${n.cuerpo ? TEXTO.html(n.cuerpo, SITE.asset) : (n.resumen ? `<p>${esc(n.resumen)}</p>` : "")}</div>
        ${adjunto ? `<p class="noticia__adjunto"><a class="btn btn--gold" href="${esc(SITE.asset(adjunto))}" target="_blank" rel="noopener">${esPdf ? "Descargar documento (PDF)" : "Abrir enlace"}</a></p>` : ""}
        <p class="noticia__volver"><a href="${esc(SITE.url("noticias/"))}">← Volver a noticias</a></p>
      </article>`;
    $id("noticiaOtras").hidden = noticias.length < 2;
  };

  const PAGINA = document.body.dataset.page || "inicio";
  SITE.ready = fetch(SITE.base + "data/sitio.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      aplicarColores(data.colores);
      SITE.logo(data.logo);
      if (data.lema) document.querySelectorAll("[data-lema]").forEach((el) => { el.textContent = data.lema; });
      if (window.ESTILO) {
        window.ESTILO.aplicar(data.estilo || {}, PAGINA);
        try { localStorage.setItem("csm-estilo", JSON.stringify(data.estilo || {})); } catch (e) { /* sin almacenamiento */ }
      }
      personal = Array.isArray(data.personal) ? data.personal : [];
      renderDirectivos(data.directivos);
      renderPilares(data.pilares);
      departamentos = Array.isArray(data.departamentos) ? data.departamentos : [];
      renderPersonal();
      renderHorarios(data.horarios);
      renderOrganizaciones(data.organizaciones);
      renderDocumentos(data.documentos);
      renderRedes(data.redes);
      noticias = (data.noticias || []).slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
      renderPortada(noticias[0]);
      renderNoticia();
      renderNews();
      renderDepartamentos();
    })
    .catch(() => {
      if (newsEl) newsEl.innerHTML = '<p>No se pudieron cargar las noticias. Abre el sitio desde su dirección web para verlas.</p>';
      if (moreBtn) moreBtn.hidden = true;
      if ($id("redes")) $id("redes").hidden = true;
    });

  /* ---------- Formulario de contacto ---------- */
  const form = $id("contactForm");
  const ok = $id("formOk");
  const reglas = {
    nombre: (v) => v.trim().length >= 3 || "Ingresa tu nombre completo.",
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Ingresa un correo válido.",
    motivo: (v) => v !== "" || "Selecciona un motivo.",
    mensaje: (v) => v.trim().length >= 10 || "Escribe un mensaje de al menos 10 caracteres.",
  };
  const validar = (campo) => {
    const res = reglas[campo.name](campo.value);
    const field = campo.closest(".field");
    field.classList.toggle("has-error", res !== true);
    field.querySelector(".error").textContent = res === true ? "" : res;
    return res === true;
  };
  if (form) Object.keys(reglas).forEach((name) => {
    form.elements[name].addEventListener("blur", (e) => validar(e.target));
  });
  if (form) form.addEventListener("submit", (e) => {
    e.preventDefault();
    const campos = Object.keys(reglas).map((n) => form.elements[n]);
    const validos = campos.map(validar).every(Boolean);
    if (!validos) { campos.find((c) => c.closest(".has-error")).focus(); return; }
    // Aquí se conecta el envío real (por ejemplo, un servicio de formularios o el correo del colegio).
    form.reset();
    ok.hidden = false;
    setTimeout(() => { ok.hidden = true; }, 6000);
  });

})();

/* ==========================================================
   Panel de administración — Colegio San Martín Iquique
   Edita data/sitio.json y sube archivos al repositorio de GitHub
   que publica el sitio (GitHub Pages). No necesita servidor.
   ========================================================== */
(function () {
  "use strict";

  // El panel no se puede mostrar dentro de otra página (evita que lo «disfracen» para robar clics)
  if (window.top !== window.self) { document.body.innerHTML = ""; return; }

  const DATA_PATH = "data/sitio.json";
  const ROLES_PATH = "data/roles.json";
  const STORE_KEY = "csm-admin";
  const MAX_MB = 25;

  const state = {
    owner: "", repo: "", branch: "main", token: "", data: null, sha: null, dirty: false, view: "directivos",
    // Quién entró: el dueño del repositorio escribe directo; los demás envían sus cambios a revisión
    login: "", rol: "", nombre: "", modo: "directo", base: null, envio: null,
    roles: { usuarios: [] }, rolesSha: null, rolesTexto: "",
  };
  const ROLES = {
    dueno: { nombre: "Administrador (dueño)", desc: "Puede cambiar absolutamente todo, incluidos los usuarios y sus permisos." },
    trabajador: { nombre: "Administrador (trabajador)", desc: "Puede cambiar el contenido, los estilos y las páginas, pero no los usuarios. Cada cambio se le avisa al dueño, y los cambios en el HTML de las páginas esperan su aprobación." },
    utp: { nombre: "UTP", desc: "Solo puede publicar y editar noticias." },
  };
  const textoGuardar = () => (state.modo === "directo" ? "Guardar y publicar" : "Enviar cambios");
  const puede = (vista) => state.rol === "dueno" || (state.rol === "trabajador" && vista !== "usuarios") || (state.rol === "utp" && vista === "noticias");
  // Archivos que un funcionario puede subir (sin SVG ni HTML, que pueden ejecutar código). Lo mismo revisa la acción de GitHub.
  const SUBIBLE = /\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|mp3|mp4)$/i;
  const previews = {}; // ruta subida -> dataURL, para ver la imagen antes de que GitHub Pages la publique

  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- Utilidades ---------- */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(Infinity).forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }

  let toastTimer;
  function toast(msg, type = "") {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast is-on " + (type ? "is-" + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), type === "error" ? 7000 : 3500);
  }

  const utf8ToB64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "archivo";

  const resolver = (src) => !src ? "" : previews[src] || (/^(https?:|data:)/.test(src) ? src : "../" + src);

  /* ---------- GitHub API ---------- */
  async function api(path, opts = {}) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + state.token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      let msg = res.status + "";
      try { msg = (await res.json()).message || msg; } catch (e) { /* sin cuerpo */ }
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  const gh = (path, opts) => api(`/repos/${state.owner}/${state.repo}${path}`, opts);
  const shaDe = async (o, r, ruta, ref) => {
    try { return (await api(`/repos/${o}/${r}/contents/${ruta}?ref=${encodeURIComponent(ref)}`)).sha; } catch (e) { if (e.status === 404) return null; throw e; }
  };

  /* ---------- Escritura: directa (dueño) o en una rama de revisión (funcionarios) ---------- */
  // Los funcionarios no pueden escribir en el repositorio: sus cambios van a una rama «panel-…» de su copia (fork)
  // y se envían como solicitud de cambios. Una acción de GitHub la revisa según su rol y la publica.
  async function prepararRama() {
    const fork = await api(`/repos/${state.owner}/${state.repo}/forks`, { method: "POST", body: JSON.stringify({ default_branch_only: true }) });
    const d = { owner: fork.owner.login, repo: fork.name, branch: "panel-" + Date.now().toString(36) };
    for (let i = 0; i < 15; i++) { // la copia puede tardar unos segundos en estar lista
      try { await api(`/repos/${d.owner}/${d.repo}`); break; } catch (e) { if (i === 14) throw e; await new Promise((ok) => setTimeout(ok, 2000)); }
    }
    const crear = () => api(`/repos/${d.owner}/${d.repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: "refs/heads/" + d.branch, sha: state.base }) });
    try {
      await crear();
    } catch (e) {
      // La copia está desactualizada: se sincroniza con el original y se reintenta
      await api(`/repos/${d.owner}/${d.repo}/merge-upstream`, { method: "POST", body: JSON.stringify({ branch: fork.default_branch || state.branch }) }).catch(() => {});
      await crear();
    }
    return d;
  }

  async function escribir(ruta, contenido, mensaje, { sha, borrar } = {}) {
    const body = { message: mensaje };
    if (!borrar) body.content = contenido;
    let destino;
    if (state.modo === "directo") {
      destino = { owner: state.owner, repo: state.repo, branch: state.branch };
      if (sha === undefined) sha = await shaDe(destino.owner, destino.repo, ruta, destino.branch);
    } else {
      if (!state.envio) state.envio = await prepararRama();
      destino = state.envio;
      sha = await shaDe(destino.owner, destino.repo, ruta, destino.branch);
    }
    if (borrar && !sha) return null;
    if (sha) body.sha = sha;
    body.branch = destino.branch;
    return api(`/repos/${destino.owner}/${destino.repo}/contents/${ruta}`, { method: borrar ? "DELETE" : "PUT", body: JSON.stringify(body) });
  }

  // Abre la solicitud de cambios con lo escrito desde el último envío
  async function enviar(titulo) {
    const d = state.envio;
    if (!d) return null;
    state.envio = null;
    const pr = await gh("/pulls", { method: "POST", body: JSON.stringify({
      title: `${titulo} · ${state.nombre || "@" + state.login}`,
      head: `${d.owner}:${d.branch}`, base: state.branch,
      body: `Enviado desde el panel por ${state.nombre ? state.nombre + " " : ""}(@${state.login}, ${ROLES[state.rol].nombre}).\n\nSe revisa y publica automáticamente según su rol.`,
    }) });
    seguir(pr.number);
    return pr;
  }

  // Avisa al funcionario cuando la revisión automática termina
  function seguir(numero, intento = 0) {
    if (intento > 30) return;
    setTimeout(async () => {
      try {
        const issue = await gh(`/issues/${numero}`);
        const labels = issue.labels.map((l) => l.name);
        if (labels.includes("publicado")) return toast("Tus cambios ya se publicaron. El sitio se actualiza en 1 o 2 minutos.", "ok");
        if (labels.includes("pendiente")) return toast("Tus cambios quedaron pendientes de aprobación del dueño.", "ok");
        if (labels.includes("rechazado")) {
          const coms = await gh(`/issues/${numero}/comments?per_page=10`);
          const ult = coms.reverse().find((c) => /No se publicó/.test(c.body));
          const motivo = ult ? ult.body.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)).join(" ") : "";
          return toast("Tus cambios no se publicaron. " + motivo, "error");
        }
      } catch (e) { /* se reintenta */ }
      seguir(numero, intento + 1);
    }, 8000);
  }

  async function cargarDatos() {
    // Se recuerda el commit leído: los envíos a revisión parten de él
    state.base = (await gh(`/git/ref/heads/${encodeURIComponent(state.branch)}`)).object.sha;
    const f = await gh(`/contents/${DATA_PATH}?ref=${state.base}`);
    state.sha = f.sha;
    state.crudo = b64ToUtf8(f.content);
    state.data = JSON.parse(state.crudo);
    normalizar();
    prepararHorarios();
    state.data.noticias.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    // Foto de cada sección tal como se cargó, para enviar a revisión solo lo que de verdad cambió
    state.foto = Object.fromEntries(Object.keys(state.data).map((k) => [k, JSON.stringify(state.data[k])]));
    try {
      const r = await gh(`/contents/${ROLES_PATH}?ref=${state.base}`);
      state.roles = JSON.parse(b64ToUtf8(r.content));
      state.rolesSha = r.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
      state.roles = { usuarios: [] }; state.rolesSha = null;
    }
    state.roles.usuarios = state.roles.usuarios || [];
    state.rolesTexto = JSON.stringify(state.roles);
  }

  function normalizar() {
    const d = state.data;
    d.colores = d.colores || { primario: "#0b1f3a", secundario: "#1c3a66", acento: "#c9a24b" };
    d.directivos = d.directivos || [];
    d.departamentos = (d.departamentos || []).map((x) => (x.tipo ? x : { ...x, tipo: "apoyo" }));
    d.personal = (d.personal || []).map((p) => (p.tipo ? p : { ...p, tipo: /^docentes/i.test(p.area || "") ? "docente" : /centro de (padres|estudiantes)/i.test(p.area || "") ? "comunidad" : "equipo" }));
    d.organizaciones = d.organizaciones || [];
    d.pilares = d.pilares || [];
    d.noticias = d.noticias || [];
    d.documentos = d.documentos || [];
    d.redes = d.redes || { titulo: "", descripcion: "", lista: [] };
    d.redes.lista = d.redes.lista || [];
    d.horarios = d.horarios || {};
    d.horarios.colores = d.horarios.colores || {};
    d.horarios.cursos = d.horarios.cursos || [];
    d.horarios.docentes = d.horarios.docentes || [];
    d.horarios.asignaturas = d.horarios.asignaturas || []; // asignaturas agregadas a mano (aunque aún no estén en un horario)
    d.estilo = d.estilo || {};
    d.estilo.global = d.estilo.global || {};
    d.estilo.paginas = d.estilo.paginas || {};
  }

  async function subirArchivo(file, carpeta) {
    if (file.size > MAX_MB * 1024 * 1024) throw new Error(`El archivo supera ${MAX_MB} MB.`);
    const dataUrl = await new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(file);
    });
    const punto = file.name.lastIndexOf(".");
    const base = slug(punto > 0 ? file.name.slice(0, punto) : file.name);
    const ext = punto > 0 ? file.name.slice(punto).toLowerCase() : "";
    if (state.rol !== "dueno" && !SUBIBLE.test(ext)) throw new Error("Ese tipo de archivo no está permitido. Usa PNG, JPG, WEBP, GIF, PDF o un documento de Office.");
    const ruta = `${carpeta}/${Date.now().toString(36)}-${base}${ext}`;
    await escribir(ruta, dataUrl.split(",")[1], `Subir ${file.name} desde el panel`, { sha: null });
    if (file.type.startsWith("image/")) previews[ruta] = dataUrl;
    return ruta;
  }

  async function guardar() {
    const btn = $("#saveBtn");
    btn.disabled = true; btn.textContent = state.modo === "directo" ? "Publicando…" : "Enviando…";
    try {
      for (const k in state.data.estilo.paginas) if (!Object.keys(state.data.estilo.paginas[k]).length) delete state.data.estilo.paginas[k];
      prepararHorarios();
      idsNoticias();
      idsDepartamentos();
      state.data.noticias.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
      const rolesCambiaron = puede("usuarios") && JSON.stringify(state.roles) !== state.rolesTexto;
      if (rolesCambiaron) {
        const r = await escribir(ROLES_PATH, utf8ToB64(JSON.stringify(state.roles, null, 2) + "\n"), "Actualizar usuarios y permisos del panel", { sha: state.rolesSha });
        if (state.modo === "directo") state.rolesSha = r.content.sha;
        state.rolesTexto = JSON.stringify(state.roles);
      }
      let salida = state.data;
      if (state.modo !== "directo") {
        salida = JSON.parse(state.crudo);
        for (const k in state.data) if (JSON.stringify(state.data[k]) !== state.foto[k]) salida[k] = state.data[k];
      }
      const res = await escribir(DATA_PATH, utf8ToB64(JSON.stringify(salida, null, 2) + "\n"), "Actualizar contenido del sitio desde el panel", { sha: state.sha });
      if (state.modo === "directo") {
        state.sha = res.content.sha;
        toast("Cambios publicados. El sitio se actualiza en 1 o 2 minutos.", "ok");
      } else {
        await enviar(state.rol === "utp" ? "Noticias" : "Contenido del sitio");
        state.foto = Object.fromEntries(Object.keys(state.data).map((k) => [k, JSON.stringify(state.data[k])]));
        toast("Cambios enviados. Se revisan y publican solos en 1 o 2 minutos.", "ok");
      }
      setDirty(false);
      render();
    } catch (e) {
      if (state.modo === "directo" && (e.status === 409 || e.status === 422)) {
        toast("El contenido cambió en GitHub desde que lo abriste. Descarga un respaldo y recarga el panel.", "error");
      } else {
        toast("No se pudo publicar: " + e.message, "error");
      }
      btn.disabled = false;
    } finally {
      btn.textContent = textoGuardar();
    }
  }

  /* ---------- Estado de cambios ---------- */
  function setDirty(v) {
    state.dirty = v;
    $("#saveBtn").disabled = !v;
    $("#dirtyFlag").hidden = !v;
    if (v) $(".bar__actions").hidden = false;
  }
  window.addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- Campos ---------- */
  function campo(def, obj, onChange) {
    const id = "f" + Math.random().toString(36).slice(2, 9);
    const val = obj[def.k] == null ? "" : obj[def.k];
    const set = (v) => { obj[def.k] = v; setDirty(true); onChange && onChange(); };
    let input;

    if (def.type === "textarea") {
      input = h("textarea", { id, rows: 3, oninput: (e) => set(e.target.value) });
      input.value = val;
    } else if (def.type === "select") {
      input = h("select", { id, onchange: (e) => set(e.target.value) },
        def.options.map(([v, t]) => h("option", { value: v, selected: v === val }, t)));
    } else if (def.type === "file") {
      const txt = h("input", { id, type: "text", value: val, placeholder: def.placeholder || "", oninput: (e) => set(e.target.value) });
      const wrap = h("div", { class: "upload" }, txt);
      const fileIn = h("input", {
        type: "file", accept: def.accept || "",
        onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          wrap.classList.add("is-busy");
          toast("Subiendo " + f.name + "…");
          try {
            const ruta = await subirArchivo(/^image\/(png|jpeg|webp)$/.test(f.type) ? await ajustarImagen(f, def.ajustar || 2400) : f, def.folder);
            txt.value = ruta; set(ruta);
            toast(`Archivo subido. Recuerda presionar «${textoGuardar()}».`, "ok");
          } catch (err) {
            toast("No se pudo subir el archivo: " + err.message, "error");
          } finally {
            wrap.classList.remove("is-busy"); e.target.value = "";
          }
        },
      });
      wrap.append(h("span", { class: "btn btn--ghost btn--sm upload__btn" }, "Subir…", fileIn));
      input = wrap;
    } else if (def.type === "custom") {
      input = def.render(obj, () => { setDirty(true); onChange && onChange(); });
    } else {
      input = h("input", { id, type: def.type || "text", value: val, placeholder: def.placeholder || "", maxlength: def.max || null,
        oninput: (e) => set(e.target.value) });
    }
    return h("div", { class: "field" + (def.full ? " field--full" : "") },
      h("label", { for: id }, def.label), input, def.help ? h("small", {}, def.help) : null);
  }

  /* ---------- Cuerpo de una noticia: texto con formato simple y vista previa ---------- */
  function editorCuerpo(obj, avisar) {
    const ta = h("textarea", { rows: 12, class: "cuerpo__texto", placeholder: "Escribe aquí la noticia completa. Deja una línea en blanco entre párrafos." });
    ta.value = obj.cuerpo || "";
    const vista = h("div", { class: "cuerpo__vista noticia__cuerpo" });
    const pintar = () => {
      vista.innerHTML = window.TEXTO.html(ta.value, (u) => previews[u] || (/^(https?:|mailto:)/i.test(u) ? u : SITIO + u)) ||
        '<p class="cuerpo__vacio">Aquí verás cómo queda.</p>';
    };
    const cambiar = () => { obj.cuerpo = ta.value; pintar(); avisar(); };
    ta.addEventListener("input", cambiar);
    // Envuelve la selección (o inserta un ejemplo) con las marcas del formato
    const envolver = (antes, despues, ejemplo, alFinal) => {
      const a = ta.selectionStart, b = ta.selectionEnd;
      const sel = ta.value.slice(a, b) || ejemplo;
      ta.setRangeText(antes + sel + despues, a, b, "end");
      if (!alFinal) { ta.selectionStart = a + antes.length; ta.selectionEnd = a + antes.length + sel.length; }
      ta.focus(); cambiar();
    };
    // Inserta un bloque propio (subtítulo, lista, imagen) separado por líneas en blanco
    const bloque = (texto, aparte) => {
      const b = ta.selectionEnd, a = aparte ? b : ta.selectionStart;
      const previo = ta.value.slice(0, a);
      const sep = !previo.trim() ? "" : /\n\n$/.test(previo) ? "" : /\n$/.test(previo) ? "\n" : "\n\n";
      const sel = ta.value.slice(a, b);
      const t = typeof texto === "function" ? texto(sel) : texto;
      ta.setRangeText(sep + t + "\n\n", a, b, "end");
      ta.focus(); cambiar();
    };
    const boton = (txt, title, fn) => h("button", { type: "button", class: "btn btn--ghost btn--sm", title, onclick: fn }, txt);
    const fotoIn = h("input", {
      type: "file", accept: "image/*", hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        toast("Subiendo " + f.name + "…");
        try {
          const ruta = await subirArchivo(/^image\/(png|jpeg|webp|gif)$/.test(f.type) ? await ajustarImagen(f, 1600) : f, "img/noticias");
          bloque(`![](${ruta})`, true);
          toast("Imagen agregada. Puedes escribir una descripción entre los corchetes [ ].", "ok");
        } catch (err) {
          toast("No se pudo subir la imagen: " + err.message, "error");
        } finally { e.target.value = ""; }
      },
    });
    const barra = h("div", { class: "cuerpo__barra" },
      boton("Negrita", "Negrita: **texto**", () => envolver("**", "**", "texto destacado")),
      boton("Cursiva", "Cursiva: *texto*", () => envolver("*", "*", "texto")),
      boton("Subtítulo", "Subtítulo: ## Título", () => bloque((sel) => "## " + (sel || "Subtítulo"))),
      boton("Lista", "Lista con viñetas", () => bloque((sel) => (sel || "Primer punto\nSegundo punto").split("\n").map((l) => "- " + l.replace(/^\s*[-•]\s*/, "")).join("\n"))),
      boton("Cita", "Cita o texto destacado", () => bloque((sel) => (sel || "Texto citado").split("\n").map((l) => "> " + l).join("\n"))),
      boton("Enlace", "Enlace: [texto](https://…)", () => {
        const url = prompt("Dirección del enlace (https://…):", "https://");
        if (url && window.TEXTO.urlSegura(url)) envolver("[", `](${url.trim()})`, "texto del enlace", true);
        else if (url) toast("Ese enlace no es válido. Debe empezar con https://", "error");
      }),
      h("label", { class: "btn btn--ghost btn--sm", title: "Subir una imagen dentro del texto" }, "Imagen…", fotoIn));
    pintar();
    return h("div", { class: "cuerpo" }, barra,
      h("div", { class: "cuerpo__panes" }, ta, vista),
      h("small", {}, "Formato: **negrita**, *cursiva*, ## subtítulo, - lista, > cita, [texto](enlace). Deja una línea en blanco entre párrafos. Si lo dejas vacío, la página muestra solo el resumen."));
  }

  // Enlace a la página propia de la noticia (se crea sola al guardar)
  function enlacePagina(obj) {
    const id = obj.id || window.TEXTO.idNoticia(obj);
    const url = SITIO + "noticia/?id=" + encodeURIComponent(id);
    return h("p", { class: "cuerpo__link" }, obj.id ? h("a", { href: url, target: "_blank", rel: "noopener" }, "Ver la página de esta noticia ↗")
      : "La página de esta noticia se crea al guardar. Después de publicar, el botón «Seguir leyendo» llevará a ella.");
  }

  // Cada noticia recibe un identificador fijo para su página (no cambia si después se edita el título)
  function idsNoticias() {
    const usados = new Set(state.data.noticias.map((n) => n.id).filter(Boolean));
    state.data.noticias.forEach((n) => {
      if (n.id) return;
      const base = window.TEXTO.idNoticia(n);
      let id = base, i = 2;
      while (usados.has(id)) id = `${base}-${i++}`;
      usados.add(id); n.id = id;
    });
  }

  /* ---------- Departamentos: identificador, enlace y selección de docentes ---------- */
  const idDepto = (d) => d.id || window.TEXTO.slug(String(d.nombre || "").replace(/^Departamento (de )?/i, "")) || "departamento";
  function idsDepartamentos() {
    const usados = new Set(state.data.departamentos.map((d) => d.id).filter(Boolean));
    state.data.departamentos.forEach((d) => {
      if (d.id) return;
      const base = idDepto(d);
      let id = base, i = 2;
      while (usados.has(id)) id = `${base}-${i++}`;
      usados.add(id); d.id = id;
    });
  }
  function enlaceDepto(obj) {
    if (obj.tipo !== "academico") return h("p", { class: "cuerpo__link" }, "Los equipos de apoyo no tienen página propia.");
    return h("p", { class: "cuerpo__link" }, obj.id ? h("a", { href: SITIO + "departamentos/?d=" + encodeURIComponent(obj.id), target: "_blank", rel: "noopener" }, "Ver la página del departamento ↗")
      : "Su página se crea al guardar.");
  }
  // Casillas para elegir los departamentos académicos de un docente (puede estar en más de uno)
  function elegirDeptos(obj, avisar) {
    const acas = state.data.departamentos.filter((d) => d.tipo === "academico");
    if (!acas.length) return h("p", { class: "cuerpo__link" }, "Primero crea los departamentos académicos en «Departamentos».");
    return h("div", { class: "checks" }, acas.map((d) => {
      const id = idDepto(d);
      return h("label", { class: "check" }, h("input", { type: "checkbox", checked: (obj.departamentos || []).includes(id), onchange: (e) => {
        const set = new Set(obj.departamentos || []);
        if (e.target.checked) set.add(id); else set.delete(id);
        obj.departamentos = acas.map(idDepto).filter((x) => set.has(x));
        if (!obj.departamentos.length) delete obj.departamentos;
        avisar();
      } }), String(d.nombre).replace(/^Departamento (de )?/i, ""));
    }));
  }

  /* ---------- Editor de listas ---------- */
  function editorLista({ items, campos, resumen, miniatura, nuevo, agregarArriba, textoAgregar, vacio }) {
    const cont = h("div");
    const abiertos = new WeakSet();

    const pintar = () => {
      cont.innerHTML = "";
      if (!items.length) cont.append(h("p", { class: "empty" }, vacio));
      const list = h("div", { class: "list" });
      items.forEach((it, i) => {
        const titulo = h("div", { class: "item__title" });
        const thumb = h("span", { class: "item__thumb" });
        const refrescar = () => {
          const r = resumen(it);
          titulo.replaceChildren(h("strong", {}, r[0] || "(sin título)"), h("small", {}, r[1] || ""));
          thumb.innerHTML = "";
          miniatura(it, thumb);
        };
        refrescar();
        const mover = (d) => (e) => { e.stopPropagation(); items.splice(i + d, 0, items.splice(i, 1)[0]); setDirty(true); pintar(); };
        const item = h("div", { class: "item" + (abiertos.has(it) ? " is-open" : "") },
          h("div", { class: "item__head", onclick: () => { item.classList.toggle("is-open"); item.classList.contains("is-open") ? abiertos.add(it) : abiertos.delete(it); } },
            thumb, titulo,
            h("div", { class: "item__tools" },
              h("button", { class: "icon-btn", title: "Subir", "aria-label": "Mover arriba", disabled: i === 0, onclick: mover(-1) }, "↑"),
              h("button", { class: "icon-btn", title: "Bajar", "aria-label": "Mover abajo", disabled: i === items.length - 1, onclick: mover(1) }, "↓"),
              h("button", { class: "icon-btn icon-btn--danger", title: "Eliminar", "aria-label": "Eliminar",
                onclick: (e) => { e.stopPropagation(); if (confirm(`¿Eliminar «${resumen(it)[0] || "este elemento"}»?`)) { items.splice(i, 1); setDirty(true); pintar(); } } }, "✕"))),
          h("div", { class: "item__body" }, campos.map((c) => campo(c, it, refrescar))));
        list.append(item);
      });
      cont.append(list);
    };

    pintar();
    const add = h("div", { class: "add-row" }, h("button", { class: "btn btn--ghost", onclick: () => {
      const n = nuevo();
      agregarArriba ? items.unshift(n) : items.push(n);
      abiertos.add(n); setDirty(true); pintar();
    } }, "+ " + textoAgregar));
    return h("div", {}, agregarArriba ? add : null, cont, agregarArriba ? null : add);
  }

  const iniciales = (it) => it.iniciales || (it.cargo || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const fotoOIniciales = (src, txt) => (it, el) => {
    const s = resolver(it[src]);
    if (s) el.append(h("img", { src: s, alt: "" })); else el.textContent = txt(it);
  };

  /* ---------- Vistas ---------- */
  const VISTAS = {
    directivos: {
      titulo: "Directivos",
      ayuda: "Funcionarios del equipo directivo que aparecen en la sección «Equipo directivo». El orden de la lista es el orden en el sitio.",
      render: () => editorLista({
        items: state.data.directivos,
        textoAgregar: "Agregar directivo",
        vacio: "Aún no hay directivos.",
        nuevo: () => ({ cargo: "", nombre: "", descripcion: "", iniciales: "", foto: "" }),
        resumen: (it) => [it.cargo, it.nombre],
        miniatura: fotoOIniciales("foto", iniciales),
        campos: [
          { k: "cargo", label: "Cargo", placeholder: "Ej.: Dirección" },
          { k: "nombre", label: "Nombre", placeholder: "Ej.: María Pérez Soto" },
          { k: "descripcion", label: "Descripción breve", type: "textarea", full: true },
          { k: "correo", label: "Correo", type: "email", help: "Opcional." },
          { k: "telefono", label: "Teléfono", help: "Opcional." },
          { k: "iniciales", label: "Iniciales (si no hay foto)", max: 3 },
          { k: "foto", label: "Foto", type: "file", accept: "image/*", folder: "img/directivos", placeholder: "Sube una imagen o pega un enlace" },
        ],
      }),
    },
    departamentos: {
      titulo: "Departamentos",
      ayuda: "Los departamentos académicos (Matemática, Lenguaje…) tienen su propia página con sus profesores y actividades. Los profesores se asignan en «Docentes y personal» y las actividades son noticias con la etiqueta de su departamento. Los equipos de apoyo aparecen en una sección aparte.",
      render: () => editorLista({
        items: state.data.departamentos,
        textoAgregar: "Agregar departamento",
        vacio: "Aún no hay departamentos.",
        nuevo: () => ({ tipo: "academico", nombre: "", descripcion: "", encargado: "", correo: "", imagen: "", formato: "foto" }),
        resumen: (it) => [it.nombre, [it.tipo === "academico" ? "Académico" : "Equipo de apoyo", it.encargado].filter(Boolean).join(" · ")],
        miniatura: (it, el) => { el.textContent = (it.nombre || "?").replace(/^Departamento (de )?/i, "").slice(0, 2).toUpperCase(); },
        campos: [
          { k: "nombre", label: "Nombre", placeholder: "Ej.: Departamento de Matemática", full: true },
          { k: "tipo", label: "Tipo", type: "select", options: [["academico", "Académico (con página, profesores y actividades)"], ["apoyo", "Equipo de apoyo"]] },
          { k: "id", label: "Página", type: "custom", render: (obj) => enlaceDepto(obj) },
          { k: "descripcion", label: "Descripción", type: "textarea", full: true },
          { k: "encargado", label: "Jefe/a o encargado/a", help: "Opcional." },
          { k: "correo", label: "Correo de contacto", type: "email", help: "Opcional." },
          { k: "imagen", label: "Imagen o portada", type: "file", accept: "image/*", folder: "img/departamentos", ajustar: 1600, full: true,
            placeholder: "Opcional: sube una foto o un ícono", help: "En los académicos es la portada de su página (mejor horizontal). Se ajusta sola." },
          { k: "formato", label: "Mostrar la imagen como", type: "select", options: [["icono", "Ícono pequeño arriba del título"], ["foto", "Foto a lo ancho de la tarjeta"]] },
        ],
      }),
    },
    personal: {
      titulo: "Docentes y personal",
      ayuda: "Cada persona aparece en la página «Docentes», «Equipos y funcionarios» o «CGPA y CEAL» según su tipo, agrupada por área. Marca sus «Departamentos» para que aparezcan en la página de cada departamento académico. Título, postgrado, tema favorito y frase se ven al tocar su tarjeta.",
      render: () => {
        const fijas = ["Docentes Primer Ciclo", "Docentes Segundo Ciclo", "Inspectoría", "Asistentes de aula", "Administración",
          "Auxiliares, aseo y mantención", "Centro de Padres y Apoderados", "Centro de Estudiantes (CEAL)"];
        const areas = [...new Set(fijas.concat(state.data.departamentos.map((d) => d.nombre), state.data.personal.map((p) => p.area)).filter(Boolean))];
        return editorLista({
          items: state.data.personal,
          textoAgregar: "Agregar persona",
          vacio: "Aún no hay personas.",
          nuevo: () => ({ nombre: "", cargo: "", area: areas[0], tipo: "docente", correo: "", telefono: "", foto: "" }),
          resumen: (it) => [it.nombre, [{ equipo: "Equipo", comunidad: "CGPA/CEAL" }[it.tipo] || "Docente", it.cargo, it.area].filter(Boolean).join(" · ")],
          miniatura: fotoOIniciales("foto", (it) => (it.nombre || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()),
          campos: [
            { k: "nombre", label: "Nombre completo" },
            { k: "cargo", label: "Cargo, curso o asignatura", placeholder: "Ej.: Profesora jefe 2° básico A" },
            { k: "tipo", label: "Aparece en", type: "select", options: [["docente", "Docentes (profesores)"], ["equipo", "Equipos y funcionarios"], ["comunidad", "CGPA y CEAL"]] },
            { k: "area", label: "Área o equipo", type: "select", options: areas.map((a) => [a, a]), help: "Título del grupo en que aparece." },
            { k: "correo", label: "Correo", type: "email", help: "Opcional." },
            { k: "telefono", label: "Teléfono", help: "Opcional." },
            { k: "departamentos", label: "Departamentos", type: "custom", full: true, render: (obj, avisar) => elegirDeptos(obj, avisar) },
            { k: "titulo", label: "Título profesional", placeholder: "Ej.: Profesora de Matemática, Universidad Arturo Prat", full: true, help: "Opcional. Se ve en su ficha completa." },
            { k: "postgrado", label: "Postgrado", placeholder: "Ej.: Magíster en Educación Matemática", full: true, help: "Opcional: magíster, doctorado, diplomado…" },
            { k: "interes", label: "Tema favorito o área de interés", placeholder: "Ej.: Geometría y resolución de problemas", full: true, help: "Opcional." },
            { k: "frase", label: "Frase breve", type: "textarea", full: true, help: "Opcional. Una frase sobre su forma de enseñar o algo que le guste." },
            { k: "foto", label: "Foto", type: "file", accept: "image/*", folder: "img/personal", full: true,
              placeholder: "Sube una foto o pega un enlace", help: "Horizontal, idealmente de medio cuerpo. Si no hay foto se muestran las iniciales." },
          ],
        });
      },
    },
    noticias: {
      titulo: "Noticias",
      ayuda: "Las noticias se ordenan por fecha automáticamente. La más reciente aparece destacada en la portada.",
      render: () => editorLista({
        items: state.data.noticias,
        agregarArriba: true,
        textoAgregar: "Nueva noticia",
        vacio: "Aún no hay noticias.",
        nuevo: () => ({ fecha: new Date().toISOString().slice(0, 10), tipo: "comunicado", titulo: "", resumen: "", url: "", imagen: "" }),
        resumen: (it) => [it.titulo, it.fecha],
        miniatura: fotoOIniciales("imagen", (it) => (it.fecha || "").slice(8, 10) || "•"),
        campos: [
          { k: "titulo", label: "Título", full: true },
          { k: "fecha", label: "Fecha", type: "date" },
          { k: "tipo", label: "Categoría", type: "select", options: [["comunicado", "Comunicado"], ["pedagogia", "Pedagogía"], ["comunidad", "Comunidad"]] },
          { k: "departamento", label: "Departamento (opcional)", type: "select",
            options: [["", "Ninguno"]].concat(state.data.departamentos.filter((d) => d.tipo === "academico").map((d) => [idDepto(d), d.nombre])),
            help: "Si eliges uno, la noticia también aparece en «Actividades» de ese departamento." },
          { k: "resumen", label: "Resumen", type: "textarea", full: true, help: "Una o dos frases. Se ve en la tarjeta de la noticia y al inicio de su página." },
          { k: "cuerpo", label: "Texto completo de la noticia", type: "custom", full: true, render: (obj, avisar) => editorCuerpo(obj, avisar) },
          { k: "imagen", label: "Imagen de portada", type: "file", accept: "image/*", folder: "img/noticias", ajustar: 1600, full: true, help: "Opcional. Formato horizontal." },
          { k: "url", label: "Documento adjunto o enlace externo", type: "file", accept: ".pdf,image/*", folder: "documentos/noticias", full: true,
            placeholder: "Opcional: sube un PDF o pega un enlace (https://…)", help: "Aparece como botón al final de la noticia." },
          { k: "id", label: "Página de la noticia", type: "custom", full: true, render: (obj) => enlacePagina(obj) },
        ],
      }),
    },
    documentos: {
      titulo: "Documentos institucionales",
      ayuda: "RICE, PEI, reglamentos, protocolos y otros documentos que se descargan desde el sitio.",
      render: () => editorLista({
        items: state.data.documentos,
        textoAgregar: "Agregar documento",
        vacio: "Aún no hay documentos.",
        nuevo: () => ({ nombre: "", sigla: "PDF", url: "" }),
        resumen: (it) => [it.nombre, it.url],
        miniatura: (it, el) => { el.textContent = (it.sigla || "PDF").slice(0, 4); },
        campos: [
          { k: "nombre", label: "Nombre del documento", placeholder: "Ej.: Reglamento Interno de Convivencia Escolar (RICE)", full: true },
          { k: "sigla", label: "Etiqueta corta", max: 6, help: "Ej.: RICE, PEI, PDF" },
          { k: "url", label: "Archivo", type: "file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx", folder: "documentos",
            placeholder: "Sube el archivo o pega un enlace" },
        ],
      }),
    },
    redes: {
      titulo: "Redes sociales",
      ayuda: "Cuentas que aparecen en la sección de redes, en la barra superior y en el pie de página.",
      render: () => {
        const r = state.data.redes;
        const textos = h("div", { class: "panel" }, h("h2", {}, "Textos de la sección"),
          h("div", { class: "item__body", style: "border:0;padding:0" },
            campo({ k: "titulo", label: "Título", full: true }, r),
            campo({ k: "descripcion", label: "Descripción", type: "textarea", full: true }, r)));
        const opciones = Object.entries(window.REDES).map(([k, v]) => [k, v.nombre]);
        return h("div", {}, textos, editorLista({
          items: r.lista,
          textoAgregar: "Agregar cuenta",
          vacio: "Aún no hay cuentas.",
          nuevo: () => ({ red: "facebook", nombre: "", url: "" }),
          resumen: (it) => [it.nombre || (window.REDES[it.red] || {}).nombre, it.url],
          miniatura: (it, el) => { el.innerHTML = window.iconoRed(it.red); },
          campos: [
            { k: "red", label: "Red social", type: "select", options: opciones },
            { k: "nombre", label: "Nombre visible", placeholder: "Ej.: Centro de Padres" },
            { k: "url", label: "Enlace", type: "url", placeholder: "https://…", full: true },
          ],
        }));
      },
    },
    colores: {
      titulo: "Colores del sitio",
      ayuda: "Elige los colores institucionales. Los tonos intermedios se calculan automáticamente.",
      render: () => {
        const c = state.data.colores;
        const DEF = [
          ["primario", "Color principal", "Fondo de portada, títulos y pie de página."],
          ["secundario", "Color secundario", "Degradados y fondos de apoyo."],
          ["acento", "Color de acento", "Botones, detalles y destacados."],
        ];
        const preview = h("div", { class: "preview" });
        const pintarPreview = () => {
          preview.innerHTML = `
            <div class="preview__hero" style="background:linear-gradient(135deg, ${c.primario}, ${c.secundario})">
              <h3>Una escuela para <em style="color:${c.acento}">aprender</em>, crecer y convivir</h3>
              <p>Así se verá la portada del sitio con estos colores.</p>
              <span class="preview__btn" style="background:${c.acento};color:${c.primario}">Admisión 2027</span>
            </div>
            <div class="preview__body">
              <span class="preview__chip" style="background:${c.primario};color:${c.acento}">SM</span>
              <strong style="font-family:Fraunces,serif;color:${c.primario}">Equipo directivo</strong>
            </div>`;
        };
        const inputs = {};
        const colores = h("div", { class: "colors" }, DEF.map(([k, label, help]) => {
          const code = h("code", {}, c[k]);
          inputs[k] = h("input", { type: "color", value: c[k], "aria-label": label,
            oninput: (e) => { c[k] = e.target.value; code.textContent = e.target.value; setDirty(true); pintarPreview(); } });
          inputs[k].code = code;
          return h("label", { class: "color" }, inputs[k], h("span", {}, h("strong", {}, label), code, h("small", { style: "display:block;color:var(--muted);font-size:.78rem" }, help)));
        }));
        const PRESETS = [
          ["Institucional", "#0b1f3a", "#1c3a66", "#c9a24b"],
          ["Verde bosque", "#123524", "#2f6b4f", "#d4a72c"],
          ["Burdeo", "#3b0d18", "#7a1f35", "#e0b45c"],
          ["Azul cielo", "#0f2d52", "#2b6cb0", "#f2b134"],
          ["Grafito", "#1f2328", "#3d4752", "#e4572e"],
        ];
        const presets = h("div", { class: "presets" }, PRESETS.map(([n, p, s, a]) =>
          h("button", { class: "preset", type: "button", onclick: () => {
            Object.assign(c, { primario: p, secundario: s, acento: a });
            for (const k in inputs) { inputs[k].value = c[k]; inputs[k].code.textContent = c[k]; }
            setDirty(true); pintarPreview();
          } }, h("i", { style: `background:${p}` }), h("i", { style: `background:${s}` }), h("i", { style: `background:${a}` }), n)));
        pintarPreview();
        return h("div", {},
          h("div", { class: "panel" }, h("h2", {}, "Paleta"), colores, h("p", { style: "margin:1.2rem 0 0;font-size:.85rem;color:var(--muted)" }, "Combinaciones sugeridas:"), presets),
          h("div", { class: "panel" }, h("h2", {}, "Vista previa"), preview));
      },
    },
  };

  /* ---------- Pilares del proyecto educativo ---------- */
  VISTAS.pilares = {
    titulo: "Pilares",
    ayuda: "Las tarjetas «Lo que nos distingue» de la portada y de «Nuestro colegio». Cada una puede llevar una imagen: un ícono o una foto.",
    render: () => editorLista({
      items: state.data.pilares,
      textoAgregar: "Agregar pilar",
      vacio: "Aún no hay pilares.",
      nuevo: () => ({ titulo: "", texto: "", imagen: "", formato: "icono" }),
      resumen: (it) => [it.titulo, it.imagen ? (it.formato === "foto" ? "Con foto" : "Con ícono") : "Sin imagen"],
      miniatura: fotoOIniciales("imagen", (it) => (it.titulo || "?").slice(0, 2).toUpperCase()),
      campos: [
        { k: "titulo", label: "Título", full: true },
        { k: "texto", label: "Texto", type: "textarea", full: true },
        { k: "imagen", label: "Imagen", type: "file", accept: "image/*", folder: "img/pilares", ajustar: 900, full: true,
          placeholder: "Opcional: sube un ícono o una foto", help: "Se ajusta sola a un tamaño estándar. Para íconos usa PNG con fondo transparente." },
        { k: "formato", label: "Mostrar la imagen como", type: "select", options: [["icono", "Ícono pequeño arriba del título"], ["foto", "Foto a lo ancho de la tarjeta"]] },
      ],
    }),
  };

  /* ---------- CGPA y CEAL ---------- */
  VISTAS.organizaciones = {
    titulo: "CGPA y CEAL",
    ayuda: "Centro de Padres y Centro de Estudiantes, en la página /cgpa-ceal/. Sus integrantes se agregan en «Docentes y personal» con «Aparece en: CGPA y CEAL» y el área de su centro.",
    render: () => editorLista({
      items: state.data.organizaciones,
      textoAgregar: "Agregar organización",
      vacio: "Aún no hay organizaciones.",
      nuevo: () => ({ sigla: "", nombre: "", area: "", descripcion: "", correo: "", instagram: "" }),
      resumen: (it) => [it.nombre, [it.sigla, it.instagram ? "Instagram listo" : "Sin Instagram", `${state.data.personal.filter((p) => it.area && p.area === it.area).length} integrantes`].filter(Boolean).join(" · ")],
      miniatura: (it, el) => { el.textContent = (it.sigla || it.nombre || "?").slice(0, 4); },
      campos: [
        { k: "nombre", label: "Nombre", placeholder: "Ej.: Centro de Estudiantes" },
        { k: "sigla", label: "Sigla", max: 8, placeholder: "Ej.: CEAL" },
        { k: "descripcion", label: "Descripción", type: "textarea", full: true },
        { k: "instagram", label: "Instagram", type: "url", placeholder: "https://www.instagram.com/usuario", help: "Pega el enlace completo de su perfil. Si lo dejas vacío se muestra «Muy pronto»." },
        { k: "correo", label: "Correo", type: "email", help: "Opcional." },
        { k: "area", label: "Área de sus integrantes", full: true, help: "Debe coincidir con el «Área o equipo» de sus integrantes en «Docentes y personal».",
          placeholder: "Ej.: Centro de Estudiantes (CEAL)" },
      ],
    }),
  };

  /* ==========================================================
     Usuarios y permisos (solo el dueño)
     ========================================================== */
  const ESTADOS = { publicado: ["Publicado", "ok"], pendiente: ["Esperando tu aprobación", "warn"], rechazado: ["Rechazado", "bad"] };

  VISTAS.usuarios = {
    titulo: "Usuarios y permisos",
    ayuda: "Funcionarios que pueden entrar al panel y qué pueden cambiar. Cada uno entra con su propia cuenta de GitHub y sus cambios se revisan solos según su rol.",
    render: () => {
      const roles = h("div", { class: "roles" }, Object.entries(ROLES).map(([k, r]) =>
        h("div", { class: "roles__item" }, h("strong", {}, r.nombre), h("p", {}, r.desc))));

      const lista = editorLista({
        items: state.roles.usuarios,
        textoAgregar: "Agregar funcionario",
        vacio: "Aún no hay funcionarios con acceso. Quienes tienen permiso de escritura en el repositorio siempre tienen acceso total.",
        nuevo: () => ({ nombre: "", github: "", rol: "utp" }),
        resumen: (it) => [it.nombre || (it.github ? "@" + it.github : "(sin nombre)"), [it.github ? "@" + it.github : "", (ROLES[it.rol] || {}).nombre].filter(Boolean).join(" · ")],
        miniatura: (it, el) => { el.textContent = (it.nombre || it.github || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); },
        campos: [
          { k: "nombre", label: "Nombre", placeholder: "Ej.: Ana Rojas (UTP)" },
          { k: "github", label: "Usuario de GitHub", placeholder: "Ej.: anarojas", help: "El nombre de su cuenta, sin @." },
          { k: "rol", label: "Rol", type: "select", full: true, options: Object.entries(ROLES).map(([k, r]) => [k, r.nombre]) },
        ],
      });

      const pasos = h("ol", { class: "steps-list" },
        h("li", {}, "El funcionario crea una cuenta gratis en ", h("a", { href: "https://github.com/signup", target: "_blank", rel: "noopener" }, "github.com"), " y te dice su nombre de usuario."),
        h("li", {}, "Lo agregas aquí con su rol y presionas «Guardar y publicar»."),
        h("li", {}, "Él crea su token de acceso en ", h("a", { href: "https://github.com/settings/tokens/new?scopes=public_repo&description=Panel%20Colegio%20San%20Mart%C3%ADn", target: "_blank", rel: "noopener" }, "este enlace"),
          " (ya viene con el permiso correcto, «public_repo»; solo debe elegir una fecha de vencimiento y presionar «Generate token»)."),
        h("li", {}, "Entra a esta misma dirección del panel y pega su token."));

      const actividad = h("div", { class: "act" }, h("p", { class: "empty" }, "Cargando…"));
      gh("/pulls?state=all&per_page=40").then((prs) => {
        const filas = prs.filter((p) => p.head.ref.startsWith("panel-")).slice(0, 15).map((p) => {
          const lab = p.labels.map((l) => l.name).find((n) => ESTADOS[n]);
          const [txt, cls] = lab ? ESTADOS[lab] : p.state === "open" ? ["En revisión", ""] : p.merged_at ? ESTADOS.publicado : ["Cerrado", ""];
          return h("a", { class: "act__row", href: p.html_url, target: "_blank", rel: "noopener" },
            h("span", { class: "act__date" }, new Date(p.created_at).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })),
            h("span", { class: "act__title" }, p.title),
            h("span", { class: "act__state" + (cls ? " is-" + cls : "") }, txt));
        });
        actividad.replaceChildren(...(filas.length ? filas : [h("p", { class: "empty" }, "Todavía no hay cambios enviados por funcionarios.")]));
      }).catch(() => actividad.replaceChildren(h("p", { class: "empty" }, "No se pudo cargar la actividad.")));

      return h("div", {},
        h("div", { class: "panel" }, h("h2", {}, "Roles"), roles),
        h("h2", { class: "sec-title" }, "Funcionarios con acceso"), lista,
        h("div", { class: "panel", style: "margin-top:1.5rem" }, h("h2", {}, "Cómo dar acceso a un funcionario"), pasos),
        h("div", { class: "panel" }, h("h2", {}, "Actividad reciente"),
          h("p", { class: "panel__help" }, "Cambios enviados por funcionarios. GitHub también te avisa por correo cuando un administrador trabajador publica algo o cuando un cambio espera tu aprobación."),
          actividad));
    },
  };

  /* ==========================================================
     Logo del colegio: se ajusta solo a un tamaño estándar antes de subirlo
     ========================================================== */
  const LOGO_ALTO = 256;   // alto máximo de la imagen guardada (se muestra a 52 px, nítida en pantallas de alta densidad)
  const LOGO_ANCHO = 640;  // ancho máximo, para logos horizontales
  // Favicon: rutas fijas, enlazadas en el <head> de todas las páginas
  const FAVICONS = [
    { ruta: "img/logo/favicon-32.png", lado: 32 },
    { ruta: "img/logo/favicon-192.png", lado: 192 },
    { ruta: "img/logo/apple-touch-icon.png", lado: 180, fondo: "#ffffff" }, // iOS no admite transparencia
  ];

  const cargarImagen = (file) => new Promise((ok, fail) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(u); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(u); fail(new Error("No se pudo leer la imagen. Usa PNG, JPG, WEBP o SVG.")); };
    img.src = u;
  });
  const lienzo = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  // Recorta los bordes transparentes, para que todos los logos ocupen el mismo espacio
  function recortar(c) {
    const { data, width: w, height: h } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return c;
    const out = lienzo(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  // Reduce a la mitad varias veces y luego al tamaño final: queda más nítido que un solo salto
  function escalar(c, w, h) {
    let src = c;
    while (src.width / 2 >= w && src.height / 2 >= h) {
      const mitad = lienzo(Math.round(src.width / 2), Math.round(src.height / 2));
      const g = mitad.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, mitad.width, mitad.height);
      src = mitad;
    }
    const out = lienzo(w, h);
    const g = out.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, w, h);
    return out;
  }

  async function procesarLogo(file) {
    const img = await cargarImagen(file);
    const w0 = img.naturalWidth || 1024, h0 = img.naturalHeight || 1024;
    const base = lienzo(w0, h0);
    base.getContext("2d").drawImage(img, 0, 0, w0, h0);
    const rec = recortar(base);
    const k = Math.min(1, LOGO_ALTO / rec.height, LOGO_ANCHO / rec.width);
    const grande = escalar(rec, Math.max(1, Math.round(rec.width * k)), Math.max(1, Math.round(rec.height * k)));
    // Ícono cuadrado, centrado y con un pequeño margen
    const lado = Math.max(rec.width, rec.height);
    const cuadrado = lienzo(Math.round(lado * 1.08), Math.round(lado * 1.08));
    cuadrado.getContext("2d").drawImage(rec, (cuadrado.width - rec.width) / 2, (cuadrado.height - rec.height) / 2);
    const blob = (c) => new Promise((ok) => c.toBlob(ok, "image/png"));
    const iconos = [];
    for (const f of FAVICONS) {
      let c = escalar(cuadrado, f.lado, f.lado);
      if (f.fondo) {
        const con = lienzo(f.lado, f.lado), g = con.getContext("2d");
        g.fillStyle = f.fondo; g.fillRect(0, 0, f.lado, f.lado);
        const m = Math.round(f.lado * 0.1);
        g.drawImage(escalar(cuadrado, f.lado - 2 * m, f.lado - 2 * m), m, m);
        c = con;
      }
      iconos.push({ ruta: f.ruta, blob: await blob(c), dataUrl: c.toDataURL("image/png") });
    }
    return { grande: await blob(grande), iconos, ancho: grande.width, alto: grande.height, original: [w0, h0] };
  }

  // Sube (o reemplaza) un archivo en una ruta fija
  async function subirFijo(ruta, blob, dataUrl) {
    const b64 = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result.split(",")[1]); r.onerror = fail; r.readAsDataURL(blob); });
    await escribir(ruta, b64, "Actualizar favicon desde el panel");
    previews[ruta] = dataUrl;
  }
  async function borrarFavicons() {
    for (const f of FAVICONS) await escribir(f.ruta, null, "Quitar favicon desde el panel", { borrar: true });
  }

  // Reduce una imagen a un tamaño estándar (sin agrandarla) antes de subirla. PNG/WEBP conservan la transparencia.
  async function ajustarImagen(file, max) {
    const img = await cargarImagen(file);
    const k = Math.min(1, max / img.naturalWidth, max / img.naturalHeight);
    // Siempre se vuelve a dibujar: así la imagen pierde sus datos ocultos (ubicación GPS, teléfono, autor)
    if (/gif/.test(file.type)) return file;
    const base = lienzo(img.naturalWidth, img.naturalHeight);
    base.getContext("2d").drawImage(img, 0, 0);
    const c = escalar(base, Math.max(1, Math.round(img.naturalWidth * k)), Math.max(1, Math.round(img.naturalHeight * k)));
    const png = /png|webp|gif/.test(file.type);
    const blob = await new Promise((ok) => c.toBlob(ok, png ? "image/png" : "image/jpeg", 0.86));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + (png ? ".png" : ".jpg"), { type: blob.type });
  }

  VISTAS.logo = {
    titulo: "Logo y lema",
    ayuda: "Sube el logo o insignia del colegio. Se ajusta solo: se recortan los bordes vacíos y se reduce a un tamaño estándar, aunque la imagen original sea muy grande.",
    render: () => {
      const d = state.data;
      const actual = d.logo && d.logo.imagen ? d.logo : null;
      const info = h("p", { class: "logo__info" });
      const pintarInfo = () => {
        info.textContent = actual
          ? `Imagen guardada de ${actual.ancho} × ${actual.alto} px${actual.original ? ` (la original era de ${actual.original[0]} × ${actual.original[1]} px)` : ""}. Se muestra a 52 px de alto en la cabecera.`
          : "Ahora se muestra el escudo provisional «SM».";
      };
      pintarInfo();
      const marca = (claro) => actual
        ? h("img", { src: resolver(actual.imagen), alt: "Logo" })
        : h("span", { class: "logo__sm", html: '<svg viewBox="0 0 48 56"><path d="M24 2 4 9v17c0 14 9 23 20 28 11-5 20-14 20-28V9L24 2z" fill="currentColor"/><text x="24" y="33" text-anchor="middle" font-family="Fraunces, serif" font-size="15" font-weight="700" fill="#c9a24b">SM</text></svg>' });
      const c = d.colores || {};
      const vista = h("div", { class: "logo__preview" },
        h("div", { class: "logo__bar" }, h("span", { class: "logo__mark" }, marca(true)), h("span", { class: "logo__name", style: `color:${c.primario || "#0b1f3a"}` }, h("strong", {}, "Colegio San Martín"), h("small", {}, "Iquique"))),
        h("div", { class: "logo__bar logo__bar--pie", style: `background:${c.primario || "#0b1f3a"}` }, h("span", { class: "logo__mark logo__mark--pie" }, marca(false)), h("span", { class: "logo__name" }, h("strong", {}, "Colegio San Martín"), h("small", {}, "Pie de página"))),
        actual && actual.icono ? h("div", { class: "logo__icons" },
          h("div", { class: "logo__tab" }, h("img", { src: resolver(actual.icono), alt: "" }), h("span", {}, "Colegio San Martín Iquique"), h("small", {}, "Pestaña del navegador")),
          actual.apple ? h("div", { class: "logo__app" }, h("img", { src: resolver(actual.apple), alt: "" }), h("small", {}, "Acceso directo en el celular")) : null) : null);

      const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", class: "sr-only", onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        toast("Ajustando y subiendo " + f.name + "…");
        try {
          const r = await procesarLogo(f);
          const nombre = slug(f.name.replace(/\.[^.]+$/, ""));
          const imagen = await subirArchivo(new File([r.grande], nombre + ".png", { type: "image/png" }), "img/logo");
          for (const ic of r.iconos) await subirFijo(ic.ruta, ic.blob, ic.dataUrl);
          d.logo = { imagen, icono: FAVICONS[0].ruta, apple: FAVICONS[2].ruta, version: Date.now().toString(36), ancho: r.ancho, alto: r.alto, original: r.original };
          setDirty(true); render();
          toast(`Logo ajustado de ${r.original[0]} × ${r.original[1]} a ${r.ancho} × ${r.alto} px. Presiona «${textoGuardar()}».`, "ok");
        } catch (err) {
          toast("No se pudo subir el logo: " + err.message, "error");
        } finally { e.target.value = ""; }
      } });

      return h("div", {},
        h("div", { class: "panel" }, h("h2", {}, "Imagen"),
          h("p", { class: "panel__help" }, "Ideal: PNG con fondo transparente. Se guarda con un máximo de 256 px de alto y con la misma imagen se crea el favicon: el ícono de la pestaña (32 px), el de Android (192 px) y el de iPhone (180 px, con fondo blanco)."),
          h("div", { class: "imp__btns" },
            h("label", { class: "btn btn--primary btn--sm" }, actual ? "Cambiar logo…" : "Subir logo…", input),
            actual ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => {
              if (!confirm("¿Quitar el logo y el favicon y volver al escudo provisional?")) return;
              borrarFavicons().catch((err) => toast("No se pudo borrar el favicon: " + err.message, "error"));
              delete d.logo; setDirty(true); render();
            } }, "Quitar logo") : null),
          info),
        h("div", { class: "panel" }, h("h2", {}, "Vista previa"), vista),
        h("div", { class: "panel" }, h("h2", {}, "Lema"),
          h("p", { class: "panel__help" }, "Frase breve que aparece junto a la cita de la portada, en «Nuestro colegio» y en el pie de página."),
          campo({ k: "lema", label: "Lema del colegio", full: true, placeholder: "Ej.: Aprender, crecer y convivir con sentido." }, d)));
    },
  };

  /* ==========================================================
     Horarios: importación desde Excel, colores y edición
     ========================================================== */
  const H = window.HORARIOS;
  const DIAS_N = H.DIAS.map(H.norm);
  const ultimoImport = {};

  // Antes de publicar: los bloques administrativos de un docente nunca llegan al sitio
  function prepararHorarios() {
    const hs = state.data.horarios;
    hs.docentes.forEach((d) => d.filas.forEach((f) => { f.celdas = f.celdas.map((c) => (H.esAdministrativo(c) ? "" : c)); }));
    const usadas = new Set(H.asignaturas(hs.cursos.concat(hs.docentes)).concat(hs.asignaturas).map(H.norm));
    for (const k in hs.colores) if (!usadas.has(H.norm(k))) delete hs.colores[k];
  }

  // El lector de Excel (SheetJS) solo se descarga cuando se usa
  let xlsxListo = null;
  const cargarXLSX = () => xlsxListo || (xlsxListo = new Promise((ok, fail) => {
    if (window.XLSX) return ok(window.XLSX);
    const sc = document.createElement("script");
    sc.src = "vendor/xlsx/xlsx.core.min.js";
    sc.onload = () => ok(window.XLSX);
    sc.onerror = () => { xlsxListo = null; fail(new Error("No se pudo cargar el lector de Excel.")); };
    document.head.append(sc);
  }));

  // Las celdas combinadas (un bloque doble, un recreo de lado a lado) se repiten en cada celda
  function rellenarCombinadas(ws, XLSX) {
    (ws["!merges"] || []).forEach((m) => {
      const origen = ws[XLSX.utils.encode_cell(m.s)];
      if (!origen) return;
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
        if (r !== m.s.r || c !== m.s.c) ws[XLSX.utils.encode_cell({ r, c })] = { ...origen };
      }
    });
  }

  // Una hoja = un horario. Busca la fila con los días; las columnas anteriores a «Lunes» forman la hora.
  function leerHoja(nombreHoja, ws, XLSX) {
    rellenarCombinadas(ws, XLSX);
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
    const iHead = filas.findIndex((r) => r.some((c) => H.norm(c) === "lunes"));
    if (iHead < 0) return null;
    const head = filas[iHead].map(H.norm);
    const cols = DIAS_N.map((d) => head.findIndex((x) => x === d || x === d.slice(0, 3)));
    const primeraDia = Math.min(...cols.filter((c) => c >= 0));
    const titulo = filas.slice(0, iHead).flat().map((c) => String(c).trim()).find(Boolean);
    const nombre = (titulo || nombreHoja).replace(/^(curso|docente|profesora?|nombre)\s*:\s*/i, "").trim();
    const out = filas.slice(iHead + 1).map((r) => ({
      hora: r.slice(0, primeraDia).map((c) => String(c).trim()).filter(Boolean).join(" – "),
      celdas: cols.map((c) => (c >= 0 ? String(r[c] || "").trim() : "")),
    })).filter((f) => f.hora || f.celdas.some(Boolean));
    return out.length ? { nombre, filas: out } : null;
  }

  // Todas las asignaturas: las agregadas a mano y las que aparecen en algún horario
  const todasAsignaturas = () => {
    const hs = state.data.horarios, vistas = new Map();
    hs.asignaturas.concat(H.asignaturas(hs.cursos.concat(hs.docentes))).forEach((a) => { if (a && !vistas.has(H.norm(a))) vistas.set(H.norm(a), a); });
    return [...vistas.values()];
  };

  // Da un color de la paleta a cada asignatura que aún no tiene uno
  function asignarColores() {
    const c = state.data.horarios.colores;
    const usados = new Set(Object.values(c));
    todasAsignaturas().forEach((a) => {
      if (Object.keys(c).some((k) => H.norm(k) === H.norm(a))) return;
      const libre = H.PALETA.find((x) => !usados.has(x)) || H.color(a, {});
      c[a] = libre; usados.add(libre);
    });
  }

  async function importarExcel(file, tipo) {
    const XLSX = await cargarXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const leidos = wb.SheetNames.map((n) => leerHoja(n, wb.Sheets[n], XLSX)).filter(Boolean);
    if (!leidos.length) throw new Error("No encontré ninguna hoja con la fila de días (Lunes, Martes…). Usa la plantilla.");
    let omitidos = 0;
    if (tipo === "docentes") leidos.forEach((x) => x.filas.forEach((f) => {
      f.celdas = f.celdas.map((c) => (H.esAdministrativo(c) ? (omitidos++, "") : c));
    }));
    const lista = state.data.horarios[tipo];
    let nuevos = 0;
    leidos.forEach((x) => {
      const i = lista.findIndex((y) => H.norm(y.nombre) === H.norm(x.nombre));
      if (i >= 0) lista[i] = x; else { lista.push(x); nuevos++; }
    });
    asignarColores();
    setDirty(true);
    return { nombres: leidos.map((x) => x.nombre), nuevos, actualizados: leidos.length - nuevos, omitidos };
  }

  const BLOQUES = [["08:00 - 08:45"], ["08:45 - 09:30"], ["09:30 - 09:45", "Recreo"], ["09:45 - 10:30"], ["10:30 - 11:15"],
    ["11:15 - 11:30", "Recreo"], ["11:30 - 12:15"], ["12:15 - 13:00"], ["13:00 - 13:45", "Almuerzo"], ["13:45 - 14:30"], ["14:30 - 15:15"]];
  const EJEMPLOS = {
    cursos: [
      ["1° básico A", [
        ["Lenguaje y Comunicación", "Matemática", "Lenguaje y Comunicación", "Matemática", "Lenguaje y Comunicación"],
        ["Lenguaje y Comunicación", "Matemática", "Lenguaje y Comunicación", "Matemática", "Lenguaje y Comunicación"],
        ["Matemática", "Ciencias Naturales", "Inglés", "Historia y Geografía", "Educación Física"],
        ["Matemática", "Ciencias Naturales", "Inglés", "Historia y Geografía", "Educación Física"],
        ["Artes Visuales", "Música", "Educación Física", "Religión", "Orientación"],
        ["Artes Visuales", "Música", "Educación Física", "Tecnología", "Orientación"],
        ["Historia y Geografía", "Lenguaje y Comunicación", "Ciencias Naturales", "Lenguaje y Comunicación", ""],
        ["Taller de lectura", "Lenguaje y Comunicación", "Matemática", "Taller de lectura", ""],
      ]],
      ["3° medio A", [
        ["Lengua y Literatura", "Matemática", "Biología / Economía y sociedad", "Inglés", "Filosofía"],
        ["Lengua y Literatura", "Matemática", "Biología / Economía y sociedad", "Inglés", "Filosofía"],
        ["Educación Ciudadana", "Ciencias para la Ciudadanía", "Matemática", "Física / Comprensión histórica del presente", "Lengua y Literatura"],
        ["Educación Ciudadana", "Ciencias para la Ciudadanía", "Matemática", "Física / Comprensión histórica del presente", "Lengua y Literatura"],
        ["Científico: Química · Laboratorio | Humanista: Participación y argumentación · Sala 8", "Educación Física · Gimnasio", "Inglés", "Matemática", "Orientación"],
        ["Científico: Química · Laboratorio | Humanista: Participación y argumentación · Sala 8", "Educación Física · Gimnasio", "Inglés", "Matemática", "Religión"],
        ["Matemática", "Lengua y Literatura", "Artes Visuales", "Lengua y Literatura", ""],
        ["Matemática", "Lengua y Literatura", "Artes Visuales", "Lengua y Literatura", ""],
      ]],
      ["7° básico A", [
        ["Matemática · Sala 12", "Lengua y Literatura · Sala 12", "Ciencias Naturales · Laboratorio", "Matemática · Sala 12", "Inglés · Sala 12"],
        ["Matemática · Sala 12", "Lengua y Literatura · Sala 12", "Ciencias Naturales · Laboratorio", "Matemática · Sala 12", "Inglés · Sala 12"],
        ["Historia y Geografía", "Educación Física · Gimnasio", "Lengua y Literatura", "Tecnología · Sala de computación", "Música"],
        ["Historia y Geografía", "Educación Física · Gimnasio", "Lengua y Literatura", "Tecnología · Sala de computación", "Música"],
        ["Inglés", "Matemática", "Historia y Geografía", "Artes Visuales", "Orientación"],
        ["Inglés", "Matemática", "Historia y Geografía", "Artes Visuales", "Religión"],
        ["Lengua y Literatura", "Ciencias Naturales", "Educación Física · Gimnasio", "Lengua y Literatura", ""],
        ["Lengua y Literatura", "Ciencias Naturales", "Educación Física · Gimnasio", "Lengua y Literatura", ""],
      ]],
    ],
  };
  const INSTRUCCIONES = (tipo) => [
    [`Plantilla de horarios de ${tipo === "cursos" ? "cursos" : "docentes"} · Colegio San Martín Iquique`],
    [],
    ["1. Cada hoja es un horario. Escribe el nombre del " + (tipo === "cursos" ? "curso (ej.: 1° básico A)" : "docente, tal como aparece en el sitio") + " en la celda A1. Si la dejas vacía se usa el nombre de la hoja."],
    ["2. La fila de títulos debe decir: Hora, Lunes, Martes, Miércoles, Jueves, Viernes. También puedes usar dos columnas, Inicio y Fin, en lugar de Hora."],
    ["3. En cada celda escribe la asignatura. Para agregar sala o curso usa « · » o un salto de línea. Ejemplo: Matemática · Sala 12."],
    ["4. Recreos y almuerzo: escribe «Recreo» o «Almuerzo» en la columna Hora o en todas las celdas de esa fila."],
    ["5. Bloques dobles: repite la asignatura en filas seguidas o combina las celdas; en el sitio se unen solos."],
    ...(tipo === "cursos" ? [
      ["Electivos (un mismo bloque dividido entre planes): separa las asignaturas con « / ». La primera es del plan Científico y la segunda del Humanista. Ejemplo: Biología / Economía y sociedad."],
      ["   Para poner otros nombres de plan o salas, usa « | »: Científico: Química · Laboratorio | Humanista: Participación y argumentación · Sala 8."],
    ] : []),
    [],
    ["Puedes agregar todas las hojas que necesites. Esta hoja de instrucciones se ignora al importar."],
  ];

  function hojaHorario(XLSX, nombre, filas) {
    const ws = XLSX.utils.aoa_to_sheet([[nombre], [], ["Hora"].concat(H.DIAS)].concat(filas.map((f) => [f.hora].concat(f.celdas))));
    ws["!cols"] = [{ wch: 16 }].concat(H.DIAS.map(() => ({ wch: 26 })));
    return ws;
  }
  const nombreHoja = (n, usados) => {
    let base = (n || "Horario").replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Horario", x = base, i = 2;
    while (usados.has(x.toLowerCase())) x = `${base} ${i++}`;
    usados.add(x.toLowerCase());
    return x;
  };

  async function descargarExcel(tipo, actuales) {
    try {
      const XLSX = await cargarXLSX();
      const wb = XLSX.utils.book_new();
      const usados = new Set(["instrucciones"]);
      const ins = XLSX.utils.aoa_to_sheet(INSTRUCCIONES(tipo));
      ins["!cols"] = [{ wch: 120 }];
      XLSX.utils.book_append_sheet(wb, ins, "Instrucciones");
      const lista = actuales ? state.data.horarios[tipo]
        : EJEMPLOS[tipo].map(([nombre, celdas]) => {
          let k = 0;
          return { nombre, filas: BLOQUES.map(([hora, pausa]) => ({ hora, celdas: pausa ? H.DIAS.map(() => pausa) : celdas[k++] })) };
        });
      lista.forEach((x) => XLSX.utils.book_append_sheet(wb, hojaHorario(XLSX, x.nombre, x.filas), nombreHoja(x.nombre, usados)));
      XLSX.writeFile(wb, actuales ? `horarios-${tipo}.xlsx` : `plantilla-horarios-${tipo}.xlsx`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // Tabla editable de un horario; cada celda toma el color de su asignatura
  function editorGrilla(hor, avisar, esDocente) {
    const cont = h("div", { class: "grid-ed" });
    hor.filas = hor.filas || [];
    // Sugerencias al escribir: todas las asignaturas conocidas
    const listaId = "asig-" + Math.random().toString(36).slice(2, 8);
    let enfocada = null;
    // Convierte la celda elegida en un electivo dividido entre Científico y Humanista
    const hacerElectivo = () => {
      if (!enfocada) return toast("Primero toca la celda del bloque que quieres dividir.", "error");
      const { inp, f, d } = enfocada;
      const v = inp.value.trim();
      if (H.electivos(v)) { inp.focus(); return toast("Esa celda ya es un electivo. Escribe cada asignatura después de «Científico:» y «Humanista:».", "ok"); }
      inp.value = f.celdas[d] = `${H.GRUPOS[0]}: ${v || "Asignatura"} | ${H.GRUPOS[1]}: `;
      tintar(inp); avisar(); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    };
    const tintar = (inp) => {
      const v = inp.value.trim();
      const e = v && H.electivos(v);
      const bg = !v ? "" : esDocente && H.esAdministrativo(v) ? "#ececec" : H.pausa({ celdas: [v] }) ? "#f3efe4" : H.color(H.asignatura(v), state.data.horarios.colores);
      if (e) {
        // Un electivo se ve con los colores de cada plan, lado a lado
        const cs = e.map((x) => H.color(x.asignatura, state.data.horarios.colores));
        inp.style.background = `linear-gradient(90deg, ${cs.map((c, i) => `${c} ${(i * 100) / cs.length}% ${((i + 1) * 100) / cs.length}%`).join(", ")})`;
      } else inp.style.background = bg;
      inp.style.color = bg ? H.tinta(bg) : "";
      inp.title = e ? e.map((x) => `${x.grupo}: ${x.asignatura}${x.detalle ? " · " + x.detalle : ""}`).join("\n") : "";
      inp.classList.toggle("is-oculto", esDocente && H.esAdministrativo(v));
    };
    const pintar = () => {
      const filas = hor.filas.map((f, r) => {
        f.celdas = H.DIAS.map((_, d) => (f.celdas || [])[d] || "");
        return h("tr", {},
          h("td", {}, h("input", { value: f.hora || "", placeholder: "08:00 - 08:45", "aria-label": "Hora", oninput: (e) => { f.hora = e.target.value; avisar(); } })),
          H.DIAS.map((dia, d) => {
            const inp = h("input", { value: f.celdas[d], "aria-label": dia, list: listaId, onfocus: () => { enfocada = { inp, f, d }; },
              oninput: (e) => { f.celdas[d] = e.target.value; tintar(inp); avisar(); } });
            tintar(inp);
            return h("td", {}, inp);
          }),
          h("td", {}, h("button", { type: "button", class: "icon-btn icon-btn--danger", title: "Quitar bloque", "aria-label": "Quitar bloque",
            onclick: () => { hor.filas.splice(r, 1); avisar(); pintar(); } }, "✕")));
      });
      cont.replaceChildren(
        h("datalist", { id: listaId }, todasAsignaturas().map((a) => h("option", { value: a }))),
        h("div", { class: "grid-ed__scroll" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, "Hora"), H.DIAS.map((d) => h("th", {}, d)), h("th", {}))),
          h("tbody", {}, filas))),
        h("div", { class: "grid-ed__foot" },
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => { hor.filas.push({ hora: "", celdas: H.DIAS.map(() => "") }); avisar(); pintar(); } }, "+ Agregar bloque"),
          esDocente ? null : h("button", { type: "button", class: "btn btn--ghost btn--sm", onmousedown: (e) => e.preventDefault(), onclick: hacerElectivo,
            title: "Divide la celda seleccionada entre Científico y Humanista" }, "Dividir en electivo"),
          h("small", {}, esDocente
            ? "Escribe «Recreo» o «Almuerzo» en toda la fila para una pausa. Los bloques «Administrativo» o «Planificación» se ven en gris y no se publican."
            : "Escribe «Recreo» o «Almuerzo» en toda la fila para una pausa. Usa « · » para agregar la sala: Matemática · Sala 12. Electivo: separa con « / », por ejemplo Biología / Economía y sociedad (la primera es Científico y la segunda Humanista).")));
    };
    pintar();
    return cont;
  }

  VISTAS.horarios = {
    titulo: "Horarios",
    ayuda: "Horarios de clases de cada curso. Impórtalos desde Excel o edítalos aquí. El color de cada celda depende de la asignatura.",
    render: () => {
      const hs = state.data.horarios;

      const importador = (tipo, titulo, texto) => {
        const r = ultimoImport[tipo];
        const input = h("input", { type: "file", accept: ".xlsx,.xls,.ods,.csv", class: "sr-only", onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          toast("Leyendo " + f.name + "…");
          try {
            ultimoImport[tipo] = await importarExcel(f, tipo);
            toast(`Horarios importados. Revisa y presiona «${textoGuardar()}».`, "ok");
            render();
          } catch (err) {
            toast("No se pudo importar: " + err.message, "error");
          } finally { e.target.value = ""; }
        } });
        return h("div", { class: "imp" },
          h("h3", {}, titulo), h("p", {}, texto),
          h("div", { class: "imp__btns" },
            h("label", { class: "btn btn--primary btn--sm" }, "Importar Excel…", input),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => descargarExcel(tipo, false) }, "Descargar plantilla"),
            hs[tipo].length ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => descargarExcel(tipo, true) }, "Exportar actuales") : null),
          r ? h("p", { class: "imp__res" },
            `Importé ${r.nombres.length} ${r.nombres.length === 1 ? "horario" : "horarios"} (${r.nuevos} ${r.nuevos === 1 ? "nuevo" : "nuevos"}, ${r.actualizados} ${r.actualizados === 1 ? "reemplazado" : "reemplazados"}): ${r.nombres.join(", ")}.`,
            r.omitidos ? ` Omití ${r.omitidos} ${r.omitidos === 1 ? "bloque administrativo" : "bloques administrativos"}, que no se publican.` : "") : null);
      };

      const asigs = todasAsignaturas();
      const enUso = new Set(H.asignaturas(hs.cursos.concat(hs.docentes)).map(H.norm));
      const colores = asigs.length ? h("div", { class: "subj" }, asigs.map((a) => {
        const k = Object.keys(hs.colores).find((x) => H.norm(x) === H.norm(a)) || a;
        const bg = H.color(a, hs.colores);
        const muestra = h("span", { class: "subj__chip", style: `background:${bg};color:${H.tinta(bg)}` }, a);
        const inp = h("input", { type: "color", value: bg, "aria-label": "Color de " + a, oninput: (e) => {
          hs.colores[k] = e.target.value;
          muestra.style.background = e.target.value; muestra.style.color = H.tinta(e.target.value);
          setDirty(true);
        } });
        // Una asignatura agregada a mano que no está en ningún horario se puede quitar
        const quitar = enUso.has(H.norm(a)) ? null : h("button", { type: "button", class: "subj__x", title: "Quitar asignatura", "aria-label": "Quitar " + a,
          onclick: (e) => { e.preventDefault(); hs.asignaturas = hs.asignaturas.filter((x) => H.norm(x) !== H.norm(a)); delete hs.colores[k]; setDirty(true); render(); } }, "✕");
        return h("div", { class: "subj__item" }, h("label", { class: "subj__pick" }, inp, muestra), quitar);
      })) : h("p", { class: "empty" }, "Aún no hay asignaturas. Agrégalas aquí abajo o importa un horario.");
      // Agregar una asignatura nueva con su color
      const libre = H.PALETA.find((x) => !Object.values(hs.colores).includes(x)) || H.PALETA[0];
      const nuevaNombre = h("input", { type: "text", placeholder: "Ej.: Economía y sociedad", "aria-label": "Nombre de la asignatura", maxlength: 60 });
      const nuevaColor = h("input", { type: "color", value: libre, "aria-label": "Color de la asignatura" });
      const agregar = () => {
        const n = nuevaNombre.value.trim().replace(/\s+/g, " ");
        if (!n) return toast("Escribe el nombre de la asignatura.", "error");
        if (/[|/·:]/.test(n)) return toast("El nombre no puede llevar « / », « | », « · » ni « : ».", "error");
        if (asigs.some((x) => H.norm(x) === H.norm(n))) return toast("Esa asignatura ya existe.", "error");
        hs.asignaturas.push(n); hs.colores[n] = nuevaColor.value;
        setDirty(true); render();
        toast(`Agregué «${n}». Ya aparece como sugerencia al escribir en los horarios.`, "ok");
      };
      nuevaNombre.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } });
      const nueva = h("div", { class: "subj__nueva" }, nuevaColor, nuevaNombre,
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: agregar }, "+ Agregar asignatura"));

      const lista = (tipo) => editorLista({
        items: hs[tipo],
        textoAgregar: tipo === "cursos" ? "Agregar curso" : "Agregar docente",
        vacio: tipo === "cursos" ? "Aún no hay horarios de cursos." : "Aún no hay horarios de docentes.",
        nuevo: () => {
          const base = hs.cursos[0] || hs.docentes[0];
          const horas = base ? base.filas.map((f) => [f.hora, H.pausa(f)]) : BLOQUES;
          return { nombre: "", filas: horas.map(([hora, p]) => ({ hora, celdas: H.DIAS.map(() => p || "") })) };
        },
        resumen: (it) => [it.nombre, `${(it.filas || []).filter((f) => !H.pausa(f)).length} bloques`],
        miniatura: (it, el) => {
          const n = it.nombre || "?";
          el.textContent = tipo === "cursos" ? (n.match(/\d+°?/) || [n.slice(0, 2)])[0] + ((n.match(/\b[A-Z]$/) || [""])[0])
            : n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
        },
        campos: [
          { k: "nombre", label: tipo === "cursos" ? "Curso" : "Docente", full: true,
            placeholder: tipo === "cursos" ? "Ej.: 1° básico A" : "Nombre completo, igual que en «Docentes y personal»" },
          { k: "filas", label: "Horario", type: "custom", full: true, render: (obj, avisar) => editorGrilla(obj, avisar, tipo === "docentes") },
        ],
      });

      return h("div", {},
        h("div", { class: "panel" }, h("h2", {}, "Importar desde Excel"),
          h("div", { class: "imps" },
            importador("cursos", "Horarios de cursos", "Una hoja por curso. Si un curso ya existe, se reemplaza."))),
        h("div", { class: "panel" }, h("h2", {}, "Asignaturas y colores"),
          h("p", { class: "panel__help" }, "Cada asignatura tiene su color en todos los horarios. Toca el cuadro de color para cambiarlo. Agrega asignaturas nuevas (por ejemplo, electivos como Biología o Economía y sociedad) para tenerlas como sugerencia al escribir."),
          colores, nueva,
          asigs.length ? h("div", { class: "add-row" }, h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => {
            if (!confirm("¿Volver a asignar los colores automáticamente? Se perderán los colores que elegiste.")) return;
            state.data.horarios.colores = {}; asignarColores(); setDirty(true); render();
          } }, "Reasignar colores automáticamente")) : null),
        h("h2", { class: "sec-title" }, "Horarios de cursos"), lista("cursos"));
    },
  };

  /* ==========================================================
     Editor de página: HTML y CSS de cada página + Estilo visual
     ========================================================== */
  const SITIO = new URL("../", location.href).href;
  const PAGINAS = [
    { id: "inicio", ruta: "/index", nombre: "Inicio", archivo: "index.html", url: "" },
    { id: "colegio", ruta: "/colegio", nombre: "Nuestro colegio", archivo: "colegio/index.html", url: "colegio/" },
    { id: "directivos", ruta: "/directivos", nombre: "Equipo directivo", archivo: "directivos/index.html", url: "directivos/" },
    { id: "docentes", ruta: "/docentes", nombre: "Docentes", archivo: "docentes/index.html", url: "docentes/" },
    { id: "equipos", ruta: "/equipos", nombre: "Equipos y funcionarios", archivo: "equipos/index.html", url: "equipos/" },
    { id: "cgpa-ceal", ruta: "/cgpa-ceal", nombre: "CGPA y CEAL", archivo: "cgpa-ceal/index.html", url: "cgpa-ceal/" },
    { id: "departamentos", ruta: "/departamentos", nombre: "Departamentos", archivo: "departamentos/index.html", url: "departamentos/" },
    { id: "noticias", ruta: "/noticias", nombre: "Noticias", archivo: "noticias/index.html", url: "noticias/" },
    { id: "noticia", ruta: "/noticia", nombre: "Página de una noticia", archivo: "noticia/index.html", url: "noticia/" },
    { id: "horarios", ruta: "/horarios", nombre: "Horarios", archivo: "horarios/index.html", url: "horarios/" },
    { id: "admision", ruta: "/admision", nombre: "Admisión", archivo: "admision/index.html", url: "admision/" },
    { id: "documentos", ruta: "/documentos", nombre: "Documentos", archivo: "documentos/index.html", url: "documentos/" },
    { id: "contacto", ruta: "/contacto", nombre: "Contacto", archivo: "contacto/index.html", url: "contacto/" },
  ];
  const HOJAS = [{ id: "global", ruta: "Global", nombre: "Todas las páginas", archivo: "css/estilos.css", pagina: PAGINAS[0] }]
    .concat(PAGINAS.map((p) => ({ id: p.id, ruta: p.ruta, nombre: p.nombre, archivo: `css/paginas/${p.id}.css`, pagina: p })));

  // Zonas que el panel rellena con datos al cargar la página
  const ZONAS = {
    news: "Noticias", team: "Directivos", depts: "Departamentos", docs: "Documentos",
    socialGrid: "Redes sociales", pillars: "Pilares", staff: "Docentes o equipos", timetable: "Horarios", orgs: "CGPA y CEAL", heroNewsTitle: "Último comunicado de la portada", noticiaVer: "Texto de la noticia", contactForm: "Formulario de contacto",
  };

  const editor = { archivo: null, sha: null, original: "", dirty: false, api: null };
  const editorSucio = () => editor.dirty;
  window.addEventListener("beforeunload", (e) => { if (editor.dirty) { e.preventDefault(); e.returnValue = ""; } });

  async function leerArchivo(ruta, ref) {
    const f = await gh(`/contents/${ruta}?ref=${encodeURIComponent(ref || state.branch)}`);
    return { texto: b64ToUtf8(f.content), sha: f.sha };
  }

  function crearEditorCodigo(padre, modo, valor, onChange) {
    if (window.CodeMirror) {
      const cm = window.CodeMirror(padre, {
        value: valor, mode: modo === "html" ? "htmlmixed" : "css", lineNumbers: true, lineWrapping: true,
        tabSize: 2, indentUnit: 2, viewportMargin: 50,
      });
      cm.on("change", () => onChange(cm.getValue()));
      setTimeout(() => cm.refresh(), 0);
      return { get: () => cm.getValue(), set: (v) => cm.setValue(v) };
    }
    const ta = h("textarea", { class: "code-fallback", spellcheck: "false", oninput: () => onChange(ta.value) });
    ta.value = valor;
    padre.append(ta);
    return { get: () => ta.value, set: (v) => { ta.value = v; onChange(v); } };
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function vistaPrevia() {
    return h("iframe", { class: "preview-frame", title: "Vista previa", loading: "lazy" });
  }

  function pintarHTMLPrevia(frame, item, texto) {
    const base = `<base href="${SITIO + item.url}">`;
    frame.srcdoc = /<head[^>]*>/i.test(texto) ? texto.replace(/<head[^>]*>/i, (m) => m + base) : base + texto;
  }

  function pintarCSSPrevia(frame, hoja, texto) {
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.head) return;
      const link = [...doc.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href.endsWith(hoja.archivo));
      if (link) link.disabled = true;
      let st = doc.getElementById("__preview_css");
      if (!st) { st = doc.createElement("style"); st.id = "__preview_css"; (link || doc.head.lastChild).after(st); }
      st.textContent = texto;
    } catch (e) { /* la vista previa no está disponible */ }
  }

  function vistaEditorArchivos(tipo) {
    const lista = tipo === "html" ? PAGINAS : HOJAS;
    const wrap = h("div", { class: "editor" });
    const side = h("nav", { class: "editor__files", "aria-label": tipo === "html" ? "Páginas" : "Hojas de estilo" });
    const area = h("div", { class: "editor__area" }, h("p", { class: "empty" }, "Elige " + (tipo === "html" ? "una página" : "una hoja de estilo") + " para editarla."));
    lista.forEach((it) => side.append(h("button", {
      type: "button", "data-file": it.archivo, class: editor.archivo === it.archivo ? "is-active" : "",
      onclick: () => abrir(it),
    }, h("code", {}, it.ruta), h("small", {}, it.nombre))));
    wrap.append(side, area);

    async function abrir(it) {
      if (editor.dirty && !confirm("Tienes cambios sin guardar en " + editor.archivo + ". ¿Descartarlos?")) return;
      side.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.file === it.archivo));
      area.replaceChildren(h("p", { class: "empty" }, "Cargando " + it.archivo + "…"));
      let f;
      try { f = await leerArchivo(it.archivo); } catch (e) {
        if (e.status === 404 && tipo === "css") f = { texto: `/* Estilos propios de la página ${it.ruta} */\n`, sha: null };
        else { area.replaceChildren(h("p", { class: "empty" }, "No se pudo abrir el archivo: " + e.message)); return; }
      }
      Object.assign(editor, { archivo: it.archivo, sha: f.sha, original: f.texto, dirty: false });

      const estado = h("span", { class: "editor__state" }, "Sin cambios");
      const marcar = (texto) => {
        editor.dirty = texto !== editor.original;
        estado.textContent = editor.dirty ? "Cambios sin guardar" : "Sin cambios";
        estado.classList.toggle("is-dirty", editor.dirty);
        btnGuardar.disabled = !editor.dirty;
      };
      const frame = vistaPrevia();
      const refrescar = debounce((texto) => tipo === "html" ? pintarHTMLPrevia(frame, it, texto) : pintarCSSPrevia(frame, it, texto), 450);

      const btnGuardar = h("button", { class: "btn btn--primary btn--sm", disabled: true,
        onclick: async () => { btnGuardar.disabled = true; await guardarArchivo(it, tipo); marcar(editor.api.get()); } }, textoGuardar());
      const btnDeshacer = h("button", { class: "btn btn--ghost btn--sm", onclick: () => { if (confirm("¿Volver a la versión publicada?")) editor.api.set(editor.original); } }, "Descartar cambios");
      const historial = h("select", { class: "editor__history", "aria-label": "Versiones anteriores", onchange: async (e) => {
        const sha = e.target.value; e.target.value = "";
        if (!sha) return;
        try {
          const v = await leerArchivo(it.archivo, sha);
          editor.api.set(v.texto);
          toast(`Versión cargada en el editor. Revísala y presiona «${textoGuardar()}» para restaurarla.`);
        } catch (err) { toast("No se pudo cargar esa versión: " + err.message, "error"); }
      } }, h("option", { value: "" }, "Historial de versiones…"));
      gh(`/commits?path=${encodeURIComponent(it.archivo)}&sha=${encodeURIComponent(state.branch)}&per_page=15`).then((commits) => {
        commits.forEach((c) => historial.append(h("option", { value: c.sha },
          new Date(c.commit.author.date).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) + " · " + c.commit.message.split("\n")[0].slice(0, 50))));
      }).catch(() => {});

      const nota = tipo === "html" ? notaZonas(f.texto) : h("p", { class: "editor__note" },
        it.id === "global"
          ? "Esta hoja define el diseño de todo el sitio. Para cambios simples (botones, fondos, fuentes) es más seguro usar «Estilo visual»."
          : `Las reglas que escribas aquí solo afectan a la página ${it.ruta} y se aplican encima de la hoja global.`);

      const codigo = h("div", { class: "editor__code" });
      area.replaceChildren(
        h("div", { class: "editor__bar" },
          h("div", {}, h("strong", {}, it.ruta), " ", h("code", { class: "editor__path" }, it.archivo), " ", estado),
          h("div", { class: "editor__actions" }, historial, btnDeshacer, btnGuardar)),
        nota,
        h("div", { class: "editor__split" }, codigo, h("div", { class: "editor__preview" },
          h("div", { class: "editor__previewbar" }, "Vista previa", h("a", { href: SITIO + (it.pagina || it).url, target: "_blank", rel: "noopener" }, "Abrir página ↗")), frame)));

      editor.api = crearEditorCodigo(codigo, tipo, f.texto, (texto) => { marcar(texto); refrescar(texto); });
      if (tipo === "html") pintarHTMLPrevia(frame, it, f.texto);
      else {
        frame.addEventListener("load", () => pintarCSSPrevia(frame, it, editor.api.get()));
        frame.src = SITIO + it.pagina.url;
      }
    }

    if (editor.archivo) {
      const actual = lista.find((x) => x.archivo === editor.archivo);
      editor.archivo = null; editor.dirty = false;
      if (actual) setTimeout(() => abrir(actual));
    }
    return wrap;
  }

  function notaZonas(texto) {
    const presentes = Object.keys(ZONAS).filter((id) => new RegExp(`id="${id}"`).test(texto));
    if (!presentes.length) return h("p", { class: "editor__note" }, "La cabecera, el menú y el pie de página son comunes a todas las páginas y no aparecen en este archivo.");
    return h("div", { class: "editor__note" },
      h("strong", {}, "Zonas automáticas: "),
      "estos bloques los rellena el panel con sus listas al cargar la página: ",
      presentes.map((id, i) => [i ? ", " : "", h("code", {}, `id="${id}"`), ` (${ZONAS[id]})`]),
      ". Puedes moverlos o cambiar el texto que los rodea, pero no borres su id ni escribas dentro: ese contenido se reemplaza. La cabecera, el menú y el pie son comunes a todas las páginas y no aparecen aquí.");
  }

  async function guardarArchivo(it, tipo) {
    const texto = editor.api.get();
    if (tipo === "html") {
      const faltan = Object.keys(ZONAS).filter((id) => editor.original.includes(`id="${id}"`) && !texto.includes(`id="${id}"`));
      if (faltan.length && !confirm("Se eliminaron zonas automáticas: " + faltan.map((id) => ZONAS[id]).join(", ") +
        ". Esa información dejará de mostrarse en la página. ¿Guardar de todos modos?")) return false;
      const doc = new DOMParser().parseFromString(texto, "text/html");
      if (!doc.querySelector('script[src*="layout.js"]') && !confirm("La página ya no carga la cabecera y el pie (js/layout.js). ¿Guardar de todos modos?")) return false;
    }
    try {
      const res = await escribir(it.archivo, utf8ToB64(texto), `Editar ${it.archivo} desde el panel`, { sha: editor.sha || null });
      Object.assign(editor, { original: texto, dirty: false });
      if (state.modo === "directo") {
        editor.sha = res.content.sha;
        toast("Archivo publicado. El sitio se actualiza en 1 o 2 minutos.", "ok");
      } else {
        await enviar("Editar " + it.archivo);
        toast(state.rol === "trabajador" && tipo === "html"
          ? "Cambio enviado. Los cambios en el HTML se publican cuando el dueño los aprueba."
          : "Cambio enviado. Se revisa y publica solo en 1 o 2 minutos.", "ok");
      }
      return true;
    } catch (e) {
      toast(e.status === 409 || e.status === 422
        ? "El archivo cambió en GitHub desde que lo abriste. Copia tus cambios, recarga y vuelve a intentarlo."
        : "No se pudo guardar: " + e.message, "error");
      return false;
    }
  }

  /* ---------- Estilo visual ---------- */
  function vistaEstilo() {
    const est = state.data.estilo;
    let alcance = state.estiloAlcance || "global";
    const OP = window.ESTILO.OPCIONES;
    const valoresDe = (a) => a === "global" ? est.global : (est.paginas[a] = est.paginas[a] || {});
    const paginaPrevia = () => alcance === "global" ? PAGINAS[0] : PAGINAS.find((p) => p.id === alcance);

    const frame = vistaPrevia();
    const aplicarPrevia = () => {
      try {
        const w = frame.contentWindow;
        if (!w || !w.ESTILO) return;
        const p = paginaPrevia();
        (w.SITE && w.SITE.ready ? w.SITE.ready : Promise.resolve()).then(() => w.ESTILO.aplicar(est, p.id));
      } catch (e) { /* sin vista previa */ }
    };
    frame.addEventListener("load", aplicarPrevia);

    const controles = h("div", { class: "style-groups" });
    const pintarControles = () => {
      const vals = valoresDe(alcance);
      const heredado = (k) => alcance !== "global" && est.global[k] !== undefined ? est.global[k] : undefined;
      const grupos = {};
      OP.forEach((o) => (grupos[o.grupo] = grupos[o.grupo] || []).push(o));
      controles.replaceChildren(...Object.entries(grupos).map(([g, ops]) => h("section", { class: "panel style-group" }, h("h2", {}, g),
        ops.map((o) => {
          const actual = vals[o.k] !== undefined ? vals[o.k] : heredado(o.k) !== undefined ? heredado(o.k) : o.def;
          const propio = vals[o.k] !== undefined;
          const set = (v) => { vals[o.k] = v; setDirty(true); aplicarPrevia(); pintarControles(); };
          const reset = h("button", { type: "button", class: "link-btn", hidden: !propio, onclick: () => { delete vals[o.k]; setDirty(true); aplicarPrevia(); pintarControles(); } },
            alcance === "global" ? "Restablecer" : "Usar el estilo global");
          let control;
          if (o.tipo === "opciones") {
            control = h("div", { class: "seg" }, Object.entries(o.opciones).map(([v, [t]]) =>
              h("button", { type: "button", class: v === actual ? "is-on" : "", onclick: () => set(v) }, t)));
          } else if (o.tipo === "color") {
            const muestra = actual || (o.k === "btnFondo" ? state.data.colores.acento : state.data.colores.primario);
            control = h("div", { class: "color-row" },
              h("input", { type: "color", value: muestra, "aria-label": o.label, onchange: (e) => set(e.target.value) }),
              h("code", {}, actual ? actual : o.vacio || muestra));
          } else if (o.tipo === "fuente") {
            control = h("select", { onchange: (e) => set(e.target.value), style: `font-family:"${actual}"` },
              o.lista.map((f) => h("option", { value: f, selected: f === actual }, f)));
            window.ESTILO.cargarFuente(document, actual);
          } else if (o.tipo === "rango") {
            const out = h("output", {}, actual + o.unidad);
            control = h("div", { class: "range-row" },
              h("input", { type: "range", min: o.min, max: o.max, step: o.paso, value: actual,
                oninput: (e) => { out.textContent = e.target.value + o.unidad; },
                onchange: (e) => set(+e.target.value) }), out);
          }
          return h("div", { class: "style-row" + (propio ? " is-custom" : "") },
            h("div", { class: "style-row__label" }, h("span", {}, o.label), reset), control);
        }))));
    };

    const selector = h("select", { id: "estiloAlcance", onchange: (e) => {
      alcance = state.estiloAlcance = e.target.value;
      pintarControles();
      frame.src = SITIO + paginaPrevia().url;
    } }, h("option", { value: "global", selected: alcance === "global" }, "Todas las páginas"),
      PAGINAS.map((p) => h("option", { value: p.id, selected: alcance === p.id }, `Solo ${p.ruta} (${p.nombre})`)));

    pintarControles();
    frame.src = SITIO + paginaPrevia().url;
    return h("div", { class: "style-tool" },
      h("div", { class: "style-tool__controls" },
        h("div", { class: "panel" }, h("label", { for: "estiloAlcance", class: "style-scope" }, "Aplicar cambios a"), selector,
          h("p", { class: "editor__note", style: "margin:.8rem 0 0" }, "Lo que elijas para una página se aplica encima del estilo de «Todas las páginas». Los colores institucionales se cambian en «Colores».")),
        controles),
      h("div", { class: "style-tool__preview" }, h("div", { class: "editor__previewbar" }, "Vista previa en vivo"), frame));
  }

  Object.assign(VISTAS, {
    html: { titulo: "Editor de página · HTML", ayuda: "Edita el código de cada página. Verás el resultado en la vista previa antes de publicar.", render: () => vistaEditorArchivos("html") },
    css: { titulo: "Editor de página · CSS", ayuda: "Edita la hoja de estilos global o la propia de cada página.", render: () => vistaEditorArchivos("css") },
    estilo: { titulo: "Estilo visual", ayuda: "Cambia botones, fondos, tipografías y tarjetas sin tocar código. Se publica con el botón de arriba.", render: vistaEstilo },
  });

  function render() {
    const v = VISTAS[state.view];
    $("#viewTitle").textContent = v.titulo;
    $("#viewHelp").textContent = v.ayuda + (state.rol === "trabajador" && state.view === "html"
      ? " Como administrador trabajador, tus cambios en el HTML quedan pendientes hasta que el dueño los apruebe." : "");
    $("#view").replaceChildren(v.render());
    document.querySelectorAll("#sideNav button").forEach((b) => b.classList.toggle("is-active", b.dataset.view === state.view));
    document.body.classList.toggle("is-wide", ["html", "css", "estilo"].includes(state.view));
    $(".bar__actions").hidden = ["html", "css"].includes(state.view) && !state.dirty;
  }

  /* ---------- Rol: qué secciones ve cada uno ---------- */
  function aplicarRol() {
    document.querySelectorAll("#sideNav button[data-view]").forEach((b) => { b.hidden = !puede(b.dataset.view); });
    document.querySelectorAll("#sideNav .side__group").forEach((g) => {
      let n = g.nextElementSibling, alguno = false;
      while (n && !n.classList.contains("side__group")) { if (!n.hidden) alguno = true; n = n.nextElementSibling; }
      g.hidden = !alguno;
    });
    if (!puede(state.view)) state.view = state.rol === "utp" ? "noticias" : "directivos";
    $("#saveBtn").textContent = textoGuardar();
    $("#sessionInfo").textContent = `${state.nombre || "@" + state.login} · ${ROLES[state.rol].nombre}`;
  }

  /* ---------- Sesión ---------- */
  // El token nunca queda guardado para siempre: sin «Recordar» se borra al cerrar la pestaña;
  // con «Recordar», vence a las 12 horas. Además, la sesión se cierra tras 30 minutos sin uso.
  const RECORDAR_HORAS = 12;
  const INACTIVIDAD_MIN = 30;
  function guardarSesion(recordar) {
    const s = JSON.stringify({ owner: state.owner, repo: state.repo, branch: state.branch, token: state.token,
      vence: recordar ? Date.now() + RECORDAR_HORAS * 3600e3 : null });
    sessionStorage.setItem(STORE_KEY, s);
    if (recordar) localStorage.setItem(STORE_KEY, s); else localStorage.removeItem(STORE_KEY);
    marcarActividad();
  }
  function borrarSesion() {
    try { sessionStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_KEY + "-uso"); } catch (e) { /* sin almacenamiento */ }
    state.token = null;
  }
  // Última actividad compartida entre pestañas
  let ultimoUso = Date.now();
  function marcarActividad() {
    ultimoUso = Date.now();
    try { localStorage.setItem(STORE_KEY + "-uso", String(ultimoUso)); } catch (e) { /* sin almacenamiento */ }
  }
  let marcaPendiente = false;
  ["pointerdown", "keydown", "scroll"].forEach((ev) => window.addEventListener(ev, () => {
    if (!state.token || marcaPendiente) return;
    marcaPendiente = true; setTimeout(() => { marcaPendiente = false; marcarActividad(); }, 5000);
  }, { passive: true, capture: true }));
  setInterval(() => {
    if (!state.token) return;
    let uso = ultimoUso, vence = null;
    try {
      uso = Math.max(uso, +localStorage.getItem(STORE_KEY + "-uso") || 0);
      vence = (JSON.parse(sessionStorage.getItem(STORE_KEY) || "null") || {}).vence;
    } catch (e) { /* sin almacenamiento */ }
    if (Date.now() > (vence || uso + INACTIVIDAD_MIN * 60e3)) {
      if (state.dirty) return; // no se pierden cambios sin publicar; se cerrará después de guardar
      borrarSesion();
      sessionStorage.setItem(STORE_KEY + "-aviso", "1");
      location.reload();
    }
  }, 30e3);

  // Freno a intentos repetidos de ingreso desde este equipo: 5 errores y hay que esperar (cada vez más)
  const BLOQUEO_KEY = STORE_KEY + "-intentos";
  const leerIntentos = () => { try { return JSON.parse(localStorage.getItem(BLOQUEO_KEY) || "null") || { n: 0, hasta: 0 }; } catch (e) { return { n: 0, hasta: 0 }; } };
  const anotarIntento = (ok) => {
    const i = leerIntentos();
    const nuevo = ok ? { n: 0, hasta: 0 } : { n: i.n + 1, hasta: i.n + 1 >= 5 ? Date.now() + Math.min(60, 2 ** (i.n + 1 - 5)) * 60e3 : 0 };
    try { localStorage.setItem(BLOQUEO_KEY, JSON.stringify(nuevo)); } catch (e) { /* sin almacenamiento */ }
  };

  async function entrar(recordar) {
    const yo = await api("/user");
    const repo = await gh("");
    await cargarDatos();
    state.login = yo.login;
    // Quien tiene permiso de escritura en el repositorio (dueño o administrador de la organización) publica directo
    if (repo.permissions && repo.permissions.push) {
      const u = state.roles.usuarios.find((x) => (x.github || "").toLowerCase() === yo.login.toLowerCase());
      Object.assign(state, { rol: "dueno", modo: "directo", nombre: (u && u.nombre) || yo.name || "" });
    } else {
      const u = state.roles.usuarios.find((x) => (x.github || "").toLowerCase() === yo.login.toLowerCase());
      if (!u || !ROLES[u.rol]) throw new Error(`Tu cuenta de GitHub (@${yo.login}) no tiene acceso al panel. Pídele al administrador que te agregue en «Usuarios y permisos».`);
      Object.assign(state, { rol: u.rol, modo: "revision", nombre: u.nombre || "" });
    }
    aplicarRol();
    guardarSesion(recordar);
    $("#login").hidden = true;
    $("#app").hidden = false;
    setDirty(false);
    render();
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const [owner, repo] = $("#repoInput").value.trim().split("/");
    Object.assign(state, { owner, repo, branch: $("#branchInput").value.trim() || "main", token: $("#token").value.trim() });
    const btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "Verificando…"; $("#loginError").textContent = "";
    const espera = leerIntentos().hasta - Date.now();
    if (espera > 0) {
      $("#loginError").textContent = `Demasiados intentos fallidos. Espera ${Math.ceil(espera / 60e3)} minuto(s) antes de volver a intentar.`;
      btn.disabled = false; btn.textContent = "Ingresar";
      return;
    }
    try {
      await entrar($("#remember").checked);
      anotarIntento(true);
      $("#token").value = "";
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404 || /no tiene acceso al panel/.test(err.message)) anotarIntento(false);
      state.token = null;
      $("#loginError").textContent = err.status === 401 ? "Token inválido o vencido."
        : err.status === 404 ? "No se encontró el repositorio o el archivo de datos, o el token no tiene acceso."
        : err.message;
    } finally {
      btn.disabled = false; btn.textContent = "Ingresar";
    }
  });

  $("#sideNav").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-view]");
    if (!b || b.dataset.view === state.view) return;
    if (editorSucio() && !confirm("Tienes cambios sin guardar en " + editor.archivo + ". ¿Descartarlos?")) return;
    editor.dirty = false; editor.archivo = null;
    state.view = b.dataset.view; render();
  });
  $("#saveBtn").addEventListener("click", guardar);
  $("#logoutBtn").addEventListener("click", () => {
    if (state.dirty && !confirm("Tienes cambios sin publicar. ¿Cerrar sesión de todos modos?")) return;
    borrarSesion();
    state.dirty = false; location.reload();
  });
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `sitio-respaldo-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  });

  // Reanudar sesión guardada
  try {
    if (sessionStorage.getItem(STORE_KEY + "-aviso")) {
      sessionStorage.removeItem(STORE_KEY + "-aviso");
      $("#loginError").textContent = "Por seguridad, la sesión se cerró (pasaron 30 minutos sin uso o venció el «Recordar»). Ingresa de nuevo.";
    }
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY) || "null");
    const usoPrevio = +localStorage.getItem(STORE_KEY + "-uso") || 0;
    const vencida = saved && ((saved.vence && Date.now() > saved.vence) || !saved.vence && localStorage.getItem(STORE_KEY)
      || (!saved.vence && usoPrevio && Date.now() - usoPrevio > INACTIVIDAD_MIN * 60e3));
    if (vencida) {
      borrarSesion();
      $("#loginError").textContent = "Por seguridad, la sesión se cerró (pasaron 30 minutos sin uso o venció el «Recordar»). Ingresa de nuevo.";
    }
    else if (saved && saved.token) {
      Object.assign(state, saved);
      $("#repoInput").value = `${saved.owner}/${saved.repo}`;
      $("#branchInput").value = saved.branch;
      entrar(!!saved.vence).catch(() => borrarSesion());
    }
  } catch (e) { /* almacenamiento no disponible */ }
})();

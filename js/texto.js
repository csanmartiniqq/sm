/* Texto con formato simple para el cuerpo de las noticias. Lo usan el sitio y el panel.
   Se escribe con marcas fáciles y nunca se interpreta HTML (así no se puede colar código):
     ## Subtítulo            **negrita**        *cursiva*
     - elemento de lista     1. lista numerada  > cita
     [texto](https://…)      ![descripción](img/noticias/foto.jpg)   (imagen en su propia línea)
   Un párrafo nuevo se separa con una línea en blanco. */
window.TEXTO = (function () {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Solo enlaces web, correo o rutas del propio sitio
  const urlSegura = (u) => {
    const t = String(u || "").trim();
    if (/^(https?:\/\/|mailto:)/i.test(t)) return t;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) || /\s/.test(t) || !/[./]/.test(t)) return "";
    return t;
  };

  const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").slice(0, 70).replace(/^-+|-+$/g, "");
  // Identificador de una noticia para su página: el guardado, o uno a partir de la fecha y el título
  const idNoticia = (n) => n.id || slug(`${n.fecha || ""} ${n.titulo || ""}`) || "noticia";

  function enLinea(t, asset) {
    return esc(t)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
        const u = urlSegura(url.replace(/&amp;/g, "&"));
        if (!u) return txt;
        const externo = /^https?:/i.test(u);
        return `<a href="${esc(asset(u))}"${externo ? ' target="_blank" rel="noopener"' : ""}>${txt}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  }

  function html(md, asset = (u) => u) {
    const bloques = String(md || "").replace(/\r/g, "").split(/\n{2,}/);
    return bloques.map((b) => {
      const lineas = b.split("\n").filter((l) => l.trim());
      if (!lineas.length) return "";
      const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(lineas[0].trim());
      if (img && lineas.length === 1) {
        const u = urlSegura(img[2]);
        return u ? `<figure><img src="${esc(asset(u))}" alt="${esc(img[1])}" loading="lazy">${img[1] ? `<figcaption>${esc(img[1])}</figcaption>` : ""}</figure>` : "";
      }
      const h = /^(#{2,3})\s+(.*)$/.exec(lineas[0]);
      if (h && lineas.length === 1) return `<h${h[1].length}>${enLinea(h[2], asset)}</h${h[1].length}>`;
      if (lineas.every((l) => /^\s*[-•]\s+/.test(l))) return `<ul>${lineas.map((l) => `<li>${enLinea(l.replace(/^\s*[-•]\s+/, ""), asset)}</li>`).join("")}</ul>`;
      if (lineas.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lineas.map((l) => `<li>${enLinea(l.replace(/^\s*\d+[.)]\s+/, ""), asset)}</li>`).join("")}</ol>`;
      if (lineas.every((l) => /^\s*>/.test(l))) return `<blockquote>${lineas.map((l) => enLinea(l.replace(/^\s*>\s?/, ""), asset)).join("<br>")}</blockquote>`;
      return `<p>${lineas.map((l) => enLinea(l, asset)).join("<br>")}</p>`;
    }).join("\n");
  }

  return { html, urlSegura, slug, idNoticia, esc };
})();

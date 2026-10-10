# Sitio web Colegio San Martín Iquique

Propuesta de rediseño del sitio del Colegio San Martín de Iquique, hecha con HTML, CSS y JavaScript sin dependencias.

- `index.html`: portada
- `colegio/`, `directivos/`, `docentes/`, `equipos/`, `departamentos/`, `noticias/`, `horarios/`, `admision/`, `documentos/`, `contacto/`: una página por sección
- `css/estilos.css`: estilos (escritorio y móvil)
- `js/layout.js`: cabecera, menú y pie compartidos por todas las páginas
- `js/main.js`: menú, pestañas, noticias, formulario, animaciones y carga del contenido editable

- `data/sitio.json`: contenido editable (colores, directivos, departamentos, personal, horarios, noticias, redes sociales y documentos)
- `admin/`: panel de administración (contenido, editor HTML/CSS por página y estilo visual)
- `css/paginas/`: estilos propios de cada página, que se aplican encima de `css/estilos.css`
- `js/horarios.js`: reglas de los horarios (colores por asignatura, recreos, bloques administrativos que no se publican)
- `admin/vendor/`: CodeMirror (editor de código) y SheetJS (lectura y escritura de Excel, licencia Apache 2.0)
- `js/estilo.js`: opciones de la herramienta «Estilo visual» (botones, fondos, tipografías, tarjetas)

## Panel de administración

Entra a `/admin/` e ingresa con un token de GitHub de grano fino (*fine-grained*) limitado a este repositorio con permiso **Contents: Read and write**. El panel guarda los cambios en `data/sitio.json` y sube fotos y documentos a `img/` y `documentos/`; GitHub Pages publica la nueva versión en uno o dos minutos.

La dirección del panel no es secreta: lo que protege el contenido es el token. Sin un token con permiso de escritura nadie puede modificar nada.

## Horarios

En el panel, **Horarios** permite importar un Excel con una hoja por curso. La fila de títulos debe decir Hora, Lunes, Martes, Miércoles, Jueves y Viernes (o Inicio y Fin en lugar de Hora), y el nombre del curso va en la celda A1. Descarga la plantilla desde el mismo panel. Los electivos se escriben «Biología / Economía y sociedad» (Científico / Humanista). En el sitio, cada horario se puede descargar como imagen PNG.

## Usuarios y permisos del panel

Quien tiene permiso de escritura en el repositorio (administradores de la organización colegiosanmartin) entra con su token y publica directo; GitHub avisa a las cuentas con rol «dueño» en `data/roles.json`. Los funcionarios entran con su propia cuenta de GitHub (token clásico con permiso `public_repo`) y tienen uno de estos roles, definidos en `data/roles.json` desde «Usuarios y permisos»:

- **Administrador (dueño)**: cambia todo, incluidos los usuarios.
- **Administrador (trabajador)**: cambia contenido, estilos y archivos; cada cambio se le avisa al dueño y los cambios en HTML esperan su aprobación.
- **UTP**: solo noticias.

Los funcionarios no tienen permiso de escritura: el panel guarda sus cambios en una rama `panel-…` de su copia (fork) y abre una solicitud de cambios. La acción `.github/workflows/cambios-panel.yml` la revisa según el rol (leído siempre desde `main`), publica lo permitido, rechaza lo demás explicando por qué y avisa al dueño mencionándolo en GitHub. La acción nunca ejecuta código de la solicitud.

## Seguridad

Ver [SEGURIDAD.md](SEGURIDAD.md): qué protege el código y los pasos que debe hacer el administrador en GitHub (2FA, tokens con vencimiento, reglas de la rama main).

## Departamentos

`/departamentos/` muestra los departamentos académicos (cada uno con su página `/departamentos/?d=matematica`, con «Profesores» y «Actividades») y los equipos de apoyo. Los docentes se asignan con el campo «Departamentos» en «Docentes y personal»; las actividades son noticias con la etiqueta «Departamento». Al tocar a una persona se abre su ficha completa (título, postgrado, tema favorito y frase).

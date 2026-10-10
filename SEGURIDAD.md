# Seguridad del sitio y del panel

## Qué protege el sitio

GitHub Pages solo entrega archivos estáticos. No hay servidor, base de datos ni contraseña que se pueda adivinar en el sitio, así que lo que hay que cuidar son **las cuentas de GitHub y los tokens** que dan acceso al panel `/admin/`.

## Lo que ya hace el código

- **Solo scripts propios.** Cada página declara una política de seguridad de contenido (`Content-Security-Policy`):
  - Solo se ejecutan los scripts del propio sitio.
  - Las fuentes vienen solo de Google Fonts.
  - El mapa solo se carga desde Google Maps.
  - El panel solo se conecta con `api.github.com`.
  - Si alguien lograra colar código en una noticia o en una página, el navegador no lo ejecuta.
- **Enlaces seguros.** Todo lo que se escribe en el panel se muestra como texto. Los enlaces solo aceptan `https://`, `mailto:`, `tel:` o rutas del sitio; `javascript:`, `data:` y similares se descartan al mostrar la página. El texto de las noticias usa un formato simple que nunca interpreta HTML (`js/texto.js`).
- **Sesión del panel.** El token se borra al cerrar la pestaña. Con «Recordar», se borra a las 12 horas. Sin «Recordar», la sesión también se cierra tras 30 minutos sin uso. Nunca queda guardado para siempre.
- **Intentos repetidos.** Tras 5 intentos fallidos de ingreso, el panel obliga a esperar, y la espera crece cada vez. Un token de GitHub tiene más de 40 caracteres al azar, por lo que adivinarlo no es viable; además, GitHub limita los intentos por su cuenta.
- **El panel no se puede incrustar** dentro de otra página, lo que evita trampas de clics.
- **Roles.** Los funcionarios no tienen permiso de escritura. Sus cambios llegan como propuesta y la Action `cambios-panel.yml` los revisa:
  - Lee los roles siempre desde `main`, nunca desde la propuesta.
  - Nunca ejecuta código de la propuesta.
  - Rechaza cambios en `.github/`, `admin/`, `js/`, `data/roles.json`, `CNAME` y `_config.yml`.
  - Rechaza archivos SVG o HTML subidos.
  - Rechaza enlaces `javascript:` y `data:`.
- **Action fijada.** Las acciones de GitHub usadas están fijadas por su código exacto y Dependabot avisa cuando hay versiones nuevas (`.github/dependabot.yml`).

## Lo que debe hacer el administrador en GitHub

Estos pasos no se pueden hacer desde el código.

1. **Verificación en dos pasos (2FA).**
   - Actívala en tu cuenta: *Settings → Password and authentication*.
   - Luego exígela a todos en la organización: *github.com/organizations/colegiosanmartin/settings/security* → «Require two-factor authentication».
2. **Tokens con vencimiento.**
   - Crea los tokens del panel con fecha de vencimiento (90 días como máximo) y solo para este repositorio.
   - Revoca los que ya no uses en *Settings → Developer settings → Personal access tokens*.
   - Pide a los funcionarios que usen 30 días.
3. **Proteger la rama `main`.**
   - Ve a *Settings → Rules → Rulesets → New branch ruleset* y elige *Target: Default branch*.
   - Activa «Restrict deletions» y «Block force pushes».
   - **No** actives «Require a pull request», porque impediría publicar directo desde el panel.
4. **Permisos de Actions.**
   - En *Settings → Actions → General → Workflow permissions*, elige «Read repository contents and packages permissions». La Action del panel declara sus propios permisos.
   - Deja desmarcado «Allow GitHub Actions to create and approve pull requests».
5. **Escaneo de secretos.** En *Settings → Code security*, activa «Secret scanning», «Push protection» y «Dependabot alerts».
6. **Pocos dueños.**
   - En la organización, deja *Base permissions* en «No permission» o «Read».
   - Da rol *Owner* solo a quien lo necesite. Quien tenga escritura en el repositorio es dueño del panel.
7. **Con dominio propio** (colegiosm.cl), marca «Enforce HTTPS» en *Settings → Pages*.

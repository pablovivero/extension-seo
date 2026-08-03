# SERP Capture Extension

Extension independiente de Chrome Manifest V3 para automatizar busquedas en Google desde una lista de keywords, capturar resultados organicos visibles y descargar un unico JSON reutilizable por otro proyecto.

## Limitaciones

- Captura solo resultados organicos visibles que contengan un enlace HTTP/HTTPS y un titulo visible.
- No captura anuncios, AI Overview, People Also Ask, featured snippets, videos, local pack ni paginacion.
- No raspa las paginas de destino.
- No usa backend, base de datos, proxies, servicios externos ni APIs de scraping.
- Google cambia el DOM con frecuencia; los selectores y heuristicas pueden requerir mantenimiento.
- Si aparece consentimiento o CAPTCHA, la extension no lo acepta ni lo resuelve. La pestaña queda visible para intervencion humana.

## Instalacion

```bash
npm install
```

## Build

```bash
npm run typecheck
npm test
npm run build
```

La extension compilada queda en `dist`.

## Carga en Chrome

1. Abrir `chrome://extensions`.
2. Activar el modo desarrollador.
3. Elegir `Cargar descomprimida`.
4. Seleccionar la carpeta `dist`.
5. Abrir el popup de `SERP Capture`.

## Uso

1. Introducir keywords, una por linea.
2. Elegir resultados por keyword, entre 1 y 10. El valor inicial es 5.
3. Pulsar `Iniciar captura`.
4. La extension abre una pestaña temporal de Google y procesa una keyword cada vez.
5. Al finalizar descarga `serp-results-<timestamp>.json`.
6. Mientras el service worker mantenga el resultado en `chrome.storage.session`, se puede descargar de nuevo desde el popup.

## Enviar al CLI redactor-seo

La descarga manual sigue disponible. Además, la extensión puede enviar la misma captura JSON al CLI local `redactor-seo`.

Primera vez:

1. En el repo del CLI, ejecuta `npm run generar`.
2. El CLI mostrará un código de emparejamiento la primera vez que cree su archivo local de pairing.
3. En el popup de la extensión, pega ese código en `Emparejar con redactor-seo` y pulsa `Guardar emparejamiento`.

Día a día:

1. Ejecuta `npm run generar` en el CLI y déjalo esperando la captura.
2. Con Chrome abierto y la extensión ya emparejada, no hace falta abrir el popup: el background comprueba `GET /job`, lanza la captura pendiente y envía el JSON al redactor automáticamente.
3. Chrome ejecuta esta comprobación con `chrome.alarms`. En extensiones normales el intervalo mínimo práctico es de aproximadamente 1 minuto, así que puede tardar hasta ~1 minuto en arrancar tras enviar el brief desde el CLI. Al guardar un emparejamiento nuevo, la extensión hace una comprobación inmediata.
4. El popup sigue siendo una alternativa manual: puedes pulsar `Iniciar captura`, `Enviar al redactor` o `Descargar último JSON` como antes.

Para reemparejar, pulsa `Olvidar emparejamiento` en el popup y pega el nuevo código del CLI. Esto es coherente con `npm run redactor:pairing:reset` en el repo del CLI.

La extensión consulta jobs en `http://127.0.0.1:43187/job` y envía capturas a `http://127.0.0.1:43187/serp`, el puerto por defecto del CLI. El permiso de host se declara como `http://127.0.0.1/*` para cubrir el servidor local si el CLI cambia de puerto con `REDACTOR_LOCAL_PORT`; las URLs de la extensión usan el puerto por defecto y tendrían que ajustarse si se configura otro puerto en el CLI.

## Contrato JSON

```ts
interface SerpCapture {
  schemaVersion: "1.0";
  capturedAt: string;
  engine: "google";
  locale: string;
  queries: SerpQuery[];
}

interface SerpQuery {
  keyword: string;
  searchUrl: string;
  capturedAt: string;
  requestedResultCount: number;
  results: SerpResult[];
  warnings: string[];
}

interface SerpResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string | null;
  type: "organic";
}
```

## Estrategia de captura

El content script analiza el DOM ya cargado en Google. Busca bloques habituales de resultados (`div.g`, `div.MjjYud` y contenedores relacionados), exige un `h3` visible dentro de un enlace, normaliza URLs, calcula dominio con `new URL` y asigna posiciones consecutivas solo a resultados validos.

Tambien aplica una ruta de respaldo basada en encabezados `h3` visibles cuando los contenedores habituales no aparecen.

## Bloques excluidos

- Anuncios o bloques con marcas visibles de anuncio/patrocinado.
- URLs internas de Google como busqueda, preferencias, cache, herramientas, redirecciones internas sin destino valido, maps o shopping.
- Enlaces no HTTP/HTTPS.
- Resultados duplicados dentro de la misma keyword.
- Bloques sin titulo visible o sin URL valida.

## CAPTCHA, consentimiento y errores

La extension detecta textos y estructuras comunes de consentimiento, CAPTCHA, paginas de error y ausencia de resultados. En esos casos registra advertencias en la keyword y continua con la siguiente cuando tiene sentido. No intenta evadir protecciones ni aceptar terminos automaticamente.

## Comprobacion manual sugerida

- Una keyword devuelve resultados.
- Varias keywords se procesan en orden.
- Los resultados tienen titulo, URL, dominio y posicion.
- El limite solicitado se respeta.
- No aparecen anuncios como organicos.
- El archivo JSON se descarga.
- Una busqueda sin resultados no rompe toda la ejecucion.
- Cerrar el popup no destruye el proceso mientras el service worker sigue activo.
- Cancelar detiene las siguientes busquedas.
- El JSON cumple el contrato documentado.

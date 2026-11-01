# Parchís

El parchís español de siempre para Android e iPhone, de 2 a 4 jugadores: contra la máquina, con amigos en el mismo móvil y en línea.
App Capacitor + web (`www/`). Todos los datos se guardan en el móvil; solo el juego en línea usa el servidor de juegos (nombre y jugadas, sin guardarlos).
Paquete: `com.itcanarias.parchis` · versión 1.0.0

**iPhone y navegadores**: la misma app se publica como versión web instalable en https://csuarezsm.github.io/Parchis/app/ (GitHub Pages, carpeta `docs/app`, copia de `www/`). En Safari: Compartir → «Añadir a pantalla de inicio». Tras cambiar `www/`, ejecuta `npm run web` antes del commit: las pruebas y el workflow comprueban que `docs/app` está al día. La página de descarga (https://csuarezsm.github.io/Parchis/) ofrece Android e iPhone, y el mensaje de «Compartir la app» enlaza a ella.

© 2026 IT Canarias. Todos los derechos reservados.

Hecha con la misma plantilla y el mismo espíritu que Ajedrez, Damas, Chinchón y Pumba (tema por defecto: madera).

## Reglas (parchís español)

- De 2 a 4 jugadores, 4 fichas cada uno y un dado. Con dos jugadores, los colores van enfrentados. Empieza un color al azar; en la revancha, otro.
- Recorrido común de 68 casillas, en sentido contrario a las agujas del reloj. Salidas: amarillo 5, azul 22, rojo 39, verde 56. Seguros: 5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63 y 68. Cada color entra en su pasillo (7 casillas) tras la 68, 17, 34 y 51, y sigue hasta la meta.
- **Salir**: con un 5 hay que sacar ficha si se puede. Si en la salida hay dos fichas y alguna es de otro color, se come una.
- **El 6** repite tirada; si no quedan fichas en casa, cuenta 7. **Tres seises seguidos**: la última ficha movida vuelve a casa (si no está en el pasillo) y se pierde el turno.
- **Barrera**: dos fichas del mismo color en una casilla; nadie la pasa ni cae en ella. Con un 6 (o 7) hay que abrirla si se puede. Como mucho dos fichas por casilla.
- **Comer** (fuera de los seguros): la ficha comida vuelve a su casa y **se cuentan 20** con cualquier ficha. En los seguros conviven dos fichas de distinto color.
- **Meta** con el número exacto: **se cuentan 10**. Gana quien mete antes sus cuatro fichas; los demás quedan por recorrido hecho.

## Qué hace

- **Contra la máquina**: tu color, de 1 a 3 rivales y tres niveles (fácil, normal y difícil).
- **Con amigos** en el mismo móvil: cada color es una persona, la máquina o nadie.
- **Jugar en línea** con el servidor común de IT Canarias (`wss://juegos.itcanarias.com/ws`, repo `csuarezsm/juegos-servidor`, juego `parchis`): salas de 2 a 4 con código, la máquina puede ocupar sillas libres y juega por quien se desconecta; el **dado lo tira el servidor** (aleatorio criptográfico) y valida cada jugada con las mismas reglas. Revancha en la misma sala.
- **Tablero** dibujado en SVG, girado para que tu casa quede abajo a la derecha. Las fichas que se pueden mover brillan y su destino se marca; se mueven casilla a casilla. Con una sola opción se mueve sola (se puede quitar).
- **Clasificación** por puestos (10 al ganador y 0 al último, valoración 0–100 ajustada por partidas), jornadas, récords y ficha de jugador. La máquina ocupa puesto pero no sale en el ranking.
- **Igual que la plantilla**: temas, tableros, velocidad de la máquina, tamaño de letra, horizontal y tablet, sonidos sintetizados, bienvenida, copias automáticas, enviar partidas al grupo, actualizador del APK, compartir la app y borrar datos.

## Archivos (`www/`)

| Archivo | Qué contiene |
|---|---|
| `parchis.js` | Reglas y máquina. Estado de la partida (`nueva`, `tirar`, `mover`, `movimientos`, `quitar`, `clasificar`) y elección de la máquina por niveles (`elegir`): valora comer, meter, salir, ponerse a salvo, barreras y el peligro de cada casilla. Es el mismo archivo que usa el servidor (`motores/parchis/parchis.js`). |
| `juego.js` | Tablero, dado, partida local, pantalla de inicio y juego en línea. |
| `index.html` | Estilos, menú, temas, actualizador, copias, clasificación y arranque. |

Sin librerías de terceros: tablero, reglas y máquina son propios.

## Publicar una versión

1. Sube `versionCode` y `versionName` en `android/app/build.gradle`, `APP_VERSION` en `www/index.html` y `CACHE` en `www/sw.js`.
2. `npm run web` (versión web) y push a `main`. El workflow pasa las pruebas, compila el **APK** (`parchis.apk`, con actualizador) y el **AAB** de Google Play (`parchis-play.aab`), los firma y crea la Release `vX.Y.Z`.

### Secretos del repositorio (Settings → Secrets and variables → Actions)

- `ANDROID_KEYSTORE_BASE64`: el archivo `parchis-release.jks` en base64.
- `ANDROID_KEYSTORE_PASSWORD`: su contraseña (alias de la clave: `parchis`).

**Guarda el `.jks` y la contraseña en un lugar seguro.** Si se pierden, las versiones ya instaladas no podrán actualizarse sin desinstalar la app.

## Pruebas

`npm test` comprueba las reglas (salir con 5, el 6 y el 7, tres seises, barreras, comer y seguros, meta exacta y premios), cientos de partidas simuladas, la fuerza de los niveles, el juego en línea contra una copia local del servidor común (busca `../juegos-servidor` o `JUEGOS_SERVIDOR`; en GitHub lo clona el workflow) y toda la interfaz en móvil, horizontal y tablet.

## Desarrollo local

```bash
npm install
npm test
npm run web               # copia www/ a docs/app (versión web)
npx cap sync android && npx cap open android
npm run icons             # iconos y splash a partir de assets/
```

## Web

- `docs/index.html`: página de descarga (Android e iPhone).
- `docs/app/`: la versión web instalable.
- `docs/privacidad.html`: política de privacidad (la pide Google Play).
- `docs/descargas.html`: contador de descargas del APK.

## Más juegos de IT Canarias

En el menú ⋮ → «🎲 Más juegos de IT Canarias» y en la página de descarga aparecen los otros juegos (Ajedrez, Damas, Chinchón, Pumba y Parchís). El código es `www/masjuegos.js`, **el mismo archivo en todas las apps**, con la lista y los iconos (`www/juegos/`) dentro para que funcione sin conexión. Con internet, la app lee como mucho cada 12 horas el catálogo común `https://csuarezsm.github.io/juegos-servidor/juegos.json` (repo `juegos-servidor`, carpeta `docs/`): un juego nuevo añadido allí aparece en todas las apps sin actualizarlas. En Android, si el otro juego está instalado, el botón lo abre (plugin `OtrasApps` y `<queries>` del manifiesto); si no, lleva a su página de descarga, o a Google Play si el catálogo tiene su enlace `play` y esta es la versión de Play. En iPhone abre su versión web.

## Aviso de turno en línea

En una partida en línea, cuando pasa a ser tu turno suena un «ding-dong» corto y el móvil vibra (`www/turno.js`, el mismo archivo en todas las apps; sonido sintetizado). Se quita en ⋮ → Colores… → «🔔 Aviso de turno en línea». Suena con la app abierta; con la app en segundo plano el sistema puede pausarla.

## Idiomas (español e inglés)

⋮ → «🌐 Idioma · Language». La primera vez se usa el idioma del móvil (español si empieza por «es»; si no, inglés). La app está escrita en español y `www/idioma.js` traduce lo que se ve con el diccionario `www/i18n-en.js` (los dos, **los mismos archivos en todas las apps**): textos, plantillas con datos ({1}, {2}…), mensajes para compartir, imágenes, fechas y números. Cuando se añade o cambia un texto en español, hay que añadir su traducción al diccionario común (`comun/` en el chat de desarrollo) y copiarlo a todas las apps. Para otro idioma: un `i18n-<código>.js` y su nombre en `IDIOMAS` de `idioma.js`.

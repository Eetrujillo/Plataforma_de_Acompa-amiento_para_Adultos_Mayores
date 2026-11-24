---
name: senior-ui-wcag
description: "Estándares obligatorios de la app del adulto mayor (React Native/Android): texto mínimo 20pt, áreas táctiles 48x48 CSS px, contraste WCAG 2.2 AA 4,5:1, cero credenciales, botón SOS siempre visible y feedback inmediato. Usar al construir o revisar cualquier pantalla de la app del adulto mayor (HU-009, HU-018, HU-019, HU-023, HU-024, HU-025)."
---

# La app del adulto mayor no es el panel del cuidador

Este archivo es la regla de oro: **lo que sirve para el cuidador no sirve para el adulto mayor**.
Un usuario de 75 años con presbicia, temblor en las manos y poca familiaridad con el teléfono no
puede adaptarse a la interfaz; la interfaz se adapta a él. Cada punto de abajo es verificable y se
revisa antes de dar por terminada una pantalla.

## 1. Tipografía

- **20pt mínimo** para títulos y para el texto de cada actividad. Es el piso que fija el
  anteproyecto, no el objetivo: el cuerpo va en 20-24pt y los títulos en 28pt o más.
- Altura de línea 1.5 como mínimo. Texto nunca justificado: la alineación a la izquierda mantiene el
  ritmo de lectura.
- El escalado de texto del sistema **no se bloquea** (`allowFontScaling` activo): WCAG 2.2 pide poder
  ampliar hasta el 200 % sin pérdida de contenido ni de función.
- Prohibido achicar texto para que entre: si no entra, se acorta la frase o se parte en dos líneas.
- Una sola familia tipográfica, sin itálicas ni versalitas, sin texto en mayúsculas sostenidas.

## 2. Áreas de toque

- **48x48 CSS px mínimo**, con **8px mínimo de separación** entre dos controles. El anteproyecto fija
  48 superando el umbral AAA de 44x44 (y el AA de 24x24): el objetivo del proyecto es el más
  exigente, no el mínimo normativo.
- El área táctil puede ser mayor que el dibujo: el `padding` cuenta.
- Un solo control primario por pantalla. Si hay dos acciones, una es secundaria y visualmente menor.
- Nada de gestos ocultos (swipe para completar, long-press para borrar). Todo lo que se puede hacer
  se ve en pantalla. La única excepción declarada es el **SOS con presión sostenida**, que es
  intencional y tiene instrucción visible en pantalla.

## 3. Contraste y color

- WCAG 2.2 **nivel AA**: relación mínima **4,5:1** para texto normal, 3:1 para texto grande y para
  componentes de interfaz. Ese es el umbral que el anteproyecto se compromete a cumplir; verificado
  con medidor, no a ojo.
- **El color nunca es el único portador de significado.** "Pendiente" y "Completada" se distinguen
  por texto, ícono y forma, no solo por verde contra gris (HU-018).
- Fondos planos. Sin degradados detrás de texto, sin transparencias que bajen el contraste real.
- El rojo del SOS es el único rojo de la app: no se usa para "error de formulario" ni para adornos.

## 4. Cero credenciales para el adulto mayor

- El adulto mayor **nunca** escribe correo, contraseña, ni un token. Ni siquiera una vez.
- La vinculación es por QR una sola vez (HU-009) y la sesión queda persistente (HU-006).
- Nunca hay pantalla de "registro", "iniciar sesión" ni "recuperar contraseña" en la app móvil.
- No hay PIN ni ningún otro secreto que el adulto mayor deba recordar o tipear (decisión L3).
  Si algo exigiera identidad, la respuesta correcta es rediseñar el flujo, no agregar una credencial.

## 5. Errores, estados vacíos y textos

- Español neutro, frases de 8 palabras o menos, sin jerga técnica. "Sin conexión. Reintentando..." —
  no "Network error (code 0)".
- El mensaje dice **qué hacer**, no qué falló. Si el QR venció, el texto exacto es
  **"Pídele a tu familiar un QR nuevo"** (HU-009).
- Sin pantallas en blanco: estado vacío explicado ("Hoy no tienes actividades", HU-018), estado de
  carga con texto, estado de error con una sola acción de salida.
- Nunca se muestra un código de error, un stack ni un id al usuario.

## 6. Feedback y movimiento

- Toda acción confirma **de inmediato** con un cambio visual: la tarjeta pasa a "Completada" al
  tocar, antes de que el servidor conteste (HU-019).
- La acción destructiva o irreversible tiene "Deshacer" visible durante 10 segundos (HU-019).
- Transiciones de 150-200 ms como máximo, y `prefers-reduced-motion` / reduce motion respetado: si
  el sistema lo pide, no hay animación.
- Sin carruseles, sin auto-scroll, sin contenido que se mueva solo.

## 7. SOS

- Botón rojo **siempre visible** en todas las pantallas del adulto mayor, sin scroll y sin abrir un
  menú (HU-024). Zona fija, no flotante sobre contenido que se pueda tocar por error.
- Al presionar: cuenta regresiva de **5 segundos** con un "Cancelar" del mismo tamaño o mayor que el
  botón que la inició.
- El SOS funciona sin conexión: encola y reintenta (HU-030). Nunca se deshabilita por falta de red.
- Nunca queda detrás de un modal, de una pantalla de actividad o de un permiso del sistema.

## 8. Estructura de pantalla

- Una tarea por pantalla o una lista vertical simple. Sin scroll horizontal, sin tablas, sin
  columnas, sin menú hamburguesa.
- Navegación por botones grandes con texto, nunca por íconos solos.
- La primera pantalla después de abrir es la acción útil (la rutina del día, HU-006/HU-017), no un
  dashboard ni un tutorial.
- Barra de estado y `safe-area` respetadas: nada de contenido debajo del notch ni del gesto del
  sistema (`safe-area-handling`).

## 9. Rendimiento percibido

- La rutina del día se lee del almacenamiento local primero y se revalida después (HU-029). La app
  abre con señal o sin ella.
- Sin bloqueos por red en la ruta crítica: marcar una actividad nunca espera al servidor.

## 10. Cómo se verifica

- Automático: `wcag-accessibility-audit` y `wcag-check` (`.agents/skills/vendor/`) sobre los
  componentes y sus estilos.
- En React Native se declaran las props `accessibilityRole`, `accessibilityLabel` y
  `accessibilityHint` en todo control interactivo: un `Pressable` sin rol ni etiqueta no existe para
  TalkBack.
- Manual y obligatorio, porque ninguna herramienta lo resuelve: tamaño de fuente real en el
  dispositivo, recorrido con TalkBack, orden de foco, y prueba con el teléfono en la mano a 40 cm.
- Un hallazgo no se cierra "porque el linter pasó": se cierra con la prueba manual anotada.
- **Límite declarado en el anteproyecto:** el proyecto **no certifica conformidad total con WCAG**
  porque no se audita con lectores de pantalla de forma sistemática. Eso no es permiso para ignorar
  las reglas de arriba: son las que sí se verifican.

## Dónde vive

- App del adulto mayor: `app/src/screens/senior/` y `app/src/features/*/ui/senior/`.
- App del familiar: `app/src/screens/caregiver/` y `app/src/features/*/ui/caregiver/`.
- Ningún componente de una app se importa desde la otra. Lo compartido vive en `app/src/shared/` y es
  lógica, no UI.
- Navegación: un `NavigationContainer` raíz por binario (`react-navigation`).

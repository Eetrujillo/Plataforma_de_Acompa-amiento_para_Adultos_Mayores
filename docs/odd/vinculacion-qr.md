# Vinculación por QR y roles por vía de entrada — AAM

Tercera entrega: vinculación con QR único del familiar y asignación de roles según cómo entra el usuario a la app móvil. Admin queda sin modificar.

## Specs

S1: "admin de momento no va a ser modificado" — el rol admin no se sobreescribe ni se le agregan flujos; sigue como está.
S2: "necesito que desde la app mobil si no se loguea con cuenta pero escanea QR se asigne el rol de Adulto Mayor" — escaneo sin sesión → sesión local (invitada) con rol adulto_mayor.
S3: "si desde la app se loguea y escanea QR se asigne el rol de cuidador" — escaneo con sesión abierta en la app → el rol del usuario pasa a cuidador y queda vinculado al código escaneado.
S4: "si se loguea entra como rol de familiar" — login desde la app móvil → la sesión entra como familiar (salvo admin, ver S1).
S5: "el familiar debe tener un QR único generado por su correo que igualmente es único, ese QR permite la vinculación" — código derivado determinísticamente del email (SHA-256) + QR renderizado. Solo un vínculo por correo.
S6: "desde web no existe el escaneo, en WEB se administra y consulta la información" — la pantalla de escaneo no se ofrece en web; la web mantiene registro con selección de rol y consulta.

## Decisiones del arquitecto (registradas)

D1: El rol del escaneo sobreescribe el rol almacenado salvo para admin (S1). Cuando un usuario ya vinculado escanea otro código, se re-vincula al nuevo código.
D2: Sesión invitada del adulto mayor: usuario local `Paciente` con identificador basado en el código del vínculo; no hay cuenta con contraseña. Session guarda `guest: true` y `vinculo`.
D3: Formato del contenido del QR: JSON `{"t":"aam-vinculo","code":"...","email":"..."}`; QRs ajenos se rechazan con mensaje claro.
D4: El login en móvil fuerza rol `familiar` solo en la sesión; el rol almacenado de la cuenta no cambia (puede ser cuidador por escaneo previo). Web no fuerza rol.
D5: El QR se genera con react-native-qrcode-svg + react-native-svg (compatibles con web y nativo); el escaneo nativo usa expo-camera (solo se monta en nativo).

## Tasks

T1 [S5] ✅ `src/services/vinculos.ts`: deriveCode(email) determinístico, ensureVinculo(email) con registro único por código, parseQrPayload(text) y PayloadVinculo. Commit: 7b3c567.
T2 [S2,S3,S4,S1] ✅ `src/services/auth.ts`: login con `roleOverride` (móvil → familiar, admin intacto), loginGuestAdulto(code), applyVinculoToLoggedInUser(code) (rol cuidador salvo admin + vínculo asociado), campos vinculo/guest en sesión. Commit: 7b3c567.
T3 [S5] ✅ `src/app/(dashboard)/mi-qr.tsx`: QR del vínculo del usuario (visible para familiar; también admin lo puede consultar). Commit: 754604a.
T4 [S2,S3,S6] ✅ `src/app/escanear.tsx`: expo-camera solo en nativo, aviso en web (S6); maneja invitado (S2) y usuario logueado (S3/D1). Commit: 754604a.
T5 [S3,S4] ✅ Entradas en UI: botón "Mi QR" para familiar en dashboard; botón "Vincularme escaneando un QR" en auth solo móvil (S6: oculto en web); selector de rol solo en web; badge de vínculo en dashboard. Commit: dbe2a9b.
T6 [S1..S6] ✅ (parcial, ver L2) Verificación: tsc exit 0; expo lint exit 0; export web exit 0; E2E Chromium: login familiar → "Mi QR" en dashboard → /mi-qr con QR SVG visible + código 16 hex + email; /escanear en web muestra aviso "El escaneo está solo en la aplicación" (S6).

L2: Verificación (2025-11-13): los flujos que dependen de cámara nativa (escaneo invitado → adulto_mayor, escaneo logueado → cuidador) y el override de rol en login móvil requieren dispositivo físico con Expo Go: implementados y verificados estáticamente (tsc/lint) + lógica revisada, pendiente de prueba real en teléfono. El usuario corre `npm run web` propio para validar. Commits: 7b3c567, 754604a, dbe2a9b.

## Log

L1: "admin de momento no va a ser modificado, necesito que desde la app mobil si no se loguea con cuenta pero escanea QR se asigne el rol de Adulto Mayor, si desde la app se loguea y escanea QR se asigne el rol de cuidador, si se loguea entra como rol de familiar, el familiar debe tener un QR unico generado por su correo que igualmente es unico, ese QR permite la vinculación, desde web no existe el escaneo, en WEB se administra y consulta la información"

Delivery strategy: ask-on-risk. Forecast ~700 authored lines.

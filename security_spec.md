# Especificación de Seguridad Firestore — RIS San Ignacio (Curso de Vida Adulto)

## 1. Invariantes de Datos y Seguridad
1. **Aislamiento estricto de PII y datos nominales (Pilar 6)**: Ningún DNI, nombre de paciente ni observación nominal detallada puede almacenarse en `public_manifests`, `public_batches`, `upload_history` ni `cartilla_resources`. Todos los datos nominales residen exclusivamente en `nominal_manifests` y `nominal_batches`.
2. **Sin autoasignación de privilegios**: Un usuario que se registra en `/users/{userId}` solo puede crear su perfil con `role: "consultor"`, `nominalAccess: false` y `active: true` (salvo administrador maestro preconfigurado). Solo un administrador verificado puede cambiar `role`, `nominalAccess` o `active`.
3. **Verificación de correo**: Toda operación autenticada exige `request.auth.token.email_verified == true`.
4. **Integridad temporal**: Todos los campos `createdAt`, `updatedAt` y `uploadedAt` deben coincidir con `request.time`.
5. **Control de tamaño de ID y payloads**: Todos los IDs de ruta cumplen `^[a-zA-Z0-9_\-]+$` y `<= 128` caracteres; las listas tienen límites máximos estrictos (`batchIds <= 100`, `rows <= 350`, `hisCodes <= 40`).

## 2. "Dirty Dozen" Payloads (Casos de Prueba Adversarios)
1. **Unauthenticated Nominal Read**: Solicitud `get` sin token a `/nominal_batches/batch_1` -> `PERMISSION_DENIED`.
2. **Consultor Sin Autorización Nominal**: Usuario autenticado (`role: "consultor"`, `nominalAccess: false`) intentando `get` en `/nominal_manifests/pacientes` -> `PERMISSION_DENIED`.
3. **Self-Privilege Escalation on Create**: Usuario creando `/users/{uid}` con `role: "admin"` o `nominalAccess: true` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Profile**: Usuario actualizando su perfil `/users/{uid}` con un campo fantasma `isVerified: true` o `nominalAccess: true` -> `PERMISSION_DENIED`.
5. **Unverified Email Admin Spoof**: Token con `email: "cursodevidaadulto@gmail.com"` pero `email_verified: false` intentando escribir en `/public_manifests/morbilidades` -> `PERMISSION_DENIED`.
6. **Direct Write to Admin Registry**: Consultor intentando insertar su UID en `/admins/{uid}` -> `PERMISSION_DENIED`.
7. **Unauthorized Upload History Tampering**: Consultor intentando crear o borrar un registro en `/upload_history/{id}` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Intento de escritura en `/cartilla_resources/invalid$id..1500chars` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Admin o usuario enviando `createdAt` distinto de `request.time` -> `PERMISSION_DENIED`.
10. **Immutable UID Mutation**: Usuario intentando cambiar `uid` o `createdAt` en un `update` sobre `/users/{uid}` -> `PERMISSION_DENIED`.
11. **Oversized Batch Array Injection**: Intento de crear `/nominal_batches/b1` con `rows.size() > 350` -> `PERMISSION_DENIED`.
12. **Blanket List Scraping on Nominal Batches**: Intento de `list` sobre `/nominal_batches` o `/users` por usuario no autorizado -> `PERMISSION_DENIED`.

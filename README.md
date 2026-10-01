# GM Electronics

API Express publicada en https://gm-electronics-api.onrender.com, conectada a PostgreSQL en Neon. Siete pruebas locales y una comprobación del dominio público verifican los 694 productos y 834 variantes, sus precios del Excel, stock e imágenes.

## Qué guarda la base

- 694 productos y 834 variantes del JSON maestro.
- Precios Excel y disponibilidad por color: 569 disponibles, 211 sin stock y 54 desconocidas.
- 13 categorías, referencias a 2.838 imágenes y evidencia de los 883 bloques del Excel.
- Historial por lista del proveedor, para que una nueva importación no borre lo anterior.

El stock indica disponibilidad del proveedor, no unidades propias. La API entrega los precios actualizados del Excel según lo solicitado; puede ocultarlos con EXPOSE_SUPPLIER_PRICES=false. Las imágenes se sirven desde Express; Storage queda para otra etapa.

## Uso local

PostgreSQL y sus datos se guardan en `.local/postgres/`. Las credenciales generadas están en `.env.local`, excluidas de Git. No compartir ese archivo.

Para iniciar tras reiniciar la PC, ejecutar desde esta carpeta:

```powershell
& ./scripts/bootstrap-local.ps1 -StartOnly
```

Para detenerlo:

```powershell
& ./scripts/stop-local.ps1
```

La sesión restringida de Codex no permite enviar la señal de apagado normal de PostgreSQL. Si aparece ese error, `& ./scripts/stop-local.ps1 -Force` verifica que sea esta base, guarda un checkpoint y detiene únicamente los procesos locales del proyecto. En el próximo inicio PostgreSQL recupera el estado desde su registro de transacciones. La recuperación se probó sin pérdida de registros. Este modo es para desarrollo local; la base de producción usará el servicio administrado de Railway.

La conexión local usa `127.0.0.1:55432`, base `gm_electronics`. No se instaló un servicio que arranque automáticamente al encender Windows.

La creación inicial y comprobación se ejecutan con `scripts/bootstrap-local.ps1`. Es repetible: registra la versión de la estructura y usa identificadores estables; no duplica productos ni listas al repetir la carga.

## Archivos de estructura

- `database/migrations/001_catalog.sql`: estructura y vistas.
- `database/build_seed.py`: prepara la carga desde los archivos auditados, sin modificar fuentes.
- `database/generated/seed.sql`: carga generada de datos, excluida de Git.
- `database/verify.sql`: verifica conteos, precios, colores y conflictos reales.
- `database/constraints-test.sql`: verifica restricciones y rechazo de listas incompletas o antiguas en una transacción que se revierte.

PostgreSQL 18.6 se descargó del enlace Windows x86-64 publicado por EDB, distribuidor enlazado desde el sitio oficial de PostgreSQL. La versión y el hash del archivo descargado están registrados en `.local/postgres/download-manifest.json`.

La copia de respaldo inicial está en `.local/postgres/gm-electronics-initial.dump`. Se genera con `scripts/verify-local.ps1`. No contiene la contraseña del usuario local.

La restauración se probó en una segunda base local, `gm_electronics_restore_check`, que se conserva como copia de comprobación. La sesión restringida también impide completar su borrado normal. La aplicación debe conectarse siempre a `gm_electronics`, no a esa copia de prueba.

La vista `gm.public_catalog` sirve para consultar catálogo sin precios del proveedor. `gm.current_variant_state` muestra los precios y disponibilidad vigentes por variante. `gm.variant_snapshots` conserva el historial y `gm.supplier_rows` conserva la evidencia de origen.

El lote inicial incluye los precios del Excel identificado por Gonzalo como vigente; su encabezado fecha la lista al 28/09/2026. Los códigos ausentes o incompatibles mantienen sus precios actuales y stock como desconocidos.

## Ejecutar la API

Con PostgreSQL iniciado, ejecutar `npm ci` y `npm start`. Abrir http://localhost:3000/ready y http://localhost:3000/api/v1/products. `npm test` comprueba catálogo, stock, precios, imágenes, filtros y acceso administrativo. La guía [docs/API.md](docs/API.md) detalla respuestas y despliegue.

El Dockerfile prepara las 2.838 imágenes desde un commit fijo del repositorio público original de Gonzalo y verifica cada archivo contra los SHA-256 del ZIP auditado. La carga inicial comprimida en data/seed-part-*.b64 omite rutas locales de Windows; conserva el catálogo, precios históricos e importación vigente. Los precios históricos nunca se usan como reemplazo de precios actuales desconocidos. La carga local completa permanece en database/generated/seed.sql.

La API se aloja en Render (plan gratuito), y la base en Neon (plan gratuito). Se usa el despliegue nativo Node de render.yaml; el Dockerfile queda como alternativa. Cada actualización de main dispara un despliegue y una verificación del dominio público, cuyo resultado se registra en gm.deployment_checks. Las credenciales están en variables privadas del servicio.

En Render gratuito, el servicio se suspende después de 15 minutos sin consultas y la siguiente puede demorar mientras arranca. PostgreSQL permanece en Neon y las imágenes se reconstruyen y verifican durante el despliegue. La API sigue disponible con la PC de Gonzalo apagada.

No se empezó la web ni se conectó la lista futura de Drive. El próximo paso es integrar la página con los endpoints documentados; para la importación semanal faltan el archivo y el enlace de Drive.


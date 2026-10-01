# GM Electronics

API Express y PostgreSQL local, con cat�logo, variantes, precios del Excel, stock e im�genes. Siete pruebas verifican los 694 productos y 834 variantes. La publicaci�n est� pendiente: Railway informa que la prueba de la cuenta venci� y exige elegir un plan.

## Qu� guarda la base

- 694 productos y 834 variantes del JSON maestro.
- Precios Excel y disponibilidad por color: 569 disponibles, 211 sin stock y 54 desconocidas.
- 13 categor�as, referencias a 2.838 im�genes y evidencia de los 883 bloques del Excel.
- Historial por lista del proveedor, para que una nueva importaci�n no borre lo anterior.

El stock indica disponibilidad del proveedor, no unidades propias. La API entrega los precios actualizados del Excel seg�n lo solicitado; puede ocultarlos con EXPOSE_SUPPLIER_PRICES=false. Las im�genes se sirven desde Express; Storage queda para otra etapa.

## Uso local

PostgreSQL y sus datos se guardan en `.local/postgres/`. Las credenciales generadas est�n en `.env.local`, excluidas de Git. No compartir ese archivo.

Para iniciar tras reiniciar la PC, ejecutar desde esta carpeta:

```powershell
& ./scripts/bootstrap-local.ps1 -StartOnly
```

Para detenerlo:

```powershell
& ./scripts/stop-local.ps1
```

La sesi�n restringida de Codex no permite enviar la se�al de apagado normal de PostgreSQL. Si aparece ese error, `& ./scripts/stop-local.ps1 -Force` verifica que sea esta base, guarda un checkpoint y detiene �nicamente los procesos locales del proyecto. En el pr�ximo inicio PostgreSQL recupera el estado desde su registro de transacciones. La recuperaci�n se prob� sin p�rdida de registros. Este modo es para desarrollo local; la base de producci�n usar� el servicio administrado de Railway.

La conexi�n local usa `127.0.0.1:55432`, base `gm_electronics`. No se instal� un servicio que arranque autom�ticamente al encender Windows.

La creaci�n inicial y comprobaci�n se ejecutan con `scripts/bootstrap-local.ps1`. Es repetible: registra la versi�n de la estructura y usa identificadores estables; no duplica productos ni listas al repetir la carga.

## Archivos de estructura

- `database/migrations/001_catalog.sql`: estructura y vistas.
- `database/build_seed.py`: prepara la carga desde los archivos auditados, sin modificar fuentes.
- `database/generated/seed.sql`: carga generada de datos, excluida de Git.
- `database/verify.sql`: verifica conteos, precios, colores y conflictos reales.
- `database/constraints-test.sql`: verifica restricciones y rechazo de listas incompletas o antiguas en una transacci�n que se revierte.

PostgreSQL 18.6 se descarg� del enlace Windows x86-64 publicado por EDB, distribuidor enlazado desde el sitio oficial de PostgreSQL. La versi�n y el hash del archivo descargado est�n registrados en `.local/postgres/download-manifest.json`.

La copia de respaldo inicial est� en `.local/postgres/gm-electronics-initial.dump`. Se genera con `scripts/verify-local.ps1`. No contiene la contrase�a del usuario local.

La restauraci�n se prob� en una segunda base local, `gm_electronics_restore_check`, que se conserva como copia de comprobaci�n. La sesi�n restringida tambi�n impide completar su borrado normal. La aplicaci�n debe conectarse siempre a `gm_electronics`, no a esa copia de prueba.

La vista `gm.public_catalog` sirve para consultar cat�logo sin precios del proveedor. `gm.current_variant_state` muestra los precios y disponibilidad vigentes por variante. `gm.variant_snapshots` conserva el historial y `gm.supplier_rows` conserva la evidencia de origen.

El lote inicial incluye los precios del Excel identificado por Gonzalo como vigente; su encabezado fecha la lista al 28/09/2026. Los c�digos ausentes o incompatibles mantienen sus precios actuales y stock como desconocidos.

## Ejecutar la API

Con PostgreSQL iniciado, ejecutar `npm ci` y `npm start`. Abrir http://localhost:3000/ready y http://localhost:3000/api/v1/products. `npm test` comprueba cat�logo, stock, precios, im�genes, filtros y acceso administrativo. La gu�a [docs/API.md](docs/API.md) detalla respuestas y despliegue.

El Dockerfile prepara las 2.838 im�genes desde un commit fijo del repositorio p�blico original de Gonzalo y verifica cada archivo contra los SHA-256 del ZIP auditado. La carga inicial comprimida en data/seed-part-*.b64 omite rutas locales de Windows; conserva el cat�logo, precios hist�ricos e importaci�n vigente. Los precios hist�ricos nunca se usan como reemplazo de precios actuales desconocidos. La carga local completa permanece en database/generated/seed.sql.

No se empez� la web ni se conect� la lista futura de Drive. Para finalizar la publicaci�n hace falta habilitar un plan en Railway; luego crear PostgreSQL y desplegar este repositorio con DATABASE_URL, verificar /ready y generar su dominio.

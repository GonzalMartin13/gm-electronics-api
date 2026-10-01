# API de GM Electronics

La API es el intermediario entre la página y PostgreSQL. La página pide productos; la API consulta la base y devuelve JSON. La página todavía no se modificó.

## Consultas disponibles

| Consulta GET | Resultado |
| --- | --- |
| `/health` | El proceso responde |
| `/ready` | Confirma conexión y catálogo importado |
| `/api/v1/categories` | Las 13 categorías y cantidad de productos |
| `/api/v1/products` | Productos paginados con variantes |
| `/api/v1/products/:id` | Producto por ID original del JSON o UUID de la API |
| `/api/v1/variants/:id` | Variante por código del proveedor o UUID |
| `/images/...` | Fotografías y archivos del catálogo |

Ejemplo: `/api/v1/products?q=auricular&availability=available&page=1&limit=24`.

Filtros: `q` busca nombre, descripción o código exacto; `category` acepta nombre exacto o UUID; `availability` acepta `available`, `unavailable`, `unknown`; `min_price` y `max_price` filtran pesos argentinos. `page` empieza en 1, `limit` permite 1 a 100. La respuesta incluye `data`, `pagination` y `meta`. Para cargar todos los productos, recorrer las páginas hasta `pagination.pages`.

## Cómo interpretar los datos

`stock_disponible: true` significa celda verde; `false`, amarilla; `null`, dato no confirmado. Es disponibilidad del proveedor y no una cantidad de unidades.

Los precios son los del Excel indicado por Gonzalo. Se devuelven como cadenas decimales (`"3661.00"`) para conservar precisión monetaria. `null` significa precio sin confirmar; jamás se reemplaza por el precio viejo del JSON. El encabezado del Excel identifica la lista del 28/09/2026.

Cada variante tiene su propio código, precio, stock e imágenes. El precio del producto corresponde a su variante más económica con ambos precios confirmados. `precio_es_desde` señala precios diferentes entre variantes; `precio_codigo_referencia` identifica la variante usada. No implica que esa variante esté disponible. `precios_completos` indica que todas tienen ambos precios confirmados.

Las imágenes tienen URL absoluta. Algunos productos y variantes carecen de imagen en las fuentes. Las discrepancias, como el código 2362, mantienen stock y precio desconocidos.

## Errores y acceso

Filtros inválidos: HTTP 400. Producto, variante o imagen inexistente: 404. Base temporalmente inaccesible: 503. Más de 120 consultas por minuto y dirección IP: 429. Los errores no exponen credenciales ni consultas internas.

La API pública entrega los precios del Excel según lo solicitado. Se pueden ocultar con `EXPOSE_SUPPLIER_PRICES=false`. Las rutas `/api/v1/admin/products`, `/api/v1/admin/categories` y `/api/v1/admin/variants/:id` requieren `x-api-key` y `ADMIN_API_KEY`; nunca enviar esa clave al navegador de la página. No hay operaciones públicas de escritura.

## API publicada

Base pública: https://gm-electronics-api.onrender.com.

Estado y catálogo: https://gm-electronics-api.onrender.com/ready.

Productos: https://gm-electronics-api.onrender.com/api/v1/products.

Servicio Render: https://dashboard.render.com/web/srv-daurlso473hc73ccbbr0.

Proyecto Neon: https://console.neon.tech/app/projects/morning-mouse-32936483/branches/br-soft-bar-b44ujirz.

El repositorio independiente es `GonzalMartin13/gm-electronics-api`, creado por Gonzalo como público. No subir `.env.local`, `.local` ni `node_modules`. La carga comprimida en `data/seed-part-*.b64` contiene el catálogo y las evidencias de importación, sin contraseñas ni rutas locales de Windows. El Dockerfile reconstruye las imágenes desde un commit fijo del repositorio original y verifica todos los hashes.

Render aloja Express; Neon conserva PostgreSQL. `DATABASE_URL` usa la conexión agrupada y `DATABASE_URL_UNPOOLED` la directa para migraciones. `NODE_ENV=production`, `TRUST_PROXY_HOPS=1`, `EXPOSE_SUPPLIER_PRICES=true`. Render aporta `PORT`. La preparación verifica las 2.838 imágenes, y el inicio ejecuta migraciones e importación repetibles antes de abrir el servidor. La comprobación del dominio público recorre todas las páginas, compara todos los precios y stocks con los datos auditados, descarga fotografías y verifica sus hashes. Su resultado está en `gm.deployment_checks`.

Los servicios actuales son gratuitos. Render puede suspender Express después de 15 minutos sin consultas; la primera consulta siguiente tarda más. Los datos se conservan en Neon. La página debe contemplar la espera y reintentar errores temporales.

La lista automática de Drive todavía no se conectó: falta el archivo y su enlace. Los endpoints de importación no están implementados; una nueva lista debe auditarse antes de aplicarla. Las imágenes están incluidas en el servicio inicial; Storage queda para una etapa posterior.


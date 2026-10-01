# API de GM Electronics

La API es el intermediario entre la p�gina y PostgreSQL. La p�gina pide productos; la API consulta la base y devuelve JSON. La p�gina todav�a no se modific�.

## Consultas disponibles

| Consulta GET | Resultado |
| --- | --- |
| `/health` | El proceso responde |
| `/ready` | Confirma conexi�n y cat�logo importado |
| `/api/v1/categories` | Las 13 categor�as y cantidad de productos |
| `/api/v1/products` | Productos paginados con variantes |
| `/api/v1/products/:id` | Producto por ID original del JSON o UUID de la API |
| `/api/v1/variants/:id` | Variante por c�digo del proveedor o UUID |
| `/images/...` | Fotograf�as y archivos del cat�logo |

Ejemplo: `/api/v1/products?q=auricular&availability=available&page=1&limit=24`.

Filtros: `q` busca nombre, descripci�n o c�digo exacto; `category` acepta nombre exacto o UUID; `availability` acepta `available`, `unavailable`, `unknown`; `min_price` y `max_price` filtran pesos argentinos. `page` empieza en 1, `limit` permite 1 a 100. La respuesta incluye `data`, `pagination` y `meta`. Para cargar todos los productos, recorrer las p�ginas hasta `pagination.pages`.

## C�mo interpretar los datos

`stock_disponible: true` significa celda verde; `false`, amarilla; `null`, dato no confirmado. Es disponibilidad del proveedor y no una cantidad de unidades.

Los precios son los del Excel indicado por Gonzalo. Se devuelven como cadenas decimales (`"3661.00"`) para conservar precisi�n monetaria. `null` significa precio sin confirmar; jam�s se reemplaza por el precio viejo del JSON. El encabezado del Excel identifica la lista del 28/09/2026.

Cada variante tiene su propio c�digo, precio, stock e im�genes. El precio del producto corresponde a su variante m�s econ�mica con ambos precios confirmados. `precio_es_desde` se�ala precios diferentes entre variantes; `precio_codigo_referencia` identifica la variante usada. No implica que esa variante est� disponible. `precios_completos` indica que todas tienen ambos precios confirmados.

Las im�genes tienen URL absoluta. Algunos productos y variantes carecen de imagen en las fuentes. Las discrepancias, como el c�digo 2362, mantienen stock y precio desconocidos.

## Errores y acceso

Filtros inv�lidos: HTTP 400. Producto, variante o imagen inexistente: 404. Base temporalmente inaccesible: 503. M�s de 120 consultas por minuto y direcci�n IP: 429. Los errores no exponen credenciales ni consultas internas.

La API p�blica entrega los precios del Excel seg�n lo solicitado. Se pueden ocultar con `EXPOSE_SUPPLIER_PRICES=false`. Las rutas `/api/v1/admin/products`, `/api/v1/admin/categories` y `/api/v1/admin/variants/:id` requieren `x-api-key` y `ADMIN_API_KEY`; nunca enviar esa clave al navegador de la p�gina. No hay operaciones p�blicas de escritura.

## Publicaci�n pendiente

El repositorio independiente es `GonzalMartin13/gm-electronics-api`, creado por Gonzalo como p�blico. No subir `.env.local`, `.local` ni `node_modules`. La carga comprimida en `data/seed-part-*.b64` contiene el cat�logo y las evidencias de importaci�n, sin contrase�as ni rutas locales de Windows. El Dockerfile reconstruye las im�genes desde un commit fijo del repositorio original y verifica todos los hashes.

En Railway: PostgreSQL persistente y un servicio para Express. Configurar `DATABASE_URL` con la referencia del servicio PostgreSQL; `NODE_ENV=production`; `TRUST_PROXY_HOPS=1`; `EXPOSE_SUPPLIER_PRICES=true`. Railway aporta `PORT`. El archivo `railway.json` ejecuta migraciones e importaci�n antes de iniciar, y comprueba `/ready`. Las migraciones y la importaci�n son repetibles. Generar dominio p�blico y confirmar `/ready`, los 694 productos, precios, stock e im�genes antes de considerar publicada la API.

La lista autom�tica de Drive todav�a no se conect�: falta el archivo y su enlace. Los endpoints de importaci�n no est�n implementados; una nueva lista debe auditarse antes de aplicarla. Las im�genes est�n incluidas en el servicio inicial; Storage queda para una etapa posterior.

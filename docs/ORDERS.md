# Pedidos y catálogo conectado

El catálogo conserva los 694 productos y 834 variantes auditados. Las opciones con disponibilidad por confirmar se muestran como Consultar disponibilidad; un precio ausente se muestra como Consultar precio. Los valores booleanos y null originales se conservan en la API.

## Catálogo
GET /api/v1/products acepta page, limit (máximo 100), q, category, availability, min_price, max_price y sort.
sort: relevance, priceAsc o priceDesc. Ordenación global estable; precios desconocidos al final.
availability: available, consult; también conserva unavailable y unknown para consumidores anteriores.
consult reúne las disponibilidades false y null. Los productos permanecen visibles en la vista general.

## Solicitudes de pedido
POST /api/v1/orders/quote recibe items con variant_id UUID y quantity entera entre 1 y 999, e invoice booleano.
Devuelve opciones actuales, código/color, precios y lista de origen, subtotal, IVA, total y firma de la cotización.
No crea pedidos ni reserva unidades. Si un artículo requiere consulta, responde 409 CONSULTATION_REQUIRED.

POST /api/v1/orders recibe esos mismos datos, customer (name, phone, email, business, address, payment), channel (whatsapp/pdf/email), quote_signature, idempotency_key UUID y access_token UUID generado por el cliente.
El servidor consulta el lote publicado, calcula importes en centavos, agrega IVA 21% solamente cuando invoice=true, y guarda un snapshot privado en gm.orders.
No usa subtotal, precios o PDF enviados por el cliente. Una firma anterior devuelve 409 QUOTE_CHANGED, sin registrar el pedido.
Una repetición idéntica con la misma clave devuelve el pedido original; datos distintos con esa clave devuelven 409 IDEMPOTENCY_CONFLICT.

GET /api/v1/orders/:id exige Authorization: Bearer access_token. La base guarda solamente el hash del token.
No hay un listado público de clientes o pedidos. Las respuestas de pedidos no se almacenan en caché.
Cada solicitud obtiene número GM-000001, GM-000002, etc. La disponibilidad se verifica y no implica una reserva de unidades.

## Documentos y correo
El cliente usa el snapshot devuelto para WhatsApp y PDF. La función de Vercel api/send-order.js recibe solo order_id y access_token, recupera el pedido privado de la API y produce el correo y su PDF en el servidor.
Requiere RESEND_API_KEY y EMAIL_FROM habilitados en Vercel. El destinatario fijo es gonzalo.m.martin@gmail.com.
Los reintentos usan Idempotency-Key gm-order/id conforme a https://resend.com/docs/dashboard/emails/idempotency-keys .
No se enviaron emails reales durante las pruebas.

## Validación
Diez pruebas locales: catálogo completo, variantes/precios/colores, entradas inválidas, SQL literal, privacidad administrativa, imágenes, filtros, ordenación global, IVA en centavos, cotizaciones cambiadas, totales falsificados y reintentos concurrentes.
La comprobación alojada verifica dominio público, 694 productos, 834 variantes, precios vigentes y hashes de imágenes.
Los pedidos de prueba se crean y retiran solo de la base local.

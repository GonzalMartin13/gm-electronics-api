# TAR-0027 — PNG de productos

Trabajo autorizado el 04/11/2026: retirar fondo blanco, conservar producto y originales, actualizar JSON y referencias de la web sin modificar precios ni stock.

Fuentes: Library GM_Fastec180_JSON_Fotos.zip (libfile_186905848aa88191b26fa8d44ce8e2f0; obtener con acceso autorizado), JSON original SHA256 9199d1f82888811e3210958de8c96964738761b65bfc3b112d0684e64284c43b y catálogo público actual de la API. No publicar credenciales ni enlaces firmados en este repositorio.

Instalar dependencias en esta carpeta. Definir GM_PNG_WORKDIR como directorio privado de trabajo y GM_SOURCE_ZIP como ruta al ZIP autorizado. Ejecutar process.mjs, revisar los casos señalados y después package.mjs con índice de parte basado en cero.

Resultado comprobado: 4.304 rutas y 4.047 imágenes únicas; 3.908 con fondo retirado o alfa existente; 139 conservadas por no tener un fondo separable con seguridad. PNG optimizados: 203.164.482 bytes. JSON de referencia: 717 productos. Web: 743 productos y 892 variantes visibles. Los campos comerciales se compararon y permanecen iguales.

Prueba en Neon aislada br-falling-resonance-b4pmlemt: se actualizaron 1.977 storage_key sin tocar original_path, SHA ni metadatos originales. Checksum comercial antes/después 057490ee235ecad41d2eb77ea3ee2db4. La rama de producción br-soft-bar-b44ujirz conserva cero storage_key del nuevo prefijo. No desplegar ni cambiar producción antes de que existan los archivos PNG publicados y verificados.

Bloqueo: revisión automática rechazó subir once paquetes PNG/JSON al almacenamiento externo Higgsfield por falta de autorización explícita para ese destino. No hubo transferencia de esos paquetes ni cambios en la web/base de producción. Requiere autorización específica o una alternativa dentro del alojamiento ya autorizado, revisada previamente.

La copia local de Windows quedó desconectada; la segunda ejecución y archivos de trabajo están en el sandbox remoto de Higgsfield bajo /home/user/gm_png. Los datos operativos y originales siguen intactos.

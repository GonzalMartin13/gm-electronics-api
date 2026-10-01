import express from 'express';
import {Orders,OrderError} from './orders.js';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serializeProduct, serializeVariant } from './catalog.js';

class InputError extends Error {}
function text(query,key,max=120) {
  const value=query[key];
  if (value===undefined) return undefined;
  if (typeof value!=='string' || !value.trim() || value.length>max) throw new InputError(`Parámetro inválido: ${key}`);
  return value.trim();
}
function positiveInteger(query,key,defaultValue,max) {
  const value=text(query,key,10);
  if (value===undefined) return defaultValue;
  if (!/^[1-9]\d*$/.test(value) || Number(value)>max) throw new InputError(`Parámetro inválido: ${key}`);
  return Number(value);
}
function price(query,key) {
  const value=text(query,key,17);
  if (value!==undefined && !/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new InputError(`Parámetro inválido: ${key}`);
  return value;
}
function listOptions(query,prices) {
  const supported=new Set(['q','category','availability','page','limit','min_price','max_price','sort']);
  if (Object.keys(query).some(key=>!supported.has(key))) throw new InputError('Filtro desconocido');
  const options={page:positiveInteger(query,'page',1,100000),limit:positiveInteger(query,'limit',24,100),q:text(query,'q'),category:text(query,'category'),availability:text(query,'availability',20),sort:text(query,'sort',20),minPrice:price(query,'min_price'),maxPrice:price(query,'max_price')};
  if (options.sort&&!['relevance','priceAsc','priceDesc'].includes(options.sort))throw new InputError('Orden inválido');
  if (options.availability && !['available','unavailable','unknown','consult'].includes(options.availability)) throw new InputError('Disponibilidad inválida');
  if (options.minPrice!==undefined && options.maxPrice!==undefined && Number(options.minPrice)>Number(options.maxPrice)) throw new InputError('El precio mínimo supera al máximo');
  if (!prices && (options.minPrice!==undefined || options.maxPrice!==undefined)) throw new InputError('Los precios públicos todavía no están habilitados');
  return options;
}
function safeKey(value,expected) {
  if (!expected || typeof value!=='string') return false;
  const a=Buffer.from(value),b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}

export function createApp({ catalog, config, logger=console, orders=new Orders(catalog.pool) }) {
  const app=express();
  app.disable('x-powered-by');
  app.set('query parser','simple');
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
  app.use((req,res,next)=>{ res.setHeader('X-Request-Id',randomUUID()); next(); });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin(origin,done) {
    if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return done(null,true);
    return done(null,false);
  }, credentials:false, methods:['GET','HEAD','OPTIONS','POST'] }));
  app.use('/images',express.static(fileURLToPath(new URL('../public/images',import.meta.url)),{dotfiles:'deny',index:false,maxAge:'1d',fallthrough:false}));
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'gm-electronics-api'}));
  app.get('/ready',async (_req,res)=>{
    try { res.json({status:'ready',...await catalog.ready()}); }
    catch { res.status(503).json({status:'unavailable',message:'La base de datos no está disponible'}); }
  });
  app.get('/',(_req,res)=>res.json({nombre:'GM Electronics API',version:'1.0.0',documentacion:'/api/v1',productos:'/api/v1/products'}));
  app.get('/api/v1',(_req,res)=>res.json({version:'1.0.0',endpoints:{categories:'/api/v1/categories',products:'/api/v1/products',product:'/api/v1/products/:id',variant:'/api/v1/variants/:id'},stock:{true:'Disponible',false:'Consultar disponibilidad',null:'Consultar disponibilidad'},precios_publicos:config.exposeSupplierPrices}));
  app.use('/api',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMITED',message:'Demasiadas consultas; intentá nuevamente en un minuto'}}}));
  app.use('/api/v1/orders',rateLimit({windowMs:60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMITED',message:'Esperá un momento para volver a preparar el pedido.'}}}),express.json({limit:'32kb'}),(_req,res,next)=>{res.set('Cache-Control','no-store');next()});
  app.post('/api/v1/orders/quote',async(req,res)=>res.json({data:await orders.quote(req.body)}));
  app.post('/api/v1/orders',async(req,res)=>{const result=await orders.create(req.body);res.status(result.reused?200:201).json({data:result.order,reused:result.reused})});
  app.get('/api/v1/orders/:id',async(req,res)=>res.json({data:await orders.get(req.params.id,req.get('Authorization')?.replace(/^Bearer /,''))}));
  const metadata = { fuente_stock:'proveedor', moneda_pesos:'ARS', moneda_dolares:'USD' };
  function context(req,prices) {
    const base=config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
    return {prices,assetUrl:path=>new URL('/'+path.split('/').map(encodeURIComponent).join('/'),base).href};
  }
  function mount(router,prices) {
    router.get('/categories',async (_req,res)=>res.json({data:await catalog.categories()}));
    router.get('/products',async (req,res)=>{
      const result=await catalog.list(listOptions(req.query,prices));
      if (!res.get('Cache-Control')) res.set('Cache-Control','public, max-age=0, must-revalidate');
      res.json({...result,data:result.data.map(p=>serializeProduct(p,context(req,prices))),meta:metadata});
    });
    router.get('/products/:id',async (req,res)=>{
      if (req.params.id.length>200) throw new InputError('Identificador inválido');
      const product=await catalog.product(req.params.id);
      if (!product) return res.status(404).json({error:{code:'NOT_FOUND',message:'Producto inexistente'}});
      res.json({data:serializeProduct(product,context(req,prices)),meta:metadata});
    });
    router.get('/variants/:id',async (req,res)=>{
      if (req.params.id.length>200) throw new InputError('Identificador inválido');
      const variant=await catalog.variant(req.params.id);
      if (!variant) return res.status(404).json({error:{code:'NOT_FOUND',message:'Variante inexistente'}});
      res.json({data:serializeVariant(variant,context(req,prices)),meta:metadata});
    });
    return router;
  }
  app.use('/api/v1/admin', (req,res,next)=>{
    if (!config.adminKey) return res.status(503).json({error:{code:'ADMIN_NOT_CONFIGURED',message:'Acceso administrativo no configurado'}});
    if (!safeKey(req.get('x-api-key'),config.adminKey)) return res.status(401).json({error:{code:'UNAUTHORIZED',message:'Se requiere una clave administrativa válida'}});
    res.set('Cache-Control','no-store');
    next();
  }, mount(express.Router(),true));
  app.use('/api/v1',mount(express.Router(),config.exposeSupplierPrices));
  app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Ruta inexistente'}}));
  app.use((error,req,res,_next)=>{
    if(error instanceof OrderError)return res.status(error.status).json({error:{code:error.code,message:error.message,...(error.details||{})}});
    if(error.type==='entity.too.large'||error.type==='entity.parse.failed')return res.status(400).json({error:{code:'INVALID_ORDER',message:'Revisá los datos del pedido.'}});
    if (error instanceof InputError) return res.status(400).json({error:{code:'INVALID_QUERY',message:error.message}});
    if (error.status===404) return res.status(404).json({error:{code:'NOT_FOUND',message:'Imagen inexistente'}});
    logger.error({requestId:res.getHeader('X-Request-Id'),code:error.code || 'INTERNAL_ERROR',message:'API request failed'});
    return res.status(503).json({error:{code:'SERVICE_UNAVAILABLE',message:'No se pudo consultar el catálogo. Intentá nuevamente.'}});
  });
  return app;
}


import {randomUUID} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {OrderError} from './orders.js';

const unauthorized=()=>new OrderError('Ingresá a tu cuenta para continuar.',401,'AUTH_REQUIRED');
const publicProfile=row=>({id:row.id,name:row.name,email:row.email,phone:row.phone,business:row.business,address:row.address});

export function createIdentityVerifier(baseUrl,{jwks}={}) {
  if(!baseUrl)return async()=>{throw new OrderError('Las cuentas todavía están en preparación.',503,'AUTH_NOT_CONFIGURED')};
  const base=new URL(baseUrl);
  if(base.protocol!=='https:')throw new Error('Auth requires HTTPS');
  const keys=jwks||createRemoteJWKSet(new URL(baseUrl.replace(/\/$/,'')+'/.well-known/jwks.json'),{timeoutDuration:5000});
  return async header=>{
    if(typeof header!=='string'||!/^Bearer [^\s]+$/.test(header)||header.length>16000)throw unauthorized();
    let payload;
    try{({payload}=await jwtVerify(header.slice(7),keys,{issuer:base.origin,audience:base.origin,algorithms:['EdDSA'],requiredClaims:['sub','exp','iat']}))}catch{throw unauthorized()}
    if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>200||typeof payload.email!=='string'||payload.email.length>254||!payload.email.includes('@'))throw unauthorized();
    if(payload.banned===true)throw new OrderError('Consultanos para habilitar tu cuenta.',403,'ACCOUNT_DISABLED');
    if(payload.emailVerified!==true)throw new OrderError('Verificá tu email para continuar.',403,'EMAIL_NOT_VERIFIED');
    return {id:payload.sub,email:payload.email,name:typeof payload.name==='string'?payload.name.slice(0,200):''};
  };
}

export class Accounts {
  constructor(pool){this.pool=pool}
  async ensure(identity){
    const {rows}=await this.pool.query(`INSERT INTO gm.customer_accounts(id,auth_user_id,name,email) VALUES($1,$2,$3,$4)
      ON CONFLICT(auth_user_id) DO UPDATE SET email=EXCLUDED.email
      RETURNING *`,[randomUUID(),identity.id,identity.name,identity.email]);
    return publicProfile(rows[0]);
  }
  async update(identity,body){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['name','phone','business','address'].includes(key)))throw new OrderError('Revisá los datos de tu cuenta.',400,'INVALID_PROFILE');
    const fields={};
    for(const [key,max] of Object.entries({name:200,phone:13,business:200,address:500})){
      if(typeof body[key]!=='string'||body[key].length>max||(key==='name'&&!body[key].trim()))throw new OrderError('Revisá los datos de tu cuenta.',400,'INVALID_PROFILE');
      fields[key]=body[key].trim();
    }
    if(fields.phone&&!/^[0-9]{8,13}$/.test(fields.phone))throw new OrderError('Usá entre 8 y 13 números para el teléfono.',400,'INVALID_PROFILE');
    await this.ensure(identity);
    const {rows}=await this.pool.query(`UPDATE gm.customer_accounts SET name=$2,phone=$3,business=$4,address=$5,updated_at=now() WHERE auth_user_id=$1 RETURNING *`,[identity.id,fields.name,fields.phone,fields.business,fields.address]);
    return publicProfile(rows[0]);
  }
}
